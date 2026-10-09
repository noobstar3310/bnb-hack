# Folio Lab contracts

Foundry project for the seeded pooled portfolio vault. Owner: **Aik Wei** (PRD tasks SC-01 – SC-07).

Scope and acceptance criteria: [`docs/folio-lab-pooled-fund-prd.md`](../docs/folio-lab-pooled-fund-prd.md).

## Status

**SC-02 is built.** Design and decisions: [`docs/folio-lab-contract-architecture.md`](../docs/folio-lab-contract-architecture.md).

| Contract | What works today |
|---|---|
| `AssetRegistry` | Asset and router allowlists, settlement token, guardian. Owned by governance. |
| `VaultFactory` | Anyone can create a vault. |
| `FolioVault` | `seed()` and `activate()`; shares are non-transferable. |

Not built yet: subscriptions (SC-03), manager trading (SC-04), redemption (SC-05),
pause and manager replacement (SC-06), deploy scripts and invariants (SC-07).
Until SC-05 lands there is **no way to withdraw** — do not deploy this to mainnet.

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
forge test
```

## Commands

| Command | Purpose |
|---|---|
| `forge build` | Compile |
| `forge test` | Run tests (512 fuzz runs) |
| `FOUNDRY_PROFILE=deep forge test` | 10,000 fuzz runs, deeper invariants — before any deploy |
| `forge test --match-test <name> -vvv` | Debug a single test with traces |
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

## Deploying

Never put a private key in `.env`. Use an encrypted keystore:

```bash
cast wallet import deployer --interactive
forge script script/<Name>.s.sol --rpc-url bsc_testnet --account deployer --broadcast --verify
```

## Handoff to backend

Per the PRD, Vincent's indexer (BE-03) and transaction preparation (BE-04) depend on a
frozen interface from SC-01. When contracts land, publish: versioned ABI, event schema,
custom errors, chain/address manifest, deployment block, and the asset/share decimal and
rounding rules. Interface changes need a version bump and a matching integration check.
