'use client';

import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {Address} from 'viem';
import type {VaultView} from '@/lib/contracts/hooks';
import {shortAddress, tokenAmount} from '@/lib/domain/format';
import crescentIsland from './art/vault-island-art-crescent.png';
import crescentMask from './art/vault-island-art-crescent-land-mask.png';
import sampleIsland from './art/vault-island-art-sample.png';
import sampleMask from './art/vault-island-art-sample-land-mask.png';
import {assetMix, sharePartsPerMillion} from './capitalMapModel';
import {useIslandOverlay, type MapHolder, type OverlayAsset} from './useIslandOverlay';

const DESKTOP_VIEW_WIDTH = 1080;
const ART_SIZE = 430;
const SAMPLE_SIZE = 500;
const MAX_COLUMNS = 2;
const ART_VARIANTS = [
  {image: sampleIsland.src, mask: sampleMask.src},
  {image: crescentIsland.src, mask: crescentMask.src},
] as const;

const subscribeViewport = (callback: () => void) => {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
};

const compactViewport = () => window.innerWidth < 768;
const desktopServerSnapshot = () => false;

interface Props {
  vaults: VaultView[];
  selectedAddress: Address | null;
  connectedAddress?: Address;
  artSample?: boolean;
  demo?: boolean;
  holdersByVault?: Record<string, MapHolder[]>;
  onSelect: (address: Address) => void;
}

interface Pan {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startPan: Pan;
  unitsX: number;
  unitsY: number;
}

interface TerritoryDetail {
  vault: VaultView;
  holder: MapHolder;
}

type MapView = 'terrain' | 'distribution';

interface HoveredAsset {
  address: string;
  symbol: string;
  percent: number;
  color: string;
}

