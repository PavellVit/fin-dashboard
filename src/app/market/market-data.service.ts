import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { emptyRow } from './metrics';
import type { FromWorker, InstrumentRow, ProducerStatus, ToWorker } from './protocol';
import { DEFAULT_SETTINGS, type ProducerSettings } from './settings';
import { SYMBOLS } from './symbols';

const IDLE: ProducerStatus = { state: 'idle', batches: 0, updates: 0 };
const READY_TIMEOUT_MS = 5000;

const emptyRows = (count: number): InstrumentRow[] => SYMBOLS.slice(0, count).map(emptyRow);

// One instance per app, so navigation never creates producers; a worker exists only after apply()
@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly _rows = signal<InstrumentRow[]>(emptyRows(DEFAULT_SETTINGS.instrumentCount));
  private readonly _status = signal<ProducerStatus>(IDLE);
  private readonly _error = signal<string | null>(null);

  readonly rows = this._rows.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();

  private worker: Worker | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  // Always a new run: new worker, empty rows, even from paused and with the same settings
  apply(settings: ProducerSettings): void {
    this.dispose(); // the replaced producer is terminated right away
    this._rows.set(emptyRows(settings.instrumentCount));
    this._status.set({ ...IDLE, state: 'initializing' });
    this._error.set(null);

    let w: Worker;
    try {
      // The path must be a literal: Angular CLI bundles the worker from it
      w = new Worker(new URL('./market.worker', import.meta.url), { type: 'module' });
    } catch (e) {
      // No (module) Web Workers or blocked by the browser: report it instead of breaking the app start.
      // A missing WebAssembly is reported by the worker itself as an initialization error.
      const reason = e instanceof Error ? e.message : String(e);
      this.fail(`Cannot start the producer, Web Workers are unavailable: ${reason}`);
      return;
    }
    // Only the current worker may update state: after terminate() an already queued error event can
    // still arrive, and a failed or destroyed run must not come back to life
    const isCurrent = () => this.worker === w;
    w.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      if (isCurrent()) {
        this.onMessage(data);
      }
    };
    w.onerror = (e) => {
      if (isCurrent()) {
        this.fail(`Worker failed: ${e.message || 'script could not be loaded'}`);
      }
    };
    this.worker = w;
    this.readyTimer = setTimeout(
      () => this.fail(`Producer did not start within ${READY_TIMEOUT_MS / 1000} s`),
      READY_TIMEOUT_MS,
    );
    this.post({
      type: 'start',
      settings,
      wasmUrl: new URL('producer.wasm', document.baseURI).href, // also works under <base href="/repo/">
      seed: crypto.getRandomValues(new Uint32Array(1))[0], // only the seed comes from JS; randomness runs in Wasm
    });
  }

  pause(): void {
    this.post({ type: 'pause' });
  }

  resume(): void {
    this.post({ type: 'resume' });
  }

  private post(m: ToWorker): void {
    this.worker?.postMessage(m);
  }

  private onMessage(m: FromWorker): void {
    this.clearReadyTimer();
    if (m.type === 'snapshot') {
      this._rows.set(m.rows);
      this._status.set(m.status);
    } else {
      this.fail(`${m.phase === 'init' ? 'Initialization' : 'Runtime'} error: ${m.message}`);
    }
  }

  // Rows are kept: the last values stay visible next to the error
  private fail(message: string): void {
    this._error.set(message);
    this._status.update((s) => ({ ...s, state: 'error' }));
    this.dispose();
  }

  private dispose(): void {
    this.clearReadyTimer();
    this.worker?.terminate();
    this.worker = null;
  }

  private clearReadyTimer(): void {
    if (this.readyTimer !== null) {
      clearTimeout(this.readyTimer);
    }
    this.readyTimer = null;
  }
}
