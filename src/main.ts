import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import type { FromWorker, ToWorker } from './app/market/protocol';
import { DEFAULT_SETTINGS, type ProducerSettings } from './app/market/settings';

bootstrapApplication(App, appConfig)
  .then(() => {
    // Temporary console harness for testing the producer
    // In DevTools: producer.pause(), producer.resume(), producer.start({ ...settings }, seed)
    const w = new Worker(new URL('./app/market/market.worker', import.meta.url), {
      type: 'module',
    });
    let runId = 0;
    const send = (m: ToWorker) => w.postMessage(m);

    w.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      if (data.type === 'error') {
        console.error(`run ${data.runId}: ${data.phase} error: ${data.message}`);
      } else {
        console.log(`run ${data.runId}:`, data.status);
        console.table(data.rows);
      }
    };

    const producer = {
      start: (settings: ProducerSettings = DEFAULT_SETTINGS, seed = 42) =>
        send({
          type: 'start',
          runId: ++runId,
          settings,
          seed,
          wasmUrl: new URL('producer.wasm', document.baseURI).href,
        }),
      pause: () => send({ type: 'pause', runId }),
      resume: () => send({ type: 'resume', runId }),
    };
    Object.assign(window, { producer });
    producer.start();
    console.log('window.producer', producer);
  })
  .catch((err) => console.error(err));