export function AssetMap({
  vaults,
  selectedAddress,
  connectedAddress,
  artSample = false,
  demo = false,
  holdersByVault,
  onSelect,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({x: 0, y: 0});
  const [mapView, setMapView] = useState<MapView>('distribution');
  const [showTerritories, setShowTerritories] = useState(true);
  const [territoryDetail, setTerritoryDetail] = useState<TerritoryDetail | null>(null);
  const [hoveredAsset, setHoveredAsset] = useState<HoveredAsset | null>(null);
  const drag = useRef<DragState | null>(null);
  const compact = useSyncExternalStore(subscribeViewport, compactViewport, desktopServerSnapshot);
  const singleIsland = artSample || demo;
  const visibleVaults = singleIsland
    ? vaults.filter((vault) => vault.address === selectedAddress).slice(0, 1)
    : vaults;
  const columns = singleIsland || compact ? 1 : Math.min(MAX_COLUMNS, Math.max(1, visibleVaults.length));
  const rows = Math.max(1, Math.ceil(visibleVaults.length / columns));
  const viewWidth = compact ? 620 : DESKTOP_VIEW_WIDTH;
  const viewHeight = singleIsland
    ? 630
    : compact
      ? Math.max(560, 30 + rows * 480)
      : Math.max(620, 50 + rows * 480);
  const selectedVault = visibleVaults.find((vault) => vault.address === selectedAddress) ?? visibleVaults[0] ?? null;

  function resetView() {
    setZoom(1);
    setPan({x: 0, y: 0});
  }

  function selectVault(address: Address) {
    setTerritoryDetail(null);
    onSelect(address);
  }

  function startDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || (event.target as Element).closest('[data-map-control]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: pan,
      unitsX: viewWidth / bounds.width,
      unitsY: viewHeight / bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setPan({
      x: drag.current.startPan.x + (event.clientX - drag.current.startX) * drag.current.unitsX / zoom,
      y: drag.current.startPan.y + (event.clientY - drag.current.startY) * drag.current.unitsY / zoom,
    });
  }

  function endDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#071a2a]">
      <div className="relative z-30 flex min-h-[58px] flex-wrap items-center gap-2 border-b border-[#284055] bg-[#0b1827]/96 px-3 py-2 sm:px-4">
        <div className="mr-auto w-full min-w-0 sm:w-auto sm:min-w-[155px]">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-[820] tracking-[-0.2px] text-white sm:text-[17px]">Capital archipelago</h2>
            <span className="rounded border border-[#24584f] bg-[#0d302d] px-2 py-1 font-mono text-[7px] font-[800] tracking-[0.7px] text-[#6ce2cf]">
              {demo ? 'VISUAL DEMO' : artSample ? 'ART SAMPLE' : 'VAULT ISLANDS'}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[8px] text-[#7e91aa] sm:text-[9px]">
            {visibleVaults.length} vault {visibleVaults.length === 1 ? 'island' : 'islands'} · select land to manage it
          </p>
        </div>

        <MapViewToggle value={mapView} onChange={(value) => {
          setMapView(value);
          if (value === 'terrain') setHoveredAsset(null);
        }} />
        <LayerToggle active={showTerritories} label="User territories" shortLabel="USERS" onClick={() => setShowTerritories((value) => !value)} />
        <div className="ml-1 flex items-center gap-1.5 border-l border-[#2a4055] pl-2">
          <MapButton label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>−</MapButton>
          <span className="w-9 text-center font-mono text-[8px] text-[#91a2b8]">{Math.round(zoom * 100)}%</span>
          <MapButton label="Zoom in" disabled={zoom >= 1.75} onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}>+</MapButton>
          <button type="button" onClick={resetView} className="h-8 rounded-md border border-[#344960] bg-[#101e2e] px-2 font-mono text-[7px] font-[800] tracking-[0.5px] text-[#aebdce] hover:border-[#68798c] hover:text-white">RESET</button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_48%_42%,#123c55_0%,#0a2a42_44%,#061827_100%)]">
        {visibleVaults.length === 0 ? (
          <EmptyMap />
        ) : (
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            className="h-full w-full touch-none select-none"
            role="img"
            aria-label="Interactive map of managed vault islands"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <defs>
              <pattern id="ocean-pixels" width="32" height="32" patternUnits="userSpaceOnUse">
                <rect width="32" height="32" fill="#08243a" />
                <rect width="16" height="16" fill="#0a2941" opacity="0.45" />
                <rect x="16" y="16" width="16" height="16" fill="#071f34" opacity="0.38" />
              </pattern>
              <filter id="island-shadow" x="-30%" y="-30%" width="160%" height="170%">
                <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#00101b" floodOpacity="0.65" />
              </filter>
              <filter id="selected-island" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#f1d552" floodOpacity="0.9" />
              </filter>
            </defs>
            <rect width={viewWidth} height={viewHeight} fill="url(#ocean-pixels)" />
            <OceanTexture width={viewWidth} height={viewHeight} />
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {visibleVaults.map((vault, index) => {
                const slotWidth = viewWidth / columns;
                const size = singleIsland ? SAMPLE_SIZE : ART_SIZE;
                const x = index % columns * slotWidth + (slotWidth - size) / 2;
                const y = (singleIsland ? 15 : 25) + Math.floor(index / columns) * 480;
                const variant = singleIsland ? ART_VARIANTS[0] : ART_VARIANTS[hashString(vault.address.toLowerCase()) % ART_VARIANTS.length];
                return (
                  <ArtVaultIsland
                    key={vault.address}
                    vault={vault}
                    x={x}
                    y={y}
                    size={size}
                    imageUrl={variant.image}
                    maskUrl={variant.mask}
                    selected={vault.address === selectedAddress}
                    connectedAddress={connectedAddress}
                    holdersOverride={holdersByVault?.[vault.address.toLowerCase()]}
                    showAssets={mapView === 'distribution'}
                    showTerritories={showTerritories}
                    hoveredAssetAddress={hoveredAsset?.address ?? null}
                    zoom={zoom}
                    onSelect={() => selectVault(vault.address)}
                    onTerritory={(holder) => {
                      selectVault(vault.address);
                      setTerritoryDetail({vault, holder});
                    }}
                    onAssetHover={(asset) => setHoveredAsset((current) => {
                      if (!current && !asset) return current;
                      if (current && asset && current.address === asset.address && current.percent === asset.percent) return current;
                      return asset;
                    })}
                  />
                );
              })}
            </g>
          </svg>
        )}

        {territoryDetail && showTerritories && (
          <TerritoryDetailCard detail={territoryDetail} onClose={() => setTerritoryDetail(null)} />
        )}
        {hoveredAsset && mapView === 'distribution' && <AssetHoverCard asset={hoveredAsset} />}
      </div>

      <MapLegend vault={selectedVault} mapView={mapView} showTerritories={showTerritories} demo={demo} />
    </div>
  );
}

