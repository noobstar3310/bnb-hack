'use client';

import {useEffect, useMemo, useState} from 'react';
import {formatUnits, parseUnits, type Address} from 'viem';
import {useNotify} from '@/components/Toast';
import {explainError, type VaultView} from '@/lib/contracts/hooks';
import {tokenAmount} from '@/lib/domain/format';
import {CuratorModal} from './CuratorModal';
import {REBALANCE_ABI_BLOCKER} from './dependencies';
import {curatorAssets, type SignedPrices, type TradeQuote} from './model';
import {useTokenSymbols} from './useTokenSymbols';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
}

const QUOTE_LIFETIME_MS = 20_000;

export function RebalanceCard({vault, managerAllowed}: Props) {
  const notify = useNotify();
  const assets = useMemo(() => curatorAssets(vault), [vault]);
  const sellable = vault.holdings.filter((holding) => holding.amount !== '0');
  const tokenSymbol = useTokenSymbols(assets);
  const [sell, setSell] = useState<Address | ''>(sellable[0]?.asset ?? '');
  const [buy, setBuy] = useState<Address | ''>(assets.find((asset) => asset.address !== sell)?.address ?? '');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [signedPrices, setSignedPrices] = useState<SignedPrices | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [pricesExpired, setPricesExpired] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [signingPrices, setSigningPrices] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const active = vault.state === 'ACTIVE';
  const planReady = Boolean(vault.plan && vault.plan.version > 0);
  const canQuote = managerAllowed && active && planReady;
  const sellHolding = sellable.find((holding) => holding.asset === sell);
  const buyAsset = assets.find((asset) => asset.address === buy);
  const sellSymbol = sellHolding ? tokenSymbol(sellHolding.asset, sellHolding.symbol) : '';
  const buySymbol = buyAsset ? tokenSymbol(buyAsset.address, buyAsset.symbol) : '';

  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuoteExpired(true), QUOTE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [quote]);

  useEffect(() => {
    if (!signedPrices) return;
    const remaining = Math.max(0, signedPrices.expiresAt * 1000 - Date.now());
    const timer = setTimeout(() => setPricesExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [signedPrices]);

  function clearPreparedTrade() {
    setQuote(null);
    setSignedPrices(null);
    setQuoteExpired(false);
    setPricesExpired(false);
    setQuoteError(null);
    setPriceError(null);
    setConfirmOpen(false);
  }

  function changeSell(value: Address) {
    setSell(value);
    if (buy === value) setBuy(assets.find((asset) => asset.address !== value)?.address ?? '');
    clearPreparedTrade();
  }

  async function prepareTrade() {
    if (!sellHolding || !buyAsset) return notify('Choose different sell and buy tokens.');
    let rawAmount: bigint;
    try {
      rawAmount = parseUnits(amount, sellHolding.decimals);
    } catch {
      return notify('Enter a valid sell amount.');
    }
    if (rawAmount <= BigInt(0)) return notify('Enter an amount above zero.');
    if (rawAmount > BigInt(sellHolding.amount)) {
      return notify(`The vault does not hold that much ${sellSymbol}.`);
    }

    setQuoting(true);
    setSigningPrices(true);
    setQuoteError(null);
    setPriceError(null);
    setQuote(null);
    setSignedPrices(null);
    setQuoteExpired(false);
    setPricesExpired(false);
    setConfirmOpen(false);

    const tradeParams = new URLSearchParams({
      vault: vault.address,
      sell: sellHolding.asset,
      buy: buyAsset.address,
      amount: rawAmount.toString(),
      slippage,
    });
    const include = Array.from(new Set([sellHolding.asset, buyAsset.address])).join(',');
    const priceParams = new URLSearchParams({vault: vault.address, include});
    const [tradeFailure, priceFailure] = await Promise.all([
      fetchJson<TradeQuote>(`/api/trade?${tradeParams}`)
        .then((result) => {
          setQuote(result);
          return null;
        })
        .catch((caught) => {
          const message = explainError(caught);
          setQuoteError(message);
          return `Quote: ${message}`;
        })
        .finally(() => setQuoting(false)),
      fetchJson<SignedPrices>(`/api/prices?${priceParams}`)
        .then((result) => {
          setSignedPrices(result);
          return null;
        })
        .catch((caught) => {
          const message = explainError(caught);
          setPriceError(message);
          return `Signed prices: ${message}`;
        })
        .finally(() => setSigningPrices(false)),
    ]);
    const failures = [tradeFailure, priceFailure].filter((failure): failure is string => Boolean(failure));
    if (failures.length > 0) {
      notify(failures.join(' '));
    } else {
      setConfirmOpen(true);
    }
  }

  const warnings = quote?.warnings ?? [];
  const priceIncludes = Array.from(new Set([sell, buy].filter((asset): asset is Address => Boolean(asset))));
  const expected = quote && buyAsset ? formatUnits(BigInt(quote.quote.expectedBuyAmount), buyAsset.decimals) : null;
  const minimum = quote && buyAsset ? formatUnits(BigInt(quote.trade.minBuyAmount), buyAsset.decimals) : null;
  const quoteStatus = !canQuote ? 'Blocked' : quoting ? 'Loading' : quoteError ? 'Error' : quoteExpired ? 'Expired' : quote ? 'Ready' : 'Not started';
  const priceStatus = !canQuote ? 'Blocked' : signingPrices ? 'Loading' : priceError ? 'Error' : pricesExpired ? 'Expired' : signedPrices ? 'Ready' : 'Not started';
  const prepared = Boolean(quote && signedPrices);

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[9px] font-[800] tracking-[1.6px] text-[#74839a]">REBALANCE</p>
          <h2 className="text-[15px] font-[750] text-white">Build a live route</h2>
        </div>
        <StatusPill ok={active && planReady} label={active && planReady ? 'READY' : 'BLOCKED'} />
      </div>
      <p className="mt-2 text-[11px] leading-[1.55] text-[#93a2b8]">Fetch a live route and signed prices, then review everything before wallet confirmation.</p>

      {(!active || !planReady || !managerAllowed) && (
        <div className="mt-3 rounded-lg border border-[#65303a] bg-[#28161e] p-2.5 text-[11px] leading-[1.5] text-[#ff9ba5]">
          <strong className="block">Requirements not met</strong>
          {!managerAllowed && <span className="block">Connect this vault&apos;s manager wallet.</span>}
          {!active && <span className="block">Vault is {vault.state}; rebalancing requires ACTIVE.</span>}
          {!planReady && <span className="block">Publish an on-chain plan before trading.</span>}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sell">
            <select
              value={sell}
              onChange={(event) => changeSell(event.target.value as Address)}
              disabled={!canQuote || quoting}
              className={inputClass}
            >
              {sellable.map((holding) => (
                <option key={holding.asset} value={holding.asset}>
                  {tokenSymbol(holding.asset, holding.symbol)} · {tokenAmount(holding.amount, holding.decimals, 3)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buy">
            <select
              value={buy}
              onChange={(event) => {
                setBuy(event.target.value as Address);
                clearPreparedTrade();
              }}
              disabled={!canQuote || quoting}
              className={inputClass}
            >
              {assets.filter((asset) => asset.address !== sell).map((asset) => (
                <option key={asset.address} value={asset.address}>{tokenSymbol(asset.address, asset.symbol)}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Amount to sell">
          <input
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              clearPreparedTrade();
            }}
            inputMode="decimal"
            placeholder="5"
            disabled={!canQuote || quoting}
            className={inputClass}
          />
        </Field>
        <Field label="Max slippage">
          <div className="flex rounded-lg border border-[#33445b] bg-[#07131f] pr-3 focus-within:border-[#f4cd3f]">
            <input
              value={slippage}
              onChange={(event) => {
                setSlippage(event.target.value);
                clearPreparedTrade();
              }}
              inputMode="decimal"
              disabled={!canQuote || quoting}
              className="min-w-0 flex-1 bg-transparent px-3 py-[10px] text-[12px] text-white outline-none disabled:opacity-50"
            />
            <span className="self-center font-mono text-[10px] text-[#76869d]">%</span>
          </div>
        </Field>
      </div>

      <button
        type="button"
        onClick={prepared && !quoteExpired && !pricesExpired ? () => setConfirmOpen(true) : prepareTrade}
        disabled={!canQuote || quoting || signingPrices || !sellHolding || !buyAsset}
        className="mt-4 w-full rounded-lg border border-[#f2cf3d] bg-[#f2cf3d] px-4 py-3 text-[12px] font-[850] text-[#111827] transition hover:bg-[#ffe56e] disabled:cursor-not-allowed disabled:border-[#4d4627] disabled:bg-[#2b2819] disabled:text-[#817746]"
      >
        {quoting || signingPrices ? 'Fetching quote and signed prices…' : prepared && !quoteExpired && !pricesExpired ? 'Review prepared quote' : 'Prepare rebalance'}
      </button>

      {(quoteError || priceError) && (
        <div role="alert" className="mt-3 rounded-lg border border-[#72323c] bg-[#2d1720] p-2.5 text-[11px] leading-[1.55] text-[#ff9ba5]">
          <strong className="block">Preparation failed</strong>
          {quoteError && <span className="block">Quote: {quoteError}</span>}
          {priceError && <span className="block">Signed prices: {priceError}</span>}
        </div>
      )}

      {(quoteExpired || pricesExpired) && (
        <div role="alert" className="mt-3 rounded-lg border border-[#66541e] bg-[#261f10] p-2.5 text-[11px] leading-[1.55] text-[#e7d36d]">
          The {quoteExpired && pricesExpired ? 'quote and signed prices have' : quoteExpired ? 'quote has' : 'signed prices have'} expired. Prepare a fresh package before confirmation.
        </div>
      )}

      <details className="mt-4 rounded-lg border border-[#2a3c53] bg-[#091522]">
        <summary className="cursor-pointer list-none px-3 py-3 text-[11px] font-[750] text-[#b8c5d5] marker:hidden">
          <span className="flex items-center justify-between gap-3">
            Transaction stages
            <span className="font-mono text-[9px] text-[#70829a]">{prepared ? 'PACKAGE READY' : 'VIEW DETAILS'} ▾</span>
          </span>
        </summary>
        <div className="border-t border-[#27394f] p-3" aria-live="polite">
          <ol className="grid gap-2 text-[10px]">
            <Stage label="1. Binance quote" status={quoteStatus} />
            <Stage label={`2. Signed prices · include=${priceIncludes.join(',') || 'trade assets'}`} status={priceStatus} />
            <Stage label={quote ? `3. Simulation · ${Number(quote.gasLimit).toLocaleString('en-US')} gas` : '3. Contract simulation'} status="Blocked by ABI" />
            <Stage label="4. Manager wallet confirmation" status="Not started" />
            <Stage label="5. On-chain result" status="Not started" />
          </ol>
          <details className="mt-3 rounded-lg border border-[#5e5020] bg-[#231f12] p-2.5 text-[10px] leading-[1.55] text-[#dac66b]">
            <summary className="cursor-pointer font-[750] text-[#f4d657]">Execution unavailable · technical detail</summary>
            <p className="mt-1">{REBALANCE_ABI_BLOCKER}</p>
          </details>
        </div>
      </details>

      <CuratorModal open={confirmOpen} title="Review rebalance quote" onClose={() => setConfirmOpen(false)}>
        {quote && signedPrices ? (
          <div>
            <div className="rounded-lg border border-[#2d435b] bg-[#081522] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] text-[#74869e]">PROPOSED ROUTE</p>
                  <p className="mt-1 text-[15px] font-[800] text-white">{sellSymbol} → {buySymbol}</p>
                </div>
                <StatusPill ok={!quoteExpired && !pricesExpired} label={quoteExpired || pricesExpired ? 'EXPIRED' : 'FRESH'} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <QuoteValue label="Expected output" value={`${expected ?? 'Unavailable'} ${buySymbol}`} />
                <QuoteValue label="Minimum received" value={`${minimum ?? 'Unavailable'} ${buySymbol}`} />
                <QuoteValue label="Route loss" value={quote.quote.lossPercent === null ? 'Not available' : `${quote.quote.lossPercent.toFixed(2)}%`} />
                <QuoteValue label="Backend gas limit" value={Number(quote.gasLimit).toLocaleString('en-US')} />
                <QuoteValue label="Slippage" value={`${quote.quote.slippagePercent}%`} />
                <QuoteValue label="Price expiry" value={new Date(signedPrices.expiresAt * 1000).toLocaleTimeString()} />
              </div>
              <div className="mt-4 border-t border-[#293b50] pt-3">
                <p className="font-mono text-[9px] text-[#74869e]">ROUTE</p>
                <p className="mt-1 break-words text-[11px] text-[#c5d0dd]">{quote.quote.route.join(' → ') || 'No route description returned'}</p>
              </div>
            </div>

            {warnings.length > 0 ? (
              <div className="mt-3 rounded-lg border border-[#66541e] bg-[#261f10] p-3 text-[11px] leading-[1.6] text-[#e7d36d]">
                <strong className="block text-[#f4d657]">Backend warnings</strong>
                <ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-[#225f58] bg-[#102b2a] p-3 text-[11px] text-[#72dfca]">The backend returned no warnings for this route.</div>
            )}

            {(quoteExpired || pricesExpired) && <p className="mt-3 rounded-lg border border-[#66541e] bg-[#261f10] p-3 text-[11px] text-[#e7d36d]">This package expired. Close the dialog and prepare a fresh quote.</p>}

            <button type="button" disabled title={REBALANCE_ABI_BLOCKER} className="mt-4 w-full rounded-lg border border-[#4d4627] bg-[#2b2819] px-4 py-3 text-[12px] font-[850] text-[#817746] disabled:cursor-not-allowed">
              Wallet confirmation unavailable
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-[#92a2b7]">The quote package is no longer available. Close this dialog and prepare it again.</p>
        )}
      </CuratorModal>
    </section>
  );
}

const inputClass = 'w-full rounded-lg border border-[#33445b] bg-[#07131f] px-3 py-[10px] text-[12px] text-white outline-none focus:border-[#f4cd3f] disabled:opacity-50';

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <label className="grid gap-1.5 text-[10px] font-[700] text-[#b8c4d4]">{label}{children}</label>;
}

function QuoteValue({label, value}: {label: string; value: string}) {
  return (
    <div>
      <span className="block font-mono text-[9px] uppercase tracking-[0.7px] text-[#718198]">{label}</span>
      <strong className="mt-1 block break-words text-[12px] font-[700] text-[#e7edf6]">{value}</strong>
    </div>
  );
}

function StatusPill({ok, label}: {ok: boolean; label: string}) {
  return <span className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] ${ok ? 'border-[#225f58] bg-[#123e39] text-[#6ee7d1]' : 'border-[#69333d] bg-[#2a1820] text-[#ff9ba5]'}`}>{label}</span>;
}

function Stage({label, status}: {label: string; status: string}) {
  const positive = status === 'Ready';
  const warning = status === 'Expired' || status === 'Error' || status.includes('Blocked');
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[#26364b] bg-[#0d1724] px-2.5 py-2">
      <span className="min-w-0 break-all text-[#aab7c9]">{label}</span>
      <strong className={positive ? 'text-[#6ee7d1]' : warning ? 'text-[#ff9ba5]' : 'text-[#78889f]'}>{status}</strong>
    </li>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {cache: 'no-store'});
  const body = await response.json() as {error?: string; message?: string; success?: boolean} & T;
  if (!response.ok || body.success === false) {
    throw new Error(body.error ?? body.message ?? `Request failed with HTTP ${response.status}.`);
  }
  return body;
}
