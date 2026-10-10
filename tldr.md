
❯ based on this project all i konw is that we want to build a decentralized
  portfolio manager (correct me if i am wrong) whereby anyone can be a curator
  for a vault for anyone to invest in them. they can deposit any amount of
  stablecoins in there and the portfolio manager will manage the funds based on
  the rules he plans to invest. everyone will be able to see what he plans to
  invest in as it will display it in the website for users.

  however for my case, i am working on the smart contract side of things. i am
  someone who is a junior smart contract developer and constantly wants to
  improve and now i need you to explain to me the current smart contract
  architecture in a very easy to understand way and also make it short as i
  have a very short attention span and i have adhd

  Ran 2 shell commands (ctrl+o to expand)

● Your picture is mostly right. Three corrections:

  - Your deposit doesn't go straight into the vault. It waits in a holding area
    (escrow) until the manager actually spends it buying assets.
  - When you leave, you get your share of the tokens themselves, not
    stablecoins. If the vault holds AAPL and NVDA tokens, you walk out with your
    cut of each.
  - The manager can trade the funds but can never withdraw them.

  Also: no contract code exists yet. contracts/src/ is empty. What exists is the
  design in folio-lab-contract-architecture.md
  (docs/folio-lab-contract-architecture.md), so this is an explanation of the
  plan.

  ---

  The 4 pieces

  ┌───────────────┬──────────────────────────────────────────────────────────┐
  │     Piece     │                        What it is                        │
  ├───────────────┼──────────────────────────────────────────────────────────┤
  │ AssetRegistry │ The approved list: which tokens and which trading venues │
  │               │  are allowed. One list shared by all vaults.             │
  ├───────────────┼──────────────────────────────────────────────────────────┤
  │ VaultFactory  │ Creates a new vault for each curator.                    │
  ├───────────────┼──────────────────────────────────────────────────────────┤
  │ FolioVault    │ The vault itself. Holds the tokens, and its shares are   │
  │               │ an ERC-20 token.                                         │
  ├───────────────┼──────────────────────────────────────────────────────────┤
  │ TradeGuard    │ A library of safety checks that runs around every trade. │
  └───────────────┴──────────────────────────────────────────────────────────┘

  The one big idea 💡

  The vault never needs to know what it's worth. Normally a fund needs prices
  (an oracle) to decide how many shares to give you. This design avoids that:

  - Deposit: your money buys "10% more of everything", so you get 10% more
    shares.
  - Withdraw: burn 5% of the shares and you get 5% of every token.

  It only ever compares token balances before and after. No prices, no oracle to
  hack.

  The main safety trick 🔒

  Trades go through calldata from the Binance API, which the vault doesn't
  trust. So it checks balances after every trade:

  1. Sold no more than allowed ✅
  2. Bought at least the minimum ✅
  3. Nothing else went down ✅ (this is the key rule)

  If any check fails, the whole trade reverts. So a bad manager can make bad
  trades, but can't steal.

  Vault states

  DRAFT → SEEDED → ACTIVE ⇄ PAUSED → CLOSED

  Withdrawals work even when the vault is PAUSED. A pause should never trap
  anyone's money.

  ---

  Best first thing to study: rebalance() and assertDeltas in section 6 of the
  doc. Most of the security depends on them. When you're ready, next up is
  SC-02: the registry, factory, and a basic vault.

❯ let us start building the smart contracts

● Skill(superpowers:brainstorming)
  ⎿  Successfully loaded skill

  Ran 2 shell commands, wrote 1 memory (ctrl+o to expand)

● This is a big build, so I'll proceed carefully: settle decisions first, then
  draft a short plan, then build with tests. Starting with SC-02 (registry,
  factory, seedable vault), there are four open decisions to pick from before
  moving forward—my recommendations are listed first.

● User answered Claude's questions:
  ⎿  · Which stablecoin is the vault's 'money' (settlement token)? → USDT
     (Recommended)
     · Is the first (seed) investor automatically the manager? → No, separate
     roles
     · Who is 'governance' (can activate, pause, replace manager, edit
     allowlist)? → i need more understanding on the governance side of things
     first before i can make the decision
     · Minimum seed deposit (MIN_SEED)? → 10 USD

● Governance is the admin role — controlling the allowlist, vault activation,
  pause, and manager replacement, but never the funds. I recommend a global
  admin held by a multisig with a timelock on allowlist/manager changes and
  instant pause, though it can just be your wallet for the hackathon.

● User answered Claude's questions:
  ⎿  · With that explained, which governance model? → A: one global admin
     (Recommended)
     · Since seeder and manager are separate: who is allowed to seed a vault? →
     Anyone (Recommended)

  Ran 2 shell commands (ctrl+o to expand)

● Everything we need is already in OpenZeppelin. Here's the SC-02 design, short
  version.

  1. Roles: one team, two speeds

  "One global admin" becomes two addresses, both controlled by your team:

  ┌────────────┬──────────────────────────┬────────────────────┬────────────┐
  │    Role    │            Is            │        Can         │   Speed    │
  ├────────────┼──────────────────────────┼────────────────────┼────────────┤
  │ governance │ OZ TimelockController    │ edit allowlists,   │ slow (24h  │
  │            │ (Safe proposes)          │ replace manager    │ delay)     │
  ├────────────┼──────────────────────────┼────────────────────┼────────────┤
  │ guardian   │ the Safe directly        │ activate, pause,   │ instant    │
  │            │                          │ unpause            │            │
  ├────────────┼──────────────────────────┼────────────────────┼────────────┤
  │ manager    │ curator's wallet         │ trade (SC-04)      │ n/a        │
  ├────────────┼──────────────────────────┼────────────────────┼────────────┤
  │ anyone     │ any wallet               │ seed, create       │ n/a        │
  │            │                          │ vaults             │            │
  └────────────┴──────────────────────────┴────────────────────┴────────────┘

  Why split? Emergency brakes can't wait 24h, but rule changes should, so
  investors can exit first. We write no timelock code: OZ's goes in the deploy
  script. In tests, both roles are plain addresses.

  2. The three contracts

  - AssetRegistry: Ownable2Step (owner = governance). Holds the USDT address
    (fixed forever), guardian, and the asset and router allowlists.
  - VaultFactory: createVault(name, symbol, manager). Anyone can call it. It's
    safe because a vault can't go live until the guardian activates it.
  - FolioVault: an ERC-20 share token with transfers blocked (only mint and burn
    work).

  3. Seeding

  seed(amount)            anyone, only in DRAFT, amount >= 10 USDT
    pull USDT, measure what actually arrived (balance before/after)
    shares = received scaled to 18 decimals      → 1 share = 1 USDT
    mint 1e15 shares to 0xdEaD                   ← inflation-attack guard
    mint (shares - 1e15) to seeder
    state → SEEDED
  activate()              guardian only, SEEDED → ACTIVE

  Two changes from the doc:
  - Dead shares go to 0xdEaD, not address(0). OZ v5 reverts on mints to
    address(0).
  - I'm dropping minShares from seed(). The seed price is fixed, so it can't
    slip.

  Pause, close, subscribe, trade and redeem stay in later tasks (SC-03 to
  SC-06).

  4. Testing

  - Unit tests for each function and each wrong role/state
  - A fuzz test on seed math
  - A mock USDT with both 6 and 18 decimals, so we never assume 18

  ---

  If you approve, next I'll:
  1. Write these decisions into §10 of the architecture doc (instead of a
     separate spec file)
  2. Write a short step-by-step plan
  3. Build it test-first

  Does this design look right?

❯ yea it looks right

  Read 1 file, ran 1 shell command (ctrl+o to expand)