function ArtVaultIsland({
  vault,
  x,
  y,
  size,
  imageUrl,
  maskUrl,
  selected,
  connectedAddress,
  holdersOverride,
  showAssets,
  showTerritories,
  hoveredAssetAddress,
  zoom,
  onSelect,
  onTerritory,
  onAssetHover,
}: {
  vault: VaultView;
  x: number;
  y: number;
  size: number;
  imageUrl: string;
  maskUrl: string;
  selected: boolean;
  connectedAddress?: Address;
  holdersOverride?: MapHolder[];
  showAssets: boolean;
  showTerritories: boolean;
  hoveredAssetAddress: string | null;
  zoom: number;
  onSelect: () => void;
  onTerritory: (holder: MapHolder) => void;
  onAssetHover: (asset: HoveredAsset | null) => void;
}) {
  const mix = useMemo(() => assetMix(vault.holdings), [vault.holdings]);
  const assets = useMemo<OverlayAsset[] | null>(
    () => mix.status === 'ready' ? mix.assets : null,
    [mix],
  );
  const holders = useMemo(
    () => holdersOverride ?? realHolders(vault, connectedAddress),
    [connectedAddress, holdersOverride, vault],
  );
  const overlay = useIslandOverlay({
    maskUrl,
    assets,
    holders,
    totalSupply: vault.totalSupply,
    seed: vault.address.toLowerCase(),
  });
  const labelHeight = mix.status === 'unpriced' ? 61 : 49;
  const highlightedAssetUrl = hoveredAssetAddress
    ? overlay.highlightedAssetUrls[hoveredAssetAddress.toLowerCase()] ?? null
    : null;
  const shownAssetUrl = highlightedAssetUrl ?? overlay.assetUrl;
  const dimWholeAssetLayer = Boolean(hoveredAssetAddress && !highlightedAssetUrl);

  function imagePixel(event: ReactMouseEvent<SVGRectElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const localX = Math.floor((point.x - x) / size * overlay.width);
    const localY = Math.floor((point.y - y) / size * overlay.height);
    if (localX < 0 || localY < 0 || localX >= overlay.width || localY >= overlay.height) return null;
    return localY * overlay.width + localX;
  }

  function selectTerritory(event: ReactMouseEvent<SVGRectElement>) {
    event.stopPropagation();
    onSelect();
    if (!showTerritories || !overlay.territoryAt) return;
    const pixel = imagePixel(event);
    if (pixel === null) return;
    const holderIndex = overlay.territoryAt[pixel];
    const holder = holders[holderIndex];
    if (holder) onTerritory(holder);
  }

  function hoverAsset(event: ReactMouseEvent<SVGRectElement>) {
    if (!showAssets || !overlay.assetAt || mix.status !== 'ready') return onAssetHover(null);
    const pixel = imagePixel(event);
    if (pixel === null) return onAssetHover(null);
    const asset = mix.assets[overlay.assetAt[pixel]];
    if (!asset) return onAssetHover(null);
    const total = mix.assets.reduce((sum, entry) => sum + entry.value, 0);
    onAssetHover({address: asset.address.toLowerCase(), symbol: asset.symbol, percent: asset.value / total * 100, color: asset.color});
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select vault ${vault.name}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect();
      }}
      className="cursor-pointer outline-none"
      data-interactive="vault"
      data-vault-address={vault.address}
      data-selected={selected ? 'true' : 'false'}
    >
      <g filter={selected ? 'url(#selected-island)' : 'url(#island-shadow)'}>
        <image
          href={imageUrl}
          x={x}
          y={y}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid meet"
          imageRendering="pixelated"
        />
        {showAssets && shownAssetUrl && (
          <image href={shownAssetUrl} x={x} y={y} width={size} height={size} imageRendering="pixelated" opacity={dimWholeAssetLayer ? 0.3 : 1} pointerEvents="none" />
        )}
        {showAssets && overlay.assetBoundaryUrl && (
          <image href={overlay.assetBoundaryUrl} x={x} y={y} width={size} height={size} imageRendering="pixelated" pointerEvents="none" />
        )}
        {showTerritories && overlay.boundaryUrl && (
          <image href={overlay.boundaryUrl} x={x} y={y} width={size} height={size} imageRendering="pixelated" pointerEvents="none" />
        )}
        <rect
          x={x}
          y={y}
          width={size}
          height={size}
          fill="transparent"
          onClick={selectTerritory}
          onMouseMove={hoverAsset}
          onMouseLeave={() => onAssetHover(null)}
        />
      </g>

      {showTerritories && overlay.markers.map((marker) => {
        const holder = holders[marker.holderIndex];
        return (
          <g
            key={holder.id}
            transform={`translate(${x + marker.x * size} ${y + marker.y * size}) scale(${1 / zoom})`}
            role="button"
            tabIndex={0}
            aria-label={`Open territory details for ${holder.label}`}
            data-map-control="wallet-marker"
            onClick={(event) => {
              event.stopPropagation();
              onTerritory(holder);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onTerritory(holder);
            }}
          >
            <InvestorMarker current={holder.current} label={holder.current ? 'YOU' : holder.label} />
          </g>
        );
      })}

      <g transform={`translate(${x + size / 2} ${y + size - 13}) scale(${1 / zoom})`} data-map-control="label" pointerEvents="none">
        <rect x="-105" y="0" width="210" height={labelHeight} rx="5" fill="#07111e" fillOpacity="0.96" stroke={selected ? '#e4ce4f' : '#52687f'} strokeWidth={selected ? 1.4 : 1} />
        <text x="0" y="17" textAnchor="middle" fill="white" fontSize="11" fontFamily="ui-monospace, monospace" fontWeight="800">{truncate(vault.name, 24)}</text>
        <text x="0" y="33" textAnchor="middle" fill={stateColor(vault.state)} fontSize="8" fontFamily="ui-monospace, monospace">{vault.state} · {vault.totalValueUsd === null ? 'VALUATION UNAVAILABLE' : `$${Number(vault.totalValueUsd).toLocaleString('en-US', {maximumFractionDigits: 0})}`}</text>
        {mix.status === 'unpriced' && <text x="0" y="49" textAnchor="middle" fill="#dccb76" fontSize="8" fontFamily="ui-monospace, monospace">Asset ratio unavailable</text>}
      </g>
    </g>
  );
}

