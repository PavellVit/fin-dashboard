import type { InstrumentRow } from './protocol';

export const FIELDS = 7; // same batch layout as assembly/index.ts

// One update in the shape of the task's example JSON
export interface MarketUpdate {
  instrument: number;
  priceCents: number;
  tradeQuantity: number;
  bidCents: number;
  askCents: number;
  bidQuantity: number;
  askQuantity: number;
}

// Per-instrument accumulator: O(1) memory, no event history
export interface Acc {
  last: number | null;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  sumQty: number;
  sumPriceQty: number; // exact in a JS number up to 2^53
}

export const createAcc = (): Acc => ({
  last: null,
  bid: 0,
  ask: 0,
  bidQty: 0,
  askQty: 0,
  sumQty: 0,
  sumPriceQty: 0,
});

export const createAccs = (n: number): Acc[] => Array.from({ length: n }, createAcc);

// Every trade counts exactly once; book quantities never count as volume
export function applyUpdate(a: Acc, u: MarketUpdate): void {
  a.last = u.priceCents;
  a.bid = u.bidCents;
  a.ask = u.askCents;
  a.bidQty = u.bidQuantity;
  a.askQty = u.askQuantity;
  a.sumQty += u.tradeQuantity;
  a.sumPriceQty += u.priceCents * u.tradeQuantity;
}

export function applyBatch(accs: Acc[], v: Int32Array, n: number): void {
  for (let k = 0; k < n * FIELDS; k += FIELDS) {
    applyUpdate(accs[v[k]], {
      instrument: v[k],
      priceCents: v[k + 1],
      tradeQuantity: v[k + 2],
      bidCents: v[k + 3],
      askCents: v[k + 4],
      bidQuantity: v[k + 5],
      askQuantity: v[k + 6],
    });
  }
}

export const spreadCents = (a: Acc): number | null => (a.last === null ? null : a.ask - a.bid);

// Not rounded here: rounding happens only for display
export const vwapCents = (a: Acc): number | null =>
  a.sumQty === 0 ? null : a.sumPriceQty / a.sumQty;

export const imbalance = (a: Acc): number | null => {
  const book = a.bidQty + a.askQty;
  return book === 0 ? null : (a.bidQty - a.askQty) / book;
};

export const toRow = (symbol: string, a: Acc): InstrumentRow => ({
  symbol,
  lastPriceCents: a.last,
  spreadCents: spreadCents(a),
  volume: a.sumQty,
  vwapCents: vwapCents(a),
  imbalance: imbalance(a),
});

export const toRows = (symbols: readonly string[], accs: Acc[]): InstrumentRow[] =>
  accs.map((a, i) => toRow(symbols[i], a));

export const emptyRow = (symbol: string): InstrumentRow => toRow(symbol, createAcc());
