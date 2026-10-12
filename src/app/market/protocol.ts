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

// Every message carries runId, so results of a previous run can be rejected
export type ToWorker =
  | { type: 'start'; runId: number; settings: ProducerSettings; wasmUrl: string; seed: number }
  | { type: 'pause'; runId: number }
  | { type: 'resume'; runId: number };

export type FromWorker =
  | { type: 'snapshot'; runId: number; status: ProducerStatus; rows: InstrumentRow[] }
  | { type: 'error'; runId: number; phase: 'init' | 'run'; message: string };