● Update(docs/folio-lab-contract-architecture.md)
  ⎿  Added 12 lines, removed 7 lines
      140  The first deposit has no existing holdings to be proportional 
           to, so it is the
      141  one place an initial price is chosen by convention rather than
            derived:
      142  
      143 -- Seed investor deposits `S` of the settlement token.         
      144 -- Manager buys the initial basket.                            
      143 +- Seed investor deposits `S` of the settlement token. Anyone m
          +ay seed a `DRAFT`                                             
      144 +  vault; the seeder need not be the manager (§10 #4).         
      145 +- `S` is measured as the vault's actual balance increase, not 
          +the argument.                                                 
      146  - Mint `INITIAL_SHARES = S × 1e18 / 1 settlement unit` — a sha
           re starts at 1.00
      147    settlement unit, purely as a readable convention.
      147 -- **`DEAD_SHARES = 1e15` are minted to `address(0)`** and can 
          -never be redeemed.                                            
      148 -  This is the inflation-attack mitigation: it makes `totalSupp
          -ly` non-zero and                                              
      149 -  non-trivial, so later rounding cannot be gamed by donating t
          -o an almost-empty                                             
      150 -  vault.                                                      
      151 -- `MIN_SEED` enforced, value TBD (§10).                       
      148 +- **`DEAD_SHARES = 1e15` are minted to `0xdEaD`**, taken out o
          +f the seeder's                                                
      149 +  `INITIAL_SHARES`, and can never be redeemed. This is the inf
          +lation-attack                                                 
      150 +  mitigation: it makes `totalSupply` non-zero and non-trivial,
          + so later rounding                                            
      151 +  cannot be gamed by donating to an almost-empty vault. (`0xdE
          +aD`, not                                                      
      152 +  `address(0)`: OpenZeppelin v5 reverts on a mint to the zero 
          +address.)                                                     
      153 +- `MIN_SEED = 10` settlement units, enforced on the measured a
          +mount.                                                        
      154 +- The price is fixed by convention, so `seed()` takes no `minS
          +hares`.                                                       
      155 +- Then the manager buys the initial basket while the vault is 
          +`SEEDED` (SC-04),                                             
      156 +  and the guardian calls `activate()`.                        
      157  
      158  ### Subscribe
      159  

● Update(docs/folio-lab-contract-architecture.md)
  ⎿  Added 3 lines, removed 3 lines
      238  
      239  ```solidity
      240  // ---- lifecycle
      241 -function seed(uint256 amount, uint256 minShares) external retu
          -rns (uint256 shares);                                         
      242 -function activate() external;                       // governa
          -nce                                                           
      243 -function pause() external;  function unpause() external;      
      241 +function seed(uint256 amount) external returns (uint256 shares
          +);   // anyone, DRAFT only                                    
      242 +function activate() external;                       // guardia
          +n                                                             
      243 +function pause() external;  function unpause() external;   // 
          +guardian                                                      
      244  function replaceManager(address newManager) external;   // gov
           ernance, timelocked
      245  
      246  // ---- investor

● Update(docs/folio-lab-contract-architecture.md)
  ⎿  Added 29 lines, removed 6 lines
      380  
      381  ---
      382  
      383 -## 10. Open decisions                                         
      383 +## 10. Decisions                                              
      384  
      385 +### Decided (30 September 2026)                               
      386 +                                                              
      387 +| # | Decision | Answer |                                     
      388 +|---|---|---|                                                 
      389 +| 2 | Settlement token | **USDT**. Fixed in `AssetRegistry` at
          + deploy; every vault copies it as an immutable. |             
      390 +| 3 | `MIN_SEED` | **10 settlement units** (10 USDT). |       
      391 +| 4 | Is the seed investor automatically the manager? | **No.*
          +* Anyone can seed a `DRAFT` vault. The manager is named at `cr
          +eateVault`. |                                                 
      392 +| 5 | Governance model | **One global admin, two speeds** — se
          +e below. |                                                    
      393 +                                                              
      394 +**Roles.** One team controls both admin addresses; they differ
          + only in speed.                                               
      395 +                                                              
      396 +| Role | Is | Can | Speed |                                   
      397 +|---|---|---|---|                                             
      398 +| `governance` | OZ `TimelockController`, Safe as proposer | e
          +dit allowlists, set guardian, replace manager | 24h delay |   
      399 +| `guardian` | the Safe directly | `activate`, `pause`, `unpau
          +se` | instant |                                               
      400 +| `manager` | curator wallet, set per vault | trade (SC-04), e
          +xecute subscriptions (SC-03) | — |                            
      401 +| anyone | any wallet | `createVault`, `seed` | — |           
      402 +                                                              
      403 +Rule changes wait so investors can exit before they land; emer
          +gency brakes do                                               
      404 +not wait, and a pause never blocks exit anyway. No timelock co
          +de is written —                                               
      405 +OZ's `TimelockController` is deployed by the deploy script (SC
          +-07), and                                                     
      406 +`AssetRegistry` is `Ownable2Step` with that timelock as owner.
          + Vault creation                                               
      407 +is permissionless because a vault cannot take outside money un
          +til the guardian                                              
      408 +activates it.                                                 
      409 +                                                              
      410 +### Still open                                                
      411 +                                                              
      412  | # | Decision | Needed before | Owner |
      413  |---|---|---|---|
      414  | 1 | Minimum quotable size per instrument — sets the allowlis
           t | SC-04 | Aik Wei + Vincent |
      388 -| 2 | Settlement token — USDT, USDC or USD1 | SC-02 | both |  
      389 -| 3 | `MIN_SEED` value | SC-02 | founder |                    
      390 -| 4 | Is the seed investor automatically the manager? | SC-02 
          -| founder |                                                   
      391 -| 5 | Governance — single multisig, or per-vault owner? | SC-0
          -2 | both |                                                    
      415  | 6 | Subscription deadline before cancellation is allowed | S
           C-03 | both |
      393 -| 7 | Max assets per vault (bounds the redemption loop's gas) 
          -| SC-02 | Aik Wei |                                           
      416 +| 7 | Max assets per vault (bounds the redemption loop's gas) 
          +| SC-04 (first point a second asset can enter) | Aik Wei |    
      417  | 8 | Are share transfers ever enabled, and under what check? 
           | post-demo | founder + advisers |
      418  
      419  ---

● Update(docs/folio-lab-contract-architecture.md)
  ⎿  Added 1 line, removed 1 line
       95  
       96  | Contract | Responsibility |
       97  |---|---|
       98 -| `AssetRegistry` | Governance-owned allowlists: permitted ass
          -ets, permitted routers, settlement token. One instance, shared
          - by every vault. Timelocked changes. |                        
       98 +| `AssetRegistry` | Governance-owned allowlists: permitted ass
          +ets, permitted routers, settlement token, guardian address. On
          +e instance, shared by every vault. Timelocked changes (§10). |
       99  | `VaultFactory` | Deploys vaults, records them, emits `VaultC
           reated`. Holds no funds. |
      100  | `FolioVault` | The vault. Custody, share accounting, subscri
           ption escrow, redemption, manager execution. Is itself the ERC
           -20 share token. |
      101  | `TradeGuard` | Library, not a deployed contract. Snapshot/as
           sert logic around manager trades. Kept separate so it can be t
           ested in isolation. |

  Ran 1 shell command (ctrl+o to expand)

● Update(docs/folio-lab-contract-architecture.md)
  ⎿  Added 2 lines, removed 1 line
      284  
      285  ### Errors
      286  
      287 -Custom errors throughout: `NotManager`, `NotGovernance`, `Wron
          -gState`,                                                      
      287 +Custom errors throughout: `NotManager`, `NotGovernance`, `NotG
          +uardian`, `WrongState`,                                       
      288 +`TransfersDisabled`,                                          
      289  `AssetNotAllowed`, `RouterNotAllowed`, `SellExceeded`, `BuyToo
           Low`,
      290  `CollateralDecreased`, `EscrowTouched`, `SlippageTooHigh`, `Be
           lowMinimumSeed`,
      291  `DeadlineNotReached`, `NothingToRedeem`.

● I've written your decisions into the spec, folio-lab-contract-architecture.md
  (docs/folio-lab-contract-architecture.md). What changed:

  - §5 Seed: dead shares now go to 0xdEaD and come out of the seeder's shares.
    The seed amount is measured from the actual balance. MIN_SEED is 10 USDT.
  - §7 Interface: seed(amount) with no minShares. activate, pause and unpause
    belong to the guardian. Added two errors: NotGuardian and TransfersDisabled.
  - §10 Decisions: the four answers plus the governance-and-guardian roles
    table. Max assets per vault (#7) moved to SC-04, because that's the first
    task where a second asset can enter the vault.

  The docs aren't committed yet. I'll commit only when you tell me to.

  Take a quick look at §10, then say "go" and I'll write the step-by-step build
  plan.

❯ can you explain to me in a very easy to understand way for
  @docs/folio-lab-contract-architecture.md as it is very long for me. i have
  very short attention span
  ⎿  Read docs/folio-lab-contract-architecture.md (447 lines)

● Here's the whole doc, one section at a time. Think of the vault as a shared
  pizza 🍕 where shares are slices.

  ┌────────────┬────────────────────────────────────────────────────────────┐
  │     §      │                What it says, in plain words                │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │            │ The vault never asks "what is the pizza worth in dollars?" │
  │ 1. Big     │  It only asks "how much bigger did the pizza get?" If your │
  │ idea       │  money makes every topping 10% bigger, you get 10% more    │
  │            │ slices. No prices means no oracle to hack.                 │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │            │ Nobody is trusted with the money. The manager can only     │
  │ 2. Trust   │ swap approved tokens on approved venues. They can trade    │
  │            │ badly, but they can't steal and can't stop you leaving.    │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │ 3.         │ 4 pieces: AssetRegistry (the approved list), VaultFactory  │
  │ Contracts  │ (makes vaults), FolioVault (holds the money and is the     │
  │            │ share token), TradeGuard (safety checks on trades).        │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │ 4.         │ DRAFT → SEEDED → ACTIVE ⇄ PAUSED → CLOSED. The key rule:   │
  │ Lifecycle  │ you can withdraw even when paused.                         │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │            │ Seed: the first deposit, 1 share = 1 USDT. A tiny bit of   │
  │ 5. Share   │ shares is burned forever to block a known attack. Join:    │
  │ maths      │ shares come from how much the balances grew, rounded down. │
  │            │  Leave: burn X% of shares and get X% of every token.       │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │            │ The scary part. The manager's trade data comes from        │
  │ 6. Trading │ Binance and isn't trusted. So: snapshot balances → run the │
  │  safety    │  trade → check again. If anything dropped that wasn't      │
  │            │ supposed to, the trade reverts.                            │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │ 7.         │ The list of functions and events. Vincent (backend) builds │
  │ Interface  │  against this, so it needs to stay stable.                 │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │            │ The biggest is liquidity: some stock tokens can't be       │
  │ 8. Risks   │ bought in big sizes (TSLA fails at 10k USDT). Also, you    │
  │            │ leave with stock tokens, not cash, and those may be hard   │
  │            │ to sell.                                                   │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │ 9. Not     │ No fees, no leverage, no share transfers, no upgrades.     │
  │ doing      │ This keeps it simple on purpose.                           │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │ 10.        │ What you just chose: USDT, 10 USDT minimum seed, anyone    │
  │ Decisions  │ can seed, and one admin team with a slow key (rule         │
  │            │ changes, 24h delay) and a fast key (pause, activate).      │
  ├────────────┼────────────────────────────────────────────────────────────┤
  │ 11. Build  │ SC-02 vault and seed → SC-03 joining → SC-04 trading →     │
  │ order      │ SC-05 withdrawing → SC-06 pause and emergency → SC-07      │
  │            │ tests and deploy.                                          │
  └────────────┴────────────────────────────────────────────────────────────┘

  If you only remember 3 things

  1. Proportions, not prices. The contract only compares balances before and
     after.
  2. Rounding always favours people already in the vault. Newcomers absorb
     slippage.
  3. Exit can never be blocked. Not by the manager, and not by a pause.

  We're about to build SC-02 (sections 3, 4, and the "Seed" part of 5). You can
  ignore the rest of the doc until we get to it.

  Want me to go deeper on any one section, or say "go" and I'll write the build
  plan?

❯ proceed with development

● Skill(superpowers:writing-plans)
  ⎿  Successfully loaded skill

● I'm using the writing-plans skill to create the implementation plan. First, a
  quick check that the toolchain works.

  Ran 1 shell command (ctrl+o to expand)

● Write(docs/superpowers/plans/2026-09-30-sc-02-vault-seed.md)  ⎿  Wrote 1113 lines to
     docs/superpowers/plans/2026-09-30-sc-02-vault-seed.md
      1 # SC-02 — Registry, Factory, Seedable Vault Implementation Plan
      3 > **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:su
        bagent-driven-development (recommended) or superpowers:executing-
         [ ]`) syntax for tracking.
      4
        SDT and receive shares, and the guardian can activate it.
      6
        ed allowlists, the settlement token and the guardian address, and
         is owned by governance. `FolioVault` is an ERC-20 share token wi
        EEDED → ACTIVE` l
     … +1297 lines (ctrl+o to expand)

● The build plan is written: 2026-09-30-sc-02-vault-seed.md
  (docs/superpowers/plans/2026-09-30-sc-02-vault-seed.md). It's long because it
  contains all the code, so here's the short version.

  4 tasks, each test-first

  ┌─────┬────────────────────────────────────────────────────────────┬───────┐
  │  #  │                           Builds                           │ Tests │
  ├─────┼────────────────────────────────────────────────────────────┼───────┤
  │ 1   │ AssetRegistry: allowlists, USDT address, guardian          │ 15    │
  ├─────┼────────────────────────────────────────────────────────────┼───────┤
  │ 2   │ FolioVault skeleton: constructor and read views            │ 6     │
  ├─────┼────────────────────────────────────────────────────────────┼───────┤
  │ 3   │ FolioVault: seed(), transfer lock, activate()              │ 22    │
  ├─────┼────────────────────────────────────────────────────────────┼───────┤
  │ 4   │ VaultFactory, a full create → seed → activate test, README │ 9     │
  │     │  and checklist updates                                     │       │
  └─────┴────────────────────────────────────────────────────────────┴───────┘

  Edge cases the tests cover

  - A token that takes a fee on transfer → shares come from what arrived, not
    what was sent
  - Someone sends USDT to the vault before it's seeded → the seeder gets no
    extra shares
  - A 6-decimal stablecoin → still 1 share = 1 unit
  - approve + transferFrom on shares → still blocked
  - The guardian is swapped later → the vault obeys the new one

  Two things to know

  - I won't commit anything. You commit when you want.
  - After SC-02 there's still no withdraw (that's SC-05), so this isn't
    mainnet-ready yet. The README will say so.

  How should I build it?

  - Native (recommended): I build all 4 tasks here, then one fresh reviewer
    checks everything at the end. It's the faster option, and the tasks are
    small and tightly linked.
  - Subagent-driven: a fresh agent builds each task and another reviews each
    one. More thorough, but slower and costlier.

  Reply "native" or "subagent" and I'll start. Or tell me what to change in the
  plan.

❯ subagent

● Skill(superpowers:subagent-driven-development)
  ⎿  Successfully loaded skill

● I'm using Subagent-Driven Development to execute this plan.

  Ran 3 shell commands (ctrl+o to expand)

● Task 1 (AssetRegistry): dispatching the implementer.

● Agent(Implement Task 1: AssetRegistry) Haiku 4.5
  ⎿  Done (19 tool uses · 43.5k tokens · 2m 4s)
  (ctrl+o to expand)

› Message from ab54d81e24583c18d
  **Status:** DONE

  **Test Summary:** 15/15 passing, output pristine

  **Concerns:** None

  **Report File:** `/home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpower
  s/sdd/2026-09-30-sc-02-vault-seed/task-1-report.md`

  **Implementation Summary:**
  - Created MockERC20.sol (MockERC20 and MockFeeERC20 test tokens)
  - Created AssetRegistry.t.sol (15 comprehensive tests)
  - Created AssetRegistry.sol (core registry contract with Ownable2Step
  governance)
  - Deleted src/.gitkeep as required
  - Updated foundry.toml to exclude screaming-snake-case-immutable lint
  (mandated interface names)
  - All tests passing; build pristine after lint exclusion
  - Code formatted with forge fmt

  Ran 1 shell command (ctrl+o to expand)

● Task 1 implemented (15/15 passing); dispatching its reviewer.

● Agent(Review Task 1 (spec + quality)) Sonnet 5.5
  ⎿  Done (4 tool uses · 49.7k tokens · 20s)
  (ctrl+o to expand)

› Message from a6db437204529d08e
  ### Spec Compliance
  - ✅ Spec compliant. `AssetRegistry.sol` (diff lines 15-73),
  `AssetRegistry.t.sol` (74-206) and `MockERC20.sol` (207-248) match the brief's
  code blocks verbatim. There are 15 tests, as the brief expects. Every file
  has `pragma solidity 0.8.30;`, and all errors are custom errors with no
  `require` strings. The `foundry.toml` `[lint]` exclusion is exactly the one
  the controller ruled on. No other lint was silenced. No `forge-lint` disable
  comments appear in the diff.
  - ⚠️ Cannot verify from the diff: the `src/.gitkeep` deletion (a deletion is
  not visible in a new-file diff). I also did not verify the report's claims of
  a pristine `forge build` or that `forge fmt` was run. I did not re-run the
  suite, per instructions. The reported output shows 15 of 15 passing and a
  proper RED compile failure first.

  ### Strengths
  - The implementation is faithful and minimal. It uses `Ownable2Step` for the
  governance handover and an immutable `settlementToken`.
  - `setAsset` blocks removing the settlement token, and the constructor marks
  it as allowed (`AssetRegistry.sol:44,49`).
  - `guardian` and settlement-token zero-address checks run before any state is
  written.
  - Tests assert exact revert selectors. Access-control tests use the guardian
  and a stranger as callers, so they prove the guardian gets no owner powers
  (`AssetRegistry.t.sol:133-137,184-188`). The three `set*` state changes are
  checked with `vm.expectEmit` scoped to the registry address.
  - The two-step handover test checks that the old owner stays until acceptance
  (`AssetRegistry.t.sol:196-205`).

  ### Issues
  #### Critical (Must Fix)
  None.

  #### Important (Should Fix)
  None.

  #### Minor (Nice to Have)
  1. `AssetRegistry.sol:28`: `Ownable2Step` still exposes `renounceOwnership()`.
  If governance calls it, the registry can never change assets, routers or
  guardian again. This is plan-mandated, since the brief specifies
  `Ownable2Step` and lists no override. Consider overriding it to revert in a
  later task or in the final review.
  2. `AssetRegistry.t.sol`: the constructor events (`GuardianSet(0, guardian)`
  and `AssetSet(usdt, true)`, lines 50-51 of the source) are not asserted.
  `setAsset(usdt, true)` is also not tested. It reverts with
  `SettlementTokenFixed`, which is arguably surprising. The `isAsset` and
  `isRouter` mappings are only tested for the positive path on a fresh address.
  This is coverage polish only, and the brief mandated this exact test set.
  3. The report's "Lint Warnings Suppressed" section says the exclusion covers
  the public `settlementToken` getter. The lint actually targets the immutable
  declarations, `settlementToken` and `_decimals` (`MockERC20.sol:218`). The
  config change is correct and only the explanation is loose.

  ### Assessment
  **Task quality:** Approved
  **Reasoning:** The code matches the brief verbatim, and the tests assert real
  behavior, including exact revert selectors and events. The only findings are
  minor coverage and polish points, with no defects.

  Ran 1 shell command (ctrl+o to expand)

● Task 1 complete, review clean. Task 2 (vault skeleton): dispatching the
  implementer.

● Agent(Implement Task 2: FolioVault skeleton) Haiku 4.5
  ⎿  Done (14 tool uses · 41.5k tokens · 1m 28s)
  (ctrl+o to expand)

› Message from aff776a3709de082d
  **Status:** DONE

  **Test Summary:** All 24 tests pass (15 AssetRegistry + 6 FolioVault + 3
  Scaffold). 6/6 FolioVault tests pass.

  **No concerns.** Implementation matches brief exactly: FolioVault contract
  with ERC20 shares, construction validation, and read-only views. No warnings
  or lint issues.

  **Report:** /home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpowers/sdd/
  2026-09-30-sc-02-vault-seed/task-2-report.md

  **Files created:**
  - contracts/src/FolioVault.sol
  - contracts/test/FolioVault.t.sol

  Ran 1 shell command (ctrl+o to expand)

● Task 2 implemented (6/6 passing); dispatching its reviewer.

● Agent(Review Task 2 (spec + quality)) Sonnet 5.5
  ⎿  Done (4 tool uses · 46.2k tokens · 20s)
  (ctrl+o to expand)

› Message from a848899dfc4cfa741
  ### Spec Compliance
  - ✅ Spec compliant. `FolioVault.sol` matches the brief's code block verbatim,
  and the test file matches too. The only difference is the controller-approved
  `MockERC20`-only import (test file line 98).
  - ⚠️ Cannot verify from the diff: the RED and GREEN runs and the "no warnings"
  claim rest on the report's pasted output. The GREEN output shows 6 passing
  tests, which matches the brief. `forge fmt` cleanliness is also taken from the
  report.

  ### Strengths
  - Pragma is exactly `0.8.30` in both files (lines 13 and 93), and imports use
  the `@openzeppelin/contracts/` and `forge-std/` remappings.
  - The constructor checks `ZeroAddress` and `UnsupportedDecimals` before
  writing any state (`FolioVault.sol:58-61`). It reads decimals from
  `IERC20Metadata` instead of assuming them.
  - `registry`, `settlementToken`, `settlementUnit` and `minSeed` are
  immutables, so the reads are cheap and cannot be changed later. Reading the
  `settlementUnit` immutable inside the constructor (line 67) is legal on
  0.8.30.
  - The tests cover both decimal edge cases: 6-decimal scaling and the
  24-decimal rejection. The revert test checks the full error selector plus the
  `uint8(24)` argument.
  - Scope is held. There is no `seed`, `activate`, event or transfer lock, and
  no unrequested code.
  - Custom errors only, with no `require` strings.

  ### Issues
  #### Critical (Must Fix)
  None.

  #### Important (Should Fix)
  None.

  #### Minor (Nice to Have)
  - `contracts/test/FolioVault.t.sol:110-112`: `seeder` and `stranger`, and the
  `DEAD_SHARES` constant, are declared but only `DEAD_SHARES` is used. The brief
  supplies them for Task 3, so this is harmless. Do not remove them if Task 3
  relies on them.
  - `contracts/test/FolioVault.t.sol`: `holdings()` and `heldAssets()` are only
  tested empty, because `_held` has no writer until a later task. The loop body
  at `FolioVault.sol:185-187` is therefore untested. Cover it when the add-asset
  path lands.
  - `contracts/src/FolioVault.sol:59-60`: a zero or non-contract `registry_`
  reverts with a raw empty-data or ABI-decode revert, not a custom error. The
  brief does not require a check here. Consider a `ZeroAddress` check on
  `registry_` later.
  - `.superpowers/sdd/2026-09-30-sc-02-vault-seed/task-2-report.md`: "prepared
  for future use" and "Ready for Task 3" are filler. The report's claims
  otherwise check out against the diff.

  ### Assessment
  **Task quality:** Approved
  **Reasoning:** The implementation and tests match the brief exactly, including
  the controller's import amendment. The construction validation and immutable
  handling are sound, and the only findings are minor test-coverage gaps that
  cannot be filled until later tasks.

  Ran 1 shell command (ctrl+o to expand)

● Task 2 complete, review clean. Task 3 (seed, share lock, activate):
  dispatching the implementer.

● Agent(Implement Task 3: seed, lock, activate) Haiku 4.5
  ⎿  Done (22 tool uses · 56.2k tokens · 2m 57s)
  (ctrl+o to expand)

› Message from afcaf3367e4526413
  **Status:** DONE

  **Test Summary:** All 28 FolioVaultTest tests pass (6 existing + 22 new); full
  suite: 46 tests passed, 0 failed.

  **Concerns:** None. Implementation complete with no compiler warnings.

  **Report File:** `/home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpower
  s/sdd/2026-09-30-sc-02-vault-seed/task-3-report.md`

  **What Was Implemented:**
  - `seed(uint256 amount)` function with SafeERC20, balance-delta measurement
  for fee tokens, DEAD_SHARES minting, state transition, nonReentrant guard
  - `activate()` function with guardian-only authorization and state transition
  - `_setState()` helper for state transitions with events
  - `_update()` override to disable share transfers (mint/burn only)
  - Events: `Seeded`, `StateChanged`
  - Errors: `NotGuardian`, `WrongState`, `BelowMinimumSeed`, `TransfersDisabled`
  - 22 new tests covering seed paths, fee tokens, decimals, share lock, and
  activation with guardian rotation
  - Lint suppression comments for 2 expected unchecked ERC20 transfers in tests

  Ran 2 shell commands (ctrl+o to expand)

● Task 3 implemented (28/28 passing, lint clean); dispatching its reviewer.

● Agent(Review Task 3 (spec + quality)) Sonnet 5.5
  ⎿  Done (4 tool uses · 55.8k tokens · 23s)
  (ctrl+o to expand)

› Message from abfcdf638ad58aa0b
  ### Spec Compliance
  - ✅ Spec compliant. The contract diff matches the brief's Step 3 block line
  for line, and the tests match its Step 1 block. The only additions are the two
  `forge-lint` suppression comments, which the controller ruling allows.
    - Imports, `ReentrancyGuardTransient` inheritance and `using SafeERC20` are
  present (FolioVault.sol diff lines 18-19, 27-28).
    - Both events and all four new errors are declared (diff lines 50-58).
    - `seed` is `nonReentrant` and checks state first (line 82).
    - It measures the received amount from the balance before and after
  `safeTransferFrom` (lines 85-87) and enforces `minSeed` on that received
  amount (line 88).
    - It computes `received * 1e18 / settlementUnit - DEAD_SHARES` (line 91).
  `received >= minSeed` guarantees the subtraction cannot underflow.
    - It mints `DEAD_SHARES` to `DEAD` and the remainder to the caller.
    - `activate` reads the live `registry.guardian()` (line 103).
    - The `_update` override reverts only when both `from` and `to` are
  non-zero, so mint and burn still work (lines 114-117).
    - The test suite has 28 tests in total (6 from Task 2, 22 new). This matches
  the brief's expected count and the reported output.
    - The forge-lint suppressions are at test lines 319-320 and 331-332, each
  with a reason comment. They are listed in the report.
  - ⚠️ Cannot verify from the diff alone:
    - `DEAD`, `DEAD_SHARES`, `MIN_SEED_UNITS`, `shareOf` and the `_deploy`
  helper are defined in earlier tasks and are not in the diff. The reported
  passing run implies they exist.
    - "No compiler warnings" and "forge fmt applied" come from the report only.
  I did not re-run either.

  ### Strengths
  - The fee-on-transfer path is handled correctly and tested at both levels. The
  mint amount follows the received amount
  (`test_seed_feeOnTransfer_mintsFromReceived`), and the minimum applies to the
  received amount (`test_seed_feeOnTransfer_minimumAppliesToReceived`, with
  9.9e18 against 10e18).
  - Shares come only from the deposit, so a prior donation cannot inflate the
  seeder's shares (`test_seed_ignoresPriorDonation`).
  - Effects and mints happen after the transfer, under the reentrancy guard, and
  the state check runs before any token movement.
  - `activate` follows guardian rotation, and the rotation test also checks that
  the old guardian is rejected.
  - The fuzz test covers every decimals value from 0 to 18 and checks the total
  supply, the dead shares and the seeder shares together.
  - The `_update` share lock is minimal and does not block minting or burning.
  - The suppressions are narrow, one line each, with reasons.

  ### Issues
  #### Critical (Must Fix)
  None.

  #### Important (Should Fix)
  None.

  #### Minor (Nice to Have)
  - Test file line ~247 (`test_seed_revertsWithoutAllowance`) uses a bare
  `vm.expectRevert()`. It would pass on any revert, for example a mock bug. The
  brief mandates it, so it is not a defect of this task. Later, consider
  asserting the OZ `ERC20InsufficientAllowance` selector.
  - No test covers a reentrant settlement token against the `nonReentrant` guard
  on `seed`. Coverage is thin here, but the brief does not require it.
  - Report lines 113-114 and 166-172 cite line numbers "237" and "247" for the
  suppressions, but the actual test lines are about 319-332. This is cosmetic
  and does not affect the code.
  - Report line 213 says "Concerns: None" and the self-review claims are
  unverified assertions. I could match each one to the diff, so this is not a
  code issue.

  ### Assessment
  **Task quality:** Approved
  **Reasoning:** The implementation matches the brief, the money path is sound
  (balance-delta accounting, guard, safe transfers, no underflow), and the tests
  exercise real behavior including the fee-token, donation, decimals and
  guardian-rotation edge cases. Only minor polish items remain.

  Note for the user: the claude.ai Gmail and Google Calendar MCP servers need
  authorization before their tools can be used. This session is non-interactive,
  so authorize them via the claude.ai connector settings. They are unavailable
  until then. They were not needed for this review.

  Ran 1 shell command (ctrl+o to expand)

● Task 3 complete, review clean. Task 4 (factory + cleanup): dispatching the
  implementer.

● Agent(Implement Task 4: VaultFactory + cleanup) Haiku 4.5
  ⎿  Done (15 tool uses · 47.2k tokens · 1m 50s)
  (ctrl+o to expand)
› Message from a5c60ea6d8e22f4ef
  **Status:** DONE

  **Test summary:** 52 tests pass across 3 suites (15 + 9 + 28); FolioVault and
  VaultFactory both under 24,576-byte runtime limit.

  **No concerns.**

  **Report:** `/home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpowers/sdd
  /2026-09-30-sc-02-vault-seed/task-4-report.md`

  ---

  ## Summary

  VaultFactory (7,509 bytes) and its 9-test suite are complete. TDD flow
  confirmed:
  - RED: compilation failed with "Source not found" (expected)
  - GREEN: all 9 tests passed after implementation
  - CLEANUP: Scaffold test deleted, all 52 tests across 3 suites pass, format
  clean, no lint issues

  Documentation updated:
  - `contracts/README.md`: Status section replaced with SC-02 completion
  announcement and work summary
  - `docs/sc-checklist.md`: Phase 1 fully ticked; 4 of 5 decisions ticked (5th
  left open per spec)

  Files created: `VaultFactory.sol`, `VaultFactory.t.sol`
  Files deleted: `Scaffold.t.sol`
  Files modified: `README.md`, `sc-checklist.md`
  Lint silenced: 0
  Changes staged: None (per requirements — user commits manually)


  Ran 1 shell command (ctrl+o to expand)

● Task 4 implemented (52/52 passing); dispatching its reviewer.

● Agent(Review Task 4 (spec + quality)) Sonnet 5.5
  ⎿  Done (4 tool uses · 51.3k tokens · 25s)
  (ctrl+o to expand)

› Message from a92b98fbc3d0f8226
  ### Spec Compliance
  - ✅ Spec compliant. Every file in the brief has its hunk. The diff matches
  the brief's code and doc text apart from cosmetic differences.
    - `contracts/src/VaultFactory.sol`: the interface matches the brief
  (constructor, immutable `registry`, `vaults`, `isVault`, `createVault`,
  `vaultCount`, `VaultCreated`). `pragma solidity 0.8.30` is exact, there are no
  `require` strings, and imports are relative.
    - `contracts/test/VaultFactory.t.sol`: all 9 tests are present and match the
  brief.
    - `contracts/test/Scaffold.t.sol` is deleted. `contracts/script/.gitkeep` is
  not in the diff, which is correct under the controller ruling.
    - `contracts/README.md`: the Status section is replaced with the brief's
  text, and `## Setup` is untouched.
    - `docs/sc-checklist.md`: 4 decisions are ticked and the max-stocks line is
  left open with "(you, before SC-04)". Phase 1 is ticked except the
  unseeded-vault item, which carries the SC-03 note. The dead-shares line now
  says `0xdEaD`.
  - ⚠️ Cannot verify from the diff:
    - The README claim "shares are non-transferable" depends on
  `FolioVault.sol`, which is outside this diff.
    - The "52 tests / 24,576-byte limit" result rests on the report's output
  only. It shows per-suite counts of 15 + 9 + 28 and runtime sizes well under
  the limit.
    - `MockERC20` and the `AssetRegistry`/`FolioVault` interfaces come from
  earlier tasks. The report shows the tests compiling and passing.

  ### Strengths
  - The RED-to-GREEN evidence is genuine: the compile failure on the missing
  source is shown, then 9 of 9 pass.
  - The event test computes the expected CREATE address up front
  (`vm.computeCreateAddress`) and uses `vm.expectEmit(address(factory))`. That
  asserts the vault address, manager and settlement token, and checks the
  returned address too.
  - The tests exercise real behaviour rather than just reading getters:
    - a caller who is not the manager
    - two vaults created with identical arguments, which must differ
    - the zero-manager revert propagating from `FolioVault`
    - a full create, seed, activate flow that asserts the dead-share arithmetic
  (`500e18 - 1e15`)
  - The docs stay honest. The README says there is no withdrawal path yet and
  warns against a mainnet deploy. It also lists the unbuilt work per SC-number.

  ### Issues
  #### Critical (Must Fix)
  None.

  #### Important (Should Fix)
  None.

  #### Minor (Nice to Have)
  - `contracts/src/VaultFactory.sol:36-44` (plan-mandated design): `createVault`
  is open to anyone, and `isVault` is documented as the "list of genuine ones".
  Anyone can therefore register unlimited vaults with arbitrary names and
  symbols, including ones that imitate a real fund's name. Nothing in the
  contract tells a UI or indexer which vaults are trustworthy.
    - This is acceptable in a DRAFT-only model, and the NatSpec states it. The
  frontend and indexer should not treat `isVault` as an endorsement. Consider
  saying so in the NatSpec, or gating the listing behind guardian activation
  later.
  - `contracts/src/VaultFactory.sol:40-43` has no factory-level test that
  `VaultCreated` carries the registry's settlement token when it differs from
  the mock. This is negligible, since `test_createVault_emitsVaultCreated`
  already asserts `address(usdt)`.

  ### Assessment
  **Task quality:** Approved
  **Reasoning:** The diff matches the brief file by file, including the ruling
  that `.gitkeep` stays. The tests assert real behaviour, and the doc edits
  claim only what the built contracts do.

  Ran 2 shell commands (ctrl+o to expand)

● All 4 tasks complete and reviewed clean. Dispatching the final whole-build
  review.

● Agent(Final review of SC-02 build)
  ⎿  Done (20 tool uses · 146.9k tokens · 8m 34s)
  (ctrl+o to expand)

