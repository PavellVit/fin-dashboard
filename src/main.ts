import { effect } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { MarketDataService } from './app/market/market-data.service';

bootstrapApplication(App, appConfig)
  .then((app) => {
    // Temporary. In DevTools: mdService.pause(), mdService.resume(), mdService.apply({...}: ProducerSettings)
    const svc = app.injector.get(MarketDataService);
    Object.assign(window, { svc });
    effect(
      () => {
        console.log(svc.status(), svc.error() ?? '');
        console.table(svc.rows());
      },
      { injector: app.injector },
    );
  })
  .catch((err) => console.error(err));
