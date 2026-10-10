import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    const w = new Worker(new URL('./app/market/market.worker', import.meta.url), {
      type: 'module', // Worker bundle - ES module
    });
    w.onmessage = (e) => console.log('worker:', e.data);
    w.postMessage({ wasmUrl: new URL('producer.wasm', document.baseURI).href });
  })
  .catch((err) => console.error(err));
