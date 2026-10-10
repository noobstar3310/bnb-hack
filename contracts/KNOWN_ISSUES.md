# Known issues — contracts handoff

Open security issues in `contracts/`, found by a 3-pass AI security review on 10 October 2026
(36 review agents over `FolioVault`, `AssetRegistry`, `VaultFactory` and `script/Deploy.s.sol`).
**None is fixed.** They were accepted for the hackathon demo and must be fixed before real
investor money goes in.

Line numbers refer to the code as of the review. Search for the quoted code if they have moved.

## Before you start

```bash
cd contracts
forge build && forge test        # 141 tests should pass
```

- Read `contracts/README.md` first (how the vault works), then spec §6 in
  `docs/folio-lab-contract-architecture.md` (why `rebalance` checks balances, not calldata).
- Tests live in `test/`. `test/helpers/VaultFixture.sol` gives you a seeded vault, a mock router
  and `_trade(sell, buy, sellAmount, buyAmount)`, which posts a plan and runs a fair trade.
  `test/mocks/MockRouter.sol` has honest and hostile router functions.
- Work test-first: write the attack as a failing test, then fix it, then run
  `forge fmt && forge build && forge lint && forge test`.
- Changing a function signature or event changes the shared interface in `AGENTS.md`. Agree it
  with Parts 2–4 first.

## Summary

| # | Priority | Issue | Who can trigger it | Effort |
|---|---|---|---|---|
| 1 | **High** | Many 2%-loss trades add up with no limit | Manager | Small |
| 2 | **High** | 1 wei of a sold stock keeps it in the held list forever | Anyone | Tiny |
| 3 | Medium | Anyone can seed a vault before its manager | Anyone | Tiny (founder decision) |
| 4 | Medium | Deposit with an old signed price, then redeem at once | Anyone | Small, but a design choice |
| 5 | Medium | Deposit then redeem buys stock at the signed price with no fee | Anyone | Small, but a design choice |
| 6 | Low | Deposits count a frozen stock at full price | Existing holder | Small |

---

## 1. Many 2%-loss trades add up with no limit

**Where:** `src/FolioVault.sol` `rebalance`, the loss check near line 309:

```solidity
if (valueBought * 10_000 < valueSold * (10_000 - MAX_TRADE_LOSS_BPS)) {
    revert TradeLossTooHigh(valueSold, valueBought);
}
```

**What goes wrong:** the check limits the loss of **one** trade to 2% at the signed prices. Nothing
limits how many trades the manager makes, or the total loss. A manager who controls the other side
of the trade keeps the 2% every time:

- a sandwich: buy on the pool before the vault's trade, sell after it, in one bundle
- a route through a pool the manager owns (the router calldata is opaque and the manager builds it)
- a fee or receiver field in the router calldata (the router is an upgradeable proxy)

**Numbers:** a vault with 100,000 USDT. Each trade gets 98% of the signed value back. After 35
trades the vault holds 100,000 × 0.98^35 ≈ 49,300 USDT. All of them fit in one transaction, so
investors cannot redeem in between. This breaks the core promise "the manager can trade but never
withdraw".

**Fix options:**

- **A (simplest):** a cooldown between trades, for example 1 hour. Investors then see each trade
  and can leave.
  ```solidity
  uint256 public constant TRADE_COOLDOWN = 1 hours;
  uint64 public lastTradeAt;
  // in rebalance, after the plan check:
  if (block.timestamp < lastTradeAt + TRADE_COOLDOWN) revert TradeCooldown();
  lastTradeAt = uint64(block.timestamp);
  ```
- **B (stronger):** a daily loss budget. Add up `valueSold - valueBought` per day and revert when it
  goes over a cap (for example 2% of the value sold that day).
- A and B can be combined.

**Tests to add** (`test/FolioVaultRebalance.t.sol`):
- a second trade inside the cooldown reverts; a trade after `vm.warp(+1 hours)` passes
- (for B) a series of trades that each lose 1.9% reverts once the budget is used

**Watch out:** `test/helpers/VaultFixture.sol` `_trade` is called several times in a row by some
tests (for example `_fillToCap`). Add a `vm.warp` there, or those tests will hit the cooldown.

