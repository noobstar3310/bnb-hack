'use client';

import {useEffect, useMemo, useState} from 'react';
import {formatUnits, parseUnits, type Address} from 'viem';
import {useNotify} from '@/components/Toast';
import {explainError, type VaultView} from '@/lib/contracts/hooks';
import {tokenAmount} from '@/lib/domain/format';
import {curatorAssets, type TradeQuote} from './model';
import type {CuratorAction} from './useCuratorActions';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
  action: CuratorAction;
  onRebalance: (vault: Address, quote: TradeQuote) => Promise<void>;
}

const QUOTE_LIFETIME_MS = 20_000;

export function RebalanceCard({vault, managerAllowed, action, onRebalance}: Props) {
  const notify = useNotify();
  const assets = useMemo(() => curatorAssets(vault), [vault]);
  const sellable = vault.holdings.filter((holding) => holding.amount !== '0');
  const [sell, setSell] = useState<Address | ''>(sellable[0]?.asset ?? '');
  const [buy, setBuy] = useState<Address | ''>(assets.find((asset) => asset.address !== sell)?.address ?? '');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const busy = action === 'rebalancing';
  const stateAllowsTrade = vault.state === 'SEEDED' || vault.state === 'ACTIVE';

  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuoteExpired(true), QUOTE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [quote]);

  const sellHolding = sellable.find((holding) => holding.asset === sell);
  const buyAsset = assets.find((asset) => asset.address === buy);
  function changeSell(value: Address) {
    setSell(value);
    if (buy === value) setBuy(assets.find((asset) => asset.address !== value)?.address ?? '');
    setQuote(null);
  }

  async function getQuote() {
    if (!sellHolding || !buyAsset) return notify('Choose different sell and buy tokens.');
    let rawAmount: bigint;
    try {
      rawAmount = parseUnits(amount, sellHolding.decimals);
    } catch {
      return notify('Enter a valid sell amount.');
    }
    if (rawAmount <= BigInt(0)) return notify('Enter an amount above zero.');
    if (rawAmount > BigInt(sellHolding.amount)) return notify(`The vault does not hold that much ${sellHolding.symbol}.`);

    setQuoting(true);
    setQuote(null);
    try {
      const params = new URLSearchParams({
        vault: vault.address,
        sell: sellHolding.asset,
        buy: buyAsset.address,
        amount: rawAmount.toString(),
        slippage,
      });
      const response = await fetch(`/api/trade?${params}`, {cache: 'no-store'});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not build a trade quote.');
      setQuoteExpired(false);
      setQuote(body as TradeQuote);
    } catch (error) {
      notify(explainError(error));
    } finally {
      setQuoting(false);
    }
  }

  async function confirmTrade() {
    if (!quote || quoteExpired) return notify('That quote expired. Fetch a fresh one before signing.');
    try {
      await onRebalance(vault.address, quote);
      setQuote(null);
      setAmount('');
      notify('Rebalance confirmed on-chain.');
    } catch (error) {
      notify(explainError(error));
    }
  }

  const warnings = quote?.warnings ?? [];
  const expected = quote && buyAsset ? formatUnits(BigInt(quote.quote.expectedBuyAmount), buyAsset.decimals) : null;
  const minimum = quote && buyAsset ? formatUnits(BigInt(quote.trade.minBuyAmount), buyAsset.decimals) : null;

  return (
    <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
      <p className="mb-2 text-[11px] font-[750] tracking-[1.8px] text-muted-3">REBALANCE</p>
      <h2 className="text-[20px] tracking-[-0.5px]">Review a live route</h2>
      <p className="mt-2 text-[13px] leading-[1.65] text-muted-2">
        Binance builds the route with this vault as the trader. Nothing is signed until you review the output.
      </p>

      {!stateAllowsTrade && (
        <p className="mt-4 rounded-lg bg-[#f6e9eb] p-3 text-[13px] leading-[1.6] text-negative">
          Trading is unavailable while the vault is {vault.state.toLowerCase()}.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-[7px] text-[13px] font-[650] text-[#37465d]">
          Sell
          <select
            value={sell}
            onChange={(event) => changeSell(event.target.value as Address)}
            disabled={!managerAllowed || busy || !stateAllowsTrade}
            className="rounded-lg border border-field bg-field-bg px-3 py-[11px] font-normal text-ink disabled:opacity-60"
          >
            {sellable.map((holding) => (
              <option key={holding.asset} value={holding.asset}>
                {holding.symbol} Â· {tokenAmount(holding.amount, holding.decimals, 4)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-[7px] text-[13px] font-[650] text-[#37465d]">
          Buy
          <select
            value={buy}
            onChange={(event) => {
              setBuy(event.target.value as Address);
              setQuote(null);
            }}
            disabled={!managerAllowed || busy || !stateAllowsTrade}
            className="rounded-lg border border-field bg-field-bg px-3 py-[11px] font-normal text-ink disabled:opacity-60"
          >
            {assets.filter((asset) => asset.address !== sell).map((asset) => (
              <option key={asset.address} value={asset.address}>{asset.symbol}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-[7px] text-[13px] font-[650] text-[#37465d]">
          Amount to sell
          <input
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setQuote(null);
            }}
            inputMode="decimal"
            placeholder="5"
            disabled={!managerAllowed || busy || !stateAllowsTrade}
            className="rounded-lg border border-field bg-field-bg px-3 py-[11px] font-normal text-ink disabled:opacity-60"
          />
        </label>
        <label className="grid gap-[7px] text-[13px] font-[650] text-[#37465d]">
          Max slippage
          <span className="flex items-center rounded-lg border border-field bg-field-bg pr-3">
            <input
              value={slippage}
              onChange={(event) => {
                setSlippage(event.target.value);
                setQuote(null);
              }}
              inputMode="decimal"
              disabled={!managerAllowed || busy || !stateAllowsTrade}
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-[11px] font-normal outline-none disabled:opacity-60"
            />
            <span className="text-[12px] text-muted-3">%</span>
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={getQuote}
        disabled={!managerAllowed || !stateAllowsTrade || quoting || busy || !sellHolding || !buyAsset}
        className="mt-4 w-full rounded-lg border border-line-2 bg-white px-4 py-3 text-[14px] font-[650] text-[#253b5c] hover:bg-[#f7f9fc] disabled:opacity-50"
      >
        {quoting ? 'Getting fresh quoteâ€¦' : 'Get rebalance quote'}
      </button>

      {quote && (
        <div className="mt-5 rounded-xl border border-[#cad5e3] bg-[#f8fafc] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <QuoteValue label="Expected output" value={`${expected} ${buyAsset?.symbol ?? ''}`} />
            <QuoteValue label="Minimum received" value={`${minimum} ${buyAsset?.symbol ?? ''}`} />
            <QuoteValue label="Slippage" value={`${quote.quote.slippagePercent}%`} />
            <QuoteValue label="Route" value={quote.quote.route.join(' â†’ ') || 'Binance router'} />
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 rounded-lg bg-[#fff2d8] p-3 text-[13px] leading-[1.6] text-[#7a5310]">
              <strong className="block">Resolve before signing</strong>
              <ul className="mt-1 list-disc pl-5">
                {warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
          {quoteExpired && (
            <p className="mt-4 rounded-lg bg-[#fff2d8] p-3 text-[13px] text-[#7a5310]">
              This quote is more than 20 seconds old. Fetch a fresh one before signing.
            </p>
          )}
          <button
            type="button"
            onClick={confirmTrade}
            disabled={busy || quoteExpired || warnings.length > 0}
            className="mt-4 w-full rounded-lg border border-ink-soft bg-ink-soft px-4 py-3 text-[14px] font-[650] text-white hover:bg-ink-hover disabled:opacity-50"
          >
            {busy ? 'Waiting for confirmationâ€¦' : 'Confirm rebalance in wallet'}
          </button>
        </div>
      )}
    </section>
  );
}

function QuoteValue({label, value}: {label: string; value: string}) {
  return (
    <div>
      <span className="block text-[11px] font-[650] uppercase tracking-[0.8px] text-muted-3">{label}</span>
      <strong className="mt-1 block break-words text-[14px] font-[650] text-ink">{value}</strong>
    </div>
  );
}
