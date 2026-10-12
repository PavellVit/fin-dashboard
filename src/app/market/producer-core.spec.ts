import { FLUSH_MS, ProducerCore } from './producer-core';
import type { FromWorker } from './protocol';
import type { GeneratorExports } from './wasm-loader';

const FIELDS = 7;

// Every update is the same trade: instrument 0, 1 unit at $100.00, bid $99.99 / ask $100.00, book 1 / 1
function fakeGenerator(): GeneratorExports {
  const buffer = new ArrayBuffer(1000 * FIELDS * 4);
  return {
    memory: { buffer } as WebAssembly.Memory,
    init: vi.fn(),
    getBatchPointer: () => 0,
    getBatchCapacity: () => 1000,
    getFieldCount: () => FIELDS,
    getMidCents: () => 10000,
    generateBatch(n) {
      const v = new Int32Array(buffer, 0, n * FIELDS);
      for (let k = 0; k < n; k++) v.set([0, 10000, 1, 9999, 10000, 1, 1], k * FIELDS);
      return n;
    },
  };
}

// A load() that the test resolves or rejects by hand
function manualLoads() {
  const calls: { resolve: (g: GeneratorExports) => void; reject: (e: Error) => void }[] = [];
  const load = () =>
    new Promise<GeneratorExports>((resolve, reject) => calls.push({ resolve, reject }));
  return { calls, load };
}

const SETTINGS = { instrumentCount: 2, updatesPerBatch: 7, batchIntervalMs: 500 };
const START = { type: 'start' as const, runId: 3, settings: SETTINGS, wasmUrl: 'x.wasm', seed: 42 };
type Snapshot = Extract<FromWorker, { type: 'snapshot' }>;