---

## 2. One wei of a sold stock keeps it in the held list forever

**Where:** `src/FolioVault.sol` `rebalance`, line 313:

```solidity
if (sellAfter == 0 && t.sellToken != address(settlementToken)) _held.remove(t.sellToken);
```

**What goes wrong:** the stock leaves `_held` only when its balance is **exactly** 0. The Binance
calldata sells a fixed amount (the balance at quote time). Anyone can send 1 wei of that stock to the
vault first, so 1 wei stays and the stock stays held. The manager cannot clear it: selling 1 wei
returns 0, so `rebalance` reverts with `BuyTooLow`.

**Effects:**
- the stock keeps one of the 10 `MAX_ASSETS` slots; when the vault is full, a swap into a new stock
  reverts with `TooManyAssets`
- every deposit needs a signed price for it (`_vaultValue` skips only a zero balance); if the backend
  stops pricing it (for example after it is delisted), every deposit reverts with `MissingPrice`
- it costs the attacker 1 wei plus gas, and they can repeat it on every retry

**Fix:**
```solidity
/// @dev A leftover this small is treated as sold out, so a 1-wei donation cannot pin a token.
uint256 internal constant DUST = 1e12;
// line 313:
if (sellAfter <= DUST && t.sellToken != address(settlementToken)) _held.remove(t.sellToken);
```
Optional extra: a manager-only `dropDust(asset)` that removes a non-USDT token whose balance is
`<= DUST`.

**Tests to add:**
- the full-sell trade, but `aapl.mint(address(vault), 1)` first: AAPL must still leave `heldAssets()`
- the same at `MAX_ASSETS`: swapping one stock fully into a new one must still pass

**Watch out:** dust left after removal is not counted in deposits or paid out in redeems. That is
fine at 1e12 wei (0.000001 of a token), but do not make `DUST` large.

---

## 3. Anyone can seed a vault before its manager

**Where:** `src/FolioVault.sol` `seed`, line 126. It checks only `state == DRAFT`.

**What goes wrong:** an attacker sees `VaultCreated` and calls `seed(10 USDT)` first. The vault moves
to `SEEDED`, the manager's own seed reverts with `WrongState(SEEDED)`, and the attacker holds every
share except the dead shares. The attacker can redeem the 10 USDT later, so it costs them only gas,
and they can repeat it on every new vault.

**Fix:** add `_onlyManager();` at the top of `seed`. Or let `VaultFactory` create and seed in one
transaction.

