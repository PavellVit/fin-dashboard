import { applyBatch, createAccs, toRows, type Acc } from './metrics';
import type { FromWorker, ProducerState, ProducerStatus, ToWorker } from './protocol';
import { SYMBOLS } from './symbols';
import { readBatch, type GeneratorExports } from './wasm-loader';

// The UI gets at most one snapshot per FLUSH_MS; every batch is still aggregated
export const FLUSH_MS = 100;

// The whole producer loop without worker globals: `post` and `load` are injected,
// timers are the global setTimeout, so tests drive them with fake timers.
// One run per instance: the service creates a new worker for every run.
export class ProducerCore {
  private state: ProducerState = 'idle';
  private generator: GeneratorExports | null = null;
  private accs: Acc[] = [];
  private updatesPerBatch = 0;
  private intervalMs = 0;
  private batches = 0;
  private updates = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly post: (m: FromWorker) => void,
    private readonly load: (url: string) => Promise<GeneratorExports>,
  ) {}

  async handle(m: ToWorker): Promise<void> {
    if (m.type === 'start') {
      if (this.state === 'idle') {
        await this.start(m); // a repeated start is ignored
      }
      return;
    }

    if (m.type === 'pause' && this.state === 'running') {
      this.clearTick();
      this.state = 'paused';
      this.flush();
    } else if (m.type === 'resume' && this.state === 'paused') {
      this.state = 'running';
      this.schedule();
      this.flush();
    }
  }

  private async start(m: Extract<ToWorker, { type: 'start' }>): Promise<void> {
    this.state = 'initializing';
    this.updatesPerBatch = m.settings.updatesPerBatch;
    this.intervalMs = m.settings.batchIntervalMs;
    this.accs = createAccs(m.settings.instrumentCount);

    try {
      const g = await this.load(m.wasmUrl);
      g.init(m.settings.instrumentCount, m.seed);
      this.generator = g;
    } catch (e) {
      this.fail('init', e);
      return;
    }

    this.state = 'running';
    this.schedule(); // the first batch comes after one interval
    this.flush(); // empty rows and the running state right away
  }

  // One batch per tick; the next tick is planned only after a successful batch,
  // so a timer held back in a background tab never fires a burst of catch-up batches.
  private tick(): void {
    this.tickTimer = null;
    const g = this.generator!; // ticks run only while a generator is loaded

    try {
      const n = g.generateBatch(this.updatesPerBatch);
      applyBatch(this.accs, readBatch(g, n), n);
      this.batches++;
      this.updates += n;
    } catch (e) {
      this.fail('run', e);
      return; // the loop stops: no next tick
    }
    this.scheduleFlush();
    this.schedule();
  }

  private schedule(): void {
    this.tickTimer ??= setTimeout(() => this.tick(), this.intervalMs);
  }

  private scheduleFlush(): void {
    this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    this.clearFlush();
    this.post({
      type: 'snapshot',
      status: this.status(),
      rows: toRows(SYMBOLS, this.accs),
    });
  }

  private status(): ProducerStatus {
    return {
      state: this.state,
      batches: this.batches,
      updates: this.updates,
    };
  }

  private fail(phase: 'init' | 'run', e: unknown): void {
    this.clearTick();
    this.clearFlush(); // no "running" snapshot after the error
    this.state = 'error';
    this.post({
      type: 'error',
      phase,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  private clearTick(): void {
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer);
    }
    this.tickTimer = null;
  }

  private clearFlush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = null;
  }
}
