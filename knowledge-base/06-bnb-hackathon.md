# BNB hackathon — current delivery scope

Updated 17 September 2026. This document takes priority over earlier production-launch sequencing for the immediate build. The long-term fund-management vision is unchanged.

## Event requirements

The [official event page](https://www.bnbchain.org/en/hackathons/tokenized-stocks) specifies BSC mainnet, spot assets, a central role for bStocks/Ondo/xStocks, and at least one Binance Web3 API module. The deadline is 11 October 2026 at 12:00 UTC (20:00 Malaysia). Submission needs a public repository and an accessible deployment or reproducible instructions. A developer-experience report is mandatory; it must reflect genuine experience, and the organizers reject AI-generated reports. A short demo video is optional. Scoring: implementation 30%, originality 25%, developer experience 25%, UX 20%.

## Proposed hackathon positioning

**Folio Lab: creator-led tokenized-stock portfolios with explainable rebalancing controls.** Working name only.

Lead with one concrete journey: a creator publishes a basket and its limits; an investor inspects holdings and execution conditions; the app prepares the allocation; a wallet owner reviews and signs; the portfolio view explains the resulting exposure.

Proposed differentiator: an execution-readiness check showing stock-market status, token/reference-price divergence, estimated slippage and quote freshness. Explain why a rebalance is ready, deferred, or blocked. This is a product hypothesis, not a claimed arbitrage opportunity or implemented feature.

Private prototype: [Open Folio Lab](https://folio-lab-hackathon-vy.vincent-yeo96.chatgpt.site). This owner-only link is for iteration; judge access still needs to be arranged.

## Built now

The initial browser prototype supports strategy discovery, allocation-based creation, simulated deposits and redemptions, proportional share accounting, positions, and ±5% market scenarios. Each vault starts with explicit simulated seed capital. Everything lives in the current browser session and resets on refresh. No actual stock tokens, API data, blockchain contracts, wallets, custody, or fees are connected. This prototype alone is not submission-ready.

## Proposed next implementation slices

1. **Read-only BSC discovery.** Use the RWA Data API to retrieve actual eligible instrument metadata. Show provider, contract, chain, timestamps and market status. Never substitute mock values silently when the API fails.
2. **Execution preview.** Use Trading and Transaction APIs to prepare and simulate one small spot allocation. Show costs, approvals, minimum received and failures. Keep credentials server-side.
3. **Wallet-controlled execution.** The wallet owner signs the specific reviewed transactions. Record actual transaction hashes and handle partial completion across basket legs.
4. **Portfolio read-back.** Reconcile confirmed balances through Wallet API or chain reads. Separate confirmed holdings from pending orders.
5. **Submission packaging.** Publish an appropriate public source repository and judge-accessible demonstration, prepare a walkthrough, and use the participant's own development notes for the experience report.

Choose deliberately between a pooled vault and individual-wallet basket execution. A basket held in each user's wallet can demonstrate strategy discovery and investing sooner, but does not implement pooled fund shares. If pooled management is retained for the hackathon, scope a reviewed vault integration and explicit investor/manager permissions; do not call the browser simulation an onchain vault.

## What is needed next

A Binance Web3 developer account/API key through the [developer portal](https://web3.binance.com/en/dev-portal), a chosen instrument/provider and basket, and an explicit choice of pooled vault versus individual-wallet execution. Secrets should be configured securely rather than pasted into chat or browser code. Live transactions require a funded wallet and the owner's review/signature.

## Scope discipline

Do not block the hackathon prototype on full production licensing, fee monetization, a DAO, a governance token, a large manager marketplace or historical alpha claims. Retain the production risk register as context. Keep the distinction between a functional demonstration and a public investment offering explicit.

## Experience log prompts — participant-owned

Keep dated notes of first-call time, exact documentation URLs, actual error messages, latency, failed simulations, out-of-hours pricing observations and suggested fixes. These prompts are a note-taking aid, not a draft submission report. The report should come from real development experience in the participant's own words.
