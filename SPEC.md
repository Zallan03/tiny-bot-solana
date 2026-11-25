# SPEC — Tiny Bot: Two-Lot Trend + Core

Bounty: **Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana** (`u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1`)
— $2 pot (1st $1 / 2nd $0.60 / 3rd $0.40), closes 27 Nov 2026 00:00 UTC (07:00 WIB).
Harness: `agent-fun/bars-replay/v1`, hourly bars, 7 symbols (FARTCOIN, JITOSOL,
POPCAT, RAY, SOL, WETH, WIF), $10,000 USDC, long only, no leverage, no shorts.
Final window: 3 whole UTC days (72 bars) collected after the deadline — it does
not exist yet, so the strategy must be general, not fitted to old data.
Gates: ≥ 8 trades, max drawdown ≤ 25%, two runs byte-identical action logs.
Prize only if Net PnL beats the buy-and-hold baseline on the final window.

## Strategy: two lots per symbol, one cash pool

Each symbol is traded in two independent lots, tracked from exact fills:

**Core lot — 30% of capital.** Bought on the first tradable bar, spread evenly
over all 7 symbols, like buy-and-hold. Purpose: capture a rally that starts at
bar 0 (a pure trend bot enters 14+ bars late and loses every rising window).
Exits on a **−3% stop** vs its own fill cost, or when the close sits under
EMA(21) for **2 bars in a row** (trend break). Re-enters only on a fresh
EMA(8)/EMA(21) cross-up **and** a 12h return above +2%, after a 24-bar cooldown.

**Trend lot — 70% of capital.** Bought on an EMA(8)/EMA(21) cross-up. Purpose:
in a falling market it mostly stays in cash, so drawdowns stay small. Exits on
the same 2-bar trend break, on a **−6% stop**, or on a **+30% take-profit**.
Re-enters on a cross-up after a 24-bar cooldown.

**Sizing:** each lot is equity/7 × its fraction (core 30% / trend 70%), capped
at 25% of equity combined per symbol (the harness `max_weight_bps`), floored at
the $1 minimum notional. Sells are sent first each bar; buys draw only from
cash not yet spent by the same reply (a sell's proceeds never fund a buy of the
same reply). Max slippage 300 bps per order. A rejected fill leaves its lot
untouched, so the exit is re-sent while its reason still holds.

**Determinism:** every decision is a pure function of the bars and fills seen
so far. No clock, no environment, no randomness. Money is BigInt; floats are
used only for the EMAs (IEEE 754 — same bars, same orders). EMAs are seeded as
the mean of their first span of closes inside the window (there is no warm-up
in this competition — verified with a probe bot through `grade-local`).

## Why it beats buy-and-hold

Buy-and-hold is fully invested from bar 0 and never leaves: in a falling window
it takes the whole decline. This bot keeps the same bar-0 exposure at 30%
weight, but cuts each core lot at −3% / trend break, and only adds the other
70% once an uptrend is confirmed. In a rising window the core lots track the
rally from bar 0 and the trend lots join as crosses confirm, so it stays close
to buy-and-hold; in a falling window it is mostly in cash while buy-and-hold
bleeds. Pure trend-following was tested and rejected: it loses all 9 rising
rolling windows and can fall to 2 trades in a quiet window (below the 8-trade
bar); the two-lot design fixes both.

## Backtest (own Python replay of the kit's fill math, cold-start indicators)

Dev window, 136 bars, 29 Oct–3 Nov 2026:

| Entry | Net PnL | Return | Max DD | Trades |
|---|---|---|---|---|
| buy-and-hold (house baseline) | −$869.34 | −8.69% | 10.9% | 7 |
| EMA-cross 8/21 (house baseline) | −$173.04 | −1.73% | 2.5% | 28 |
| macd-cci (house baseline) | −$20.22 | −0.20% | 2.5% | 17 |
| **two-lot (this entry)** | **−$222.95** | **−2.23%** | **2.1%** | **46** |

Rolling 72-bar windows (the final window's length, 65 windows of the dev data),
two-lot vs buy-and-hold per window: **beats buy-and-hold in 54/65 (83%)**,
mean margin **+$165.57**, median +$178.88, worst −$153.08; max drawdown 3.4%;
**14–30 trades per window** (minimum bar is 8). Split by regime: in the 56
windows where buy-and-hold loses, this wins 53 (mean margin +$203); in the 9
windows where buy-and-hold wins, this wins 1 (mean margin −$70) — the residual
cost of entering a rally late, cut to 30% of capital by the core lots.

Parameter sensitivity is flat (core 20–40%, cooldown 6–24 bars, stops 2–4%,
EMA 8/21 vs 10/26 all land within a few dollars of the same mean margin), so
nothing is a knife-edge fit to the dev window.

## Verification (kit grader, `grade-local --driver process`)

- v1: Net PnL **−$226.92** (backtest −$222.95 — $3.97 apart, from fill-price
  detail), return −2.27%, max DD 2.27%, **46 trades, 0 rejected**, fees $38.44.
  Margin over buy-and-hold on dev: **+$642.42**. 90% bootstrap interval
  [−$296.24, −$168.59] — entirely above buy-and-hold's −$869.34.
  At 2× fees: −$265.11, still far above buy-and-hold.
- v2 (weight-room accounting fix: a trend buy in the same reply now sees the
  room left after the core buy queued just before it): **identical action log**
  to v1 (`1302d1a5f3d4e60b593e5a208a16732eca512490286e61a3a101b9b11f9c7675`),
  same PnL −$226.92 — the fix changes no dev-window trade, it only closes a
  cap edge case. The grader executes the bot twice and records one action log,
  so determinism is verified by the grader itself.
- Eligibility: `ranked: true`; `prize_eligible: false` only for
  `no_transcripts` / `cost_unpriced` — transcripts are bundled at submit time
  (parent's step), not part of this build.

## Risks (honest)

- The final window does not exist yet. If it is a strong, smooth rally, this
  bot likely trails buy-and-hold (expected margin ≈ −$70 on the dev window's
  rising slices) and wins nothing — that is the known, accepted cost of the
  trend filter. If it is flat or falling (56/65 dev slices), it beats
  buy-and-hold by ~$200 on average.
- A sharp V-shaped crash-and-recovery inside one day could stop the core lots
  out at −3% and keep them out for the 24-bar cooldown while prices recover.
- Per-symbol PnL on dev is negative for all 7 symbols (worst FARTCOIN −$63.86
  on 10 trades); the edge is relative (losing less than buy-and-hold), not
  absolute profit, because the dev window itself fell ~8%.