› Message from ae29a9bd5a7f18fe2
  ## Final review: SC-02 (AssetRegistry, FolioVault, VaultFactory)

  Reviewed in one pass, read-only on the project. All probing was done in a
  scratch copy (paths at the end). The live `src/` and `test/` match the diff
  byte for byte.

  ### Strengths

  - **Matches the plan and spec §7.** Source is the plan's code verbatim;
  function, event and error signatures match the interface Vincent will
  integrate against. All Global Constraints hold (pragma, custom errors,
  SafeERC20, balance-delta measurement, `nonReentrant` on `seed`, decimals read
  and >18 rejected).
  - **All five Review Focus items are pinned.** I broke each behaviour on
  purpose and the named test failed each time:
    | # | Mutation | Killed by |
    |---|---|---|
    | 1 | mint from the argument, not what arrived |
  `test_seed_feeOnTransfer_mintsFromReceived` |
    | 2 | count the whole balance (includes the donation) |
  `test_seed_ignoresPriorDonation` |
    | 3 | assume 18 decimals | `test_seed_sixDecimals_oneSharePerUnit` |
    | 4 | block only `transfer()` | `test_transferFrom_reverts` |
    | 5 | cache the guardian at construction |
  `test_activate_followsGuardianRotation` |
  - **Tests verify real behaviour.** 29 of 32 mutants were killed; the three
  survivors are listed under Minor. Coverage is 100% lines and branches on all
  three contracts. 52/52 pass, and the fuzz test passes at 10,000 runs under the
  deep profile.
  - **No way found to take money, mint unbacked shares, bypass a role or get
  stuck** within this surface. Probes that behaved correctly: reentrant
  settlement token (blocked by the guard), 0-decimal token, zero-value and self
  transfers, transfer to `0xdEaD`, non-contract settlement token, zero
  governance.
  - **Integrates cleanly with SC-03 to SC-06.** `_setState`, mutable `manager`,
  the `_held` set, and a lock in `_update` that leaves burn open for redemption
  are all reusable as is.
  - **README is honest** about the missing withdrawal path and says not to
  deploy to mainnet.

  ### Issues

  #### Critical (Must Fix)
  None.

  #### Important (Should Fix)
  None.

  #### Minor (Nice to Have)

  1. **`contracts/src/AssetRegistry.sol:10` — `renounceOwnership()` is still
  callable.**
     - Proved: after the call `owner()` is zero and `setGuardian` reverts
  forever.
     - Why it matters: the guardian could never be rotated and the allowlists
  freeze; it is irreversible. It is only reachable by governance itself.
     - Fix: override `renounceOwnership` to revert with a custom error, plus one
  test.

  2. **`contracts/README.md:61-62` — the "drop `evm_version` to `shanghai`"
  fallback no longer works.**
     - Proved: a shanghai build fails with error 6243, because
  `ReentrancyGuardTransient` needs `tstore`.
     - Fix: say cancun (EIP-1153) is now required; the fallback would be
  swapping to the storage-based `ReentrancyGuard`.

  3. **`contracts/src/VaultFactory.sol:8-9` — the comment "cannot take outside
  money until the guardian activates it" is not true.**
     - Proved: a stranger seeded a `DRAFT` vault. Seeding is outside money, by
  design (decision #4).
     - Fix: reword to "cannot take subscriptions until activated; the seed is
  the only deposit a `DRAFT` accepts". Spec §10 has the same sentence.

  4. **`contracts/src/FolioVault.sol:75` — no test pins `nonReentrant`.**
     - Proved: with the modifier removed all 52 tests still pass, and a callback
  token then mints 300e18 shares for 200e18 deposited.
     - Why it matters: not reachable with real USDT, but a regression would go
  unnoticed.
     - Fix: lift `test_scratch_reentrantSeedIsBlocked` and its `ReentrantToken`
  mock from the scratch file.

  5. **`contracts/test/FolioVault.t.sol:178` — `Seeded.amount` is never asserted
  under a fee token.**
     - Proved: emitting the argument instead of `received` passes every test.
     - Why it matters: the indexer relies on this event carrying what actually
  arrived.
     - Fix: add an `expectEmit` for `Seeded(seeder, 99e18, 99e18 - DEAD_SHARES)`
  to that test.

  6. **`contracts/README.md:46` — `forge test --profile deep` is rejected by
  forge 1.5.1** ("unexpected argument '--profile'").
     - This text predates the build, but it is the documented pre-deploy
  command.
     - Fix: `FOUNDRY_PROFILE=deep forge test` (confirmed working).

  7. **`contracts/src/VaultFactory.sol:18` — `registry_` is not validated.**
     - Proved: a zero registry deploys fine, then every `createVault` reverts
  with empty data. It fails closed; no funds are involved.
     - Fix: a one-line probe in the constructor, or handle it in the SC-07
  deploy script.

  8. **Stale docs.**
     - `docs/sc-checklist.md:137-144` still says SC-02 "can start as soon as
  decisions 2–5 are made".
     - `docs/folio-lab-contract-architecture.md:4` still says "Nothing here is
  built yet".

  9. **Spec-level, not an implementation defect: the seed slot can be taken by a
  stranger.**
     - Proved: a stranger seeds the 10 USDT minimum and the curator's 10,000
  seed reverts with `WrongState(SEEDED)`.
     - The curator cannot create and seed atomically, because shares mint to
  `msg.sender` and cannot be moved.
     - Effect: no loss of funds; the curator would have to enter through
  subscription after activation.
     - Decide before the §7 interface is frozen whether `createVault` should be
  able to seed in the same call, or whether the manager names the seeder.
     - Related (item 9 only): `createVault` lets anyone name any address as
  manager without consent (proved), and `VaultCreated` does not carry the
  creator.

  ### Deferred minors triaged

  | Ledger line | Ruling | Reason |
  |---|---|---|
  | T1: `renounceOwnership()` callable | **Fix now** | Three lines, irreversible
  effect, and no later task touches `AssetRegistry`, so it would be orphaned. |
  | T1: constructor events and `setAsset(settlement, true)` revert not asserted
  | Fine to leave | Confirmed the mutant survives, but the state is readable
  from getters and the revert is harmless. |
  | T2: raw revert for a zero / non-contract `registry_` | Fine to leave |
  Deploy-time misconfiguration that fails closed; belongs in the factory
  constructor or the SC-07 script. |
  | T2: `holdings()` loop untested | Closed |
  `test_seed_recordsSettlementTokenAsHeld` now covers it (mutant killed). |
  | T3: bare `vm.expectRevert()` in `test_seed_revertsWithoutAllowance` | Fine
  to leave | It exercises the mock token's error, not vault logic. |
  | T3: no reentrant-token test | Fine to leave for acceptance | SC-07's
  checklist owns it; pull it into SC-03, which adds three more token-moving
  functions. A ready test is in the scratch file. |
  | T4: `isVault` is not an endorsement | Fine to leave | The code is right. Put
  in the backend handoff: `isVault` means genuine code and registry; `ACTIVE`
  is the guardian's endorsement. |

  The controller's lint ruling (project-wide `screaming-snake-case-immutable`
  exclusion, two inline disables in tests) is reasonable; `forge fmt --check`
  and `forge lint` are clean.

  ### Declined to judge

  - No withdrawal path, and the seeder's funds are locked if the guardian never
  activates: SC-05/SC-06 scope, disclosed in the README.
  - `holdings()` will count subscription escrow once SC-03 keeps escrowed USDT
  in the same contract: SC-03 design.
  - Tokens sent to the vault that are not in `_held` are invisible to
  `holdings()` and future redemption: SC-04/SC-05 decide.
  - Unbounded `holdings()` loop and max assets per vault: open decision #7,
  SC-04.
  - `activate()` does not check that an initial allocation happened: guardian
  discretion per spec.
  - A `SEEDED` vault left with only dead shares after seed-investor recovery:
  SC-05/SC-06 behaviour.
  - Look-alike vault names and symbols, and spam vault creation: permissionless
  by decision; an off-chain curation concern.
  - `approve()` on shares still succeeds with an inert allowance: the spec only
  requires transfers to revert.
  - Delisting an asset that vaults already hold: interacts with SC-04's
  allowlist assertion.
  - The 24h timelock itself: no code here; the SC-07 deploy script sets the
  owner.
  - Issuer-level behaviour of real USDT (freeze, pause, upgrade): outside these
  contracts.
  - `received * 1e18` overflowing above about 1e59 base units: unreachable, and
  it reverts safely.
  - `fail_on_revert = false` for invariants in `foundry.toml`: predates the
  build, SC-07.

  ### Recommendations

  - Do items 1, 2 and 3 in one small pass now (about 15 lines); items 5 and 6
  are one line each if you are in there anyway.
  - Put the reentrant-token mock into the SC-03 plan rather than waiting for
  SC-07.
  - Raise item 9 with the founder before freezing the interface; it is the only
  finding that could change a signature.

  ### Assessment

  **Ready to accept?** With fixes

  **Reasoning:** Nothing Critical or Important, and nothing in the money path
  needs to change; the build is safe to build on. The fixes are the
  `renounceOwnership` override with a test and two doc lines this build made
  false (items 1 to 3).

  Scratch files, all outside the project:
  - `/tmp/claude-1000/-home-eggwae-personal-projects-bnb-hack-bnb-hack/dab20c5a-
  d5e9-4fa1-8b56-815b48700c13/scratchpad/proj/test/Scratch.t.sol` — 10 probe
  tests
  - `/tmp/claude-1000/-home-eggwae-personal-projects-bnb-hack-bnb-hack/dab20c5a-
  d5e9-4fa1-8b56-815b48700c13/scratchpad/mutate.py` — the 32 mutations

  Ran 2 shell commands (ctrl+o to expand)

● Final review: no Critical or Important findings, 9 Minor. Dispatching one fix
  pass for the ones worth fixing now.

● Agent(Fix final-review findings) Sonnet 5.5
  ⎿  Done (10 tool uses · 49.3k tokens · 55s)
  (ctrl+o to expand)

› Message from ae271d9b616df0f54
  Status: DONE
  Tests: 54 pass across 3 suites (16+29+9). fmt, build --force and lint are all
  clean.
  All 7 fixes (F1, F2, F3, F4, F5, F6, F8) are applied.
  - F1: RED was a compile error (RenounceDisabled not found), then the new test
  passed after the fix. `view` was accepted by the compiler.
  - F4: with `nonReentrant` removed from `seed`, the test failed with "inner
  seed must be blocked". With it restored, the test passes. `diff` of
  `src/FolioVault.sol` against snap-fix is empty.
  - No lint suppressions were needed.
  - Nothing committed.
  Concerns: none. Architecture doc line 4 is now a long line, since I used the
  verbatim text without re-wrapping.
  Report: /home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpowers/sdd/2026
  -09-30-sc-02-vault-seed/final-fix-report.md

  Ran 1 shell command (ctrl+o to expand)

● One scoped re-review of the fix pass.

● Agent(Re-review final fix wave) Sonnet 5.5
  ⎿  Done (3 tool uses · 45.9k tokens · 17s)
  (ctrl+o to expand)

› Message from a6582e88b38d8d725
  ### Findings
  - F1: ADDRESSED. `contracts/src/AssetRegistry.sol` diff lines 18 and 42-44 add
  the `RenounceDisabled` error and the `renounceOwnership` override that
  reverts with it. The test is at `contracts/test/AssetRegistry.t.sol` diff
  lines 85-91 and also asserts the owner is unchanged. The `view` override
  matches the brief's text exactly, and the controller's clean build and 54/54
  run confirm it compiles.
  - F2: ADDRESSED. `contracts/README.md` diff lines 267-269 replace the shanghai
  advice with the required `cancun` and `ReentrancyGuardTransient` blockquote,
  word for word.
  - F3: ADDRESSED. `VaultFactory.sol` diff lines 59-60 and
  `folio-lab-contract-architecture.md` diff lines 314-315 both use the required
  wording. The code backs it: the seed is accepted in `DRAFT`, and subscriptions
  need `ACTIVE`.
  - F4: ADDRESSED. `MockReentrantERC20` (mocks diff lines 218-240) re-enters
  `seed` from inside the transfer into the vault and records `innerOk`. The test
  at `FolioVault.t.sol` diff lines 136-151 matches the brief and asserts
  `innerOk` is false, no shares for the token, and dead shares minted once.
  `src/FolioVault.sol` does not appear in the diff, so it is unchanged. I did
  not re-run the remove-`nonReentrant` proof.
  - F5: ADDRESSED. `FolioVault.t.sol` diff lines 168-175 do explicit mint and
  approve, then `expectEmit(address(v))` with `Seeded(seeder, 99e18, 99e18 -
  DEAD_SHARES)` directly before `seed`. The three original assertions are kept
  (diff lines 177-179).
  - F6: ADDRESSED. README diff line 251 and the foundry.toml comment (diff line
  324) both read `FOUNDRY_PROFILE=deep forge test`.
  - F8: ADDRESSED. `folio-lab-contract-architecture.md` diff line 298 and
  `sc-checklist.md` diff lines 288-290 carry the required text.

  ### New breakage in the fix diff
  None. Every change maps to one of the seven findings. The test edits only add
  coverage, and no existing assertion was weakened.

  ### Out of scope (for the ledger)
  - `MockReentrantERC20` makes the test-mocks file depend on
  `src/FolioVault.sol`. This is harmless, but every mock now recompiles when the
  vault changes.

  ### Verdict
  All findings addressed

● Skill(superpowers:finishing-a-development-branch)
  ⎿  Successfully loaded skill

● I'm using the finishing-a-development-branch skill to complete this work.

  Ran 1 shell command (ctrl+o to expand)

● SC-02 is built: 54 of 54 tests pass, with forge fmt, build and lint all clean.
  Nothing is committed.

  What you have now

  ┌────────────────────────────────────────┬────────────────────────────────┐
  │                Contract                │          What it does          │
  ├────────────────────────────────────────┼────────────────────────────────┤
  │ AssetRegistry.sol                      │ Approved tokens and routers,   │
  │ (contracts/src/AssetRegistry.sol)      │ the USDT address, the          │
  │                                        │ guardian. Owned by governance. │
  ├────────────────────────────────────────┼────────────────────────────────┤
  │ FolioVault.sol                         │ Share token with transfers     │
  │ (contracts/src/FolioVault.sol)         │ blocked, plus seed() and       │
  │                                        │ activate().                    │
  ├────────────────────────────────────────┼────────────────────────────────┤
  │ VaultFactory.sol                       │ Anyone can create a vault.     │
  │ (contracts/src/VaultFactory.sol)       │                                │
  └────────────────────────────────────────┴────────────────────────────────┘

  The three contracts come to about 225 lines. Start reading with seed() in
  FolioVault: it's the only function that moves money.

  There is still no withdraw (that's SC-05), so don't deploy this to mainnet
  yet. The README says so.

  Reviews

  Each task got its own review, then one whole-build review. None found a
  Critical or Important issue. The final reviewer broke the code on purpose in
  32 ways, and the tests caught 29. I fixed seven small findings from that
  review:

  - renounceOwnership() is now disabled on the registry. Otherwise governance
    could have frozen the allowlists forever by accident.
  - Two new test checks: one proves the reentrancy guard on seed() works, and
    one checks the Seeded event amount under a fee-taking token.
  - Doc fixes: wrong README commands and a few stale lines.

  One decision for you

  A stranger can take a vault's only seed slot. Because anyone can seed, someone
  can seed a curator's new vault with 10 USDT before the curator does. The
  curator's own seed then reverts, and they would have to join through a
  subscription instead. No money is at risk.

  This follows from your "anyone can seed" choice. The fix would be letting
  createVault seed in the same transaction, or letting the manager name the
  seeder. Either one changes the interface Vincent builds against, so decide
  before that's frozen. I left it unchanged.

  Related: anyone can name any address as a vault's manager without that address
  agreeing.

  Rulings I made

  In order, each with what it costs if I got it wrong:

  1. Worked on main with no separate worktree. contracts/ is untracked, so a
     worktree would have been empty. Cost: none, since every file written is
     new.
  2. No commits. Reviews ran on file snapshots instead. Cost: the only record is
     the ledger in .superpowers/, not git.
  3. MockFeeERC20 import moved from Task 2 to Task 3. Cost: none.
  4. Kept contracts/script/.gitkeep. Cost: none.
  5. Turned off one lint project-wide (screaming-snake-case-immutable, in
     foundry.toml). It wanted REGISTRY() instead of registry(), which would
     break the agreed interface. Cost: that lint is off for the whole project.
  6. Disabled renounceOwnership(). Cost: governance can never deliberately go
     ownerless.
  7. Fixed the README and doc lines the review flagged. Cost: none.
  8. Reworded "cannot take outside money until activated" in the factory comment
     and spec §10, because seeding is outside money. Cost: none.
  9. Added the reentrancy test now instead of waiting for SC-07. Cost: one extra
     mock.
  10. Added the Seeded event check under a fee token. Cost: none.
  11. Left the factory accepting any registry address. A bad one fails safely,
      and the deploy script (SC-07) is the right place to check. Cost: a
      misdeployed factory is useless and must be redeployed.
  12. Left the seed-slot issue unchanged and raised it above. Cost: a curator
      may have to join their own vault by subscription.
  13. Kept the .superpowers/ workspace (git-ignored). With no commits it's the
      only record. Cost: a few hundred KB.

  What next?

  Nothing is on a branch, so the usual merge menu becomes:

  1. Commit to main locally, only contracts/ and the contract docs
  2. Commit on a new branch, push, and open a PR
  3. Keep as-is, uncommitted, and you handle it

  Your tree also has unrelated uncommitted work (api/, lib/binance/, app/). I'd
  leave that out of any commit.

  Which option?

❯ can you write for me a simulation test file to actually tell me the entire
  process to simulate multi user actually trying to use the system

● Write(contracts/test/Simulation.t.sol)
  ⎿  Wrote 269 lines to contracts/test/Simulation.t.sol
      1 // SPDX-License-Identifier: MIT
      2 pragma solidity 0.8.30;
      3
      4 import {Test, console} from "forge-std/Test.sol";
      5 import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol
        ";
      6 import {AssetRegistry} from "../src/AssetRegistry.sol";
      7 import {FolioVault} from "../src/FolioVault.sol";
      8 import {VaultFactory} from "../src/VaultFactory.sol";
      9 import {MockERC20} from "./mocks/MockERC20.sol";
     … +316 lines (ctrl+o to expand)

  Ran 2 shell commands (ctrl+o to expand)

● I wrote it: Simulation.t.sol (contracts/test/Simulation.t.sol). It's one test
  that plays out a story with 7 people and prints each step. It passes, and the
  full suite is now 55 of 55 with lint clean.

  Run it

  cd contracts
  forge test --match-contract SimulationTest -vv

  The -vv is what makes the story print.

  The cast

  ┌──────────────────────┬─────────────────────────────────────┐
  │         Who          │                Role                 │
  ├──────────────────────┼─────────────────────────────────────┤
  │ governance, guardian │ the team's slow and fast admin keys │
  ├──────────────────────┼─────────────────────────────────────┤
  │ Alice                │ curator of vault 1                  │
  ├──────────────────────┼─────────────────────────────────────┤
  │ Bob                  │ first investor, seeds Alice's vault │
  ├──────────────────────┼─────────────────────────────────────┤
  │ Carol                │ second investor                     │
  ├──────────────────────┼─────────────────────────────────────┤
  │ Dave                 │ curator of vault 2                  │
  ├──────────────────────┼─────────────────────────────────────┤
  │ Mallory              │ attacker                            │
  └──────────────────────┴─────────────────────────────────────┘

  What it prints

  == 0. The team deploys the system
  == 1. Governance decides what vaults may hold and where they may trade
     Mallory tried to allow her own scam token: REVERTED (she is not
  governance).
  == 2. Alice becomes a curator
     Vault state: DRAFT. It is empty and has no shares.
  == 3. Bob puts in the first money (the seed)
     Bob's shares:  999.999
     Dead shares:   0.001  (locked forever, blocks the inflation attack)
     Vault state:   SEEDED
  == 4. Carol also wants to seed Alice's vault
     REVERTED: a vault is seeded exactly once. Carol still has her 500 USDT.
  == 5. Bob tries to hand some shares to Carol
     REVERTED: shares can be minted and burned, never transferred.
  == 6. Opening the vault to the public
     Alice tried to activate her own vault: REVERTED (the manager is not the
  guardian).
     The guardian activated it. Vault state: ACTIVE
  == 7. Dave starts a second, separate vault
     Carol tried to seed Dave's vault with 5 USDT: REVERTED (minimum is 10).
     Alice's vault did not change: each vault has its own money and its own
  shares.
  == 8. Final books

  (Trimmed. The real output has a few more lines per chapter.)

  How to read the file

  - Each chapter is its own small function (_ch3BobSeedsIt, and so on), so you
    can read one at a time.
  - vm.prank(bob) means "the next call is sent by Bob".
  - vm.expectRevert(...) means "the next call must fail with this error".
  - Every chapter ends with assertEq checks, so the printed numbers are
    verified.

  It only covers what exists today. Joining after activation, trading,
  withdrawing and pausing aren't built yet, and the last lines of the output say
  so. As we build SC-03 onward, new chapters can go into this same file.

  You still haven't picked what to do with the uncommitted work (commit to main,
  branch and PR, or leave it), and the seed-slot question is still open.

❯ are all the contracts completed?

● No. Only the first of six build tasks (SC-02) is done: a vault can be created,
  seeded and activated, but nobody can join later, trade or withdraw yet.

  ┌───────┬──────────────────────────────────────────────┬──────────────────┐
  │ Task  │                 What it adds                 │      Status      │
  ├───────┼──────────────────────────────────────────────┼──────────────────┤
  │ SC-02 │ Registry, factory, vault, seed(), activate() │ ✅ built, 55     │
  │       │                                              │ tests pass       │
  ├───────┼──────────────────────────────────────────────┼──────────────────┤
  │ SC-03 │ Later investors joining (subscribe, execute, │ ❌ not built     │
  │       │  cancel)                                     │                  │
  ├───────┼──────────────────────────────────────────────┼──────────────────┤
  │ SC-04 │ Manager trading with the safety checks       │ ❌ not built     │
  │       │ (TradeGuard, rebalance)                      │                  │
  ├───────┼──────────────────────────────────────────────┼──────────────────┤
  │ SC-05 │ Withdrawing (redeem)                         │ ❌ not built     │
  ├───────┼──────────────────────────────────────────────┼──────────────────┤
  │ SC-06 │ Pause, unpause, replace manager              │ ❌ not built     │
  ├───────┼──────────────────────────────────────────────┼──────────────────┤
  │ SC-07 │ Invariant tests, deploy scripts, ABI handoff │ ❌ not built     │
  │       │  to Vincent                                  │                  │
  └───────┴──────────────────────────────────────────────┴──────────────────┘

  Money can go into a vault but cannot come out until SC-05 is built, so none of
  this should be deployed to mainnet yet.

  What blocks the next steps

  - SC-03 needs one decision from you and Vincent: how long a subscription waits
    before the investor can cancel it.
  - SC-04 needs two decisions: the maximum number of assets per vault, and which
    stock tokens go on the allowlist (based on liquidity).
  - SC-05 needs no decision. It depends only on SC-02, so it can be built right
    now.

  I'd build SC-05 (withdraw) next, because it closes the "money can't leave" gap
  and nothing blocks it. Want me to start on that?

❯ what do you mean by how long a subscription waits and why can investor cancel
  and so forth? i don't know what that is? since when there is a subscription?

