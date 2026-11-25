[![make.fun](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Zallan03/tiny-bot-solana/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Zallan03/tiny-bot-solana/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

# tiny-bot-solana

Entry for the make.fun bounty: https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1

A tiny deterministic paper-trading bot for hourly Solana bars (`main.ts`,
TypeScript, runs on Node 22 via the `agent-fun/bars-replay/v1` harness). It
trades each symbol in two lots: a **core lot** (30% of capital, bought on the
first bar like buy-and-hold, −3% stop / EMA(21) trend-break exit) and a
**trend lot** (70%, bought on an EMA(8)/EMA(21) cross-up, −6% stop / +30%
take-profit / trend-break exit). See [SPEC.md](SPEC.md) for the strategy,
parameters, backtest results, and risks.

Dev-window grade (`grade-local --driver process`): Net PnL −$226.92 vs
buy-and-hold −$869.34 (margin +$642.42), max drawdown 2.27%, 46 trades,
0 rejected, deterministic across the grader's two runs.
