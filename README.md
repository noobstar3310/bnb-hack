# BNB Hack — Tokenized Portfolio Launchpad

A hackathon project exploring creator-led investment portfolios using tokenized stocks on BNB Chain. Creators define strategies; investors compare allocations and participate according to their preferences and risk appetite.

**Current stage:** concept research plus a Next.js prototype with simulated assets. Live BSC assets, wallet execution, and Binance Web3 API integration remain to be built. “Folio Lab” is a working name.

## Start here

Current implementation plan: [Seeded pooled portfolio PRD and task assignments](docs/folio-lab-pooled-fund-prd.md). Aik Wei owns smart contracts; Vincent owns the backend. Frontend ownership remains open.

1. [Hackathon scope and next build slices](knowledge-base/06-bnb-hackathon.md)
2. [Knowledge-base index](knowledge-base/README.md)
3. [Concept and assessment](knowledge-base/01-concept-and-assessment.md)
4. [Product mechanics](knowledge-base/03-product-and-mechanics.md)

## Research and planning

- [Competitors and primary sources](knowledge-base/02-market-and-evidence.md)
- [Risk register and legal questions](knowledge-base/04-risk-and-legal.md)
- [Validation, economics and decisions](knowledge-base/05-validation-and-decisions.md)

## Running the app

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vault accounting tests
npm run build    # production build
```

| Path | What it holds |
|---|---|
| `app/` | Routes and layout. `app/api/` is where Binance Web3 API calls belong — server-side, so keys stay out of the browser. |
| `components/` | Presentation only. |
| `lib/domain/` | Vault accounting and formatting. Pure functions, no React, unit-tested. |
| `lib/state/` | Reducer and context wiring the domain to the UI. |
| `prototype/` | The original single-file version this was migrated from. Reference only. |

Copy `.env.example` to `.env.local` for API credentials. Everything in the app is
still simulated: fictional assets, no wallet, no chain calls.

## Working as a team

Record agreed decisions in the decision log, distinguish proposed features from implemented behavior, and keep source links and verification dates with research claims. Use issues or pull requests to discuss changes. Do not commit API keys, wallet secrets, or credentials.

The developer-experience report must reflect the participants’ own actual experience; the knowledge base is not that submission report.
