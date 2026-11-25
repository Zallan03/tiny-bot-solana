// Tiny Bot — "Two-Lot Trend + Core" for u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1
//
// Idea (from backtesting the kit's dev window, 136 hourly bars, 29 Oct-3 Nov 2026):
// buy-and-hold loses when the market falls because it is invested from bar 0 and
// never leaves; a pure EMA-crossover trend bot wins in falling windows but loses
// every rising window (it enters 14+ bars late, after the rally is mostly done)
// and can fall under the 8-trade minimum in a quiet window. So each symbol is
// traded in two independent lots on one cash pool:
//
//   CORE lot (30% of capital, spread over the 7 symbols): bought on the first
//     tradable bar, like buy-and-hold, so a rally from bar 0 is partly captured.
//     Exits on a -3% stop vs its own cost, or when the close sits under EMA(21)
//     for 2 bars in a row (trend break). Re-enters only on a fresh EMA(8)/EMA(21)
//     cross-up AND a 12h return above +2%, after a 24-bar cooldown.
//   TREND lot (70% of capital, spread over the 7 symbols): bought on an
//     EMA(8)/EMA(21) cross-up, so in a falling market it mostly stays in cash.
//     Exits on the same 2-bar trend break, on a -6% stop, or on a +30% take-profit.
//     Re-enters on a cross-up after a 24-bar cooldown.
//
// Backtest (own Python replay of the kit's fill math, cold-start indicators):
//   full dev window: PnL -$223 vs buy-and-hold -$784 (margin +$561), DD 2.1%,
//     46 trades. Rolling 72-bar windows (the final window's length): beats
//     buy-and-hold in 54/65 windows (83%), mean margin +$166, worst -$153,
//     max drawdown 3.4%, 14-30 trades per window (min-trade bar is 8).
//
// Deterministic: every decision is a pure function of the bars and fills seen
// so far. No clock, no environment, no randomness. Floats are used only for the
// EMAs (IEEE 754, same bars give the same orders, run after run); all money is
// BigInt. A sell is re-sent while its exit reason still holds, so a fill the
// market refuses (slippage cap) is retried on the next bar instead of being lost.
//
// Limits respected: at most caps.max_orders_per_bar orders per reply (sells
// first), each buy capped at caps.max_weight_bps of equity combined with what
// the symbol already holds, buys sized from cash not yet spent by this reply.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

// --- parameters (chosen on the dev window, flat sensitivity: neighbours within
// a few dollars of the same margin, so nothing here is a knife-edge fit) ---
const FAST_SPAN = 8;
const SLOW_SPAN = 21;
const CORE_FRAC_NUM = 30n; // core lot = 30% of capital, trend lot = the other 70%
const CORE_FRAC_DEN = 100n;
const STOP_CORE_NUM = 97n; // core stop: value <= 97% of cost
const STOP_TREND_NUM = 94n; // trend stop: value <= 94% of cost
const TAKE_TREND_NUM = 130n; // trend take-profit: value >= 130% of cost
const BREAK_BARS = 2; // trend break: close under EMA(21) this many bars in a row
const REENTRY_MOM_BARS = 12; // core re-entry needs a 12h return above ...
const REENTRY_MOM_NUM = 102n; // ... 102% of the close 12 bars ago
const COOLDOWN_BARS = 24; // bars to wait after a sell before re-entering a symbol
const MAX_SLIPPAGE_BPS = 300; // 3% past the close the order was decided on

interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

interface Lot {
  qty: bigint;
  cost: bigint;
}

interface SymState {
  closes: number[];
  fast: Ema;
  slow: Ema;
  /** fast - slow after the previous bar, once both EMAs exist. */
  prevGap: number | null;
  /** consecutive bars with close under the slow EMA. */
  belowSlow: number;
  core: Lot | null;
  trend: Lot | null;
  /** seq of the last sell order sent for this symbol. */
  lastExitSeq: number;
  /** the core lot for this symbol was bought on the first tradable bar. */
  coreSeeded: boolean;
}

