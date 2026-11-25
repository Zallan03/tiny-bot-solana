# PROMPT — Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana

Coordinator brief for the make.fun bounty
`u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1` ($2, top 3: $1 / $0.60 / $0.40,
closes 27 Nov 2026 07:00 WIB). Account @riyan3w, GitHub Zallan03, payout wallet
7foH5CZanbguGKSg7q9tzBNpU2F9aQEDUrmohg1jctC1. Do NOT use Wonder. Do NOT read
any old entry code before writing (thinking_reproduces fails if read first).

Kit: `~/workspace/goals/make-fun-bounty-entries/hidden_files/watch-20261125-1728/kits-1728/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/`
— read RULES.txt, competition.yaml, harness, baselines, dataset, protocol.schema.json, sdk.

Rules (verified in RULES.txt): harness agent-fun/bars-replay/v1, sandbox with no
network, entry executed twice and the two action logs must be IDENTICAL
byte-for-byte (deterministic — no Date.now / random / time-based seed). Final
window: 3 full UTC days of hourly bars (FARTCOIN, JITOSOL, POPCAT, RAY, SOL,
WETH, WIF), collected AFTER the deadline — so the strategy must be general, not
overfit to old data. Minimum: at least 8 trades, max drawdown ≤ 25%. Prize ONLY
if Net PnL is above the buy-and-hold baseline; ranking by highest Net PnL.

Work: study the kit (bar format, SDK/harness API, how a program reads bars and
emits actions, what the house baselines do). Design a simple, robust strategy
that in principle beats buy-and-hold over 3 days (trend-following / momentum
with stops, or mean-reversion with a guard) — pick by backtesting on the kit
dataset if it provides historical bars. Do NOT overfit: few parameters, clear
logic. Write main.ts v1 FROM SCRATCH, then REVISE it into v2 in a separate turn.
Verify locally: run the kit's local grader if available; check determinism
(2 runs = identical log), trades ≥ 8, drawdown ≤ 25% on dev data. Write SPEC.md
(strategy, parameters, dev backtest results, why it beats buy-and-hold, risks)
+ PROMPT.md. Build dir:
`~/workspace/goals/make-fun-bounty-entries/hidden_files/watch-20261125-1728/build-1728/tiny-bot-solana/`
with main.ts final + SPEC.md + PROMPT.md + README.md (3 live make.fun badges +
bounty link) + package.json + .gitignore + LICENSE (MIT) + .makefun/owner.json
{"wallet": "7foH5CZanbguGKSg7q9tzBNpU2F9aQEDUrmohg1jctC1"}. Do NOT create the
GitHub repo, do NOT bundle, do NOT submit — that is the parent's job. Report
when done: strategy summary + dev backtest results + file paths + verification
results. If the kit cannot run locally or the strategy cannot beat the baseline
in backtest, report that honestly with evidence — do not claim completion that
has not happened.
