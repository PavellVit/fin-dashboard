import type { ProducerSettings } from './settings';

export type ProducerState = 'idle' | 'initializing' | 'running' | 'paused' | 'error';

export interface ProducerStatus {
  state: ProducerState;
  batches: number;
  updates: number;
}

// null means "unavailable"
export interface InstrumentRow {
  symbol: string;
  lastPriceCents: number | null;
  spreadCents: number | null;
  volume: number;
  vwapCents: number | null;
  imbalance: number | null;
}

// A worker serves one run: it gets one start, then pause/resume
export type ToWorker =
  | { type: 'start'; settings: ProducerSettings; wasmUrl: string; seed: number }
  | { type: 'pause' }
  | { type: 'resume' };

export type FromWorker =
  | { type: 'snapshot'; status: ProducerStatus; rows: InstrumentRow[] }
  | { type: 'error'; phase: 'init' | 'run'; message: string };