**Status:** this is a **founder decision** (spec §10, decision #4 says anyone can seed). Ask before
changing it. If it changes, update `AGENTS.md` (seed is "anyone" there) and tell Part 4, whose
curator console seeds vaults.

---

## 4. Deposit with an old signed price, then redeem at once

**Where:** `src/AssetRegistry.sol` `checkPrices` (line 100, `MAX_PRICE_AGE = 60`) and
`src/FolioVault.sol` `deposit` (line 181).

**What goes wrong:** a signed `PriceUpdate` is valid for 60 s for **any** caller and **any** vault,
and `/api/prices` hands them out to anyone. If the stock price rises inside that minute, a depositor
uses the older, lower signed price, gets too many shares, and redeems in kind at once.

**Numbers:** the vault holds 1,000 AAPLon signed at 200. The market moves to 202 within 60 s. A
200,000 USDT deposit with the old price, then a full redeem, returns about 201,000 of value. The
existing holders lose the 1,000.

**Fix options:**
- **A:** accept only a price at least as new as the last one used in this vault:
  ```solidity
  uint64 public lastPriceTimestamp;
  // in deposit, after checkPrices:
  if (prices.timestamp < lastPriceTimestamp) revert OldPrices(prices.timestamp);
  lastPriceTimestamp = prices.timestamp;
  ```
  This narrows the window but does not close it.
- **B:** a minimum hold time between deposit and redeem for each account.

**Status:** this is the trust assumption accepted in spec §8.0. Option B conflicts with decision #11
("no delay before a new depositor may redeem") and with the promise that exit is always open.
Decide with the founder before changing it.

---

## 5. Deposit then redeem buys stock at the signed price with no fee

**Where:** `src/FolioVault.sol` `deposit` (line 191) together with `_redeem` (line 222).

**What goes wrong:** `deposit` takes USDT at the signed price, and `redeem` pays out a slice of
every stock. Together they are a free swap from USDT into the vault's stock at the signed price: no
DEX slippage, no fee. The prices can be fresh; this needs only a gap between the signed price and the
DEX price (a captured response showed 0.34%), or thin liquidity. The holders who stay pay the DEX
cost again when the manager buys the stock back.

**Fix options:** a small entry fee (for example 0.5%), or the minimum hold time from issue 4.

**Status:** same design question as issue 4. Spec §9 says "no fees". Decide with the founder.

---

## 6. Deposits count a frozen stock at full price

**Where:** `src/FolioVault.sol` `_vaultValue` (line 334).

**What goes wrong:** if an issuer pauses a stock or blacklists the vault, `redeem` fails and holders
leave with `redeemExcept([thatStock])`. But `deposit` still values the frozen stock at its full
signed price. A new depositor pays for a slice of a token nobody can take out, and an existing holder
who then calls `redeemExcept` takes part of the new depositor's USDT.

**Today's mitigation:** the guardian calls `pause()` as soon as a held stock is frozen. That stops
deposits, and redeem keeps working.

**Fix:** a guardian-set `isFrozen[asset]` flag, and `_vaultValue` reverts (or values the token at
zero) while any held token is frozen.

---

## Leads (not proven, worth checking)

| Lead | Where | What to check |
|---|---|---|
| Manager can set a receiver or fee in the router calldata | `rebalance` | Decode the Binance router (`0xB444…DdA5`, an upgradeable proxy) and see which functions accept a receiver, fee or pool address. Issue 1's fix covers the impact. |
| A token whose `balanceOf` reverts blocks every deposit and trade | `rebalance`, `_vaultValue` | Can an Ondo token revert on `balanceOf` when paused? If so, add a way to skip or drop it. |
| A small `redeem` just before a full sell makes the trade revert | `rebalance` | The Binance calldata sells a fixed amount. Check if the router has a "sell whole balance" mode. |
| A token removed from `_held` ignores later refunds or airdrops of it | `rebalance` | Holders who leave before it is bought back lose that balance. |
| The guardian can activate a vault whose seeder already redeemed everything | `activate` | Add a check that the vault still holds `minSeed`, if that matters. |
| No function closes a vault or replaces its manager | — | Planned as SC-06 (spec §11). |
| Anyone can create a vault with a copied name; `isVault` is true for all | `VaultFactory.createVault` | Frontends should list only `ACTIVE` vaults. |

## Notes for the backend (Part 2)

These are not contract bugs, but each one breaks deposits or trades if the backend gets it wrong:

- `checkPrices` rejects a timestamp later than `block.timestamp`. BSC blocks have whole-second
  timestamps, so sign with the latest block time minus a few seconds, not the server clock.
- Sign the price per **whole token** in USDT base units (18 decimals). Ondo tokens report a
  `tokenToShareRatio`; a price per underlying share misprices every deposit by that ratio.
- Never list an asset twice in one signed update. `_priceOf` uses the first match.
- Include every stock the vault holds, including dust (see issue 2).
- Never sign test prices with the production key on a local fork. The fork keeps chainId 56, so a
  fork registry at the mainnet address would accept that price on mainnet too.
- The wallet underestimates gas for `rebalance` (it used ~850k in the fork rehearsal). Set the gas
  limit by hand, about 1.5M.

## Accepted trust assumption (not an issue to fix now)

Whoever holds the price-signer key, or the registry owner who can replace it at once (this
deployment has no timelock), can sign a near-zero price, deposit a little USDT, and redeem most of
the stock in every vault. Spec §8.0 accepts this. Before real money: put the registry behind the
24-hour timelock, and consider a per-token price band against the last accepted price.

## Review record

The full AI report, with every finding and lead, is in
`contracts/.solidity-auditor/runs/20261010-113911/full-report.md` on the reviewer's machine (not
committed). AI review does not replace a human audit.
