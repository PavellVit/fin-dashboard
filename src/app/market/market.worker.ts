/// <reference lib="webworker" />
import { ProducerCore } from './producer-core';
import type { ToWorker } from './protocol';
import { loadGenerator } from './wasm-loader';

const core = new ProducerCore((m) => postMessage(m), loadGenerator);
addEventListener('message', (e: MessageEvent<ToWorker>) => void core.handle(e.data));
