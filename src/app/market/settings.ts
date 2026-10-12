export interface ProducerSettings {
  instrumentCount: number;
  updatesPerBatch: number;
  batchIntervalMs: number;
}

export const DEFAULT_SETTINGS: ProducerSettings = {
  instrumentCount: 5,
  updatesPerBatch: 100,
  // TODO: restore 500 (the task's default); 1000 only slows down the temporary console output
  batchIntervalMs: 1000,
};
