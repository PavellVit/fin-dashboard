import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MarketDataService } from '../../market/market-data.service';
import {
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  nominalRate,
  type ProducerSettings,
} from '../../market/settings';

// type="number" gives number | null: the empty field is left to `required`
export const integerValidator: ValidatorFn = (c) =>
  c.value === null || Number.isInteger(c.value) ? null : { integer: true };

const FIELDS = [
  { key: 'instrumentCount', label: 'Instrument count' },
  { key: 'updatesPerBatch', label: 'Updates per batch' },
  { key: 'batchIntervalMs', label: 'Batch interval, ms' },
] as const satisfies readonly { key: keyof ProducerSettings; label: string }[];

@Component({
  imports: [ReactiveFormsModule, DecimalPipe],
  selector: 'app-settings',
  styleUrl: './settings.scss',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly svc = inject(MarketDataService);
  private readonly router = inject(Router);
  protected readonly fields = FIELDS;
  protected readonly limits = SETTINGS_LIMITS;

  // Public: the spec reads form and draftRate and calls onSubmit/resetToDefaults (protected: TS2445).
  // The draft starts from the applied settings and has no subscriptions towards the service:
  // editing cannot affect the producer, apply() in onSubmit is the only link
  readonly form = inject(NonNullableFormBuilder).group({
    instrumentCount: [this.svc.settings().instrumentCount, this.rules('instrumentCount')],
    updatesPerBatch: [this.svc.settings().updatesPerBatch, this.rules('updatesPerBatch')],
    batchIntervalMs: [this.svc.settings().batchIntervalMs, this.rules('batchIntervalMs')],
  });

  // Not a signal: input is a template event, so change detection runs and the getter is re-read
  get draftRate(): number | null {
    return this.form.valid ? nominalRate(this.form.getRawValue()) : null;
  }

  resetToDefaults(): void {
    this.form.reset(DEFAULT_SETTINGS);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    this.svc.apply(this.form.getRawValue());
    void this.router.navigateByUrl('/'); // back to the dashboard to see the new run
  }

  // Validators.min/max let null through, so `required` is what rejects the empty field
  private rules(key: keyof ProducerSettings) {
    const { min, max } = SETTINGS_LIMITS[key];
    return [Validators.required, Validators.min(min), Validators.max(max), integerValidator];
  }
}
