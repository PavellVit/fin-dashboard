import { readFileSync } from 'node:fs';
import { type GeneratorExports, instantiateGenerator, readBatch } from './wasm-loader';

// The deployed release artifact; `npm test` / `npm run test:ci` build it first
const bytes = () => readFileSync('public/producer.wasm');
const load = () => instantiateGenerator(bytes());

// [instrumentIndex, priceCents, tradeQuantity, bidCents, askCents, bidQuantity, askQuantity]
type Row = [number, number, number, number, number, number, number];

const generate = (g: GeneratorExports, count: number): Row[] => {
  const n = g.generateBatch(count);
  const v = readBatch(g, n);
  const f = g.getFieldCount();
  return Array.from({ length: n }, (_, k) => Array.from(v.subarray(k * f, (k + 1) * f)) as Row);
};

const isValid = ([idx, price, qty, bid, ask, bidQty, askQty]: Row, instruments: number) =>
  idx >= 0 &&
  idx < instruments &&
  bid > 0 &&
  bid < ask &&
  ask - bid <= 10 &&
  (price === bid || price === ask) &&
  qty >= 1 &&
  bidQty >= 0 &&
  askQty >= 0;

describe('wasm generator (compiled public/producer.wasm)', () => {
  let g: GeneratorExports;

  beforeEach(async () => {
    g = await load();
    g.init(5, 42);
  });

  it('imports only env.abort and exports the generator API', async () => {
    const mod = await WebAssembly.compile(bytes());
    expect(WebAssembly.Module.imports(mod)).toEqual([
      { module: 'env', name: 'abort', kind: 'function' },
    ]);
    expect(
      WebAssembly.Module.exports(mod)
        .map((e) => e.name)
        .sort(),
    ).toEqual([
      'generateBatch',
      'getBatchCapacity',
      'getBatchPointer',
      'getFieldCount',
      'getMidCents',
      'init',
      'memory',
    ]);
  });

  it('returns exactly the requested batch size and clamps it to 0..capacity', () => {
    expect(g.generateBatch(1)).toBe(1);
    expect(g.generateBatch(100)).toBe(100);
    expect(g.generateBatch(1000)).toBe(1000);
    expect(g.generateBatch(5000)).toBe(g.getBatchCapacity());
    expect(g.generateBatch(0)).toBe(0);
    expect(g.generateBatch(-1)).toBe(0);
  });

  it('generates only valid updates (10 000 updates)', () => {
    const updates = Array.from({ length: 10 }, () => generate(g, 1000)).flat();
    expect(updates).toHaveLength(10_000);
    expect(updates.filter((row) => !isValid(row, 5)).slice(0, 3)).toEqual([]); // first 3 bad rows, if any
  });

  it('evolves a price from its previous value by at most 25 cents', () => {
    g.init(1, 7);
    let prev = g.getMidCents(0);
    for (let i = 0; i < 200; i++) {
      const [[, , , bid, ask]] = generate(g, 1);
      const mid = g.getMidCents(0);
      expect(Math.abs(mid - prev)).toBeLessThanOrEqual(25);
      expect(bid).toBeLessThan(mid);
      expect(ask).toBeGreaterThan(mid);
      prev = mid;
    }
  });

  it('leaves other instruments untouched by an update', () => {
    g.init(3, 7);
    const before = [0, 1, 2].map((i) => g.getMidCents(i));
    const [[touched]] = generate(g, 1);
    for (const i of [0, 1, 2].filter((j) => j !== touched)) {
      expect(g.getMidCents(i)).toBe(before[i]);
    }
  });

  it('is deterministic for the same seed and differs for another seed', async () => {
    const run = async (seed: number) => {
      const x = await load();
      x.init(5, seed);
      return generate(x, 100);
    };
    expect(await run(42)).toEqual(await run(42));
    expect(await run(42)).not.toEqual(await run(43));
  });

  it('init resets the state and clamps the instrument count to 1..50', async () => {
    g.generateBatch(1000);
    g.init(5, 42);
    const fresh = await load();
    fresh.init(5, 42);
    expect(generate(g, 50)).toEqual(generate(fresh, 50));

    g.init(0, 1);
    expect(generate(g, 100).every(([idx]) => idx === 0)).toBe(true);

    g.init(99, 1);
    expect(Math.max(...generate(g, 1000).map(([idx]) => idx))).toBe(49);
  });

  it('lets an instrument appear more than once in a batch', () => {
    g.init(3, 1);
    const counts = [0, 0, 0];
    for (const [idx] of generate(g, 1000)) counts[idx]++;
    expect(counts.every((c) => c > 1)).toBe(true);
  });

  // Seeds picked so that one instrument reaches the bound within 1 000 000 updates
  it.each([
    { seed: 11, bound: 'floor', cents: 100 },
    { seed: 19, bound: 'ceiling', cents: 100_000 },
  ])('clamps the price at the $bound (seed $seed, 1 000 000 updates)', ({ seed, cents }) => {
    g.init(1, seed);
    let lo = Infinity;
    let hi = -Infinity;
    for (let b = 0; b < 1000; b++) {
      g.generateBatch(1000);
      const mid = g.getMidCents(0);
      lo = Math.min(lo, mid);
      hi = Math.max(hi, mid);
    }
    expect(lo).toBeGreaterThanOrEqual(100);
    expect(hi).toBeLessThanOrEqual(100_000);
    expect([lo, hi]).toContain(cents);
  });
});
