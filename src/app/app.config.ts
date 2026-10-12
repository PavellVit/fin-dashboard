import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { MarketDataService } from './market/market-data.service';
import { DEFAULT_SETTINGS } from './market/settings';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // The app starts producing data with the default settings
    provideAppInitializer(() => inject(MarketDataService).apply(DEFAULT_SETTINGS)),
  ],
};
