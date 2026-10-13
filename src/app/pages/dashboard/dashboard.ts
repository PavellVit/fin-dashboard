import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MarketDataService } from '../../market/market-data.service';

@Component({
  imports: [CurrencyPipe, DecimalPipe],
  selector: 'app-dashboard',
  styleUrl: './dashboard.scss',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly svc = inject(MarketDataService);
}
