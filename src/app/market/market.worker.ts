/// <reference lib="webworker" />
import { loadGenerator } from './wasm-loader';

addEventListener('message', async ({ data }) => {
  try {
    const g = await loadGenerator(data.wasmUrl);
    postMessage({ ok: g.add(1, 2) });
  } catch (e) {
    postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
});