function TerritoryDetailCard({detail, onClose}: {detail: TerritoryDetail; onClose: () => void}) {
  const ppm = sharePartsPerMillion(detail.holder.shares, detail.vault.totalSupply);
  const percent = ppm === null ? null : Number(ppm) / 10_000;
  return (
    <div className="absolute bottom-3 right-3 z-30 w-[min(300px,calc(100%-24px))] rounded-lg border border-[#3c566d] bg-[#071421]/96 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.48)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[8px] font-[800] tracking-[1px] text-[#72dfcd]">{detail.holder.kind === 'wallet' ? 'INVESTOR TERRITORY' : 'UNRESOLVED TERRITORY'}</p>
          <p className="mt-1 break-all text-[11px] font-[700] text-white">{detail.holder.address ?? detail.holder.label}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-6 w-6 shrink-0 place-items-center rounded border border-[#344a60] text-[12px] text-[#91a3b9] hover:text-white">×</button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px]">
        <div><dt className="text-[#6f849e]">Shares</dt><dd className="mt-1 text-[#dce6f1]">{tokenAmount(detail.holder.shares, 18, 6)}</dd></div>
        <div><dt className="text-[#6f849e]">Vault share</dt><dd className="mt-1 text-[#dce6f1]">{percent === null ? 'Unavailable' : `${formatPercent(percent)}%`}</dd></div>
        <div className="col-span-2"><dt className="text-[#6f849e]">Estimated position value</dt><dd className="mt-1 text-[#dce6f1]">{detail.holder.valueUsd === null ? 'Valuation unavailable' : `$${Number(detail.holder.valueUsd).toLocaleString('en-US', {maximumFractionDigits: 2})}`}</dd></div>
      </dl>
      {detail.holder.kind === 'residual' && <p className="mt-3 border-t border-[#24394d] pt-2 text-[9px] leading-[1.5] text-[#8295ad]">The current API does not identify wallets inside this remainder. It may include other investors or locked/system shares.</p>}
    </div>
  );
}

function AssetHoverCard({asset}: {asset: HoveredAsset}) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 rounded-md border border-[#48647a] bg-[#06131f]/95 px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.38)] backdrop-blur">
      <span className="h-3 w-3 rounded-sm border border-white/25" style={{backgroundColor: asset.color}} />
      <span className="text-[11px] font-[800] text-white">{asset.symbol}</span>
      <span className="font-mono text-[9px] text-[#b9c9da]">{formatPercent(asset.percent)}% of vault value</span>
    </div>
  );
}