● "Subscription" is just the finance word for a later investor depositing into a
  vault that is already running. I used the doc's jargon without explaining it.
  It's not a recurring payment, and it isn't built yet; it's the design for
  SC-03.

  Why depositing later takes two steps

  The seed is simple: the vault is empty, so 1 USDT = 1 share.

  Later the vault holds stocks, and the contract refuses to price them (no
  oracle). So it can't say "your 100 USDT is worth X shares". Instead:

  1. Request. Carol sends 100 USDT. It sits in a waiting area (escrow), not in
     the vault yet. She has no shares.
  2. Execute. The manager uses Carol's 100 USDT to buy a bit more of every stock
     the vault holds. The contract measures how much the vault grew (say 1%)
     and mints Carol 1% more shares.

  So Carol only gets shares once her money has actually been invested.

  Why the investor can cancel

  Step 2 depends on the manager. If the manager never does it, Carol's USDT
  would be stuck in the waiting area forever, with no shares.

  So there is a safety exit: after a deadline, Carol can cancel and take her
  USDT back, without needing anyone's permission.

  The decision I mentioned

  It's how long that deadline is: how long Carol must wait before she is allowed
  to cancel.

  ┌─────────────────┬───────────────────────────────────────────────────────┐
  │    Deadline     │                       Trade-off                       │
  ├─────────────────┼───────────────────────────────────────────────────────┤
  │ Short (e.g. 1   │ Carol gets her money back fast, but the manager has   │
  │ hour)           │ little time to invest it                              │
  ├─────────────────┼───────────────────────────────────────────────────────┤
  │ Long (e.g. 3    │ The manager has plenty of time, but Carol's money can │
  │ days)           │  sit stuck for longer                                 │
  └─────────────────┴───────────────────────────────────────────────────────┘

  The stock tokens only trade well during US market hours, so I'd suggest 24
  hours. That gives the manager at least one full trading session.

  This only matters when we build SC-03. Withdrawals (SC-05) don't depend on it.

❯ i think from my end what i would like is users can deposit whenever they feel
  like it so a "subscription" is just pumping more funds into the vault for
  the fund manager to use to invest.

  so tldr:
  user deposit 100usdt -> 100usdt sits in vault idling until manger use the
  funds to invest -> user can immediately withdraw whenever they want

  that means when funds actually enters the vault, it is fully up to the fund
  manager's decision to actually proceed with the investment of user's funds of
  course with the restriction of the assets list in AssetRegistry

  i would also like to double check if my understanding of logic is right.
  basically when user deposit, they are essentially buying shares of the vault
  to be like a shareholder for a particular etf. however i need to know once
  the share token is distributed to the user once they purchased / deposit, how
  is the priced tracked since there will be a mix of stock tokens that the
  vault holds when manager invest and usdt idle?

  finally when withdrawal what if some part of their funds are idle while some
  are being used to invest as the entire vault is technically funds for the
  manager to freely use to invest?

