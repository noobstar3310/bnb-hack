/**
 * Turns a Binance quote into the `TradeRequest` the manager passes to
 * `vault.rebalance(t, prices, signature)` (spec §6, AGENTS.md shared interfaces). The router
 * calldata is opaque; the contract's balance checks and its 2% loss cap at the signed prices are
 * what make it safe, so this module's job is to refuse anything the contract should never be asked
 * to run and to fill in honest bounds. The signed prices come from `/api/prices` with
 * `include=<buy token>`.
 */
import {getAddress, isAddress, type Address, type Hex} from 'viem';
import {buildSwap, getSwapQuote} from '@/lib/binance/queries';
import {ApiError, isChainDown, publicClient} from '@/lib/chain/server';
import {assetRegistryAbi, erc20Abi, folioVaultAbi} from '@/lib/contracts/abis';
import {VAULT_STATES, vaultPlanAbi} from '@/lib/vaults/read';

export const DEFAULT_SLIPPAGE_PERCENT = '1';
/** Wallets underestimate `rebalance`; a real swap on a BSC fork used ~850k gas. */
export const REBALANCE_GAS_LIMIT = '1500000';
/** FolioVault.MAX_ASSETS: most tokens a vault may hold, USDT included. */
const MAX_ASSETS = 10;

/** Field-for-field the Solidity struct; amounts are raw base units as strings. */
export interface TradeRequest {
  router: Address;
  sellToken: Address;
  buyToken: Address;
  maxSellAmount: string;
  minBuyAmount: string;
  callData: Hex;
}

export interface BuiltTrade {
  trade: TradeRequest;
  quote: {expectedBuyAmount: string; slippagePercent: string; route: string[]};
  /** Send `rebalance` with this gas limit; wallet estimates come out too low. */
  gasLimit: string;
  /** Problems the contract will reject on; shown, not thrown, so development on a fork works. */
  warnings: string[];
}

export interface TradeParams {
  vault: string;
  sell: string;
  buy: string;
  amount: string;
  slippage?: string;
}

function address(value: string, name: string): Address {
  if (!isAddress(value)) throw new ApiError(`${name} must be an address`, 400);
  return getAddress(value);
}

export async function buildTrade(params: TradeParams): Promise<BuiltTrade> {
  const vault = address(params.vault, 'vault');
  const sell = address(params.sell, 'sell');
  const buy = address(params.buy, 'buy');
  if (sell === buy) throw new ApiError('sell and buy must differ', 400);
  if (!/^[1-9]\d*$/.test(params.amount)) {
    throw new ApiError('amount must be a positive integer in the sell token’s base units', 400);
  }
  const slippage = params.slippage ?? DEFAULT_SLIPPAGE_PERCENT;
  const slippageNum = Number(slippage);
  if (!Number.isFinite(slippageNum) || slippageNum <= 0 || slippageNum > 5) {
    throw new ApiError('slippage must be a percentage between 0 and 5', 400);
  }

  // The vault is the trader: Ondo market makers price for the address that sends the swap.
  const swapArgs = {fromTokenAddress: sell, toTokenAddress: buy, amount: params.amount, userWalletAddress: vault};
  const quotes = await getSwapQuote(swapArgs);
  if (!quotes.ok) throw new ApiError(`Could not get a Binance quote right now. (${quotes.error})`, 503);
  const best = quotes.data[0];
  if (!best) throw new ApiError('No route for this pair and size', 422);

  const swap = await buildSwap({...swapArgs, quoteId: best.quoteId, slippagePercent: slippage});
  if (!swap.ok) throw new ApiError(`Could not build the Binance swap right now. (${swap.error})`, 503);
  const {tx} = swap.data;

  // A signed RFQ order cannot be executed by a contract; never hand one to the vault (spec §8.1).
  if (swap.data.executionMode !== 'SWAP' || swap.data.rfq || tx.signatureData) {
    throw new ApiError(`Route needs a signed RFQ order (${swap.data.executionMode}); a vault cannot trade it`, 422);
  }
  if (BigInt(tx.value || '0') !== BigInt(0)) throw new ApiError('Route expects native BNB; refusing', 422);
  if (!isAddress(tx.to)) throw new ApiError('Binance returned no router address', 502);

  const trade: TradeRequest = {
    router: getAddress(tx.to),
    sellToken: sell,
    buyToken: buy,
    maxSellAmount: params.amount,
    minBuyAmount: tx.minReceiveAmount,
    callData: tx.data as Hex,
  };

  return {
    trade,
    quote: {
      expectedBuyAmount: best.toTokenAmount,
      slippagePercent: tx.slippagePercent,
      route: best.dexRouterList.map((r) => `${r.dexProtocol.dexName} ${r.dexProtocol.percent}%`),
    },
    gasLimit: REBALANCE_GAS_LIMIT,
    warnings: await contractWarnings(vault, trade),
  };
}

/** What `rebalance` would reject, read from the chain so the curator sees it before signing. */
async function contractWarnings(vault: Address, t: TradeRequest): Promise<string[]> {
  const client = publicClient();
  let registry: Address;
  let held: readonly Address[];
  let state: number;
  let settlement: Address;
  try {
    [registry, held, state, settlement] = await Promise.all([
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'registry'}),
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'heldAssets'}),
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'state'}),
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'settlementToken'}),
    ]);
  } catch (error) {
    return [isChainDown(error) ? 'Could not check the vault on-chain: the blockchain node is not responding' : `${vault} is not a Folio vault on the configured chain`];
  }

  const [routerOk, routerIsAsset, buyOk, planVersion, sellBalance] = await Promise.all([
    client.readContract({address: registry, abi: assetRegistryAbi, functionName: 'isRouter', args: [t.router]}),
    client.readContract({address: registry, abi: assetRegistryAbi, functionName: 'isAsset', args: [t.router]}),
    client.readContract({address: registry, abi: assetRegistryAbi, functionName: 'isAsset', args: [t.buyToken]}),
    client.readContract({address: vault, abi: vaultPlanAbi, functionName: 'planVersion'}).catch(() => null),
    client.readContract({address: t.sellToken, abi: erc20Abi, functionName: 'balanceOf', args: [vault]}),
  ]);

  const isHeld = (a: Address) => held.some((h) => getAddress(h) === a);
  const warnings: string[] = [];
  if (VAULT_STATES[state] !== 'ACTIVE') warnings.push(`The vault is ${VAULT_STATES[state] ?? state}; it can only trade while ACTIVE`);
  if (planVersion === null) warnings.push('Could not read the vault’s plan; it may predate setPlan');
  else if (planVersion === BigInt(0)) warnings.push('The curator must post a plan (setPlan) before the first trade');
  if (!routerOk || routerIsAsset) warnings.push(`Router ${t.router} is not allowlisted in the registry`);
  if (!buyOk) warnings.push(`Buy token ${t.buyToken} is not an approved asset`);
  if (!isHeld(t.sellToken)) warnings.push(`The vault does not hold ${t.sellToken}`);
  if (sellBalance < BigInt(t.maxSellAmount)) warnings.push(`The vault holds only ${sellBalance} of ${t.sellToken}`);
  // A stock (never USDT) sold to exactly 0 frees its slot before the buy token takes one.
  const freesSlot = sellBalance === BigInt(t.maxSellAmount) && t.sellToken !== getAddress(settlement);
  if (!isHeld(t.buyToken) && held.length - (freesSlot ? 1 : 0) >= MAX_ASSETS) {
    warnings.push(`The vault already holds ${MAX_ASSETS} tokens; sell one out before buying another`);
  }
  return warnings;
}
