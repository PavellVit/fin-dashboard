import type { FromWorker, InstrumentRow, ProducerStatus, ToWorker } from '../market/protocol';

// Stands in for the global Worker in specs: records posted messages, lets a test emit replies
export class FakeWorker implements Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror'
> {
  static instances: FakeWorker[] = [];

  static get last(): FakeWorker {
    return FakeWorker.instances.at(-1)!;
  }

  static reset(): void {
    FakeWorker.instances = [];
  }

  sent: ToWorker[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(m: ToWorker): void {
    this.sent.push(m);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(m: FromWorker): void {
    this.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  }
}

export const snapshot = (
  rows: InstrumentRow[],
  status: ProducerStatus = { state: 'running', batches: 1, updates: 100 },
): FromWorker => ({
  type: 'snapshot',
  status,
  rows,
});
