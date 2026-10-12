import { TestBed } from '@angular/core/testing';
import { FakeWorker, snapshot } from '../testing/fake-worker';
import { MarketDataService } from './market-data.service';
import { emptyRow } from './metrics';
import type { InstrumentRow } from './protocol';
import { DEFAULT_SETTINGS, type ProducerSettings } from './settings';

const SETTINGS: ProducerSettings = {
  instrumentCount: 3,
  updatesPerBatch: 10,
  batchIntervalMs: 200,
};
const alfa = (patch: Partial<InstrumentRow>): InstrumentRow => ({ ...emptyRow('ALFA'), ...patch });

describe('MarketDataService', () => {
  let svc: MarketDataService;

  beforeEach(() => {
    FakeWorker.reset();
    vi.stubGlobal('Worker', FakeWorker);
    svc = TestBed.inject(MarketDataService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('injecting the service creates no producer', () => {
    expect(FakeWorker.instances).toHaveLength(0);
    expect(svc.status().state).toBe('idle');
    expect(svc.rows()).toEqual(['ALFA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'].map(emptyRow));
  });

  it('apply starts a new run with N empty rows and posts start', () => {
    svc.apply(SETTINGS);
    expect(svc.rows()).toEqual(['ALFA', 'BETA', 'GAMMA'].map(emptyRow));
    expect(svc.status().state).toBe('initializing');
    expect(FakeWorker.last.sent).toEqual([
      {
        type: 'start',
        settings: SETTINGS,
        wasmUrl: expect.stringMatching(/\/producer\.wasm$/),
        seed: expect.any(Number),
      },
    ]);
  });

  it('apply replaces the worker and terminates the previous one', () => {
    svc.apply(SETTINGS);
    svc.apply(SETTINGS);
    expect(FakeWorker.instances.map((w) => w.terminated)).toEqual([true, false]);
  });

  it('apply with the same settings resets totals, also from paused', () => {
    svc.apply(SETTINGS);
    FakeWorker.last.emit(
      snapshot([alfa({ volume: 999 })], { state: 'paused', batches: 5, updates: 500 }),
    );
    svc.apply(SETTINGS);
    expect(svc.rows()[0].volume).toBe(0);
    expect(svc.status()).toEqual({ state: 'initializing', batches: 0, updates: 0 });
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.last.sent[0]).toMatchObject({ type: 'start', settings: SETTINGS });
  });

  it('drops snapshots from a replaced worker', () => {
    svc.apply(SETTINGS);
    svc.apply(SETTINGS);
    FakeWorker.instances[0].emit(snapshot([alfa({ volume: 999 })]));
    expect(svc.rows()[0].volume).toBe(0);
    FakeWorker.instances[1].emit(snapshot([alfa({ volume: 5 })]));
    expect(svc.rows()[0].volume).toBe(5);
  });

  it('drops errors from a replaced worker', () => {
    svc.apply(SETTINGS);
    svc.apply(SETTINGS);
    const old = FakeWorker.instances[0];
    old.emit({ type: 'error', phase: 'run', message: 'old' });
    old.onerror?.({ message: 'old' } as ErrorEvent);
    expect(svc.error()).toBeNull();
    expect(svc.status().state).toBe('initializing');
    expect(FakeWorker.instances[1].terminated).toBe(false);
  });

  it('pause and resume go to the current worker', () => {
    svc.apply(SETTINGS);
    svc.pause();
    svc.resume();
    expect(FakeWorker.last.sent.map((m) => m.type)).toEqual(['start', 'pause', 'resume']);
  });

  it('a snapshot updates rows and status', () => {
    svc.apply(SETTINGS);
    FakeWorker.last.emit(snapshot([alfa({ volume: 40, vwapCents: 10150 })]));
    expect(svc.rows()[0]).toMatchObject({ volume: 40, vwapCents: 10150 });
    expect(svc.status()).toEqual({ state: 'running', batches: 1, updates: 100 });
  });

  it('an init error is shown with a prefix, the worker is terminated, rows are kept', () => {
    svc.apply(DEFAULT_SETTINGS);
    FakeWorker.last.emit({
      type: 'error',
      phase: 'init',
      message: 'Cannot load x.wasm: HTTP 404',
    });
    expect(svc.error()).toBe('Initialization error: Cannot load x.wasm: HTTP 404');
    expect(svc.status().state).toBe('error');
    expect(FakeWorker.last.terminated).toBe(true);
    expect(svc.rows()).toHaveLength(DEFAULT_SETTINGS.instrumentCount);
  });

  it('a run error keeps the last rows', () => {
    svc.apply(SETTINGS);
    FakeWorker.last.emit(snapshot([alfa({ volume: 40 })]));
    FakeWorker.last.emit({ type: 'error', phase: 'run', message: 'boom' });
    expect(svc.error()).toBe('Runtime error: boom');
    expect(svc.rows()[0].volume).toBe(40);
  });

  it('apply after an error starts clean: no error, a new worker', () => {
    svc.apply(SETTINGS);
    FakeWorker.last.emit({ type: 'error', phase: 'init', message: 'x' });
    svc.apply(SETTINGS);
    expect(svc.error()).toBeNull();
    expect(svc.status().state).toBe('initializing');
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('worker.onerror switches to the error state', () => {
    svc.apply(SETTINGS);
    FakeWorker.last.onerror?.({ message: 'boom' } as ErrorEvent);
    expect(svc.status().state).toBe('error');
    expect(svc.error()).toContain('boom');
  });

  it('fails if the worker stays silent for 5 s', () => {
    vi.useFakeTimers();
    svc.apply(SETTINGS);
    vi.advanceTimersByTime(5000);
    expect(svc.status().state).toBe('error');
    expect(svc.error()).toBe('Producer did not start within 5 s');
    expect(FakeWorker.last.terminated).toBe(true);
  });

  it('the first message cancels the ready timeout', () => {
    vi.useFakeTimers();
    svc.apply(SETTINGS);
    FakeWorker.last.emit(snapshot([alfa({ volume: 1 })]));
    vi.advanceTimersByTime(10_000);
    expect(svc.error()).toBeNull();
    expect(svc.status().state).toBe('running');
  });

  it('the ready timeout of a replaced run does not fail the new run', () => {
    vi.useFakeTimers();
    svc.apply(SETTINGS);
    vi.advanceTimersByTime(4000);
    svc.apply(SETTINGS);
    vi.advanceTimersByTime(1000); // the first run's timer would have fired here
    expect(svc.status().state).toBe('initializing');
    expect(svc.error()).toBeNull();
  });

  it('a late error event from a failed worker does not revive or overwrite the run', () => {
    svc.apply(SETTINGS);
    const w = FakeWorker.last;
    w.onerror?.({ message: 'boom' } as ErrorEvent);
    w.emit(snapshot([alfa({ volume: 7 })]));
    expect(svc.status().state).toBe('error');
    expect(svc.error()).toBe('Worker failed: boom');
    expect(svc.rows()[0].volume).toBe(0);
  });

  it('without Worker support: a meaningful error, no exception', () => {
    vi.stubGlobal('Worker', undefined);
    svc.apply(SETTINGS);
    expect(svc.status().state).toBe('error');
    expect(svc.error()).toContain('Web Workers');
  });

  it('a Worker the browser refuses to create: an error state instead of an exception', () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new DOMException('Blocked by policy', 'SecurityError');
        }
      },
    );
    expect(() => svc.apply(SETTINGS)).not.toThrow();
    expect(svc.status().state).toBe('error');
    expect(svc.error()).toContain('Blocked by policy');
  });

  it('destroying the app terminates the worker', () => {
    svc.apply(SETTINGS);
    TestBed.resetTestingModule();
    expect(FakeWorker.last.terminated).toBe(true);
  });
});
