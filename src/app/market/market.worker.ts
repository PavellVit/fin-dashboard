/// <reference lib="webworker" />
import { applyBatch, createAccs, toRows } from './metrics';
import { SYMBOLS } from './symbols';
import { loadGenerator, readBatch } from './wasm-loader';

// Temporary check real Wasm batches -> metrics -> console.table
addEventListener('message', async ({ data }) => {
  try {
    const g = await loadGenerator(data.wasmUrl);
    // initialize the generator with 5 instruments and a seed of 42
    g.init(5, 42);
    const accs = createAccs(5);
    // generate 3 batches of 100 updates each
    for (let tick = 1; tick <= 3; tick++) {
      const n = g.generateBatch(100);
      applyBatch(accs, readBatch(g, n), n);
      console.table(toRows(SYMBOLS, accs));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    postMessage({ ok: 'metrics printed' });
  } catch (e) {
    postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
});
