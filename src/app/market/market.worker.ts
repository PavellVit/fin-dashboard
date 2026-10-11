/// <reference lib="webworker" />
import { loadGenerator, readBatch } from './wasm-loader';

addEventListener('message', async ({ data }) => {
  try {
    const g = await loadGenerator(data.wasmUrl);
    g.init(5, 42);
    const n = g.generateBatch(3);
    postMessage({ ok: Array.from(readBatch(g, n)) });
  } catch (e) {
    postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
});