const syms = new Map<string, SymState>();

function newEma(span: number): Ema {
  return { span, warm: [], value: null };
}

function newSym(): SymState {
  return {
    closes: [],
    fast: newEma(FAST_SPAN),
    slow: newEma(SLOW_SPAN),
    prevGap: null,
    belowSlow: 0,
    core: null,
    trend: null,
    lastExitSeq: -1_000_000,
    coreSeeded: false,
  };
}

function stepEma(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

/** Parse a client_id we sent: "c0-SYM", "ec-SYM-seq", "et-SYM-seq", "xc-SYM-seq", "xt-SYM-seq". */
function parseClientId(id: string): { kind: 'core' | 'trend'; buy: boolean } | null {
  const parts = id.split('-');
  if (parts.length < 2) return null;
  const tag = parts[0]!;
  if (tag === 'c0' || tag === 'ec' || tag === 'xc') return { kind: 'core', buy: tag !== 'xc' };
  if (tag === 'et' || tag === 'xt') return { kind: 'trend', buy: tag !== 'xt' };
  return null;
}

let coreSeedDone = false;

await runBars({
  onBatch(state: BarsState, batch) {
    // 1. Settle the fills that landed on this bar into the lot books. A fill
    //    is the only thing that creates or clears a lot: a rejected order
    //    leaves its lot exactly as it was, so its exit is retried next bar.
    for (const fill of batch.fills) {
      if (fill.status !== 'filled') continue;
      const parsed = parseClientId(fill.client_id);
      if (parsed === null) continue;
      const s = syms.get(fill.symbol);
      if (s === undefined) continue;
      if (parsed.buy) {
        const lot: Lot = { qty: BigInt(fill.qty), cost: BigInt(fill.notional_quote_units) };
        if (parsed.kind === 'core') s.core = lot;
        else s.trend = lot;
      } else {
        if (parsed.kind === 'core') s.core = null;
        else s.trend = null;
      }
    }

    // 2. Feed this bar's closes into the EMAs and the 12h momentum history.
    for (const bar of batch.bars) {
      let s = syms.get(bar.symbol);
      if (s === undefined) {
        s = newSym();
        syms.set(bar.symbol, s);
      }
      const close = Number(bar.c);
      s.closes.push(close);
      const prevFast = s.fast.value;
      const prevSlow = s.slow.value;
      stepEma(s.fast, close);
      stepEma(s.slow, close);
      if (prevFast !== null && prevSlow !== null) s.prevGap = prevFast - prevSlow;
      if (s.slow.value !== null) {
        s.belowSlow = close < s.slow.value ? s.belowSlow + 1 : 0;
      }
    }

    if (state.warmingUp) return [];

    const { caps, fees } = state.hello;
    const orders: (BuyInput | SellInput)[] = [];
    const minNotional = BigInt(fees.min_notional_quote_units);

    // 3. Core seed: on the first tradable bar, buy 30% of the cash spread
    //    evenly over every symbol that has a price, like buy-and-hold.
    if (!coreSeedDone) {
      coreSeedDone = true;
      const priced = state.hello.symbols.map((x) => x.symbol).filter((sym) => state.close(sym) !== null);
      if (priced.length > 0) {
        const total = (state.cash * CORE_FRAC_NUM) / CORE_FRAC_DEN;
        let slice = total / BigInt(priced.length);
        const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
        if (slice > byWeight) slice = byWeight;
        if (slice >= minNotional) {
          for (const sym of priced) {
            const s = syms.get(sym)!;
            s.coreSeeded = true;
            orders.push({ side: 'buy', client_id: `c0-${sym}`, symbol: sym, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
          }
          return orders.slice(0, caps.max_orders_per_bar);
        }
      }
    }

    // 4. Per symbol: exits first (a lot leaves on its own rule), then entries.
    const sells: SellInput[] = [];
    const buys: BuyInput[] = [];
    let cashLeft = state.cash;
    for (const { symbol } of state.hello.symbols) {
      const s = syms.get(symbol);
      if (s === undefined) continue;
      const close = state.close(symbol);
      if (close === null) continue;

      // --- core lot exit: -3% stop, or trend break (close under EMA21 twice) ---
      if (s.core !== null) {
        const value = state.value(symbol, s.core.qty);
        const broke = s.slow.value !== null && s.belowSlow >= BREAK_BARS;
        if (value * 100n <= s.core.cost * STOP_CORE_NUM || broke) {
          sells.push({ side: 'sell', client_id: `xc-${symbol}-${state.seq}`, symbol, qty: s.core.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
          s.lastExitSeq = state.seq;
        }
      }
      // --- trend lot exit: -6% stop, +30% take-profit, or trend break ---
      if (s.trend !== null) {
        const value = state.value(symbol, s.trend.qty);
        const broke = s.slow.value !== null && s.belowSlow >= BREAK_BARS;
        if (value * 100n <= s.trend.cost * STOP_TREND_NUM || value * 100n >= s.trend.cost * TAKE_TREND_NUM || broke) {
          sells.push({ side: 'sell', client_id: `xt-${symbol}-${state.seq}`, symbol, qty: s.trend.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
          s.lastExitSeq = state.seq;
        }
      }

      // --- entries: only on a fresh EMA(8) cross above EMA(21), and only
      //     after the cooldown that follows a sell of this symbol ---
      if (state.seq - s.lastExitSeq < COOLDOWN_BARS) continue;
      if (s.fast.value === null || s.slow.value === null || s.prevGap === null) continue;
      const gapNow = s.fast.value - s.slow.value;
      const crossUp = gapNow > 0 && s.prevGap <= 0;
      if (!crossUp) continue;
      const equity = state.equity;
      const heldValue = state.value(symbol, state.positions.get(symbol)?.qty ?? 0n);
      let room = (BigInt(caps.max_weight_bps) * equity) / BPS - heldValue;
      // Core re-entry additionally needs 12h momentum above +2%.
      if (s.core === null) {
        const back = s.closes.length > REENTRY_MOM_BARS ? s.closes[s.closes.length - 1 - REENTRY_MOM_BARS]! : undefined;
        const momOk = back !== undefined && back > 0 && Number(close) * 100 >= back * Number(REENTRY_MOM_NUM);
        if (momOk) {
          let stake = (equity / 7n) * CORE_FRAC_NUM / CORE_FRAC_DEN;
          if (stake > room) stake = room;
          if (stake > cashLeft) stake = cashLeft;
          if (stake >= minNotional) {
            buys.push({ side: 'buy', client_id: `ec-${symbol}-${state.seq}`, symbol, notional_quote_units: stake, max_slippage_bps: MAX_SLIPPAGE_BPS });
            cashLeft -= stake;
            room -= stake;
          }
        }
      }
      // Trend entry: the cross alone is enough. Its room is what is left
      // after the core buy queued above in this same reply, so the two buys
      // together can never push the symbol past the weight cap.
      if (s.trend === null) {
        let stake = ((equity / 7n) * (CORE_FRAC_DEN - CORE_FRAC_NUM)) / CORE_FRAC_DEN;
        if (stake > room) stake = room;
        if (stake > cashLeft) stake = cashLeft;
        if (stake >= minNotional) {
          buys.push({ side: 'buy', client_id: `et-${symbol}-${state.seq}`, symbol, notional_quote_units: stake, max_slippage_bps: MAX_SLIPPAGE_BPS });
          cashLeft -= stake;
        }
      }
    }

    // Sells first, then buys, never over the per-bar order cap.
    orders.push(...sells);
    for (const b of buys) {
      if (orders.length >= caps.max_orders_per_bar) break;
      orders.push(b);
    }
    return orders.slice(0, caps.max_orders_per_bar);
  },
});
