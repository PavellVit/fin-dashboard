import {
  FIELDS,
  applyBatch,
  createAcc,
  createAccs,
  emptyRow,
  imbalance,
  toRow,
  vwapCents,
} from './metrics';

// Fixtures use the Wasm batch layout: 7 numbers per update
// [instrument, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity]
const batch = (...updates: number[][]) => Int32Array.from(updates.flat());
const run = (count: number, v: Int32Array) => {
  const accs = createAccs(count);
  applyBatch(accs, v, v.length / FIELDS);
  return accs;
};

describe('metrics', () => {
  it('worked example: 10 @ $100 + 30 @ $102, bid $101.96 / ask $102, qty 600 / 400', () => {
    const [a] = run(
      1,
      batch([0, 10000, 10, 9996, 10000, 500, 500], [0, 10200, 30, 10196, 10200, 600, 400]),
    );
    expect(a).toMatchObject({ sumPriceQty: 406000, sumQty: 40 });
    const r = toRow('ALFA', a);
    expect(r.lastPriceCents).toBe(10200); // $102
    expect(r.volume).toBe(40);
    expect(r.vwapCents).toBe(10150); // 406000 / 40 = $101.50
    expect(r.spreadCents).toBe(4); // $0.04
    expect(r.imbalance).toBeCloseTo(0.2);
  });

  it('before any data: unavailable values and zero volume', () => {
    expect(emptyRow('ALFA')).toEqual({
      symbol: 'ALFA',
      lastPriceCents: null,
      spreadCents: null,
      volume: 0,
      vwapCents: null,
      imbalance: null,
    });
    expect(vwapCents(createAcc())).toBeNull();
  });

  it('zero book: imbalance unavailable, other metrics present', () => {
    const [a] = run(1, batch([0, 10000, 1, 9999, 10000, 0, 0]));
    expect(imbalance(a)).toBeNull();
    expect(toRow('ALFA', a)).toMatchObject({ volume: 1, vwapCents: 10000, spreadCents: 1 });
  });

  it('imbalance bounds: -1 and +1', () => {
    expect(toRow('A', run(1, batch([0, 10000, 1, 9999, 10000, 0, 400]))[0]).imbalance).toBe(-1);
    expect(toRow('A', run(1, batch([0, 10000, 1, 9999, 10000, 600, 0]))[0]).imbalance).toBe(1);
  });

  it('isolation: instruments do not mix', () => {
    const [a, b] = run(
      2,
      batch([0, 10000, 10, 9996, 10000, 1, 1], [1, 10200, 30, 10196, 10200, 1, 1]),
    );
    expect(toRow('A', a)).toMatchObject({ volume: 10, vwapCents: 10000 });
    expect(toRow('B', b)).toMatchObject({ volume: 30, vwapCents: 10200 });
  });

  it('duplicate instrument within a batch: every trade counted once', () => {
    const [a, b] = run(
      2,
      batch(
        [0, 10000, 10, 9996, 10000, 1, 1],
        [1, 5000, 5, 4999, 5000, 1, 1],
        [0, 10200, 30, 10196, 10200, 600, 400],
      ),
    );
    expect(toRow('A', a)).toMatchObject({
      lastPriceCents: 10200,
      volume: 40,
      vwapCents: 10150,
      spreadCents: 4,
    });
    expect(toRow('B', b)).toMatchObject({ volume: 5, vwapCents: 5000 });
  });

  it('book quantities do not contribute to volume', () => {
    expect(toRow('A', run(1, batch([0, 10000, 10, 9996, 10000, 600, 400]))[0]).volume).toBe(10);
  });

  it('keeps exact sums and rounds only for display: 7 @ $100.01 + 11 @ $100.03', () => {
    const [a] = run(
      1,
      batch([0, 10001, 7, 10000, 10001, 1, 1], [0, 10003, 11, 10002, 10003, 1, 1]),
    );
    expect(a).toMatchObject({ sumPriceQty: 180040, sumQty: 18 });
    expect(toRow('A', a).vwapCents).toBeCloseTo(10002.2222, 3); // displayed as $100.02
  });
});