function MapLegend({vault, mapView, showTerritories, demo}: {vault: VaultView | null; mapView: MapView; showTerritories: boolean; demo: boolean}) {
  const mix = useMemo(() => assetMix(vault?.holdings ?? []), [vault?.holdings]);
  const total = mix.assets.reduce((sum, asset) => sum + asset.value, 0);
  return (
    <div className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#263b52] bg-[#0b1725] px-3 py-2 font-mono text-[8px] leading-[1.4] text-[#8597ae] sm:px-4 sm:text-[9px]">
      {mix.status === 'ready' && <span className="font-[800] tracking-[0.5px] text-[#7489a2]">ASSET LEGEND</span>}
      {mix.status === 'ready' && mix.assets.map((asset) => (
        <span key={asset.address} className="inline-flex items-center gap-1.5 text-[#b9c7d7]">
          <span className="h-2.5 w-2.5 rounded-sm border border-white/20" style={{backgroundColor: asset.color}} />
          {asset.symbol} {formatPercent(asset.value / total * 100)}%
        </span>
      ))}
      {mix.status === 'unpriced' && <span className="text-[#d4c477]">Asset ratio unavailable · natural terrain retained</span>}
      {mix.status === 'ready' && <span className="text-[#6f849c]">{mapView === 'distribution' ? 'Asset distribution view' : 'Natural terrain view'}</span>}
      {showTerritories && <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-[#deebda]" /> Dashed = wallet share territory</span>}
      {!showTerritories && <span>User territories hidden</span>}
      <span className="ml-auto">{demo ? 'Static visual demo · no transactions' : 'Island size and terrain are decorative · not TVL or yield'}</span>
    </div>
  );
}

function realHolders(vault: VaultView, connectedAddress?: Address): MapHolder[] {
  const total = BigInt(vault.totalSupply);
  if (total <= BigInt(0)) return [];
  const requestedShares = vault.position === null ? BigInt(0) : BigInt(vault.position.shares);
  const currentShares = requestedShares > total ? total : requestedShares;
  const holders: MapHolder[] = [];
  if (connectedAddress && vault.position !== null && currentShares > BigInt(0)) {
    holders.push({
      id: connectedAddress.toLowerCase(),
      address: connectedAddress,
      label: shortAddress(connectedAddress),
      shares: currentShares.toString(),
      valueUsd: vault.position.valueUsd,
      current: true,
      kind: 'wallet',
    });
  }
  const remainder = total - currentShares;
  if (remainder > BigInt(0)) {
    holders.push({
      id: `${vault.address.toLowerCase()}:residual`,
      address: null,
      label: vault.position === null ? 'Share data unavailable' : 'Other / locked shares',
      shares: remainder.toString(),
      valueUsd: estimatedValue(vault.totalValueUsd, remainder, total),
      current: false,
      kind: 'residual',
    });
  }
  return holders;
}

function estimatedValue(totalValueUsd: string | null, shares: bigint, totalSupply: bigint) {
  if (totalValueUsd === null || totalSupply <= BigInt(0)) return null;
  return (Number(totalValueUsd) * Number(shares * BigInt(1_000_000) / totalSupply) / 1_000_000).toString();
}

function InvestorMarker({current, label}: {current: boolean; label: string}) {
  const shownLabel = truncate(label, 8);
  const labelWidth = Math.max(24, shownLabel.length * 5.4 + 10);
  return (
    <g className="cursor-pointer" data-investor-marker="true">
      <ellipse cx="0" cy="8" rx="10" ry="4" fill="#001019" opacity="0.55" />
      <circle cx="0" cy="-2" r="17" fill="#071522" fillOpacity="0.88" stroke={current ? '#70ead4' : '#e5d164'} strokeWidth="2" />
      <rect x="-2.5" y="-2" width="5" height="14" rx="1" fill="#9a6038" />
      <circle cx="-7" cy="-9" r="7" fill={current ? '#31a986' : '#8c7d36'} />
      <circle cx="6" cy="-10" r="8" fill={current ? '#56c8a2' : '#b4a249'} />
      <circle cx="0" cy="-16" r="7" fill={current ? '#83e2bd' : '#ddc85e'} />
      <rect x={-labelWidth / 2} y="18" width={labelWidth} height="15" rx="4" fill="#04101b" fillOpacity="0.92" stroke={current ? '#367a70' : '#6e622d'} strokeWidth="0.7" />
      <text x="0" y="28.5" textAnchor="middle" fill={current ? '#a7f2e4' : '#f6e37e'} stroke="#04101b" strokeWidth="2.4" paintOrder="stroke" fontSize="8" fontFamily="ui-monospace, monospace" fontWeight="800">{shownLabel}</text>
    </g>
  );
}

function MapViewToggle({value, onChange}: {value: MapView; onChange: (value: MapView) => void}) {
  return (
    <div role="group" aria-label="Map view" className="flex h-8 overflow-hidden rounded-md border border-[#344960] bg-[#0a1624]">
      <button
        type="button"
        aria-pressed={value === 'terrain'}
        onClick={() => onChange('terrain')}
        className={`px-2 font-mono text-[7px] font-[800] tracking-[0.4px] sm:px-2.5 ${value === 'terrain' ? 'bg-[#203448] text-white' : 'text-[#74879f] hover:text-white'}`}
      >
        <span className="sm:hidden">NATURE</span><span className="hidden sm:inline">Natural terrain</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'distribution'}
        onClick={() => onChange('distribution')}
        className={`border-l border-[#344960] px-2 font-mono text-[7px] font-[800] tracking-[0.4px] sm:px-2.5 ${value === 'distribution' ? 'bg-[#15453d] text-[#82ead8]' : 'text-[#74879f] hover:text-white'}`}
      >
        <span className="sm:hidden">ASSETS</span><span className="hidden sm:inline">Asset distribution</span>
      </button>
    </div>
  );
}

function LayerToggle({active, label, shortLabel, onClick}: {active: boolean; label: string; shortLabel: string; onClick: () => void}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`h-8 rounded-md border px-2 font-mono text-[7px] font-[800] tracking-[0.5px] transition sm:px-2.5 ${active ? 'border-[#3c766d] bg-[#12352f] text-[#78dfce]' : 'border-[#344960] bg-[#101e2e] text-[#71849c]'}`}
    >
      <span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function EmptyMap() {
  return (
    <div className="absolute inset-0 grid place-items-center p-8 text-center">
      <div>
        <div className="mx-auto h-16 w-24 opacity-65 [clip-path:polygon(8%_45%,22%_20%,52%_12%,82%_28%,96%_57%,72%_82%,36%_90%,10%_72%)] bg-[#347a64] ring-4 ring-[#1b4c63]" />
        <p className="mt-5 text-[15px] font-[750] text-[#cad6e5]">No managed vaults to map</p>
        <p className="mt-2 max-w-[360px] text-[12px] leading-[1.6] text-[#7d8fa7]">Connect the manager wallet or create its first vault. Decorative islands are never inserted.</p>
      </div>
    </div>
  );
}

function OceanTexture({width, height}: {width: number; height: number}) {
  const waves = Array.from({length: Math.max(14, Math.floor(height / 42))}, (_, index) => ({
    x: 25 + index * 179 % Math.max(1, width - 100),
    y: 36 + index * 109 % Math.max(1, height - 70),
    length: 16 + index % 3 * 7,
  }));
  return (
    <g opacity="0.28" aria-hidden="true" pointerEvents="none">
      {waves.map((wave, index) => (
        <g key={index}>
          <path d={`M${wave.x} ${wave.y}q${wave.length / 4} -3 ${wave.length / 2} 0t${wave.length / 2} 0`} fill="none" stroke="#56a1b9" strokeWidth="1.2" />
          {index % 2 === 0 && <path d={`M${wave.x + 7} ${wave.y + 7}q${wave.length / 5} -2 ${wave.length / 2.5} 0`} fill="none" stroke="#2d6c86" strokeWidth="1" />}
        </g>
      ))}
    </g>
  );
}

function MapButton({label, disabled, onClick, children}: {label: string; disabled: boolean; onClick: () => void; children: React.ReactNode}) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-md border border-[#344960] bg-[#101e2e] text-[17px] text-[#c4cfdb] hover:border-[#68798c] hover:text-white disabled:cursor-not-allowed disabled:opacity-35">{children}</button>;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value >= 0.01 && value < 99.99 ? value.toFixed(2).replace(/\.00$/, '') : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function stateColor(state: VaultView['state']) {
  if (state === 'ACTIVE') return '#6ee7d1';
  if (state === 'PAUSED') return '#f2d568';
  if (state === 'CLOSED') return '#ff9ba5';
  return '#a8b7ca';
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
