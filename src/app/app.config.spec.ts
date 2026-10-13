import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';
import { FakeWorker, snapshot, useFakeWorker } from './testing/fake-worker';

useFakeWorker();

it("the app starts one producer with the task's defaults: 5 instruments, 100 updates every 500 ms", async () => {
  TestBed.configureTestingModule({ providers: appConfig.providers });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  expect(FakeWorker.instances).toHaveLength(1);
  expect(FakeWorker.last.sent[0]).toMatchObject({
    type: 'start',
    settings: { instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 500 },
  });
});

it('navigating away and back keeps the one producer and its paused state', async () => {
  TestBed.configureTestingModule({ providers: appConfig.providers });
  const fixture = TestBed.createComponent(App);
  const page = fixture.nativeElement as HTMLElement;
  const [dashboard, settings] = page.querySelectorAll('nav a');
  FakeWorker.last.emit(snapshot([], { state: 'paused', batches: 1, updates: 100 }));

  (settings as HTMLAnchorElement).click();
  await fixture.whenStable();
  expect(page.querySelector('h1')?.textContent).toBe('Settings');

  (dashboard as HTMLAnchorElement).click();
  await fixture.whenStable();
  expect(FakeWorker.instances).toHaveLength(1);
  expect(page.querySelector('.pill')?.textContent?.trim()).toBe('paused');

  const router = TestBed.inject(Router);
  await router.navigateByUrl('/nope'); // unknown paths fall back to the dashboard
  expect(router.url).toBe('/');
});
