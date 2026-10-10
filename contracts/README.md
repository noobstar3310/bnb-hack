# Folio Lab contracts

Foundry project for the pooled portfolio vault. Owner: **Aik Wei** (PRD tasks SC-01 – SC-07).

- Scope and acceptance criteria: [`docs/folio-lab-pooled-fund-prd.md`](../docs/folio-lab-pooled-fund-prd.md)
- Full design spec (maths, interface, events, risks, decisions): [`docs/folio-lab-contract-architecture.md`](../docs/folio-lab-contract-architecture.md)
- Task tracker: [`docs/sc-checklist.md`](../docs/sc-checklist.md)

## What Folio Lab is

Folio Lab lets anyone run a **pooled portfolio of tokenized US stocks on BNB Chain**. A curator
creates a vault and manages it. Investors deposit USDT and receive vault shares. The curator
invests the pooled USDT in approved stock tokens (Ondo's AAPLon, NVDAon and similar).

Shares work like ETF units: each holder owns a fixed percentage of everything in the vault.
Shares cannot be transferred or traded. They are only minted on deposit and burned on withdrawal.

What the contracts guarantee:

- **The manager can trade but never withdraw.** Trades are limited to approved tokens on approved routers.
- **Exit is always open.** Any holder can withdraw their percentage of every holding at any time, even while the vault is paused.
- **Deposits never dilute existing holders.** New shares are minted at the fair price, rounded in the existing holders' favour.

## Status

A vault can be created, seeded, deposited into, paused, traded by its manager and withdrawn
from today. All 144 Foundry tests pass.

**Not mainnet-ready.** Deposits trust backend-signed prices, and the adversarial review (SC-07)
has not run.

| Task | What it adds | Status |
|---|---|---|
| SC-02 | Registry, factory, vault, `seed`, `activate` | Built, reviewed |
| SC-03 | Signed-price `deposit`, `pause` / `unpause` | Built, reviewed |
| SC-05 | `redeem` and `redeemExcept` (withdraw in kind) | Built, reviewed |
| SC-04 | Manager trading with balance checks (`rebalance`), `setPlan` | Built, AI-reviewed |
| SC-06 | Replace manager, close a vault | Not started |
| SC-07 | Invariant and adversarial tests, deploy scripts, ABI handoff | Deploy script built; invariant tests not started |

## How it works

There are three contracts: one shared `AssetRegistry`, one `VaultFactory`, and one `FolioVault`
per curator. The vault is itself the share token.

```mermaid
flowchart LR
    Backend[Backend price signer] -- "signed prices, 60 s" --> Investors
    Investors -- "deposit, redeem" --> Vault[FolioVault]
    Manager["Manager (curator)"] -- "trades (SC-04)" --> Vault
    Factory[VaultFactory] -- creates --> Vault
    Guardian -- "activate, pause" --> Vault
    Vault -- "verifies prices" --> Registry[AssetRegistry]
    Governance -- "rules, 24 h delay" --> Registry
```

Only investors move money in and out of the vault. Governance and the guardian change rules and
state, and the backend only signs prices.

| Contract | Job |
|---|---|
| `AssetRegistry` | Approved stock tokens and trading routers, the USDT address, the guardian and price-signer addresses. Verifies signed prices. Owned by governance. |
| `VaultFactory` | Anyone can create a vault and name its manager. Holds no funds. |
| `FolioVault` | Holds the assets, mints and burns shares, runs the lifecycle, deposits and withdrawals. |

| Role | Who | Can |
|---|---|---|
| Governance | Timelock (24 h) controlled by the team Safe | Edit allowlists, set the guardian and price signer, replace a manager |
| Guardian | Team Safe, no delay | Activate, pause and unpause a vault |
| Price signer | Backend hot key | Sign stock prices for deposits; nothing else |
| Manager | Curator wallet, one per vault | Trade (SC-04) |
| Anyone | Any wallet | Create a vault, seed it, deposit, withdraw |

**Vault lifecycle:** `DRAFT` → `seed()` → `SEEDED` → guardian `activate()` → `ACTIVE` ⇄ `PAUSED`.
Deposits need `ACTIVE`. Withdrawals work in every state.

**Seed.** The first deposit must be at least 10 USDT and mints 1 share per USDT. 0.001 shares go
to `0xdEaD` forever, to block the inflation attack.

**Deposit.** The investor's USDT sits idle in the vault until the curator invests it. Shares are
minted instantly:

```
shares = deposit × totalSupply ÷ vaultValue        (rounded down)
```

The vault value is the vault's own balances multiplied by backend-signed prices. USDT always
counts as $1.

**Withdraw.** `redeem(shares, to)` burns shares and pays the same percentage of every holding, in
kind, with no price involved. If an issuer pauses one held token, `redeemExcept` skips that token,
so exit is never blocked.

## Key decisions and the trust trade-off

The biggest decision is that **deposits are priced from backend-signed stock prices**. Investors
get shares instantly, and their USDT sits idle until the curator invests it. The cost is that the
contract trusts a price it cannot check.

**Why a signed price.** No reliable on-chain price exists for these tokens on BSC (checked
1 October 2026):

- Chainlink's Ondo-token feeds are Ethereum-only.
- The plain AAPL/NVDA/TSLA/MSFT feeds freeze at the US close.
- Pyth equity data is paid.
- DEX pools hold about $17k.

So the backend reads the Binance RWA price API and signs the prices.

**The risk.** A wrong or leaked price lets someone deposit at a low price and withdraw real
assets, which takes value from existing holders. Guardrails:

- Prices older than **60 seconds** are rejected, so the backend signs per deposit.
- The vault values itself from its **own balances**. The backend supplies prices only.
- Any held stock without a price, or with a zero price, makes the deposit revert.
- The guardian can **pause deposits instantly**, and withdrawals keep working.
- The signer is a dedicated key with no other power, and governance can rotate it.

Other decisions:

| Decision | Answer |
|---|---|
| Settlement token | USDT |
| Minimum seed | 10 USDT |
| Is the seeder the manager? | No. Anyone can seed a `DRAFT` vault. |
| Governance | One team, two keys: slow (timelocked) and fast (guardian) |
| Delay before a new depositor can withdraw | None |
| Share transfers | Disabled |

## Setup

This project uses git submodules, so a plain `git clone` will leave `lib/` empty:

```bash
git clone --recurse-submodules git@github.com:noobstar3310/bnb-hack.git
# already cloned:
git submodule update --init --recursive
```

Then:

```bash
cd contracts
cp .env.example .env     # fill in RPC + Etherscan key
forge build
forge test               # expect 144 passing
```

To see the whole flow as a story, run:

```bash
forge test --match-contract SimulationTest -vv
```

It prints ten chapters with seven actors:

1. The team deploys the contracts.
2. Alice creates a vault and Bob seeds it.
3. Carol deposits, and Mallory's fake prices fail.
4. A pause blocks deposits while Bob still withdraws.

## Repo layout

| Path | What is there |
|---|---|
| `src/` | `AssetRegistry.sol`, `VaultFactory.sol`, `FolioVault.sol` |
| `test/` | Unit, fuzz and simulation tests |
| `test/helpers/` | Shared fixtures: a seeded vault, a mock router and a fair-trade helper |
| `test/mocks/` | Mock tokens: configurable decimals, fee-on-transfer, reentrant, pausable |
| `script/` | `Deploy.s.sol`: registry, factory, signer, router and stock allowlist |
| `../docs/superpowers/plans/` | Step-by-step build plans for each batch of work |

## Commands

| Command | Purpose |
|---|---|
| `forge build` | Compile |
| `forge test` | Run tests (512 fuzz runs) |
| `FOUNDRY_PROFILE=deep forge test` | 10,000 fuzz runs, deeper invariants — before any deploy |
| `forge test --match-test <name> -vvv` | Debug a single test with traces |
| `forge test --match-contract SimulationTest -vv` | The multi-user story |
| `forge coverage` | Coverage report |
| `forge fmt` | Format |
| `forge snapshot` | Gas snapshot |

## Dependencies

| Package | Version |
|---|---|
| forge-std | v1.16.2 |
| openzeppelin-contracts | v5.7.0 |

Solidity 0.8.30, EVM target `cancun`, optimizer on (200 runs).

> `cancun` is required: `FolioVault` uses `ReentrancyGuardTransient`, which needs transient
> storage (EIP-1153). BSC supports it today. On a chain without it, swap to the storage-based
> `ReentrancyGuard` before lowering `evm_version`.

## Handoff to backend

Vincent's backend signs prices before every deposit, prepares deposit and withdraw transactions,
and indexes vault events. The interface below is **not frozen yet**. Agree on it before building
against it.

### Signing a price list (EIP-712)

The domain is name `Folio Lab`, version `1`, chainId 56, and verifyingContract = the
`AssetRegistry` address. The type is:

```solidity
PriceUpdate(address[] assets,uint256[] prices,uint64 timestamp)
```

- `prices[i]` = USDT value (in USDT's smallest units) of **one whole** `assets[i]` token.
- `timestamp` = now. The contract rejects anything older than 60 s or in the future.
- Include every stock the vault holds. One signed list works for every vault.
- Refuse to sign while the US market is closed (`marketStatus` from the RWA underlying-market
  endpoint), or when the token and reference prices diverge.
- A test signs with `cast wallet sign --data`, so standard viem or ethers `signTypedData`
  produces a valid signature.

### Functions the frontend calls

| Function | Who | Notes |
|---|---|---|
| `factory.createVault(name, symbol, manager)` | anyone | Returns the vault address |
| `vault.seed(amount)` | anyone, `DRAFT` only | Min 10 USDT; approve USDT first |
| `vault.deposit(amount, prices, signature, minShares)` | anyone, `ACTIVE` only | Approve USDT first; `minShares` guards against a moved price |
| `vault.redeem(shares, to)` | any holder, any state | Pays your % of every holding |
| `vault.redeemExcept(shares, to, forfeit)` | any holder | Same, but skips tokens that cannot move |
| `vault.holdings()`, `heldAssets()`, `balanceOf(user)`, `state()` | read | For the portfolio page |

### Events to index

- **Vault:** `VaultCreated`, `Seeded`, `Deposited` (amount, shares, vault value, price
  timestamp), `Redeemed` (actual amounts paid), `StateChanged`.
- **Registry:** `AssetSet`, `RouterSet`, `GuardianSet`, `PriceSignerSet`.

Share price for display = vault value at market prices ÷ `totalSupply()`, computed off-chain.

### What gets published when contracts land

Per the PRD, Vincent's indexer (BE-03) and transaction preparation (BE-04) depend on a frozen
interface. At deployment, publish:

- the versioned ABI
- the event schema
- the custom errors
- the chain and address manifest
- the deployment block
- the asset/share decimal and rounding rules

Interface changes need a version bump and a matching integration check.

## Deploying

Never put a private key in `.env`. Use an encrypted keystore:

```bash
cast wallet import deployer --interactive
forge script script/<Name>.s.sol --rpc-url bsc_testnet --account deployer --broadcast --verify
```

### BSC mainnet runbook

Rehearsed end to end on a BSC fork on 10 October: deploy, create, seed, activate, `setPlan`, four
real Binance swaps through `rebalance`, a full sell back to USDT, then an investor deposit and
redeem (got back $100.0002 for $100).

1. The deployer becomes registry owner **and** guardian (no timelock). Fund it with ~0.05 BNB.
2. Dry run, no broadcast: `forge script script/Deploy.s.sol --rpc-url bsc --account deployer`.
3. Broadcast: add `--broadcast --verify` (needs `ETHERSCAN_API_KEY`; one Etherscan V2 key covers BSC).
4. Copy `REGISTRY` and `FACTORY` into `lib/contracts/addresses.ts` under chain 56, then
   `forge build && cd .. && npm run abis`.
5. Set `PRICE_SIGNER_PRIVATE_KEY` on the server to the key for `0x4508…2dE4` (the address in
   `Deploy.s.sol`). On a fork, point the registry at a dev signer instead; the fork keeps chainId 56.
6. Every new vault needs the guardian (the deployer) to call `activate()` after it is seeded.
7. Send `rebalance` with a 1.5M gas limit (`/api/trade` returns it); real swaps used 755k–893k.

## Known issues (AI security review, 10 October 2026)

A 3-pass AI review (36 agents) of `FolioVault`, `AssetRegistry`, `VaultFactory` and
`Deploy.s.sol` found the issues below. **Only issue 2 is fixed**; the rest are accepted for the hackathon
demo and must be fixed before real investor money. **Each issue, with its code location, fix and
tests to add, is in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).**

| # | Issue | Who can do it | Planned fix |
|---|---|---|---|
| 1 | `rebalance` caps the loss of **each** trade at 2%, but not the total. A curator can trade back and forth many times and keep 2% each time (sandwich, own pool, or router fee field). | Manager | Cooldown between trades, or a daily loss budget |
| 2 | **Fixed 10 Oct** (dust up to 1e-6 of a token counts as sold out). Was: a sold-out stock left `_held` only at a balance of exactly 0. Anyone can send 1 wei before a full sell, so the stock stays held: it keeps one of the 10 slots and every deposit needs its price. A 1-wei sell to clear it reverts with `BuyTooLow`. | Anyone | Treat a balance under a dust threshold as sold out |
| 3 | Anyone can call `seed` on a new vault before its manager, so the manager's seed reverts. | Anyone | Manager-only `seed` (founder decision, see open decisions) |
| 4 | A signed price stays valid for 60 s for any caller and vault. A depositor can use the lowest recent price, then `redeem` at once and keep the price move. | Anyone | Accept only the newest price per vault, or a minimum hold time |
| 5 | `deposit` then an immediate `redeem` buys the vault's stock at the signed price with no fee or slippage; holders pay the DEX gap when the manager buys it back. | Anyone | Entry fee or minimum hold time (conflicts with "no exit delay", decision #11) |
| 6 | If an issuer freezes a held stock, `deposit` still counts it at full price, while existing holders can leave it behind with `redeemExcept` and take new depositors' USDT. | Existing holder | Guardian pauses the vault (works today), or a per-token frozen flag |

**Integration notes for the backend (Part 2):**

- `checkPrices` rejects a timestamp later than `block.timestamp`. BSC blocks have whole-second
  timestamps, so sign with the latest block time minus a few seconds, not the server clock.
- Sign the price per **whole token**, in USDT base units. Ondo tokens report a `tokenToShareRatio`;
  a price per underlying share would misprice every deposit by that ratio.
- Never list an asset twice in one signed update (`_priceOf` uses the first match).
- Never sign test prices with the production key on a fork: the fork keeps chainId 56.

**Accepted trust assumption:** whoever holds the price-signer key, or the owner who can replace it
(no timelock in this deployment), can sign a near-zero price and take the stock in every vault
(spec §8.0).

## Open decisions and next steps

Two decisions block manager trading (SC-04). One open issue could change the interface before
it is frozen.

| Item | Why it matters | Owner |
|---|---|---|
| Max stocks per vault | Every deposit and withdrawal loops over all holdings, so this bounds gas | Aik Wei |
| Allowlist by liquidity | TSLAon cannot fill a 10,000 USDT trade and 11 tokens cannot quote at all | Aik Wei + Vincent |
| Seed slot can be taken by a stranger | Anyone can seed a new vault with 10 USDT before its curator does; fix before freezing the interface | Founder |
| Freeze the interface and events | The backend builds against them | Aik Wei + Vincent |

Next steps:

- [ ] Update `docs/sc-checklist.md` for SC-03 and SC-05
- [ ] Run the whole-build review on SC-03 and SC-05
- [ ] Build SC-04: `rebalance` with the balance checks that make opaque router calldata safe
- [ ] Backend: a price-signing endpoint and the EIP-712 signer key
- [ ] SC-06 and SC-07: manager replacement, invariant tests, deploy scripts, ABI handoff
