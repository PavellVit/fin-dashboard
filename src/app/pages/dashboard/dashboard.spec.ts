import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarketDataService } from '../../market/market-data.service';
import { emptyRow } from '../../market/metrics';
import type { FromWorker, InstrumentRow, ProducerStatus } from '../../market/protocol';
import { FakeWorker, snapshot, useFakeWorker } from '../../testing/fake-worker';
import { Dashboard } from './dashboard';

const SETTINGS = { instrumentCount: 3, updatesPerBatch: 10, batchIntervalMs: 200 };
const WORKED_EXAMPLE: InstrumentRow = {
  symbol: 'ALFA',
  lastPriceCents: 10200,
  spreadCents: 4,
  volume: 40,
  vwapCents: 10150,
  imbalance: 0.2,
};
const status = (state: ProducerStatus['state']): ProducerStatus => ({
  state,
  batches: 1,
  updates: 100,
});

describe('Dashboard', () => {
  useFakeWorker();
  let svc: MarketDataService;
  let fixture: ComponentFixture<Dashboard>;

  const page = () => fixture.nativeElement as HTMLElement;
  const cells = (row: number) =>
    [...page().querySelectorAll(`tbody tr:nth-child(${row}) :is(th, td)`)].map((c) =>
      c.textContent?.trim(),
    );
  const button = (label: string) =>
    [...page().querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement;
  const toggle = () => page().querySelector('.status button') as HTMLButtonElement;
  const render = async () => {
    fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
  };
  const emit = async (m: FromWorker) => {
    FakeWorker.last.emit(m);
    await fixture.whenStable();
  };

  beforeEach(() => {
    svc = TestBed.inject(MarketDataService);
    svc.apply(SETTINGS);
  });

  it('renders one row per instrument with unavailable values before data', async () => {
    await render();
    expect(page().querySelectorAll('tbody tr')).toHaveLength(3);
    expect(cells(1)).toEqual(['ALFA', '—', '—', '0', '—', '—']);
  });

  it('formats the worked example: prices as currency, imbalance with two decimals', async () => {
    await render();
    await emit(snapshot([WORKED_EXAMPLE]));
    expect(cells(1)).toEqual(['ALFA', '$102.00', '$0.04', '40', '$101.50', '0.20']);
  });

  it('one Pause/Resume toggle: Pause while running, Resume while paused, disabled otherwise', async () => {
    await render();
    const view = () => [toggle().textContent?.trim(), toggle().disabled];
    expect(view()).toEqual(['Pause', true]); // initializing

    await emit(snapshot([WORKED_EXAMPLE], status('running')));
    expect(view()).toEqual(['Pause', false]);

    await emit(snapshot([WORKED_EXAMPLE], status('paused')));
    expect(view()).toEqual(['Resume', false]);

    await emit({ type: 'error', phase: 'run', message: 'boom' });
    expect(view()).toEqual(['Pause', true]);
  });

  it('the toggle sends pause, then resume, to the worker', async () => {
    await render();
    await emit(snapshot([WORKED_EXAMPLE], status('running')));
    toggle().click();
    await emit(snapshot([WORKED_EXAMPLE], status('paused')));
    toggle().click();
    expect(FakeWorker.last.sent.map((m) => m.type)).toEqual(['start', 'pause', 'resume']);
  });

  it('shows an initialization error with a working Retry', async () => {
    await render();
    await emit({ type: 'error', phase: 'init', message: 'Cannot load x.wasm: HTTP 404' });
    expect(page().querySelector('[role=alert]')?.textContent).toContain(
      'Initialization error: Cannot load x.wasm: HTTP 404',
    );

    button('Retry').click();
    await fixture.whenStable();
    expect(FakeWorker.instances).toHaveLength(2);
    expect(page().querySelector('[role=alert]')).toBeNull();
  });

  it('shows the status line: state, applied settings, nominal rate, counters', async () => {
    await render();
    await emit(snapshot([WORKED_EXAMPLE], { state: 'running', batches: 12, updates: 1200 }));
    const text = page().querySelector('.status')?.textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('running');
    expect(text).toContain('3 instruments · 10 upd / 200 ms');
    expect(text).toContain('50 upd/s nominal');
    expect(text).toContain('12 batches · 1,200 updates');
  });

  it('navigation does not create another producer and keeps the paused state', async () => {
    await render();
    await emit(snapshot([WORKED_EXAMPLE, emptyRow('BETA'), emptyRow('GAMMA')], status('paused')));
    fixture.destroy(); // leaving the page

    await render(); // coming back
    expect(FakeWorker.instances).toHaveLength(1);
    expect(page().querySelector('.pill')?.textContent?.trim()).toBe('paused');
    expect(toggle().textContent?.trim()).toBe('Resume');
    expect(toggle().disabled).toBe(false);
    expect(cells(1)).toEqual(['ALFA', '$102.00', '$0.04', '40', '$101.50', '0.20']);
  });
});
