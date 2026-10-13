import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MarketDataService } from '../../market/market-data.service';
import { emptyRow } from '../../market/metrics';
import { DEFAULT_SETTINGS, type ProducerSettings } from '../../market/settings';
import { FakeWorker, snapshot, useFakeWorker } from '../../testing/fake-worker';
import { Settings } from './settings';

const APPLIED: ProducerSettings = { instrumentCount: 3, updatesPerBatch: 10, batchIntervalMs: 100 };
const FIELD_NAMES = ['instrumentCount', 'updatesPerBatch', 'batchIntervalMs'] as const;

describe('Settings', () => {
  useFakeWorker();
  let svc: MarketDataService;
  let fixture: ComponentFixture<Settings>;
  let c: Settings;

  const create = () => {
    fixture = TestBed.createComponent(Settings);
    return fixture.componentInstance;
  };
  const page = () => fixture.nativeElement as HTMLElement;
  // The inputs follow the order of the fields: instrumentCount, updatesPerBatch, batchIntervalMs
  const inputs = () => [...page().querySelectorAll('input')];
  const type = async (index: number, value: string) => {
    await fixture.whenStable(); // the first render
    const input = inputs()[index];
    input.value = value;
    // What a browser sends when the user types a value and leaves the field
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await fixture.whenStable();
  };
  const button = (label: string) =>
    [...page().querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'settings', children: [] }])],
    });
    svc = TestBed.inject(MarketDataService);
    c = create();
  });

  it('defaults are valid and shown', async () => {
    await fixture.whenStable();
    expect(c.form.getRawValue()).toEqual({
      instrumentCount: 5,
      updatesPerBatch: 100,
      batchIntervalMs: 500,
    });
    expect(c.form.valid).toBe(true);
    expect(inputs().map((i) => i.value)).toEqual(['5', '100', '500']);
  });

  it.each([
    ['instrumentCount', 0, false],
    ['instrumentCount', 1, true],
    ['instrumentCount', 50, true],
    ['instrumentCount', 51, false],
    ['updatesPerBatch', 0, false],
    ['updatesPerBatch', 1, true],
    ['updatesPerBatch', 1000, true],
    ['updatesPerBatch', 1001, false],
    ['batchIntervalMs', 49, false],
    ['batchIntervalMs', 50, true],
    ['batchIntervalMs', 2000, true],
    ['batchIntervalMs', 2001, false],
    ['instrumentCount', 2.5, false],
    ['batchIntervalMs', null, false],
  ] as const)('%s = %s → valid %s', (field, value, valid) => {
    c.form.controls[field].setValue(value as number);
    expect(c.form.controls[field].valid).toBe(valid);
  });

  it('a non-integer fails only `integer`, an empty field fails only `required`', () => {
    const { instrumentCount } = c.form.controls;
    instrumentCount.setValue(2.5);
    expect(instrumentCount.errors).toEqual({ integer: true });

    instrumentCount.setValue(null as unknown as number);
    expect(instrumentCount.errors).toEqual({ required: true });
  });

  it('editing does not call apply or touch the producer', () => {
    const apply = vi.spyOn(svc, 'apply');
    const workers = FakeWorker.instances.length;

    c.form.controls.instrumentCount.setValue(7);

    expect(apply).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(workers);
    expect(svc.settings().instrumentCount).toBe(5);
  });

  it('typing into the fields does not start a producer or change the applied settings', async () => {
    await type(0, '7');
    await type(1, '10');
    await type(2, '51'); // out of range too: the page only edits a draft

    expect(FakeWorker.instances).toHaveLength(0);
    expect(svc.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('submit applies the raw values exactly once', () => {
    const apply = vi.spyOn(svc, 'apply');
    c.form.setValue({ instrumentCount: 7, updatesPerBatch: 10, batchIntervalMs: 50 });

    c.onSubmit();

    expect(apply).toHaveBeenCalledExactlyOnceWith({
      instrumentCount: 7,
      updatesPerBatch: 10,
      batchIntervalMs: 50,
    });
  });

  it('submit starts a new run with the new rows at zero', () => {
    svc.apply(DEFAULT_SETTINGS);
    FakeWorker.last.emit(snapshot([{ ...emptyRow('ALFA'), volume: 5 }]));
    expect(svc.rows()[0].volume).toBe(5);

    c.form.setValue({ instrumentCount: 7, updatesPerBatch: 10, batchIntervalMs: 100 });
    c.onSubmit();

    expect(svc.rows()).toHaveLength(7);
    expect(svc.rows().every((r) => r.volume === 0)).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.last.sent[0]).toMatchObject({
      type: 'start',
      settings: { instrumentCount: 7, updatesPerBatch: 10, batchIntervalMs: 100 },
    });
  });

  it('submit leads back to the dashboard', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/settings');

    c.onSubmit();
    await fixture.whenStable();

    expect(router.url).toBe('/');
  });

  it.each(FIELD_NAMES)('an invalid %s does not apply and disables Apply', (field) => {
    const apply = vi.spyOn(svc, 'apply');
    c.form.controls[field].setValue(0);
    fixture.detectChanges();

    c.onSubmit();

    expect(apply).not.toHaveBeenCalled();
    expect(button('Apply').disabled).toBe(true);
  });

  it('shows the applied settings on entry and does not create a producer', () => {
    svc.apply(APPLIED);

    expect(create().form.getRawValue()).toEqual(APPLIED);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('previews the nominal rate, and nothing while invalid', () => {
    expect(c.draftRate).toBe(200);

    c.form.setValue({ instrumentCount: 50, updatesPerBatch: 1000, batchIntervalMs: 50 });
    expect(c.draftRate).toBe(20000);

    c.form.controls.updatesPerBatch.setValue(0);
    expect(c.draftRate).toBeNull();
  });

  it('reset to defaults restores the defaults, not the applied settings, and does not apply', () => {
    svc.apply(APPLIED);
    c = create();
    const apply = vi.spyOn(svc, 'apply');

    c.resetToDefaults();

    expect(c.form.getRawValue()).toEqual(DEFAULT_SETTINGS);
    expect(apply).not.toHaveBeenCalled();
  });

  describe('in the page', () => {
    it('labels each field with its range', async () => {
      await fixture.whenStable();
      const labels = [...page().querySelectorAll('label')].map((l) => l.textContent);
      expect(labels[0]).toContain('Instrument count (1–50)');
      expect(labels[1]).toContain('Updates per batch (1–1000)');
      expect(labels[2]).toContain('Batch interval, ms (50–2000)');
      expect(inputs().map((i) => [i.min, i.max])).toEqual([
        ['1', '50'],
        ['1', '1000'],
        ['50', '2000'],
      ]);
    });

    it.each([
      ['', 'Required'],
      ['2.5', 'Must be an integer'],
      ['0', 'Min 1'],
      ['51', 'Max 50'],
    ])('typing "%s" shows "%s", marks the field and disables Apply', async (value, message) => {
      await type(0, value);

      const error = page().querySelector('.error');
      expect(error?.textContent?.trim()).toBe(message);
      expect(error?.getAttribute('role')).toBe('alert');
      expect(inputs()[0].getAttribute('aria-invalid')).toBe('true');
      expect(button('Apply').disabled).toBe(true);
      expect(page().querySelector('.rate')?.textContent).toContain('—');
    });

    it('a valid value shows no error and keeps Apply enabled', async () => {
      await type(0, '7');

      expect(page().querySelector('.error')).toBeNull();
      expect(inputs()[0].getAttribute('aria-invalid')).toBe('false');
      expect(button('Apply').disabled).toBe(false);
    });

    it('previews the nominal rate with a thousands separator and one decimal', async () => {
      await type(1, '1000');
      await type(2, '300');

      expect(page().querySelector('.rate')?.textContent).toContain(
        '3,333.3 updates/s across all instruments',
      );
    });

    it('Apply runs the producer with the typed values', async () => {
      await type(1, '10');
      await type(2, '100');
      expect(FakeWorker.instances).toHaveLength(0); // nothing before Apply

      button('Apply').click();
      await fixture.whenStable();

      expect(FakeWorker.instances).toHaveLength(1);
      expect(FakeWorker.last.sent[0]).toMatchObject({
        type: 'start',
        settings: { instrumentCount: 5, updatesPerBatch: 10, batchIntervalMs: 100 },
      });
    });

    it('Reset to defaults refills the fields without applying', async () => {
      await type(0, '7');
      expect(inputs()[0].value).toBe('7');

      button('Reset to defaults').click();
      await fixture.whenStable();

      expect(inputs().map((i) => i.value)).toEqual(['5', '100', '500']);
      expect(FakeWorker.instances).toHaveLength(0);
    });
  });
});