● Your ETF picture is right: depositing means buying shares, and shares mean you
  own a percentage of everything in the vault. But your deposit flow has one
  problem, which your own second question points at.

  1. How is the share price tracked?

  On-chain, it isn't. The contract only knows percentages ("Bob owns 10% of the
  shares"). It never knows what a share is worth in dollars.

  The website shows a price, but Vincent's backend calculates that off-chain
  from market prices. It's for display only.

  2. Withdrawing when some money is idle and some is invested

  This works cleanly. Once money is in the vault it's pooled, so there is no
  "your dollars" versus "invested dollars". You own a percentage of everything.

  Say the vault holds 400 idle USDT and 6 AAPL tokens, and you own 10% of the
  shares. You withdraw 40 USDT and 0.6 AAPL, instantly, with nobody's
  permission.

  The catch is that you get stock tokens, not all cash. You sell them yourself.

  3. The problem with "deposit → get shares immediately"

  To hand out shares at deposit, the contract must know what the vault is worth
  right now.

  - Bob seeded 1,000 USDT and holds 1,000 shares. The manager bought stocks, and
    they doubled. The vault is now worth 2,000.
  - Carol deposits 1,000 USDT. With no price, the contract can only give her 1
    share per USDT, so 1,000 shares.
  - Carol now owns 50% of a 3,000 vault, which is 1,500. She gained 500
    instantly, taken from Bob.

  To stop that, the contract needs a trusted on-chain price for every stock
  token (an oracle).

  Two ways forward

  Option 1: your flow with one tweak, no oracle (what I'd pick)

  - Deposit any time. The USDT waits in a holding area.
  - You can take it back any time, instantly. That removes the deadline decision
    entirely.
  - When the manager puts it to work, you get your shares. The manager buys the
    same mix the vault already holds, and can rebalance freely afterwards.
  - After that you can withdraw any time, as in section 2.

  The tweak is that shares arrive when the money is invested, not at deposit.
  While it waits, it earns nothing and risks nothing.

  Option 2: exactly your flow, with an oracle

  - You get shares the moment you deposit.
  - It needs a reliable on-chain price for every stock token. I haven't checked
    whether one exists on BSC for these tokens.
  - A wrong or stale price lets someone steal from existing holders, and these
    tokens barely trade outside US market hours.
  - It's more code and the hardest part to secure. The PRD calls this the
    unsolved problem.

  Which one do you want, 1 or 2?

❯ also one more thing the share token in the vault i need it to not be
  tradeable, which means users can only hold it and interact with the vault, im
  not sure if that design is already written down. so that way, their share
  tokens are like a rebase tokens which their shares in the pool is
  proportionally increased or decreased based on their contribtuion into the
  vault. furthermore, it removes the hassle of trading the share token as well
  which will affect prices further

● Yes, that's already built: shares can't be transferred or traded. It's written
  in spec §9 and enforced in the code, and Chapter 5 of the simulation test
  shows Bob failing to send shares to Carol.

  How it's built

  In FolioVault.sol (contracts/src/FolioVault.sol), every share movement goes
  through _update:

  ┌──────────────────────────────────────┬──────────────────────────────────┐
  │                 Move                 │             Allowed?             │
  ├──────────────────────────────────────┼──────────────────────────────────┤
  │ Mint (deposit)                       │ ✅                               │
  ├──────────────────────────────────────┼──────────────────────────────────┤
  │ Burn (withdraw)                      │ ✅                               │
  ├──────────────────────────────────────┼──────────────────────────────────┤
  │ transfer / transferFrom between      │ ❌ reverts with                  │
  │ users                                │ TransfersDisabled                │
  └──────────────────────────────────────┴──────────────────────────────────┘

  So there is no secondary market for shares. Users can only get them from the
  vault and give them back to the vault.

  One correction: they're not rebase tokens

  A rebase token changes the number of tokens in your wallet. Our shares work
  the other way round:

  - Your number of shares stays fixed. It only changes when you deposit or
    withdraw.
  - What each share is worth moves. If the stocks go up 10%, your shares are
    worth 10% more, but you still hold the same count.
  - Other people joining or leaving doesn't change your value. It changes your
    percentage, but the pro-rata maths keeps what your slice is worth the same.

  This is how a normal ETF or mutual fund share works. It's also simpler and
  safer than rebasing, because nothing has to update every holder's balance.

  On "trading would affect prices"

  Even if shares were tradeable, the vault would never use a trading price.
  Deposits and withdrawals only use the vault's own balances. The real benefits
  of blocking transfers are:

  - No one can sell shares to someone who never went through the app.
  - Nobody can trade shares off the platform at a misleading price.

  There's no loose end in the code here: approve still works, but it's useless
  because transferFrom always reverts.

  ---

  Still waiting on your pick from my last message: Option 1 (shares arrive when
  the manager invests; cancel any time; no oracle) or Option 2 (instant shares;
  needs an oracle)?

❯ i would prefer user have shares the moment they deposit
● Got it: shares the moment you deposit. That changes the design, because the
  contract now needs to know what the vault is worth at the moment of each
  deposit.

  Two things stay the same:
  - Withdrawals still need no price. You still get your % of everything.
  - Shares are still non-transferable.

  The new risk

  If the contract's price is wrong, someone can steal:

  1. The real AAPL price is $200, but the contract thinks it's $150.
  2. Mallory deposits, and gets shares as if the vault were cheaper than it is.
  3. She withdraws immediately and walks out with more than she put in. The
     difference comes out of Bob's pocket.

  So the main decision is where the price comes from:

● User answered Claude's questions:
  ⎿  · How should the contract know what the vault is worth when someone
     deposits? → Research first

● I'll look into which price feeds actually exist for these tokens on BSC.

● Agent(Research BSC price feeds for tokenized stocks) Sonnet 5.5
  ⎿  Done (67 tool uses · 101.7k tokens · 5m 55s)
  (ctrl+o to expand)

› Message from ad8a9c91955eed365
  Full findings, with sources and addresses, are in
  /tmp/claude-1000/-home-eggwae-personal-projects-bnb-hack-bnb-hack/dab20c5a-d5e
  9-4fa1-8b56-815b48700c13/scratchpad/price-feed-research.md. Checked 2026-10-01
  around 03:00 UTC, which is Wed 23:00 ET. "Read on-chain" means I called a BSC
  RPC myself.

  Per source:
  - **Chainlink plain equity feeds on BSC: partial, usable now.**
    - The BSC feed list has AAPL/USD 0xb7Ed5bE7977d61E83534230f3256C021e0fae0B6,
  NVDA/USD 0xea5c2Cbb5cD57daC24E26180b19a929F3E9699B8, TSLA/USD
  0xEEA2ae9c074E87596A85ABE698B2Afebc9B57893 and MSFT/USD
  0x5D209cE1fBABeAA8E6f9De4514A74FFB4b34560F. There is no AMD feed.
    - Heartbeat is 86400 s and deviation 0.5%, but I read the contracts on-chain
  and the last update was 15:50 ET, about 7 hours old. So they freeze at the US
  close and stay frozen overnight and on weekends.
    - They track the stock, not the Ondo token, which carries a dividend
  multiplier.
    - URL: https://reference-data-directory.vercel.app/feeds-bsc-mainnet.json
  - **Chainlink feeds for Ondo tokens: not available on BSC.** The `...on / USD`
  feeds exist only on Ethereum (Base listed in the docs); none are in the BSC
  list. BSC support is only announced (https://finance.yahoo.com/news/ondo-taps-
  chainlink-power-data-142836219.html). The docs say these 24/5 feeds also stop
  publishing on weekends and holidays
  (https://docs.chain.link/data-feeds/tokenized-equity-feeds).
  - **Chainlink Data Streams: unconfirmed on BSC.** I found no BNB mention in
  the pages I could retrieve. It is pull-based, and `price` halts on weekends
  while `tokenizedPrice` keeps following CEX trading
  (https://docs.chain.link/data-streams/tokenized-asset-streams).
  - **Ondo own pricing: no public on-chain USD price or NAV.**
    - Mint/redeem uses an off-chain, signed, KYC-bound quote verified in
  GMTokenManager 0x91f8Aff3738825e8eB16FC6f6b1A7A4647bDB299.
    - SyntheticSharesOracle 0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e holds
  only the shares-per-token multiplier.
    - OndoSanityCheckOracle 0x14032815B65f6B65f23d2532ad5F5DFf7BE48C03 is
  manually posted: AAPLon was about 16.7 h stale with a 48 h max delay and 10%
  tolerance, so not trustworthy as a price.
    - I could not find a "Redemption Price Oracle" for GM stocks on BSC.
    - URLs: https://docs.ondo.finance/addresses.md and
  https://github.com/ondoprotocol/rwa-contracts
  - **Pyth: not usable.**
    - The BSC contract is 0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594 and its fee
  is 0. (0x2880aB15… in the docs table is opBNB.)
    - The on-chain AAPL feed was last updated around June 2026.
    - Hermes returns HTTP 401 for equity feed ids.
    - Extended-hours feeds moved to paid Pyth Pro on 2026-06-15, and Pythnet is
  being sunset. Regular-session equities also need a paid plan, about $5k/month
  for US equities.
    - URL:
  https://www.pyth.network/blog/extended-hours-us-equity-data-moves-to-pyth-pro
  - **RedStone and API3: unconfirmed.** Both support BSC, but I found no
  documentation of AAPL/NVDA or Ondo token feeds there.
  - **Binance Oracle / APRO: partial, but for the wrong tokens.** The free APRO
  feeds cover Binance's own bStocks (NVDAB, TSLAB, at least 12 tokens), not Ondo
  tokens. This is press only, and I verified no addresses
  (https://cryptobriefing.com/bnb-chain-free-bstocks-price-feeds/).
  - **DEX pools: not available as a price source.**
    - From DexScreener, total BSC pool liquidity is about $17k for AAPLon, $15k
  for NVDAon, $5.7k for TSLAon and about $2 for MSFTon. I found no AMDon pool.
    - Pools pair against obscure tokens, so a spot price or TWAP is trivially
  manipulable.
  - **Market hours:**
    - Chainlink plain feeds freeze at the close and stay frozen overnight and on
  weekends.
    - Ondo tokens are "generally 24/5". Select assets can be minted and redeemed
  off-hours, but spreads widen.
    - Weekend volume is only about 0.55% of the total
  (https://docs.ondo.finance/ondo-stocks/token-and-quote-pricing.md).

  Recommendation: no source gives a safe live price for the five Ondo tokens on
  BSC. The vault should not read a price on-chain from any single source. For
  deposits, use the Chainlink AAPL/NVDA/TSLA/MSFT feeds as a bounded sanity
  check during US hours only. Reject deposits when they are stale, for example
  more than 20 min. AMD has no feed. Take the actual price from the vault's own
  execution, meaning what the Binance router actually paid, or from an Ondo
  signed quote. Pause or queue deposits outside US hours. Also expect the stock
  price and the total-return token price to drift apart.

  Caveat: staleness and DEX depth are single-moment snapshots.

● I checked: there is no reliable on-chain price for these stock tokens on BSC.
  That rules out the "USDT sits idle, shares arrive instantly" version.

  What exists

  ┌────────────────────────┬─────────────────────────────────────────────────┐
  │         Source         │                     Verdict                     │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ Chainlink feeds for    │ ❌ Only on Ethereum. BSC is announced, not      │
  │ Ondo tokens (AAPLon…)  │ live.                                           │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ Chainlink feeds for    │ ⚠️ Live on BSC, but no AMD. They track the      │
  │ the plain stocks       │ stock, not the token (which also carries        │
  │ (AAPL, NVDA, TSLA,     │ dividends), and they freeze at the US close:    │
  │ MSFT)                  │ overnight and all weekend.                      │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ Ondo's own price       │ ❌ No public price. Their "sanity check" oracle │
  │ contract               │  was 16 hours old.                              │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │                        │ ❌ Equity data now needs a paid plan (about     │
  │ Pyth                   │ $5k/month), and the BSC feed hasn't updated     │
  │                        │ since June.                                     │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ DEX pools              │ ❌ About $17k of liquidity for AAPLon. Anyone   │
  │                        │ could push the price around.                    │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ RedStone, API3,        │ ❓ No confirmed feeds for these tokens.         │
  │ Binance Oracle         │                                                 │
  └────────────────────────┴─────────────────────────────────────────────────┘

  Full findings with sources: price-feed-research.md in my scratchpad folder.

  What this means for you

  Any price-based design has the same weak spot: outside US market hours the
  price is frozen while the token keeps trading. Mallory could deposit at the
  stale Friday price and withdraw after Monday's move.

  The researcher's advice: take the price from the actual trade (what the router
  really paid), not from a feed. That's exactly the buy-on-deposit option,
  which gives you instant shares:

  1. Carol deposits 100 USDT.
  2. In the same transaction, her USDT buys the vault's current mix. If the
     vault is 40% cash, 40 USDT stays as USDT and 60 buys stocks.
  3. The vault measures how much it grew and mints her shares right away.
  4. After that the manager rebalances freely, and Carol can withdraw any time.

  The catch: deposits only work when the stocks can be traded (mostly US hours).
  But a price feed has that same limit, so this option loses nothing and can't
  be gamed.

  The one difference from your original idea: money doesn't sit fully idle
  waiting for the manager. It joins the existing mix straight away.

  Go with buy-on-deposit? If yes, I'll update the spec (§1, §5 and §7 change),
  and then we build withdrawals (SC-05) and this deposit flow next.

❯ can the api work able to display the price of the stock?

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● Yes, for displaying prices on the website. The Binance API returns live
  stock-token prices, and the repo already has saved responses showing it.

  What the API gives you

  From the saved response for one stock token on BSC (rwa.price.json
  (api/responses/rwa.price.json)):

  ┌─────────────────────┬───────────┬─────────────────────────────────────┐
  │        Field        │  Example  │               Meaning               │
  ├─────────────────────┼───────────┼─────────────────────────────────────┤
  │ tokenPrice          │ 335.13    │ Price of the token on-chain, in USD │
  ├─────────────────────┼───────────┼─────────────────────────────────────┤
  │ referencePrice      │ 334.005   │ Price of the real stock it tracks   │
  ├─────────────────────┼───────────┼─────────────────────────────────────┤
  │ tokenPriceUpdatedAt │ timestamp │ When that price was last updated    │
  └─────────────────────┴───────────┴─────────────────────────────────────┘

  Two other useful endpoints:
  - /rwa/underlying-market (saved response
    (api/responses/rwa.underlyingMarket.json)) tells you whether the market is
    open (marketStatus: "offhours", next open and close times), plus the 52-week
    high/low and dividends.
  - /market/price returns prices for up to 100 tokens in one call, so it can
    price the whole basket at once.

  So the website can show "this vault is worth $X, one share is worth $Y" by
  multiplying the vault's balances (read from the contract) by these prices.
  That's Vincent's backend job (BE-06).

  Why the contract can't use it for minting shares

  The API is off-chain: a smart contract can't call a website. The only way to
  get that price into the contract is for the backend to sign it and send it in.
  That's the "backend-signed price" option from earlier, with the same weak
  spot: a leaked key or a wrong price lets someone steal from holders.

  So:
  - For showing prices to users: ✅ the API is the right tool.
  - For deciding how many shares to mint: ❌ not safely. That's why I'm
    recommending buy-on-deposit, where the price comes from the actual trade
    instead.

  Go with buy-on-deposit for the contract, and use the API for display?

❯ so now what can the contract do?
  ⎿  4 skills available

● Right now the contracts can only set up a vault and take its first deposit. No
  later deposits, no trading and no withdrawals yet.

  What works today ✅

  ┌────────────────┬────────────────────────────────────────────────────────┐
  │      Who       │                         Can do                         │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │ Governance     │ Approve or remove stock tokens and trading routers.    │
  │ (slow admin)   │ Change the guardian. Hand governance to a new address  │
  │                │ in two steps.                                          │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │ Guardian (fast │ Activate a seeded vault so it's open for business.     │
  │  admin)        │                                                        │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │                │ Create a vault and name its manager. Be the first to   │
  │ Anyone         │ deposit into a new vault (the seed, at least 10 USDT), │
  │                │  getting 1 share per USDT.                             │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │ Everyone       │ See a vault's state, what it holds, and who owns how   │
  │                │ many shares.                                           │
  └────────────────┴────────────────────────────────────────────────────────┘

  Built-in protections:
  - Shares can't be transferred or traded.
  - A vault can only be seeded once.
  - Only the guardian can activate a vault. The manager can't open their own.
  - A token that takes a fee on transfer can't mint free shares.
  - USDT can never be removed from the approved list.
  - Governance can't accidentally give up ownership.

  What doesn't work yet ❌

  ┌────────────────────────────┬───────┬────────────────────────────────────┐
  │          Missing           │ Task  │             Blocked by             │
  ├────────────────────────────┼───────┼────────────────────────────────────┤
  │ Later investors depositing │ SC-03 │ Your OK on buy-on-deposit          │
  ├────────────────────────────┼───────┼────────────────────────────────────┤
  │ Manager trading            │ SC-04 │ Max assets per vault, and the      │
  │                            │       │ stock allowlist                    │
  ├────────────────────────────┼───────┼────────────────────────────────────┤
  │ Withdrawing                │ SC-05 │ Nothing, ready to build            │
  ├────────────────────────────┼───────┼────────────────────────────────────┤
  │ Pause, replace manager     │ SC-06 │ Nothing, but after SC-05           │
  ├────────────────────────────┼───────┼────────────────────────────────────┤
  │ Deploy scripts, handoff to │ SC-07 │ Everything above                   │
  │  Vincent                   │       │                                    │
  └────────────────────────────┴───────┴────────────────────────────────────┘

  Money can go into a vault, but can't come out. That's why SC-05 is the most
  important next step.

  To see all of this happening step by step, run:

  cd contracts && forge test --match-contract SimulationTest -vv

  Two answers I need from you

  1. Buy-on-deposit for later deposits: yes or no?
  2. Shall I start building withdrawals (SC-05) now?

❯ what does it mean by buy on deposit?

● "Buy-on-deposit" means your deposit gets invested in the same transaction, so
  you get your shares instantly and the contract never needs to look up a price.

  Example

  The vault holds a mix:

  ┌──────────────────┬────────────────┐
  │     Holding      │ Share of vault │
  ├──────────────────┼────────────────┤
  │ USDT (idle cash) │ 40%            │
  ├──────────────────┼────────────────┤
  │ AAPL token       │ 30%            │
  ├──────────────────┼────────────────┤
  │ NVDA token       │ 30%            │
  └──────────────────┴────────────────┘

  Bob owns all 1,000 shares.

  Carol deposits 100 USDT. In one transaction:

  1. 40 USDT stays as cash, because the vault is 40% cash.
  2. 30 USDT buys AAPL and 30 USDT buys NVDA, through the approved Binance
     router.
  3. The vault checks how much each holding grew. Say each grew by exactly 10%.
  4. Carol gets 10% more shares: 1,000 × 10% = 100 shares, instantly.

  After this, Bob and Carol each own the same mix per share as Bob did before.
  Nobody gained and nobody lost.

  Why the contract doesn't need a price

  It never asks "what is AAPL worth?" It only asks "did every holding grow by
  the same %?" It can measure that itself by checking its own balances before
  and after.

  That's why it can't be gamed with a wrong price: no price is ever used.

  If a trade fills badly

  Say AAPL only grew 9.5% instead of 10%. The vault uses the smallest growth, so
  Carol gets 95 shares instead of 100. Carol absorbs the bad fill and Bob is
  never hurt.

  Carol also sets a minimum ("I want at least 98 shares"). If the trade comes in
  worse than that, the whole deposit reverts and she keeps her USDT.

  The downsides

  - It only works when the stocks can be traded, mostly during US market hours.
    On weekends, deposits into vaults holding stocks may fail. A price feed has
    the same problem, because it freezes then too.
  - Gas cost grows with the number of stocks, because every deposit buys every
    holding. That's another reason to cap assets per vault.
  - The manager doesn't decide where your money goes at deposit time. It joins
    the current mix. The manager can rebalance freely afterwards.

  Compared with what you first wanted

  ┌────────────────────────┬──────────────────────┬─────────────────────────┐
  │                        │  Your original idea  │     Buy-on-deposit      │
  ├────────────────────────┼──────────────────────┼─────────────────────────┤
  │ Shares at deposit      │ ✅ instant           │ ✅ instant              │
  ├────────────────────────┼──────────────────────┼─────────────────────────┤
  │ Money idles until the  │ ✅                   │ ❌ joins the mix        │
  │ manager acts           │                      │ straight away           │
  ├────────────────────────┼──────────────────────┼─────────────────────────┤
  │ Needs a price          │ ❌ yes, and none is  │ ✅ no                   │
  │                        │ reliable             │                         │
  ├────────────────────────┼──────────────────────┼─────────────────────────┤
  │ Can be gamed           │ ⚠️ yes, if the price │ ✅ no                   │
  │                        │  is wrong            │                         │
  └────────────────────────┴──────────────────────┴─────────────────────────┘

  Go with buy-on-deposit? And shall I start on withdrawals (SC-05)?

❯ ok so basically, my idea for it to work is when user deposit, their funds
  enter into the vault and sit there idle until the curator actually starts
  taking action and actually investing into the stock. the investor can invest
  to any stock so long as it is within the allowed stock list. however i have
  no clue how the price mechanism will work for the users assuming we are
  simulating hundreds or if not thousands of users actually using it. how are
  we going to keep track whether the idle funds belong to which users or which
  funds that is invested belongs to which user. so one way to make it work is
  to actually issue shares in the form of a token that can be traded. however
  what if the pool of deposits for the curator to spend the USDT to invest more
  increases? how will it affect the share token and maybe its price.

● You don't need to track whose dollars are idle and whose are invested. Shares
  already solve that, for thousands of users, without making them tradeable.

  1. Who owns which money?

  Nobody owns specific dollars. Everything in the vault is one shared pot, and
  each person owns a % of the whole pot.

  The contract stores only one number per user, their share count:

  ┌───────┬────────┬────────────┐
  │ User  │ Shares │ % of vault │
  ├───────┼────────┼────────────┤
  │ Bob   │ 600    │ 60%        │
  ├───────┼────────┼────────────┤
  │ Carol │ 300    │ 30%        │
  ├───────┼────────┼────────────┤
  │ Dave  │ 100    │ 10%        │
  └───────┴────────┴────────────┘

  If the vault holds 500 idle USDT and 10 AAPL, Carol owns 30% of both: 150 USDT
  and 3 AAPL. It doesn't matter whose deposit bought the AAPL. With 5,000 users
  it's still just 5,000 share counts.

  2. How do new deposits affect the share price?

  They don't, as long as the newcomer pays the fair price per share:

  ▎ share price = total vault value ÷ total shares

  1. The vault is worth $1,000 with 1,000 shares, so 1 share = $1.00.
  2. The stocks rise 20%. The vault is worth $1,200, so 1 share = $1.20.
  3. Eve deposits $120 and gets 120 ÷ 1.20 = 100 shares.
  4. Now the vault is worth $1,320 with 1,100 shares: still $1.20 per share.

  More deposits make the pot bigger, not each share more or less valuable. Only
  the stocks going up or down moves the share price.

  3. Would a tradeable share token help?

  No, it solves a different problem. Trading lets users swap shares with each
  other. But when Eve deposits, the vault still has to decide how many new
  shares to create, and that still needs step 3's maths. A market price for the
  token is also easy to push around, so it's worse than nothing for minting.

  The one hard part

  Everything above works, except step 3 needs "what is the vault worth right
  now?" in the contract. That's the price problem from the research: no reliable
  on-chain price exists for these stocks.

  So your idea (idle USDT, shares instantly, curator invests later) needs
  exactly one number the contract can't safely get. There are three ways out:

  ┌─────────────────┬─────────────────────────────────┬────────────────────┐
  │     Option      │      How shares are priced      │       Safe?        │
  ├─────────────────┼─────────────────────────────────┼────────────────────┤
  │ Backend-signed  │ Vincent's server sends the      │ ⚠️ A wrong or      │
  │ price           │ vault value; the contract       │ hacked price lets  │
  │                 │ trusts it, with limits          │ someone steal      │
  ├─────────────────┼─────────────────────────────────┼────────────────────┤
  │                 │ The deposit buys the current    │                    │
  │ Buy-on-deposit  │ mix right away; the contract    │ ✅ No price needed │
  │                 │ measures the growth             │                    │
  ├─────────────────┼─────────────────────────────────┼────────────────────┤
  │ Wait for the    │ The deposit waits (cancel any   │ ✅ No price        │
  │ curator         │ time); shares are minted when   │ needed, but shares │
  │                 │ the curator invests it          │  aren't instant    │
  └─────────────────┴─────────────────────────────────┴────────────────────┘

  Your flow is closest to backend-signed price. It's the only one where money
  truly idles and shares arrive instantly. For a hackathon demo that's workable
  if we add guardrails: reject old prices, cap how far a price can jump, and
  only accept deposits during US market hours. But it's the riskiest option, and
  the PRD warns against it.

  Which one do you want? If you're unsure, I'd pick buy-on-deposit: it's the
  only option that's both instant and impossible to cheat.

❯ so with the current contract design, are we going with just deposits and
  issue out shares? will the current design be tradeable? and also will it be
  like this by design?:
  2. How do new deposits affect the share price?
  They don't, as long as the newcomer pays the fair price per share:

  share price = total vault value ÷ total shares

  The vault is worth $1,000 with 1,000 shares, so 1 share = $1.00.
  The stocks rise 20%. The vault is worth $1,200, so 1 share = $1.20.
  Eve deposits $120 and gets 120 ÷ 1.20 = 100 shares.
  Now the vault is worth $1,320 with 1,100 shares: still $1.20 per share.
  More deposits make the pot bigger, not each share more or less valuable. Only
  the stocks going up or down moves the share price.

● Short answers:

  1. Deposits and shares: yes, but only the first deposit (the seed) works
     today. Deposits after that aren't built yet. They're waiting on your choice
     of method.
  2. Tradeable: no, and that's on purpose. Shares can only be created by
     depositing and destroyed by withdrawing. Any transfer between users
     reverts. That's already in the code.
  3. The fair-price behaviour: yes, by design, whichever option you pick. It's
     the most important rule of the whole system, and SC-07's invariant #1
     ("share price never falls on a deposit") will test it.

  How each option gets the same result

  The options differ only in how the vault's value is measured, not in the
  outcome.

  Backend-signed price. The backend says "the vault is worth $1,200", and the
  contract does the maths from the example:

  ▎ 120 ÷ 1.20 = 100 shares

  Buy-on-deposit. No dollar price at all. Eve's $120 joins a $1,200 vault, so
  every holding grows 10%:

  ▎ 1,000 shares × 10% = 100 shares

  Same 100 shares, and the price per share stays $1.20 either way.
  Buy-on-deposit just gets there by measuring growth instead of trusting a
  price.

  Today versus later

  ┌────────────────────────────┬───────────────────┬────────────────────────┐
  │                            │       Today       │      After SC-03       │
  ├────────────────────────────┼───────────────────┼────────────────────────┤
  │ First deposit (seed)       │ ✅ 1 USDT = 1     │ same                   │
  │                            │ share             │                        │
  ├────────────────────────────┼───────────────────┼────────────────────────┤
  │ Later deposits             │ ❌ not built      │ ✅ shares at the fair  │
  │                            │                   │ price                  │
  ├────────────────────────────┼───────────────────┼────────────────────────┤
  │ Shares tradeable           │ ❌ never          │ ❌ never               │
  ├────────────────────────────┼───────────────────┼────────────────────────┤
  │ Deposits don't change      │ n/a (only one     │ ✅ guaranteed and      │
  │ share price                │ deposit)          │ tested                 │
  └────────────────────────────┴───────────────────┴────────────────────────┘

  The remaining decision is how SC-03 measures the vault's value: backend-signed
  price or buy-on-deposit. That doesn't block withdrawals (SC-05). Shall I
  build SC-05 now while you decide?

❯ whats the other option aside of buy on deposit?

● There are two other options besides buy-on-deposit. Each solves the "what is
  the vault worth?" problem differently.

  Option A: Backend-signed price

  - Your money sits idle until the curator invests it.
  - You get shares instantly.

  How it works:
  1. Eve clicks deposit. The website asks Vincent's backend for the vault's
     value.
  2. The backend adds it up from Binance API prices (idle USDT + AAPL × price +
     …), signs "vault = $1,200 at 14:05", and sends it with Eve's transaction.
  3. The contract checks the signature and mints 120 ÷ 1.20 = 100 shares.

  Guardrails we'd add:
  - Reject a price older than a few minutes.
  - Reject a price that jumps too far from the last one.
  - Only accept deposits during US market hours.

  Risk: the contract trusts the backend. If the signing key leaks, or the API
  returns a bad price, someone can deposit at a fake low price, withdraw, and
  walk off with other people's money. The PRD specifically warns against this.

  Option B: Wait for the curator

  - Your money sits idle until the curator invests it.
  - You get shares only when the curator invests it, not at deposit.

  How it works:
  1. Eve deposits 100 USDT. It goes into a waiting area. She has no shares yet,
     and she can take it back any time.
  2. Later, the curator invests the waiting money into the vault's current mix.
  3. The contract measures how much the vault grew and mints Eve's shares then.

  Risk: none from prices. The downside is that shares aren't instant, and the
  curator has to act.

  All three side by side

  ┌───────────────────┬────────────────┬──────────────┬────────────────────┐
  │                   │ Buy-on-deposit │ A: Backend   │    B: Wait for     │
  │                   │                │    price     │      curator       │
  ├───────────────────┼────────────────┼──────────────┼────────────────────┤
  │ Shares at deposit │ ✅ instant     │ ✅ instant   │ ❌ when invested   │
  ├───────────────────┼────────────────┼──────────────┼────────────────────┤
  │ Money idles until │ ❌             │ ✅           │ ✅                 │
  │  the curator acts │                │              │                    │
  ├───────────────────┼────────────────┼──────────────┼────────────────────┤
  │                   │                │ ⚠️ yes,      │                    │
  │ Needs a price     │ ❌ no          │ trusted      │ ❌ no              │
  │                   │                │ backend      │                    │
  ├───────────────────┼────────────────┼──────────────┼────────────────────┤
  │ Can be cheated    │ ✅ no          │ ⚠️ yes       │ ✅ no              │
  │ with a bad price  │                │              │                    │
  ├───────────────────┼────────────────┼──────────────┼────────────────────┤
  │ Works on weekends │ ⚠️ mostly no   │ ⚠️ we'd      │ ✅ depositing yes, │
  │                   │                │ block it     │  investing waits   │
  └───────────────────┴────────────────┴──────────────┴────────────────────┘

  Option A is the only one that matches your original idea exactly (idle money
  and instant shares), but it's also the only one that can be cheated.

  My recommendation stays buy-on-deposit, or B if you're fine with shares
  arriving later. Which one?

❯ ok let us proceed with idea A then

● Going with Option A: backend-signed price. Deposited USDT sits idle in the
  vault, you get shares instantly at the fair price, and the curator invests
  whenever they choose.

  Since this option can be cheated if a price is wrong, the guardrails matter.
  Three decisions first:

● User answered Claude's questions:
  ⎿  · What should the backend sign? → Price per stock (Recommended)
     · How old can a signed price be before the contract rejects it? → 1 minute
     · Should there be a short wait before a new depositor can withdraw? → No
     delay (Recommended)

● Decisions: price per stock, max age 1 minute, no exit delay. Here's the SC-03
  design in short.

  How a deposit works

  deposit(amount, signedPrices, signature, minShares)    anyone, vault must be
  ACTIVE
    1. check the signature is from the registry's priceSigner
    2. check the prices are at most 60 seconds old
    3. vault value = USDT balance + Σ (stock balance × signed price)
    4. pull the USDT in and measure what actually arrived
    5. shares = received × totalSupply ÷ vault value      (rounded DOWN)
    6. require shares ≥ minShares                          (the user's own
  safety limit)

  - USDT is always $1. Only the stocks need a signed price.
  - Missing a price for any stock the vault holds → revert. It must never value
    a stock at $0.
  - Deposited USDT just sits in the vault as idle cash. The curator invests it
    later via rebalance (SC-04).

  Changes to existing pieces

  ┌────────────────┬────────────────────────────────────────────────────────┐
  │     Piece      │                         Change                         │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │ AssetRegistry  │ adds priceSigner, set by governance                    │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │ FolioVault     │ adds deposit() (above)                                 │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │                │ requestSubscription, executeSubscription and           │
  │ Spec §7        │ cancelSubscription are replaced by deposit(). No more  │
  │                │ escrow or waiting area.                                │
  ├────────────────┼────────────────────────────────────────────────────────┤
  │ Withdraw       │ unchanged: any time, no price, you get your % of every │
  │ (SC-05)        │  holding                                               │
  └────────────────┴────────────────────────────────────────────────────────┘

  Safety

  ┌───────────────────┬─────────────────────────────────────────────────────┐
  │      Threat       │                      Guardrail                      │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Stale price       │ 60-second max age. The backend also refuses to sign │
  │                   │  when US markets are closed.                        │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Bad price or      │ The guardian can pause deposits instantly.          │
  │ leaked key        │ Withdrawals keep working.                           │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Rounding tricks   │ Shares always round down, in favour of existing     │
  │                   │ holders                                             │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ Fake balances     │ The contract reads its own balances, never the      │
  │                   │ backend's                                           │
  └───────────────────┴─────────────────────────────────────────────────────┘

  The risk we're accepting: a wrong or leaked signed price lets someone mint
  cheap shares and withdraw real assets. The guardrails shrink that window but
  can't remove it. I'll write this into the spec so it's a recorded decision,
  since the PRD warns against it.

  The backend signs a message in the standard EIP-712 format, so Vincent will
  need the exact message layout from us.

  Does this design look right? If yes:
  1. I update the spec.
  2. I write the plan for SC-03 (deposit) and SC-05 (withdraw) together, since
     they're best tested as a pair.
  3. Same build process as last time (subagents with reviews).

❯ yes it looks right

● I'll update the spec first, then write the plan. Let me check the current
  code.

  Ran 4 shell commands (ctrl+o to expand)

● The spec now reflects signed-price deposits across §1, §2, §4, §5, §7, §8, §10
  and §11. Before drafting the plan, I'll generate a signature using cast to
  confirm our signing format matches wallet libraries.

  Ran 1 shell command (ctrl+o to expand)

● Let me check that my registry code and the reference signature work together
  before they go into the plan.

  Ran 1 shell command (ctrl+o to expand)

● The signature from cast matches the contract's encoding, confirming the
  backend can sign with standard tooling. Now I'll prototype the vault code in
  the scratch copy to ensure the plan includes code that's verified to compile
  and pass.

  Ran 1 shell command (ctrl+o to expand)

● The vault compiles. Now the test harness and the tests:

  Ran 2 shell commands (ctrl+o to expand)

● Registry tests pass (29). Now the deposit and pause tests:

  Ran 1 shell command (ctrl+o to expand)
● Deposit and pause tests pass (23). Now the withdrawal tests:

  Ran 1 shell command (ctrl+o to expand)

● Two failures were my own arithmetic: dead shares are 0.0001% of supply, not
  0.1%. Fixing the expected values:

  Ran 1 shell command (ctrl+o to expand)

● The whole prototype passes: 105 tests, deep fuzzing and lint all clean. Let me
  check the simulation file, which changed on disk since I wrote it:

  Ran 1 shell command (ctrl+o to expand)

● I'll prototype the new simulation chapters too:

  Ran 2 shell commands (ctrl+o to expand)

● All 105 tests pass, including the new simulation chapters. Last bit of context
  before writing the plan: the README and checklist sections it has to update.

  Ran 1 shell command (ctrl+o to expand)

● Writing the plan now. It embeds the verified prototype files exactly.

● Bash(SP=/tmp/claude-1000/-home-eggwae-personal-projects-bnb-hack-bnb-hack/dab2
      0c5a-d5e9-4fa1-8b56-815b48700c13/scratchpad/proto; cd
      /home/eggwae/personal-projects/bn…)
  ⎿  1 file changed (binary, mode only or too large to show)

● Plan written. One fix-up: three error names in the code aren't in the spec's
  error list yet.

● Bash(sed -i 's/`InvalidPriceSignature`, `StalePrices`, `MissingPrice`,
      `ZeroPrice`, `ZeroShares`./`InvalidPriceSignature`, `StalePrices`,
      `LengthMismatch`, `MissingP…)
  ⎿  Updated docs/folio-lab-contract-architecture.md (+2 -1)
      284  `TransfersDisabled`,
      285  `AssetNotAllowed`, `RouterNotAllowed`, `SellExceeded`, `BuyToo
           Low`,
      286  `CollateralDecreased`, `SlippageTooHigh`, `BelowMinimumSeed`, 
           `NothingToRedeem`,
      287 -`InvalidPriceSignature`, `StalePrices`, `MissingPrice`, `ZeroP
          -rice`, `ZeroShares`.                                          
      287 +`InvalidPriceSignature`, `StalePrices`, `LengthMismatch`, `Mis
          +singPrice`, `ZeroPrice`,                                      
      288 +`ZeroShares`, `EmptyVault`, `DeadSharesLocked`.               
      289  
      290  ---
      291  

● The spec is updated and the plan for deposits (SC-03), withdrawals (SC-05) and
  pause is written: 2026-10-07-sc-03-05-deposit-redeem.md
  (docs/superpowers/plans/2026-10-07-sc-03-05-deposit-redeem.md).

  I built a working prototype in a scratch copy, outside the repo. All 105 tests
  pass there and lint is clean, so the plan's code is known to work.

  What gets built (3 tasks)

  ┌─────┬─────────────────────────────────────────────────────────┬─────────┐
  │  #  │                         Builds                          │  New    │
  │     │                                                         │  tests  │
  ├─────┼─────────────────────────────────────────────────────────┼─────────┤
  │ 1   │ Registry: the price signer, and checking that signed    │ 13      │
  │     │ prices are from the backend and at most 60 seconds old  │         │
  ├─────┼─────────────────────────────────────────────────────────┼─────────┤
  │     │ Vault: deposit() (instant shares at the fair price),    │         │
  │ 2   │ redeem() (your % of everything, any time),              │ 37      │
  │     │ pause()/unpause()                                       │         │
  ├─────┼─────────────────────────────────────────────────────────┼─────────┤
  │     │ Simulation chapters 8–10: Carol deposits, Mallory's     │         │
  │ 3   │ fake prices fail, a pause blocks deposits but Bob still │ (story) │
  │     │  withdraws. Plus README and checklist updates.          │         │
  └─────┴─────────────────────────────────────────────────────────┴─────────┘

  Things worth knowing

  - One price list works for every vault. The backend signs "AAPL = $335" once,
    and any vault can use it.
  - The contract counts its own balances. The backend only supplies prices, so
    it can't lie about how much a vault holds.
  - The signing format is checked against standard tooling. I signed a price
    list with cast, a standard wallet tool, and a test proves the contract
    accepts it. So Vincent's backend can sign with normal libraries.
  - I moved pause() from SC-06 into this task. The backend-price design needs an
    emergency brake from day one.
  - Until manager trading exists (SC-04), tests fake the trades with a test-only
    vault (the "harness"). It's never deployed.

  Spec changes

  §1 is rewritten for priced deposits, and the waiting area is gone everywhere.
  There's a new risk section (§8.0) recording that we deliberately trust the
  backend's signed prices, plus decisions #9–#11 in §10.

  Say "go" and I'll build it the same way as last time: subagents per task, with
  reviews. Nothing gets committed.

❯ proceed with building

● Building now.

  Ran 1 shell command (ctrl+o to expand)

● Agent(Implement Task 1: registry signed prices) Haiku 4.5
  ⎿  Done (13 tool uses · 52.0k tokens · 2m 3s)
  (ctrl+o to expand)

› Message from general-purpose
  DONE

  ## Summary
  Task 1 complete: Added EIP-712 signed-price verification to AssetRegistry. All
  29 tests pass (16 existing + 13 new); full suite 68/68 pass.

  ## Test Results
  - RED: Compilation failed (PriceUpdate not found) ✓
  - GREEN: All 29 AssetRegistry tests pass ✓
  - Full suite: 68 tests passed, 0 failed ✓

  ## Changes
  - contracts/src/AssetRegistry.sol: Added PriceUpdate struct, EIP712
  inheritance, price signer mechanism, checkPrices validation
  - contracts/test/AssetRegistry.t.sol: Added 13 new signed-price tests
  including off-chain signature interop

  ## Quality Checks
  - forge build: ✓ No warnings
  - forge fmt: ✓ Complete
  - forge lint: ✓ No issues

  ## Concerns
  None. Code follows brief exactly, all tests pass, no warnings.

  Report: /home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpowers/sdd/2026
  -10-07-sc-03-05-deposit-redeem/task-1-report.md

  Ran 1 shell command (ctrl+o to expand)

● Agent(Review Task 1 (spec + quality)) Sonnet 5.5
  ⎿  Done (3 tool uses · 54.6k tokens · 28s)
  (ctrl+o to expand)

› Message from general-purpose
  ### Spec Compliance
  Matches the brief; I found no missing or extra items.
  - **Pragma and errors:** `pragma solidity 0.8.30;` is exact and only custom
  errors are used (`AssetRegistry.sol` diff lines 7, 29-31).
  - **Domain and typehash:** the domain is `EIP712("Folio Lab", "1")` (line 55),
  and OZ's `EIP712` sets the verifying contract to `address(this)`. The
  typehash string (line 27) is exactly `PriceUpdate(address[] assets,uint256[]
  prices,uint64 timestamp)`.
  - **Interfaces:** the file-level struct, `MAX_PRICE_AGE = 60`,
  `PRICE_UPDATE_TYPEHASH`, `priceSigner`, `setPriceSigner` (owner-only, zero
  rejected), `PriceSignerSet`, `hashPriceUpdate` and `checkPrices` all match the
  brief. The constructor signature is unchanged.
  - **Tests:** the test file matches the brief's code (13 new tests).
  - ⚠️ Not verifiable from the diff: `forge fmt` and the pass count. The
  controller already confirmed both.

  ### Strengths
  - **Array hashing:** `keccak256(abi.encodePacked(address[]))` and
  `keccak256(abi.encodePacked(uint256[]))` (lines 90-93) are the correct EIP-712
  array encoding. `encodePacked` pads array elements to 32 bytes, so each
  address is left-padded as EIP-712 requires. `timestamp` goes through
  `abi.encode` and is padded to 32 bytes. The off-chain `cast wallet sign
  --data` vector (test lines 272-292) uses two assets, so it confirms this
  against independent tooling.
  - **Signature validation:** OZ `ECDSA.tryRecover` rejects high-s signatures
  (malleability), bad lengths and `ecrecover` returning zero. `priceSigner`
  starts as zero, so an unset signer cannot match a successfully recovered
  address. The `rejectsWhenNoSignerSet` test covers this.
  - **Replay across chains and registries:** the domain separator includes
  `chainId` and the registry address. OZ rebuilds it if the chain ID changes.
  - **Freshness logic (line 102):** the future check and the age check are
  ordered so the subtraction cannot underflow. A timestamp equal to now, and one
  exactly 60 seconds old, pass. 61 seconds old and `now+1` are rejected, and
  tests cover both boundaries.
  - **Length check:** `LengthMismatch` runs before any hashing.

  ### Issues
  #### Critical
  None.

  #### Important
  None.

  #### Minor
  - **Replay across vaults and within the window:** `checkPrices`
  (`AssetRegistry.sol` diff lines 100-107) binds no vault, nonce or caller. A
  signed update is reusable by anyone, for any vault, for the full 60 seconds.
  That is probably intended, since prices are global and the window is short.
  The deposit task must therefore treat the 60-second window as the staleness
  bound.
  - **Consumer responsibility:** the function does not check that `assets` is
  duplicate-free, matches the vault's basket, or has every asset in `isAsset`.
  Empty arrays with a valid signature also pass. The caller must validate these,
  or share pricing could be skewed. Worth recording as a requirement for the
  vault tasks.
  - **Brittle test vector:**
  `test_checkPrices_acceptsSignatureFromStandardTooling` hardcodes the registry
  address (test line 273-277), which depends on the deployer nonce and `setUp`
  order. It is plan-mandated, and the assert gives a clear failure message, but
  any change to `setUp` will break it.
  - **Missing malleability test:** there is no test that a high-s malleated
  signature is rejected (test lines 225-258). OZ handles it, but a one-line test
  would pin the behaviour.
  - **Style:** the new constants, state and errors sit above the existing
  declarations, with no NatSpec on `setPriceSigner`, `hashPriceUpdate` or
  `checkPrices` (`AssetRegistry.sol` diff lines 25-32, 81-107). `priceSigner`
  can be rotated instantly by governance, which is acceptable given the timelock
  note in the contract header.

  ### Assessment
  **Task quality:** Approved
  **Reasoning:** The EIP-712 encoding (typehash, array hashing, domain),
  signature handling and freshness boundaries are correct and match the brief.
  An independent-tooling signature vector and the boundary tests back this up.
  The remaining items are minor coverage and documentation points, plus
  caller-side validation for the later vault tasks.

  Ran 1 shell command (ctrl+o to expand)

● Task 1 is done and its review is clean. Starting Task 2 (deposit, withdraw,
  pause).

● Agent(Implement Task 2: deposit, redeem, pause) Haiku 4.5
  ⎿  Done (18 tool uses · 67.1k tokens · 3m 12s)
  (ctrl+o to expand)

› Message from general-purpose
  DONE

  **Test Summary:** All 105 tests pass (37 new + 68 existing); 4 fuzz tests pass
  at 10,000 runs each.

  **Concerns:** None. Code transcribed exactly from brief, all custom errors,
  pragma 0.8.30, no warnings.

  **Report:** /home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpowers/sdd/
  2026-10-07-sc-03-05-deposit-redeem/task-2-report.md

  **Implementation:** FolioVault.sol now supports deposit() with fair pricing,
  redeem() with proportional payout, pause/unpause guardian control, and full
  error handling. Tests cover all paths including fee-on-transfer, multiple
  decimals, edge cases, and no-profit invariants. All existing tests continue to
  pass. No commits made per instructions.

  Ran 1 shell command (ctrl+o to expand)

● Task 2 output matches the verified prototype (105/105 passing). Since this is
  the money-handling code, its reviewer runs on the strongest model.

● Agent(Review Task 2 (spec + quality))
  ⎿  Done (10 tool uses · 72.6k tokens · 1m 54s)
  (ctrl+o to expand)

› Message from general-purpose
  ### Spec Compliance
  - All five files match the brief's code blocks exactly (I compared them with
  whitespace removed: `FolioVault.sol`, the harness, the fixture and both test
  files are identical). Nothing is missing or extra.
  - Deposit follows §5: `checkPrices` runs first, `valueBefore` is taken before
  the pull, `received` is measured from the balance change, shares round down,
  and it reverts on zero shares and below `minShares`
  (`contracts/src/FolioVault.sol:118-140`). Deposit is allowed only in `ACTIVE`
  (:123).
  - Valuation: USDT is at par and a signed USDT price is ignored (:179-180).
  Every held non-USDT asset needs a non-zero price, otherwise
  `MissingPrice`/`ZeroPrice` (:189-197). Decimals are read per asset and
  non-USDT value rounds up (:182-183).
  - Redeem: amounts are computed from the pre-burn supply and every leg rounds
  down. It burns before any transfer, has no price and no state gate, and
  rejects calls from `DEAD` (:146-169).
  - Pause/unpause: guardian only, ACTIVE↔PAUSED only (:98-108). `nonReentrant`
  is on both money paths. Pragma is 0.8.30 and only custom errors are used.
  - ⚠️ Small difference from the spec: §5 says redeem works "in any state except
  DRAFT"; the brief says "any state". In DRAFT, `totalSupply()==0`, so
  `Math.mulDiv(..., 0)` panics with 0x12 (:159). It still reverts, but with a
  panic instead of a named error. Harmless in effect.

  ### Strengths
  - The order is right. `valueBefore` comes before the transfer and the redeem
  amounts come from the pre-burn supply, so a depositor cannot value their own
  deposit and a redeemer cannot dilute others.
  - Rounding goes the right way in all three places: value up, shares down,
  every redeem leg down. Dust stays in the vault for the remaining holders.
  - Prices are matched against the vault's own `_held` list, so a short or
  partial signed list reverts. A missing price never counts as zero.
  - The `DEAD_SHARES` floor plus the `ZeroShares` and `minShares` checks make a
  donation/inflation attack unprofitable. Anything donated mostly goes to the
  dead shares, and a victim deposit that would round to zero reverts.
  - `EmptyVault` guard (:128). Assets with a zero redeem amount are skipped, so
  a zero-balance holding that cannot be transferred does not block exit (:165).
  - The test-only hooks (`addHeldAsset`, `sendOut`, which have no access
  control) are in `test/helpers/FolioVaultHarness.sol` only. Nothing in `src/`
  or `script/` refers to them. The only change to production code is `_held`
  going from `private` to `internal` (:47), which is harmless.
  - Mutation check: changing deposit shares to round up makes
  `testFuzz_deposit_neverLowersValuePerShare` fail. Removing the missing-price,
  zero-price, par, dead-share or state checks is each caught by a named test.

  ### Issues
  #### Critical
  None.

  #### Important
  1. **One held token can block every exit (plan-mandated).** At
  `contracts/src/FolioVault.sol:164-166`, redeem pays every held asset in one
  all-or-nothing loop. If any one transfer reverts, the whole redemption fails
  for everyone, and that includes the idle USDT. Causes:
     - the issuer pauses an Ondo stock token (they are pausable and screen
  sanctioned addresses);
     - the token blacklists the vault;
     - a transfer hook reverts.

     Changing `to` does not help when the token is paused for everyone. This
  breaks the spec's §2 promise that exit "cannot be blocked" and the §4 "never
  stops exit" line. A small fix: a `redeem` variant that takes a list of assets
  to skip, so the caller gives up those legs and they stay for the remaining
  holders. Alternatively, a later task can own this, but it needs to be on
  record now.

  #### Minor
  1. **The test for value rounding up is missing.** I changed `_vaultValue`'s
  `Math.Rounding.Ceil` to `Floor` (`FolioVault.sol:183`) in a scratch copy
  (`/tmp/claude-1000/-home-eggwae-personal-projects-bnb-hack-bnb-hack/dab20c5a-d
  5e9-4fa1-8b56-815b48700c13/scratchpad/review2/`). All 37 tests still pass.
  Every valuation in the tests divides evenly, such as `2e18*price/1e18` and
  `2e6*300e18/1e6`, and the fuzz test computes `valueBefore = 600e18 + 2*price`
  exactly (`test/FolioVaultDeposit.t.sol:355`). Fix: add a test where the value
  does not divide evenly, for example a 6-decimal stock at an odd price or a
  balance like `1e18+1`, and assert the exact rounded-up `vaultValue` from the
  event.
  2. **Signed prices can be replayed (deferred from Task 1, still open).**
  `checkPrices` ties a signed list to no vault, caller or nonce. For 60 s anyone
  can reuse any list that was posted on-chain, including the most favourable
  recent low price, then redeem in kind at once (`FolioVault.sol:124`). This is
  the §8.0 trust assumption, so record it rather than fix it here.
  3. **Duplicate assets in the price list are not rejected.** `_priceOf` takes
  the first match (`FolioVault.sol:190-194`), and `checkPrices`
  (`src/AssetRegistry.sol:98-105`) does not reject duplicates. Only the signer
  can cause this, so it is not something a user can exploit. Deferred.
  4. **A zero-balance held asset still needs a price**
  (`FolioVault.sol:176-184`). If an asset stays in `_held` after it is sold out
  and the backend stops signing it (for example after delisting), every deposit
  reverts with `MissingPrice` until it leaves `_held`. Exit is not affected.
  SC-04 should drop zero-balance assets from `_held`, or `_vaultValue` should
  skip `balance == 0` before calling `_priceOf`.
  5. **Unbounded loops and read-only reentrancy.** `_held.values()` is looped
  over without a limit in both `deposit` and `redeem` (:156, :176). The gas cost
  depends on how many assets SC-04 allows. Separately, while redeem's transfers
  run, `totalSupply()` and `holdings()` can be read in a half-updated state
  (shares burned, tokens partly sent). Within the vault, `nonReentrant` blocks
  any exploit. Outside readers should be warned in the NatSpec.
  6. **Redeem in DRAFT panics** instead of reverting with a named error (:159;
  see the ⚠️ above). Cosmetic.
  7. **Weak profit check in a fuzz test.**
  `testFuzz_depositThenRedeem_neverProfits` (`test/FolioVaultDeposit.t.sol:375`)
  values the AAPL leg with rounding down, which makes it easier for the "never
  profits" assertion to pass. It also never tests deposits with a 6-decimal
  settlement token.

  ### Assessment
  **Task quality:** Needs fixes
  **Reasoning:** The money maths is correct and the implementation matches the
  brief exactly: no unbacked minting, no over-redemption, correct rounding
  directions, and state gating as specified. The one blocking item is that the
  all-or-nothing redeem loop lets a single paused or blacklisting held token
  stop every exit. That contradicts the spec's core promise, so it needs a fix
  or an explicit owner before this is trusted. The untested value-rounding
  direction is a cheap test to add.

● Found a real issue: if the vault's stock tokens get paused by an issuer, all
  withdrawals fail—even idle USDT—breaking the guaranteed-exit promise. I'll fix
  this along with three minor findings.

  Ran 2 shell commands (ctrl+o to expand)

● Agent(Fix round 1 for Task 2) Sonnet 5.5  ⎿  Done (8 tool uses · 51.2k tokens · 52s)
  (ctrl+o to expand)

› Message from general-purpose
  Status: DONE
  Tests: 111/111 pass (forge test); deep fuzz 4/4 pass at 10000 runs. fmt, build
  and lint are clean, no warnings.
  Proofs: Fix A RED was a compile error (redeemExcept missing). Fix B failed
  with Floor (expected ...667, got ...666) and passes with Ceil, which is
  restored. Fix C RED was MissingPrice, now green.
  Concerns: none. Nothing committed.
  Report: /home/eggwae/personal-projects/bnb-hack/bnb-hack/.superpowers/sdd/2026
  -10-07-sc-03-05-deposit-redeem/task-2-report.md ("## Fix round 1")

  Ran 1 shell command (ctrl+o to expand)

● Agent(Re-review Task 2 fix round 1) Sonnet 5.5
  ⎿  Done (2 tool uses · 44.2k tokens · 21s)
  (ctrl+o to expand)

› Message from general-purpose
  ### Findings
  - A: ADDRESSED. contracts/src/FolioVault.sol:22-28 adds `redeemExcept`;
  `_redeem` (l.30-54) skips forfeited legs (amount stays 0, no transfer, tokens
  stay in vault). `redeem` (l.11-17) delegates with an empty list, otherwise
  unchanged. Tests in contracts/test/FolioVaultRedeem.t.sol use
  `MockPausableERC20`: `redeem` reverts on a paused token; `redeemExcept` pays
  10% of the other legs, 0 for the forfeited leg, leaves 5e18 in the vault,
  burns shares in full; an empty forfeit list matches `redeem`.
  - B: ADDRESSED. `test_deposit_stockValueRoundsUp`
  (contracts/test/FolioVaultDeposit.t.sol) holds 1e18+1 AAPL at price
  333333333333333333333. Exact value is 333333333333333333333 plus a fractional
  333.33, so Ceil gives +334 and Floor gives +333. The expected `Deposited`
  event (value and shares) mismatches under Floor, so the test fails.
  - C: ADDRESSED. contracts/src/FolioVault.sol:64 `if (balance == 0) continue;`
  comes before the settlement-token branch and before `_priceOf`.
  `test_deposit_emptyHoldingNeedsNoPrice` holds a zero-balance asset with no
  signed price and the deposit succeeds at 100e18 shares.
  - D: ADDRESSED. contracts/src/FolioVault.sol:39 reverts `NothingToRedeem` when
  `supply == 0`. `test_redeem_inDraftRevertsWithNamedError` covers it.

  ### New breakage in the fix diff
  None found. I did not run any tests.
  - Forfeiting to extract more of other legs is not possible: amounts are
  computed from pre-burn balances and pre-burn supply, and a forfeited leg is
  just left in the vault, so other legs do not depend on it.
  - Forfeiting USDT or duplicate entries is harmless: forfeiting only reduces
  the caller's own payout, and duplicates only repeat a skip.
  - Burn ordering is intact: `supply` is read before `_burn`, and the burn
  happens before any `safeTransfer`. `nonReentrant` is on both external entry
  points.
  - Dead shares stay locked: the `msg.sender == DEAD` check still comes first.
  - The zero-balance skip opens no undervaluation hole: a zero balance
  contributes 0 to the value either way. A donated dust balance makes the price
  required again, which is existing behaviour and not new.

  ### Out of scope (for the ledger)
  - `redeemExcept` has no minimum-out check, so a caller who forfeits everything
  burns shares for nothing. That is the caller's own choice.
  - Griefing a deposit by donating 1 wei of an unpriced held asset is possible:
  the deposit then reverts with `MissingPrice` until the manager removes the
  asset or the backend signs a price. This was already the case before the fix.

  ### Verdict
  APPROVE. All four findings are fixed, and the diff introduces no new problems.

● Task 2 is done: the fix passed its re-review, with all 4 findings addressed.
  Moving to Task 3 (simulation chapters and docs).

  Ran 1 shell command (ctrl+o to expand)

● Agent(Implement Task 3: simulation + docs)
  ⎿  Initializing…
  ⎿  Interrupted · What should Claude do instead?

❯ can i make the push to the current change for now?

● Yes, but let me check the state first. The last task was interrupted mid-run.

  Ran 1 shell command (ctrl+o to expand)

● Yes, you can push now. The contracts are in a good state: all 111 tests pass
  and formatting is clean.

  What to know first

  - Nothing is committed yet. Everything is uncommitted on main.
  - The last task was cut off halfway. The simulation test got its new chapters,
    but the README, the checklist and the spec mention of redeemExcept weren't
    updated. The final whole-build review hasn't run either. That's fine for a
    work-in-progress push.
  - Your secrets are safe. api/.env and contracts/.env are both git-ignored.
  - Your tree also has work that isn't yours to push: app/, api/, lib/binance/,
    components/viz/, plus changes to eslint.config.mjs and tsconfig.json. I'd
    leave those out.

  What I'd include in the commit

  ┌──────────────────────────────────────────────────┬──────────────────────┐
  │                     Include                      │         Why          │
  ├──────────────────────────────────────────────────┼──────────────────────┤
  │ contracts/ (src, test, script, config, README)   │ the contracts        │
  ├──────────────────────────────────────────────────┼──────────────────────┤
  │                                                  │ forge-std and        │
  │ .gitmodules + contracts/lib/*                    │ OpenZeppelin, needed │
  │                                                  │  to build            │
  ├──────────────────────────────────────────────────┼──────────────────────┤
  │ docs/folio-lab-contract-architecture.md,         │ spec and tracker     │
  │ .excalidraw, docs/sc-checklist.md                │                      │
  ├──────────────────────────────────────────────────┼──────────────────────┤
  │ docs/superpowers/plans/                          │ the two build plans  │
  │                                                  │ (optional)           │
  └──────────────────────────────────────────────────┴──────────────────────┘

  How do you want to push?

  1. New branch + PR (my pick): for example sc-03-05-deposit-redeem. Vincent can
     review it before it hits main.
  2. Straight to main: faster, but it lands on the shared branch with no review.
  3. You do it yourself: I'll give you the exact git add / commit commands.

  Which one? If it's 1 or 2, I'll do the commit and push for you.

❯ alright cause i hv a few teammates onboarded into this project. so i will be
  pushing whatever i done and they will view from there

● Pushing for your teammates makes sense. Since they're only reading, the main
  thing is that the commit holds your contract work and nothing else.

  Run these from the repo root, bnb-hack/:

  # 1. Stage only your work
  git add .gitmodules contracts/ \
    docs/folio-lab-contract-architecture.md \
    docs/folio-lab-contract-architecture.excalidraw \
    docs/sc-checklist.md docs/superpowers/plans/

  # 2. Check what's staged before committing
  git status --short

  # 3. Commit
  git commit -m "Add Folio Lab contracts: registry, factory, vault with
  signed-price deposits and redeem"

  # 4. Push
  git push origin main

  To give teammates something to comment on before it lands, push to a branch
  instead of step 4:

  git switch -c sc-03-05-deposit-redeem
  git push -u origin sc-03-05-deposit-redeem

  What I left out, and why

  - app/, api/, lib/binance/, components/viz/, eslint.config.mjs, tsconfig.json:
    these aren't contract work, and api/ and lib/binance/ overlap with
    Vincent's backend task. Add them separately if they're yours to share.
  - api/.env and contracts/.env: these hold secrets. They're git-ignored, so git
    add won't pick them up even by accident.

  Tell your teammates

  The contracts use git submodules, so after pulling they need:

  git submodule update --init --recursive
  cd contracts && forge test

  They should see 111 tests pass. To see the whole flow as a story:

  forge test --match-contract SimulationTest -vv

  Unfinished bits

  - The README and checklist still describe SC-03 and SC-05 as not built.
  - The final whole-build review hasn't run yet.

  I can finish both after you push. Want me to?

❯ can you give me a project handoff so that i can send in to my team to
  understand about the project?

● User answered Claude's questions:
  ⎿  · Where should the handoff live? → Shareable Claude doc

● Skill(anthropic-skills:docs)
  ⎿  Successfully loaded skill

  Called Claude Docs (ctrl+o to expand)

● Outline is up. Now writing "What Folio Lab is".

● Artifact(open https://claude.ai/artifact/NQkgLkeKF3crseYdPhnrCH)
  ⎿  Opened ⧉ Folio Lab — Contracts Handoff
     (https://claude.ai/artifact/NQkgLkeKF3crseYdPhnrCH)

  Called Claude Docs 2 times (ctrl+o to expand)

● Writing "What Folio Lab is".

  Called Claude Docs (ctrl+o to expand)

● Now "Status at a glance".

  Called Claude Docs (ctrl+o to expand)

● Now "How it works". I'll add a diagram there once the prose sections are done.

  Called Claude Docs (ctrl+o to expand)

● Now "Key decisions and the trust trade-off".

  Called Claude Docs (ctrl+o to expand)

● Now "What the backend needs".

  Called Claude Docs (ctrl+o to expand)

● Now "Getting started".

  Called Claude Docs (ctrl+o to expand)

● Now "Open decisions and next steps".
  Called Claude Docs (ctrl+o to expand)

● The prose is in. Next, a diagram of how the parts connect, for the "How it
  works" section.

  Called Claude Docs 2 times (ctrl+o to expand)

● The diagram renders cleanly. One last step: a comment asking you to confirm
  something.

  Called Claude Docs (ctrl+o to expand)

● Written for: your teammates joining the project.

  ⧉ Folio Lab — Contracts Handoff
  (https://claude.ai/code/artifact/ad60efaf-5dac-4d00-aa5f-377e889d013a) is
  ready: edit it inline, comment on it, or share it with your team.

❯ i like the handoff now i want it to be in a readme. i understand that
  @README.md already have content, i just need you to fit into it to give
  people as much context as possible about the project
  ⎿  Read README.md (80 lines)

  Called Claude Docs (ctrl+o to expand)

● The doc hasn't changed beyond what I wrote. Merging the handoff into the
  README now:

● Write(contracts/README.md)
  ⎿  Added 219 lines, removed 16 lines
        1  # Folio Lab contracts
        2  
        3 -Foundry project for the seeded pooled portfolio vault. Owner: 
          -**Aik Wei** (PRD tasks SC-01 – SC-07).                        
        3 +Foundry project for the pooled portfolio vault. Owner: **Aik W
          +ei** (PRD tasks SC-01 – SC-07).                               
        4  
        5 -Scope and acceptance criteria: [`docs/folio-lab-pooled-fund-pr
          -d.md`](../docs/folio-lab-pooled-fund-prd.md).                 
        5 +- Scope and acceptance criteria: [`docs/folio-lab-pooled-fund-
          +prd.md`](../docs/folio-lab-pooled-fund-prd.md)                
        6 +- Full design spec (maths, interface, events, risks, decisions
          +): [`docs/folio-lab-contract-architecture.md`](../docs/folio-l
          +ab-contract-architecture.md)                                  
        7 +- Task tracker: [`docs/sc-checklist.md`](../docs/sc-checklist.
          +md)                                                           
        8  
        9 +## What Folio Lab is                                          
       10 +                                                              
       11 +Folio Lab lets anyone run a **pooled portfolio of tokenized US
          + stocks on BNB Chain**. A curator                             
       12 +creates a vault and manages it. Investors deposit USDT and rec
          +eive vault shares. The curator                                
       13 +invests the pooled USDT in approved stock tokens (Ondo's AAPLo
          +n, NVDAon and similar).                                       
       14 +                                                              
       15 +Shares work like ETF units: each holder owns a fixed percentag
          +e of everything in the vault.                                 
       16 +Shares cannot be transferred or traded. They are only minted o
          +n deposit and burned on withdrawal.                           
       17 +                                                              
       18 +What the contracts guarantee:                                 
       19 +                                                              
       20 +- **The manager can trade but never withdraw.** Trades are lim
          +ited to approved tokens on approved routers.                  
       21 +- **Exit is always open.** Any holder can withdraw their perce
          +ntage of every holding at any time, even while the vault is pa
          +used.                                                         
       22 +- **Deposits never dilute existing holders.** New shares are m
          +inted at the fair price, rounded in the existing holders' favo
          +ur.                                                           
       23 +                                                              
       24  ## Status
       25  
        9 -**SC-02 is built.** Design and decisions: [`docs/folio-lab-con
          -tract-architecture.md`](../docs/folio-lab-contract-architectur
          -e.md).                                                        
       26 +A vault can be created, seeded, deposited into, paused and wit
          +hdrawn from today. Manager                                    
       27 +trading is the next build. All 111 Foundry tests pass.        
       28  
       11 -| Contract | What works today |                               
       29 +**Not mainnet-ready.** Deposits trust backend-signed prices, a
          +nd the adversarial review (SC-07)                             
       30 +has not run.                                                  
       31 +                                                              
       32 +| Task | What it adds | Status |                              
       33 +|---|---|---|                                                 
       34 +| SC-02 | Registry, factory, vault, `seed`, `activate` | Built
          +, reviewed |                                                  
       35 +| SC-03 | Signed-price `deposit`, `pause` / `unpause` | Built,
          + reviewed |                                                   
       36 +| SC-05 | `redeem` and `redeemExcept` (withdraw in kind) | Bui
          +lt, reviewed |                                                
       37 +| SC-04 | Manager trading with balance checks (`rebalance`) | 
          +Not started |                                                 
       38 +| SC-06 | Replace manager, close a vault | Not started |      
       39 +| SC-07 | Invariant and adversarial tests, deploy scripts, ABI
          + handoff | Not started |                                      
       40 +                                                              
       41 +## How it works                                               
       42 +                                                              
       43 +There are three contracts: one shared `AssetRegistry`, one `Va
          +ultFactory`, and one `FolioVault`                             
       44 +per curator. The vault is itself the share token.             
       45 +                                                              
       46 +```mermaid                                                    
       47 +flowchart LR                                                  
       48 +    Backend[Backend price signer] -- "signed prices, 60 s" -->
          + Investors                                                    
       49 +    Investors -- "deposit, redeem" --> Vault[FolioVault]      
       50 +    Manager["Manager (curator)"] -- "trades (SC-04)" --> Vault
       51 +    Factory[VaultFactory] -- creates --> Vault                
       52 +    Guardian -- "activate, pause" --> Vault                   
       53 +    Vault -- "verifies prices" --> Registry[AssetRegistry]    
       54 +    Governance -- "rules, 24 h delay" --> Registry            
       55 +```                                                           
       56 +                                                              
       57 +Only investors move money in and out of the vault. Governance 
          +and the guardian change rules and                             
       58 +state, and the backend only signs prices.                     
       59 +                                                              
       60 +| Contract | Job |                                            
       61  |---|---|
       13 -| `AssetRegistry` | Asset and router allowlists, settlement to
          -ken, guardian. Owned by governance. |                         
       14 -| `VaultFactory` | Anyone can create a vault. |               
       15 -| `FolioVault` | `seed()` and `activate()`; shares are non-tra
          -nsferable. |                                                  
       62 +| `AssetRegistry` | Approved stock tokens and trading routers,
          + the USDT address, the guardian and price-signer addresses. Ve
          +rifies signed prices. Owned by governance. |                  
       63 +| `VaultFactory` | Anyone can create a vault and name its mana
          +ger. Holds no funds. |                                        
       64 +| `FolioVault` | Holds the assets, mints and burns shares, run
          +s the lifecycle, deposits and withdrawals. |                  
       65  
       17 -Not built yet: subscriptions (SC-03), manager trading (SC-04),
          - redemption (SC-05),                                          
       18 -pause and manager replacement (SC-06), deploy scripts and inva
          -riants (SC-07).                                               
       19 -Until SC-05 lands there is **no way to withdraw** — do not dep
          -loy this to mainnet.                                          
       66 +| Role | Who | Can |                                          
       67 +|---|---|---|                                                 
       68 +| Governance | Timelock (24 h) controlled by the team Safe | E
          +dit allowlists, set the guardian and price signer, replace a m
          +anager |                                                      
       69 +| Guardian | Team Safe, no delay | Activate, pause and unpause
          + a vault |                                                    
       70 +| Price signer | Backend hot key | Sign stock prices for depos
          +its; nothing else |                                           
       71 +| Manager | Curator wallet, one per vault | Trade (SC-04) |   
       72 +| Anyone | Any wallet | Create a vault, seed it, deposit, with
          +draw |                                                        
       73  
       74 +**Vault lifecycle:** `DRAFT` → `seed()` → `SEEDED` → guardian 
          +`activate()` → `ACTIVE` ⇄ `PAUSED`.                           
       75 +Deposits need `ACTIVE`. Withdrawals work in every state.      
       76 +                                                              
       77 +**Seed.** The first deposit must be at least 10 USDT and mints
          + 1 share per USDT. 0.001 shares go                            
       78 +to `0xdEaD` forever, to block the inflation attack.           
       79 +                                                              
       80 +**Deposit.** The investor's USDT sits idle in the vault until 
          +the curator invests it. Shares are                            
       81 +minted instantly:                                             
       82 +                                                              
       83 +```                                                           
       84 +shares = deposit × totalSupply ÷ vaultValue        (rounded do
          +wn)                                                           
       85 +```                                                           
       86 +                                                              
       87 +The vault value is the vault's own balances multiplied by back
          +end-signed prices. USDT always                                
       88 +counts as $1.                                                 
       89 +                                                              
       90 +**Withdraw.** `redeem(shares, to)` burns shares and pays the s
          +ame percentage of every holding, in                           
       91 +kind, with no price involved. If an issuer pauses one held tok
          +en, `redeemExcept` skips that token,                          
       92 +so exit is never blocked.                                     
       93 +                                                              
       94 +## Key decisions and the trust trade-off                      
       95 +                                                              
       96 +The biggest decision is that **deposits are priced from backen
          +d-signed stock prices**. Investors                            
       97 +get shares instantly, and their USDT sits idle until the curat
          +or invests it. The cost is that the                           
       98 +contract trusts a price it cannot check.                      
       99 +                                                              
      100 +**Why a signed price.** No reliable on-chain price exists for 
          +these tokens on BSC (checked                                  
      101 +1 October 2026):                                              
      102 +                                                              
      103 +- Chainlink's Ondo-token feeds are Ethereum-only.             
      104 +- The plain AAPL/NVDA/TSLA/MSFT feeds freeze at the US close. 
      105 +- Pyth equity data is paid.                                   
      106 +- DEX pools hold about $17k.                                  
      107 +                                                              
      108 +So the backend reads the Binance RWA price API and signs the p
          +rices.                                                        
      109 +                                                              
      110 +**The risk.** A wrong or leaked price lets someone deposit at 
          +a low price and withdraw real                                 
      111 +assets, which takes value from existing holders. Guardrails:  
      112 +                                                              
      113 +- Prices older than **60 seconds** are rejected, so the backen
          +d signs per deposit.                                          
      114 +- The vault values itself from its **own balances**. The backe
          +nd supplies prices only.                                      
      115 +- Any held stock without a price, or with a zero price, makes 
          +the deposit revert.                                           
      116 +- The guardian can **pause deposits instantly**, and withdrawa
          +ls keep working.                                              
      117 +- The signer is a dedicated key with no other power, and gover
          +nance can rotate it.                                          
      118 +                                                              
      119 +Other decisions:                                              
      120 +                                                              
      121 +| Decision | Answer |                                         
      122 +|---|---|                                                     
      123 +| Settlement token | USDT |                                   
      124 +| Minimum seed | 10 USDT |                                    
      125 +| Is the seeder the manager? | No. Anyone can seed a `DRAFT` v
          +ault. |                                                       
      126 +| Governance | One team, two keys: slow (timelocked) and fast 
          +(guardian) |                                                  
      127 +| Delay before a new depositor can withdraw | None |          
      128 +| Share transfers | Disabled |                                
      129 +                                                              
      130  ## Setup
      131  
      132  This project uses git submodules, so a plain `git clone` will 
           leave `lib/` empty:
     ...
      143  cd contracts
      144  cp .env.example .env     # fill in RPC + Etherscan key
      145  forge build
       37 -forge test                                                    
      146 +forge test               # expect 111 passing                 
      147  ```
      148  
      149 +To see the whole flow as a story, run:                        
      150 +                                                              
      151 +```bash                                                       
      152 +forge test --match-contract SimulationTest -vv                
      153 +```                                                           
      154 +                                                              
      155 +It prints ten chapters with seven actors:                     
      156 +                                                              
      157 +1. The team deploys the contracts.                            
      158 +2. Alice creates a vault and Bob seeds it.                    
      159 +3. Carol deposits, and Mallory's fake prices fail.            
      160 +4. A pause blocks deposits while Bob still withdraws.         
      161 +                                                              
      162 +## Repo layout                                                
      163 +                                                              
      164 +| Path | What is there |                                      
      165 +|---|---|                                                     
      166 +| `src/` | `AssetRegistry.sol`, `VaultFactory.sol`, `FolioVaul
          +t.sol` |                                                      
      167 +| `test/` | Unit, fuzz and simulation tests |                 
      168 +| `test/helpers/` | A test-only vault that fakes manager trade
          +s until SC-04, plus shared fixtures |                         
      169 +| `test/mocks/` | Mock tokens: configurable decimals, fee-on-t
          +ransfer, reentrant, pausable |                                
      170 +| `script/` | Deploy scripts (SC-07, empty for now) |         
      171 +| `../docs/superpowers/plans/` | Step-by-step build plans for 
          +each batch of work |                                          
      172 +                                                              
      173  ## Commands
      174  
      175  | Command | Purpose |
     ...
      178  | `forge test` | Run tests (512 fuzz runs) |
      179  | `FOUNDRY_PROFILE=deep forge test` | 10,000 fuzz runs, deeper
            invariants — before any deploy |
      180  | `forge test --match-test <name> -vvv` | Debug a single test 
           with traces |
      181 +| `forge test --match-contract SimulationTest -vv` | The multi
          +-user story |                                                 
      182  | `forge coverage` | Coverage report |
      183  | `forge fmt` | Format |
      184  | `forge snapshot` | Gas snapshot |
     ...
      196  > storage (EIP-1153). BSC supports it today. On a chain withou
           t it, swap to the storage-based
      197  > `ReentrancyGuard` before lowering `evm_version`.
      198  
      199 +## Handoff to backend                                         
      200 +                                                              
      201 +Vincent's backend signs prices before every deposit, prepares 
          +deposit and withdraw transactions,                            
      202 +and indexes vault events. The interface below is **not frozen 
          +yet**. Agree on it before building                            
      203 +against it.                                                   
      204 +                                                              
      205 +### Signing a price list (EIP-712)                            
      206 +                                                              
      207 +The domain is name `Folio Lab`, version `1`, chainId 56, and v
          +erifyingContract = the                                        
      208 +`AssetRegistry` address. The type is:                         
      209 +                                                              
      210 +```solidity                                                   
      211 +PriceUpdate(address[] assets,uint256[] prices,uint64 timestamp
          +)                                                             
      212 +```                                                           
      213 +                                                              
      214 +- `prices[i]` = USDT value (in USDT's smallest units) of **one
          + whole** `assets[i]` token.                                   
      215 +- `timestamp` = now. The contract rejects anything older than 
          +60 s or in the future.                                        
      216 +- Include every stock the vault holds. One signed list works f
          +or every vault.                                               
      217 +- Refuse to sign while the US market is closed (`marketStatus`
          + from the RWA underlying-market                               
      218 +  endpoint), or when the token and reference prices diverge.  
      219 +- A test signs with `cast wallet sign --data`, so standard vie
          +m or ethers `signTypedData`                                   
      220 +  produces a valid signature.                                 
      221 +                                                              
      222 +### Functions the frontend calls                              
      223 +                                                              
      224 +| Function | Who | Notes |                                    
      225 +|---|---|---|                                                 
      226 +| `factory.createVault(name, symbol, manager)` | anyone | Retu
          +rns the vault address |                                       
      227 +| `vault.seed(amount)` | anyone, `DRAFT` only | Min 10 USDT; a
          +pprove USDT first |                                           
      228 +| `vault.deposit(amount, prices, signature, minShares)` | anyo
          +ne, `ACTIVE` only | Approve USDT first; `minShares` guards aga
          +inst a moved price |                                          
      229 +| `vault.redeem(shares, to)` | any holder, any state | Pays yo
          +ur % of every holding |                                       
      230 +| `vault.redeemExcept(shares, to, forfeit)` | any holder | Sam
          +e, but skips tokens that cannot move |                        
      231 +| `vault.holdings()`, `heldAssets()`, `balanceOf(user)`, `stat
          +e()` | read | For the portfolio page |                        
      232 +                                                              
      233 +### Events to index                                           
      234 +                                                              
      235 +- **Vault:** `VaultCreated`, `Seeded`, `Deposited` (amount, sh
          +ares, vault value, price                                      
      236 +  timestamp), `Redeemed` (actual amounts paid), `StateChanged`
          +.                                                             
      237 +- **Registry:** `AssetSet`, `RouterSet`, `GuardianSet`, `Price
          +SignerSet`.                                                   
      238 +                                                              
      239 +Share price for display = vault value at market prices ÷ `tota
          +lSupply()`, computed off-chain.                               
      240 +                                                              
      241 +### What gets published when contracts land                   
      242 +                                                              
      243 +Per the PRD, Vincent's indexer (BE-03) and transaction prepara
          +tion (BE-04) depend on a frozen                               
      244 +interface. At deployment, publish:                            
      245 +                                                              
      246 +- the versioned ABI                                           
      247 +- the event schema                                            
      248 +- the custom errors                                           
      249 +- the chain and address manifest                              
      250 +- the deployment block                                        
      251 +- the asset/share decimal and rounding rules                  
      252 +                                                              
      253 +Interface changes need a version bump and a matching integrati
          +on check.                                                     
      254 +                                                              
      255  ## Deploying
      256  
      257  Never put a private key in `.env`. Use an encrypted keystore:
     ...
      261  forge script script/<Name>.s.sol --rpc-url bsc_testnet --accou
           nt deployer --broadcast --verify
      262  ```
      263  
       74 -## Handoff to backend                                         
      264 +## Open decisions and next steps                              
      265  
       76 -Per the PRD, Vincent's indexer (BE-03) and transaction prepara
          -tion (BE-04) depend on a                                      
       77 -frozen interface from SC-01. When contracts land, publish: ver
          -sioned ABI, event schema,                                     
       78 -custom errors, chain/address manifest, deployment block, and t
          -he asset/share decimal and                                    
       79 -rounding rules. Interface changes need a version bump and a ma
          -tching integration check.                                     
      266 +Two decisions block manager trading (SC-04). One open issue co
          +uld change the interface before                               
      267 +it is frozen.                                                 
      268 +                                                              
      269 +| Item | Why it matters | Owner |                             
      270 +|---|---|---|                                                 
      271 +| Max stocks per vault | Every deposit and withdrawal loops ov
          +er all holdings, so this bounds gas | Aik Wei |               
      272 +| Allowlist by liquidity | TSLAon cannot fill a 10,000 USDT tr
          +ade and 11 tokens cannot quote at all | Aik Wei + Vincent |   
      273 +| Seed slot can be taken by a stranger | Anyone can seed a new
          + vault with 10 USDT before its curator does; fix before freezi
          +ng the interface | Founder |                                  
      274 +| Freeze the interface and events | The backend builds against
          + them | Aik Wei + Vincent |                                   
      275 +                                                              
      276 +Next steps:                                                   
      277 +                                                              
      278 +- [ ] Update `docs/sc-checklist.md` for SC-03 and SC-05       
      279 +- [ ] Run the whole-build review on SC-03 and SC-05           
      280 +- [ ] Build SC-04: `rebalance` with the balance checks that ma
          +ke opaque router calldata safe                                
      281 +- [ ] Backend: a price-signing endpoint and the EIP-712 signer
          + key                                                          
      282 +- [ ] SC-06 and SC-07: manager replacement, invariant tests, d
          +eploy scripts, ABI handoff                                    

● Written for: teammates opening the repo.

  I merged the handoff into contracts/README.md. Everything that was already in
  it is still there, updated where it was out of date:

  - Status now says SC-02, SC-03 and SC-05 are built, with a task table.
  - The old "Handoff to backend" section is kept as "What gets published when
    contracts land", under the new backend detail.

  New sections from the handoff:

  - What Folio Lab is
  - How it works, with the diagram redrawn as a Mermaid chart, which GitHub
    renders
  - Key decisions and the trust trade-off
  - Repo layout
  - Open decisions and next steps

  The Setup section now also covers the simulation story.

  The README is inside contracts/, so links to docs/ use ../. If you want it to
  be the repo's front page instead, it would need moving to the root README.md.

❯ <ide_opened_file>The user opened the file
  /home/eggwae/personal-projects/bnb-hack/bnb-hack/contracts/src/FolioVault.sol
  in the IDE. This may or may not be related to the current
  task.</ide_opened_file>

❯ ok give me the commands to push the changes

  Ran 2 shell commands (ctrl+o to expand)

● Your earlier commit is already pushed. The only new contract change is the
  README, so this commit holds just that one file:

  git add contracts/README.md
  git commit -m "Expand contracts README with project handoff"
  git push origin main

  Run git status --short before committing if you want to confirm only the
  README is staged.

  These stay out of the commit: app/, api/, lib/binance/, components/viz/,
  eslint.config.mjs and tsconfig.json. That's frontend and backend work,
  unrelated to the contracts.

❯ i have a few teammates working on this project, i want you to know end to end
  the entire project and help me to split this project up into 4 parts so that
  4 different person can work on different parts that way it doesn't waste
  time

● I'll get a picture of the whole repo first, not just the contracts.

  Ran 1 shell command (ctrl+o to expand)

● Explore(Map the non-contract project end to end) Sonnet 5.5
  ⎿  Done (5 tool uses · 43.7k tokens · 35s)
  (ctrl+o to expand)

› Message from Explore
  Today is 2026-10-10 and the deadline is 11 Oct 12:00 UTC, so about one day
  remains.

  **1. Hackathon (knowledge-base/06-bnb-hackathon.md, README.md, plus 01–05 as
  background)**
  - The event is the BNB Chain Tokenized Stocks hackathon
  (https://www.bnbchain.org/en/hackathons/tokenized-stocks).
  - Deadline, quoted: "11 October 2026 at 12:00 UTC (20:00 Malaysia)".
  - Scope: BSC mainnet, spot assets, bStocks/Ondo/xStocks central, and "at least
  one Binance Web3 API module".
  - Submission: a public repository, plus an "accessible deployment or
  reproducible instructions".
  - A developer-experience report is mandatory. It "must reflect genuine
  experience, and the organizers reject AI-generated reports". The notes say it
  must be in the participants' own words.
  - A short demo video is optional.
  - Scoring: implementation 30%, originality 25%, developer experience 25%, UX
  20%.
  - Scope rule: don't block on licensing, fees, a DAO, a token or a manager
  marketplace. Don't call the browser simulation an onchain vault.
  - The KB's own status line says the prototype alone "is not submission-ready".
  Judge access to the private ChatGPT-hosted prototype link "still needs to be
  arranged".

  **2. PRD (docs/folio-lab-pooled-fund-prd.md; also docs/sc-checklist.md,
  docs/superpowers/plans/*)**
  - The model is a seeded pooled vault: seed, then subscribe at NAV, manager
  rebalance, redeem.
  - P01–P10 are lifecycle/roles, seed and shares, allocation history,
  subscriptions, constrained execution, consistent dealing, valuation,
  redemption, emergency pause, and the integrated demo (P10).
  - Team: Aik Wei owns contracts (SC-01..07). Vincent owns the backend
  (BE-01..08). The frontend is explicitly **unassigned**. No FE-* tasks exist.
  - Backend tasks, one line each:
    - BE-01: server-side Binance Web3 integration. Verify instruments, reference
  data and swap routes.
    - BE-02: authenticated metadata APIs and storage, with signed-wallet
  challenges using single-use nonces.
    - BE-03: event indexer and transaction monitor, with reorg and duplicate-log
  handling.
    - BE-04: quotes, readiness checks, simulation and unsigned manager rebalance
  payloads.
    - BE-05: seed, subscribe and redeem preview and unsigned-request APIs.
    - BE-06: holdings, ownership, valuation and allocation-history APIs.
    - BE-07: operation status, retry and monitoring.
    - BE-08: deploy the backend, document it, and run the end-to-end integration
  check.
  - The unassigned frontend work is creation/seed screens, factsheets, wallet
  signing, a manager console, an investor dashboard and withdrawal screens.
  - Open decisions that block work:
    - whether the founder is also the manager;
    - minimum seed, settlement token and supported assets;
    - oracle and valuation trust model, which blocks subscriptions;
    - redemption and queue policy;
    - whether the Binance route supports a vault as holder and trader;
    - who builds the frontend and wallet client.

  **3. Frontend: fully MOCK, no wallet**
  - app/page.tsx is a single page with components: Header, AccountBar,
  StrategyCard, DetailPanel, PriceChart, PositionsList, TradeDialog,
  CreateStrategyDialog and Toast.
  - It covers strategy discovery, create-strategy, simulated deposit/redeem,
  positions and ±5% market scenarios.
  - The data is four fictional assets (CORE, TECH, HEALTH, USD) in
  lib/domain/vault.ts. State is an in-memory reducer in lib/state/store.tsx and
  resets on refresh.
  - A grep found no wagmi, viem or ethers in the app code. package.json has only
  next 16.3.5 and react 19.2.8.
  - Tests: vitest, with lib/domain/vault.test.ts and lib/domain/format.test.ts.
  vitest.config.mts includes only `lib/**/*.test.ts`, so there are no component
  tests.
  - prototype/ is the old single-file reference. public/ holds only Next default
  SVGs.
  - The root README says everything is simulated.
  - Vite + TanStack Start: **confirmed in a memory note**,
  ~/.claude/projects/-home-eggwae-personal-projects-bnb-hack-bnb-hack/memory/int
  ended-frontend-stack.md. It says the PM wants Vite + TanStack Start and a
  separate backend, with Postgres later. The migration was designed but not
  started, and Next.js is "not the settled choice".
    - In-repo docs: api/README.md says "It will survive the Vite migration
  unchanged". No other repo doc mentions Vite or TanStack.
    - Next is only coupled through app/layout.tsx, the app/ routes, and the
  Server Components in app/api-visual that import lib/binance. Components, store
  and lib/domain are framework-free.
  - Uncommitted: app/api-visual/page.tsx is a server-rendered, force-dynamic
  page that calls lib/binance/queries.ts for live chains and RWA
  platforms/tokens. It draws charts with components/viz/* (StatusBreakdown,
  PriceRelationship, ExecutionFlow, CategoryBars, WriteCapabilities,
  primitives). It is a data explorer, not product UI.
  - app/api/ contains only a README. The planned `rwa/route.ts` does not exist,
  so nothing connects live data to the main UI.

  **4. Backend: a probe tool and a typed read client, not a server**
  - api/ is a standalone Node 24 CLI explorer for BE-01, with its own
  package.json and .env.
    - client.ts is a 5-line stub.
    - endpoints.ts catalogues 34 read-only endpoints: market, portfolio, rwa,
  wallet, trading.chains, trading.quote and trading.history.
    - probe.ts is the runner. shape.ts, signcheck.ts and doctor.ts are helpers.
    - responses/ holds about 25 captured JSON responses, so the probe was run
  live.
    - Learned: API errors return HTTP 200 with `success:false`. Equity/RWA
  tokens use `executionMode` RFQ.
    - The README gives "Parameter conventions (verified live, 18 Sep 2026)".
    - It also documents a Malaysian ISP DNS block, worked around with
  BINANCE_WEB3_DNS=1.1.1.1.
  - lib/binance/ is the real signed client (HMAC-SHA256, `/build` prefix, DNS
  override) plus queries.ts and types.ts. Queries return an Outcome type and
  never fake data. It integrates only getMarketChains, getRwaPlatforms,
  getRwaTokens, getTradingChains and getWalletChains.
  - Swap, approve, order-submit and broadcast endpoints are deliberately
  excluded. The Transaction and DeFi API paths are unknown. Nine endpoints need
  PROBE_ADDRESS or PROBE_TXHASH.
  - Missing entirely:
    - a persistent API server (nothing hosts the BE routes);
    - a database;
    - an indexer;
    - wallet-challenge auth;
    - a quote-to-unsigned-tx preparer;
    - a status/retry service;
    - a signing service. The PRD says the backend must never hold signing
  authority, so this one is correct to omit.

  **5. Deploy, env and CI**
  - .env.example has BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET.
  api/.env.example is separate, and BINANCE_WEB3_DNS and BINANCE_WEB3_HOST are
  read in code.
  - There is no CI (no .github), no Dockerfile, no hosting config and no
  deployed URL.
  - The only hosting note is that Vercel/Railway-type hosts avoid the local DNS
  problem.
  - Git state: modified app/globals.css, eslint.config.mjs and tsconfig.json.
  Untracked: api/, app/api-visual/, components/viz/ and lib/binance/. Contracts
  are committed.

  **Gaps vs PRD and hackathon**
  - No live data in the main UI, no wallet, no contract connection, no
  deployment, no repo-level docs for judges.
  - There is no Binance quote/swap integration beyond the read-only catalogue.

  **Remaining work outside contracts**
  1. Decide Next vs Vite/TanStack now. With one day left, staying on Next is the
  pragmatic option.
  2. Frontend owner and wallet layer: add wagmi/viem, then build connect,
  seed/create, subscribe, redeem and manager rebalance views against the
  contract ABIs.
  3. Replace the mock store and fictional assets with real RWA instruments (the
  `app/api/rwa/route.ts` slice) and onchain reads of shares, NAV and holdings.
  4. BE-04/05: quote, simulation and unsigned payload endpoints. This needs the
  Transaction API paths, which are still unknown.
  5. BE-03/06: a minimal indexer or chain-read layer for holdings and history.
  Postgres is optional. Contract reads via viem could replace it for the demo.
  6. BE-02: wallet-signature metadata API, if kept in scope. It can be cut.
  7. Deployment: host the app and any backend with API secrets set, publish the
  repo, and fill in README run instructions.
  8. Write the developer-experience report in the team's own words (mandatory).
  Optionally record the demo video. Use api/README.md's findings as raw notes.
  9. An end-to-end integration script or demo that shows seed, subscribe,
  rebalance and redeem on BSC (P10). Add CI (lint, vitest, build) if time
  allows.
  10. Commit the uncommitted api/, lib/binance/ and viz work, and decide whether
  app/api-visual stays.

● The deadline matters most, so I'll confirm it before planning around it.

  Ran 1 shell command (ctrl+o to expand)

● Time first: the deadline is Sunday 11 Oct, 12:00 UTC, about 36 hours from now.
  With that little time, the split has to aim at one goal: a working demo on
  BSC that judges can use, plus the required submission items. Anything that
  doesn't serve that gets cut.

  What exists today

  ┌────────────┬─────────────────────────────────────────────────────────────┐
  │    Area    │                            State                            │
  ├────────────┼─────────────────────────────────────────────────────────────┤
  │            │ Vaults can be created, seeded, deposited into, withdrawn    │
  │ Contracts  │ from and paused; 111 tests pass. Manager trading is         │
  │            │ missing, so a vault can only ever hold USDT. Not deployed.  │
  ├────────────┼─────────────────────────────────────────────────────────────┤
  │            │ A signed Binance API client (lib/binance/, uncommitted) and │
  │ Backend    │  an endpoint explorer (api/). No server, no price signing,  │
  │            │ no trade building.                                          │
  ├────────────┼─────────────────────────────────────────────────────────────┤
  │ Frontend   │ A good-looking Next.js app, but 100% mock data: fictional   │
  │            │ assets, no wallet, no contract calls.                       │
  ├────────────┼─────────────────────────────────────────────────────────────┤
  │            │ No deployment, no judge-facing README, no                   │
  │ Submission │ developer-experience report (mandatory, and must be in your │
  │            │  own words).                                                │
  └────────────┴─────────────────────────────────────────────────────────────┘

  The 4 parts

  Part 1: Contracts and deployment (you, Aik Wei)

  - SC-04 rebalance(): the manager swaps through the Binance router, and the
    balance checks stop anything else from leaving the vault. This is the heart
    of the demo: without it, there are no stocks.
  - Store the curator's target weights on-chain (setTargetWeights), so the
    website can show what the curator plans to invest in. That was your original
    vision.
  - A deploy script: registry, factory, price signer, guardian, and the
    allowlist of a few liquid tokens (AAPLon, NVDAon, MSFTon).
  - Deploy to BSC mainnet, then export ABIs and addresses for everyone else.
  - Cut: SC-06, and the full SC-07 adversarial review.

  Part 2: Backend API (Vincent)

  Built as Next.js API routes in the same app, so there's only one thing to
  deploy:
  - /api/prices: reads the Binance RWA price API, checks the market is open, and
    returns a signed PriceUpdate (EIP-712). Deposits need this.
  - /api/trade: gets a Binance quote and swap calldata, and returns a
    TradeRequest the curator signs. Rebalance needs this.
  - /api/vaults: holdings valued at market prices, for display.
  - Commit lib/binance/.
  - Cut: database, indexer, wallet-login auth, retry service (BE-02, 03 and 07).

  Part 3: Investor frontend

  - Add wagmi and viem for wallet connect on BSC. Set up the shared
    lib/contracts/ module (ABIs and addresses) in the first 2 hours, because
    Part 4 builds on it.
  - Replace the mock store with real data:
    - a vault list from the factory;
    - a vault page with holdings, share price and the curator's target weights.
  - Deposit flow (approve, fetch /api/prices, call deposit) and withdraw flow
    (redeem).

  Part 4: Curator frontend and submission

  - Curator console:
    - create a vault and seed it;
    - set target weights;
    - rebalance (fetch /api/trade, call rebalance).
  - Deploy the app to Vercel with the API secrets and the price-signer key.
  - Root README.md for judges: what it is, a live link, how to run it.
  - Record the demo video and collect everyone's notes for the
    developer-experience report.

  Agree these 3 things in the first hour

  These are what let 4 people work without waiting on each other:

  1. The rebalance signature (Part 1 → 2, 4). My proposal from spec §6:
     rebalance(TradeRequest {router, sellToken, buyToken, maxSellAmount,
     minBuyAmount, callData}).
  2. API responses (Part 2 → 3, 4).
     /api/prices → {update: {assets, prices, timestamp}, signature}.
     /api/trade → a TradeRequest object.
  3. A shared test chain. Run anvil --fork-url <BSC RPC>, a local copy of BSC
     mainnet with real tokens and the real router. Everyone builds against it
     before the mainnet deploy, so nobody waits for real money.

  Timeline (UTC)

  ┌─────────┬───────────────────────────────────────────────────────────────┐
  │   By    │                           Milestone                           │
  ├─────────┼───────────────────────────────────────────────────────────────┤
  │ Sat     │ The 3 interfaces agreed; fork chain running; Part 1 deploys   │
  │ 02:00   │ the current contracts to it                                   │
  ├─────────┼───────────────────────────────────────────────────────────────┤
  │ Sat     │ Deposit and withdraw work end to end on the fork (Parts 2 and │
  │ 12:00   │  3)                                                           │
  ├─────────┼───────────────────────────────────────────────────────────────┤
  │ Sat     │ Rebalance works end to end on the fork (Parts 1, 2 and 4)     │
  │ 20:00   │                                                               │
  ├─────────┼───────────────────────────────────────────────────────────────┤
  │ Sun     │ Mainnet deploy with small real amounts; app live on Vercel    │
  │ 04:00   │                                                               │
  ├─────────┼───────────────────────────────────────────────────────────────┤
  │ Sun     │ Freeze: README, video and developer-experience report done    │
  │ 10:00   │                                                               │
  ├─────────┼───────────────────────────────────────────────────────────────┤
  │ Sun     │ Deadline                                                      │
  │ 12:00   │                                                               │
  └─────────┴───────────────────────────────────────────────────────────────┘

  Two calls to make now

  - Stay on Next.js. The PM wanted Vite and TanStack, but there's no time to
    migrate. Tell the PM it's deferred, not dropped.
  - The developer-experience report is 25% of the score and must be in your own
    words. Each person should keep rough notes of what was painful as they go,
    such as the Binance API DNS block or HTTP-200 errors. I can help organise
    the notes, but not write the report.

  Want me to start on Part 1 (rebalance) now, or put this split into the handoff
  doc for the team first?

❯ vincent will no longer be working on this project, it will be other people. i
  want you to just split the 4 parts only

● Part 1: Smart contracts and deployment

  - Build rebalance(): the curator swaps through the Binance router, and balance
    checks stop anything else from leaving the vault.
  - Store the curator's target weights on-chain (setTargetWeights).
  - Write a deploy script for the registry, factory, price signer, guardian and
    stock allowlist.
  - Deploy to BSC mainnet and publish the ABIs and addresses.

  Part 2: Backend API

  Next.js API routes in the same app:
  - /api/prices: reads Binance RWA prices, checks the market is open, and
    returns a signed PriceUpdate for deposits.
  - /api/trade: gets a Binance quote and swap calldata, and returns a
    TradeRequest for rebalancing.
  - /api/vaults: vault holdings valued at market prices, for display.
  - Commit lib/binance/.

  Part 3: Investor frontend

  - Wallet connect on BSC (wagmi and viem), plus the shared lib/contracts/
    module with ABIs and addresses.
  - Vault list, and a vault page showing holdings, share price and the curator's
    target weights.
  - Deposit flow (approve, fetch /api/prices, call deposit) and withdraw flow
    (redeem).

  Part 4: Curator frontend and submission

  - Curator console: create and seed a vault, set target weights, and rebalance
    (fetch /api/trade, call rebalance).
  - Deploy the app to Vercel.
  - Root README for the judges, the demo video, and the developer-experience
    report, which must be in the team's own words.

❯ <ide_opened_file>The user opened the file
  /home/eggwae/personal-projects/bnb-hack/bnb-hack/CLAUDE.md in the IDE. This
  may or may not be related to the current task.</ide_opened_file>

❯ ok good now i want you to feed it to claude md to give it as much project
  context as possible and also to give you more context, there will likely be a
  total of 5 people actually working on this project. so whenever they are
  talking to any code agent, make sure to ask which of the 4 part are they
  actually working on to set their coding agent in the right direction

● I'll check how next dev manages AGENTS.md first, since that file is where
  non-Claude agents look:

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

● I'll add the project context below the marked block in AGENTS.md, since next
  dev preserves everything outside it—CLAUDE.md already imports this file, and
  other agents like Codex and Cursor read it directly, so one file covers
  everyone.

  Ran 1 shell command (ctrl+o to expand)

● Bash(cat >> AGENTS.md <<'EOF'…)
  ⎿  Updated AGENTS.md (+133 -0)
        7  This block is written and re-added by `next dev` — verify at `
           node_modules/next/dist/server/lib/generate-agent-files.js`. Re
           moving it from a diff only re-creates the uncommitted change; 
           committing it with your work keeps the tree clean.
        8  
        9  <!-- END:nextjs-agent-rules -->
       10 +                                                              
       11 +# Folio Lab — project context for every coding agent          
       12 +                                                              
       13 +## FIRST: ask which part the person is working on             
       14 +                                                              
       15 +This repo is split into **4 parts**, worked on in parallel by 
          +about 5 people. Before writing or changing any                
       16 +code, ask the person:                                         
       17 +                                                              
       18 +> Which part are you working on? **1** Smart contracts · **2**
          + Backend API · **3** Investor frontend ·                      
       19 +> **4** Curator frontend and submission                       
       20 +                                                              
       21 +Then stay inside that part's files (see "Who owns what"). Ques
          +tions about the project in general can be                     
       22 +answered without asking. If a change needs another part's file
          +s or one of the shared interfaces below,                      
       23 +stop and tell the person to agree it with that part's owner fi
          +rst. Never silently change a shared interface.                
       24 +                                                              
       25 +## What Folio Lab is                                          
       26 +                                                              
       27 +A pooled portfolio of tokenized US stocks on **BNB Smart Chain
          + (BSC) mainnet**. A curator creates a vault                   
       28 +and manages it; investors deposit USDT and get non-transferabl
          +e vault shares; the curator invests the                       
       29 +pooled USDT in approved stock tokens (Ondo's AAPLon, NVDAon, …
          +) through the Binance Web3 trading router.                    
       30 +Everyone can see what each curator plans to invest in (target 
          +weights).                                                     
       31 +                                                              
       32 +Guarantees: the manager can trade but never withdraw; any hold
          +er can always withdraw their percentage of                    
       33 +every holding (even when paused); deposits never dilute existi
          +ng holders.                                                   
       34 +                                                              
       35 +**Hackathon:** BNB Chain Tokenized Stocks. **Deadline: 11 Octo
          +ber 2026, 12:00 UTC.** Needs a public repo,                   
       36 +a working deployment or reproducible instructions, and a devel
          +oper-experience report. Scoring:                              
       37 +implementation 30%, originality 25%, developer experience 25%,
          + UX 20%. Details:                                             
       38 +`knowledge-base/06-bnb-hackathon.md`.                         
       39 +                                                              
       40 +## The 4 parts                                                
       41 +                                                              
       42 +### Part 1 — Smart contracts and deployment                   
       43 +- `rebalance()`: the curator swaps through the Binance router;
          + balance checks stop anything else leaving                    
       44 +  the vault (spec §6).                                        
       45 +- `setTargetWeights()`: the curator's planned allocation, stor
          +ed on-chain and versioned.                                    
       46 +- Deploy script: registry, factory, price signer, guardian, st
          +ock allowlist. Deploy to BSC mainnet.                         
     … 96 more lines (ctrl+o to expand)

● I put the project context in AGENTS.md, and CLAUDE.md already imports it with
  @AGENTS.md, so Claude reads it there too. Other coding agents (Codex, Cursor,
  etc.) read AGENTS.md directly, so this reaches everyone's agent. next dev only
  rewrites the Next.js block between its two marker comments, so the new
  section is safe.

  What's in it:

  - Ask which part first. Before changing code, every agent asks "Which part are
    you working on? 1 / 2 / 3 / 4". It then stays inside that part's files.
    General questions about the project don't need the question.
  - Project context: what Folio Lab is, what it guarantees, and the deadline (11
    Oct, 12:00 UTC) with the scoring.
  - The 4 parts, as agreed.
  - Who owns what: a table mapping folders to parts. package.json and
    app/layout.tsx are marked shared, so agents coordinate before editing them.
  - Shared interfaces:
    - the contract functions that exist today;
    - the planned rebalance and setTargetWeights;
    - the signed-price format;
    - proposed shapes for the three API responses.
      Agents must not change these silently.
  - Gotchas: stay on Next.js until after the deadline, keep the price-signer key
    secret, the Binance DNS block and HTTP-200 errors, liquidity limits, and no
    committed keys.
  - The developer-experience report rule: agents may organise notes but must not
    write the report, because the organisers reject AI-written reports.

  The API response shapes are marked "proposed". Whoever takes Part 2 should
  confirm them early with Parts 3 and 4.

  To push it: git add AGENTS.md && git commit -m "Add project context and part
  ownership for coding agents" && git push origin main.

❯ eggwae@LAPTOP-70GQDSLQ:~/personal-projects/bnb-hack/bnb-hack$ git push origin
  main
  To github.com:noobstar3310/bnb-hack.git
   ! [rejected]        main -> main (fetch first)
  error: failed to push some refs to 'github.com:noobstar3310/bnb-hack.git'
  hint: Updates were rejected because the remote contains work that you do not
  hint: have locally. This is usually caused by another repository pushing to
  hint: the same ref. If you want to integrate the remote changes, use
  hint: 'git pull' before pushing again.
  hint: See the 'Note about fast-forwards' in 'git push --help' for details.
  eggwae@LAPTOP-70GQDSLQ:~/personal-projects/bnb-hack/bnb-hack$
  why can't i push?

● A teammate pushed to main since your last pull, so git won't let you overwrite
  their work. Let me see what came in:

  Ran 4 shell commands (ctrl+o to expand)
● You can't push because a teammate pushed one commit to main after your last
  pull: 1c1bfb7 "Hide an easter egg in the market-move constants", which changes
  lib/domain/vault.ts. Git refuses a push that would overwrite work it hasn't
  seen.

  None of your files overlap with theirs, so this is easy to fix: pull their
  commit in, put yours on top, then push.

  git pull --rebase origin main
  git push origin main

  --rebase places your two commits after theirs, so the history stays a straight
  line with no merge commit.

  What you're about to push:
  - 8fc14ca: the AGENTS.md project context.
  - bd38401: 24 files, including the Binance explorer (api/), lib/binance/, the
    app/api-visual/ page and components/viz/. I checked it: no API keys or
    secrets, and api/.env isn't in it, only the empty .env.example.

  Your teammates have also created their own branches (egg, jv, staging, wenfei,
  wx, zh). If everyone keeps pushing straight to main, this will keep
  happening. Each person working on their own branch and merging through pull
  requests would avoid it.

[Image #1]

❯ i saw what happened because my teammate actually commited something into the
  branch so now that i have pushed, are his changes still there?

  Ran 1 shell command (ctrl+o to expand)

● Yes, his change is still there. I checked the remote:

  - His commit 1c1bfb7 is in main's history, sitting just below your two
    commits, exactly as your screenshot shows.
  - His edit to lib/domain/vault.ts is intact. Your commits don't touch that
    file, so it's identical to what he pushed.

  The rebase put your commits on top of his instead of replacing anything. Your
  two commits now have new IDs (017688a and 0eb2dab) because rebasing re-creates
  them, but their content is the same.

❯ my teammate asked to share the conversation that i have with you to the team
  to let them also throw into their coding agents. give me the sahirng of our
  session

● I can't export this conversation myself, but you can, in two ways.

  Option 1: Export the raw conversation

  In the Claude Code chat box, type:

  /export

  This saves the whole conversation to a text file, or copies it to your
  clipboard, and your teammates can paste it into their agents. The catch: it's
  very long, and most of it is tool output and back-and-forth (reviews, test
  runs, my own mistakes and fixes). That burns their agents' context for little
  gain.

  Option 2: Share the distilled version (better)

  Everything important from this session is already written into files that are
  pushed to main:

  File: AGENTS.md
  What it holds from our session: The 4-part split, who owns what, shared
  interfaces, gotchas, and the "ask which part first" rule. Every coding agent
  reads this automatically.
  ────────────────────────────────────────
  File: contracts/README.md
  What it holds from our session: How the contracts work, the signed-price
  decision and its risks, the backend interface
  ────────────────────────────────────────
  File: docs/folio-lab-contract-architecture.md
  What it holds from our session: The full spec, including every decision and
  its
  date in §10
  ────────────────────────────────────────
  File: ⧉ Contracts Handoff doc
  (https://claude.ai/code/artifact/ad60efaf-5dac-4d00-aa5f-377e889d013a)
  What it holds from our session: A readable summary for the humans on the team

  So teammates only need to:

  1. git pull to get the latest main.
  2. Open their coding agent in the repo. It loads AGENTS.md automatically and
     will ask which part they're working on.

