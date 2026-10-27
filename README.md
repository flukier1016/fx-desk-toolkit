<div align="center">

# FX Desk Toolkit

**A browser-based toolkit for FX options pricing, market conventions and risk.**

[Tools](#tools) · [Getting started](#getting-started) · [Validation](#validation-and-limitations) · [简体中文](README.zh-CN.md)

![React](https://img.shields.io/badge/React-19-1E2761?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-1E2761?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-0F766E?style=flat-square)
</div>

FX Desk Toolkit collects 13 pricing, market, risk and study tools in a self-contained HTML build. Calculations run locally in the browser, and market parameters can be shared across tools. The interface and study cards are currently in Chinese; the FX clock uses Beijing time.

<p align="center"><img src="docs/images/gk.jpg" alt="Garman–Kohlhagen option pricer" width="100%"></p>

## Tools

| Category | Tool | Purpose |
| --- | --- | --- |
| Pricing | Garman–Kohlhagen pricer | Vanilla option value, Greeks including vanna and volga, and implied volatility. |
| Pricing | Delta / strike | Convert between strike and four FX delta conventions; includes ATMF and delta-neutral shortcuts. |
| Pricing | Digital and touch | Cash and asset digitals, one-touch and no-touch calculations. |
| Pricing | Barrier options | Eight knock-in and knock-out formulas, BGK adjustment and in/out parity check. |
| Pricing | Strategies | Five multi-leg presets, aggregate Greeks and expiry PnL, with SABR smile volatility by leg. |
| Market | Volatility smile | Reconstruct a smile from ATM, risk reversal and butterfly quotes; calibrate SABR to three points. |
| Market | Swap points and CIP | Forward points, implied rates and cross-currency basis under the documented conventions. |
| Market | FX clock | Session bands and key market times in Beijing time. |
| Risk | Scenario matrix | Revalue across spot and volatility shocks; copy results as TSV. |
| Risk | PnL attribution | Delta, gamma, vega, theta and carry, with a full-revaluation residual in option mode. |
| Risk | Position book | Local positions with aggregate delta, vega and theta. |
| Daily | Practice cards | 34 study cards for desk concepts. |
| Daily | Daily summary | A copyable summary with a market-parameter snapshot. |

Shared spot, rates, volatility, maturity, notional and currency-pair settings are persisted in browser `localStorage` and can be exported or imported as JSON. Currency-pair selection applies the project's pip and delta conventions.

<table><tr><td width="50%"><img src="docs/images/smile.jpg" alt="Volatility smile"></td><td width="50%"><img src="docs/images/pnl.jpg" alt="PnL attribution"></td></tr></table>

## Getting started

Install Node.js and npm, then:

```bash
git clone https://github.com/flukier1016/fx-desk-toolkit.git
cd fx-desk-toolkit
npm ci
npm run dev
```

Open the local address printed by Vite. Use `Alt` + left/right arrows to switch tools. To create and check the portable build:

```bash
npm test
npm run build
```

Open `dist/index.html` directly or copy that file to another machine. The application performs calculations locally; saved settings, positions and drafts remain in the browser's local storage. Clearing browser storage can remove them, so export a JSON backup when needed.

## Validation and limitations

The TypeScript pricing engine has Vitest checks for parity identities, limiting cases, delta/strike and CIP round trips, numerical Greeks and reference values. The in-app engine check runs a subset in the browser. These tests help catch implementation errors; passing them does not prove every input, market convention or model assumption is correct.

The project is for education and independent checks, not investment advice or a substitute for a trading system. Model and convention limitations, including constant volatility, payout conventions and the clock's daylight-saving assumptions, are documented in [ARCHITECTURE.md](ARCHITECTURE.md) (Chinese).

## Development

The stack is Vite, React, TypeScript, Tailwind CSS and Vitest. Pricing functions live in `src/lib`; UI tools live in `src`. Add numerical tests when changing formulas, and check the shared currency conventions in `src/lib/conventions.ts`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the engine layers and extension guide, and [CHANGELOG.md](CHANGELOG.md) for project history.

## License

[MIT](LICENSE).