describe('ProducerCore', () => {
  let sent: FromWorker[];
  const create = (load: () => Promise<GeneratorExports> = async () => fakeGenerator()) =>
    new ProducerCore((m) => sent.push(m), load);
  const snapshots = () => sent.filter((m): m is Snapshot => m.type === 'snapshot');
  const last = () => snapshots().at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
  });

  afterEach(() => vi.useRealTimers());

  it('start: an empty running snapshot at once, then one batch per interval, flushed within FLUSH_MS', async () => {
    const p = create();
    await p.handle(START);
    expect(last()).toMatchObject({
      runId: 3,
      status: { state: 'running', batches: 0, updates: 0 },
    });
    expect(last().rows.map((r) => r.symbol)).toEqual(['ALFA', 'BETA']);
    expect(last().rows[0]).toMatchObject({ volume: 0, vwapCents: null, lastPriceCents: null });

    vi.advanceTimersByTime(500); // the first batch runs at 500 but is not published yet
    expect(snapshots()).toHaveLength(1);

    vi.advanceTimersByTime(FLUSH_MS);
    expect(last().status).toMatchObject({ batches: 1, updates: 7 });
    expect(last().rows[0]).toMatchObject({
      volume: 7,
      vwapCents: 10000,
      lastPriceCents: 10000,
      spreadCents: 1,
    });
  });

  it('several batches between two snapshots all count: the UI is throttled, aggregation is not', async () => {
    const p = create();
    await p.handle({ ...START, settings: { ...SETTINGS, batchIntervalMs: 30 } });
    vi.advanceTimersByTime(30 + FLUSH_MS); // batches every 30 ms; one flush FLUSH_MS after the first
    expect(snapshots()).toHaveLength(2);
    const { batches, updates } = last().status;
    expect(batches).toBeGreaterThan(1);
    expect(updates).toBe(batches * 7);
    expect(last().rows[0].volume).toBe(updates); // no trade lost between snapshots
  });

  it('pause publishes at once and stops generation; resume does not catch up', async () => {
    const p = create();
    await p.handle(START);
    vi.advanceTimersByTime(1000); // batches at 500 and 1000
    await p.handle({ type: 'pause', runId: 3 });
    expect(last().status).toMatchObject({ state: 'paused', batches: 2 });
    expect(last().rows[0].volume).toBe(14);

    const n = sent.length;
    vi.advanceTimersByTime(60_000);
    expect(sent).toHaveLength(n); // neither batches nor snapshots while paused

    await p.handle({ type: 'resume', runId: 3 });
    expect(last().status).toMatchObject({ state: 'running', batches: 2 });
    vi.advanceTimersByTime(500 + FLUSH_MS);
    expect(last().status.batches).toBe(3); // exactly one more, not 120
  });

  it('a second start stops the previous loop and uses its own interval', async () => {
    const p = create();
    const run4 = () => snapshots().filter((s) => s.runId === 4);
    await p.handle(START);
    vi.advanceTimersByTime(1050); // run 3: batches at 500 and 1000; its flush (1100) and tick (1500) are pending
    await p.handle({ ...START, runId: 4, settings: { ...SETTINGS, batchIntervalMs: 2000 } });
    expect(last()).toMatchObject({ runId: 4, status: { state: 'running', batches: 0 } });

    vi.advanceTimersByTime(1999); // run 3's pending timers must not fire
    expect(run4()).toHaveLength(1);

    vi.advanceTimersByTime(1 + FLUSH_MS); // run 4's first batch at 1050 + 2000
    expect(last()).toMatchObject({ runId: 4, status: { batches: 1, updates: 7 } });
    expect(run4()).toHaveLength(2);
  });

  it("the previous run's pending timers stay silent while a new start loads", async () => {
    const { calls, load } = manualLoads();
    const p = create(load);
    const first = p.handle(START);
    calls[0].resolve(fakeGenerator());
    await first;
    vi.advanceTimersByTime(1050); // run 3: its flush (1100) and tick (1500) are pending
    const n = sent.length;

    const second = p.handle({ ...START, runId: 4 });
    vi.advanceTimersByTime(5000); // the new generator is still loading
    expect(sent).toHaveLength(n);

    calls[1].resolve(fakeGenerator());
    await second;
    expect(last()).toMatchObject({ runId: 4, status: { state: 'running', batches: 0 } });
  });

  it('ignores pause and resume with a stale runId', async () => {
    const p = create();
    await p.handle(START);
    const n = sent.length;
    await p.handle({ type: 'pause', runId: 2 });
    expect(sent).toHaveLength(n);
    vi.advanceTimersByTime(500 + FLUSH_MS);
    expect(last().status).toMatchObject({ state: 'running', batches: 1 });
  });

  it('ignores pause and resume while the generator is still loading', async () => {
    const { calls, load } = manualLoads();
    const p = create(load);
    const started = p.handle(START);
    await p.handle({ type: 'pause', runId: 3 });
    await p.handle({ type: 'resume', runId: 3 });
    expect(sent).toHaveLength(0);

    calls[0].resolve(fakeGenerator());
    await started;
    expect(last().status.state).toBe('running');
  });

  it('a start superseded while loading posts nothing for the old run', async () => {
    const { calls, load } = manualLoads();
    const p = create(load);
    const a = p.handle(START);
    const b = p.handle({ ...START, runId: 4 });
    calls[0].resolve(fakeGenerator());
    await a;
    expect(sent).toHaveLength(0);
    calls[1].resolve(fakeGenerator());
    await b;
    expect(sent.map((m) => m.runId)).toEqual([4]);
  });

  it('a superseded start whose load fails does not break the newer run', async () => {
    const { calls, load } = manualLoads();
    const p = create(load);
    const a = p.handle(START);
    const b = p.handle({ ...START, runId: 4 });
    calls[1].resolve(fakeGenerator());
    await b;
    calls[0].reject(new Error('Cannot load x.wasm: HTTP 404'));
    await a;

    expect(sent.filter((m) => m.type === 'error')).toEqual([]);
    vi.advanceTimersByTime(500 + FLUSH_MS);
    expect(last()).toMatchObject({ runId: 4, status: { state: 'running', batches: 1 } });
  });

  it('every message carries the runId from start', async () => {
    const p = create();
    await p.handle(START);
    vi.advanceTimersByTime(1600);
    expect(sent.every((m) => m.runId === 3)).toBe(true);
  });

  it('load failure: a single init error, nothing scheduled', async () => {
    const p = create(async () => {
      throw new Error('Cannot load x.wasm: HTTP 404');
    });
    await p.handle(START);
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual([
      { type: 'error', runId: 3, phase: 'init', message: 'Cannot load x.wasm: HTTP 404' },
    ]);
  });

  it('generator failure: exactly one run error, the loop stops, later commands are ignored', async () => {
    const g = fakeGenerator();
    g.generateBatch = () => {
      throw new Error('WASM abort at 12:3');
    };
    const p = create(async () => g);
    await p.handle(START);
    vi.advanceTimersByTime(5000);
    expect(sent.map((m) => m.type)).toEqual(['snapshot', 'error']);
    expect(sent[1]).toMatchObject({ phase: 'run', message: 'WASM abort at 12:3' });

    await p.handle({ type: 'resume', runId: 3 });
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(2);
  });

  it('an error is the last message of a run, even with a snapshot pending', async () => {
    const g = fakeGenerator();
    const generate = g.generateBatch;
    let calls = 0;
    g.generateBatch = (n) => {
      if (++calls === 2) throw new Error('WASM abort at 12:3');
      return generate(n);
    };
    const p = create(async () => g);
    await p.handle({ ...START, settings: { ...SETTINGS, batchIntervalMs: 30 } });
    vi.advanceTimersByTime(5000); // batch 1 at 30 plans a flush at 30 + FLUSH_MS; batch 2 at 60 fails
    expect(sent.map((m) => m.type)).toEqual(['snapshot', 'error']);
  });
});
