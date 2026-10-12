import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { DEFAULT_SETTINGS } from './market/settings';
import { FakeWorker } from './testing/fake-worker';

afterEach(() => vi.unstubAllGlobals());

it('the app starts one producer with the default settings', async () => {
  FakeWorker.reset();
  vi.stubGlobal('Worker', FakeWorker);
  TestBed.configureTestingModule({ providers: appConfig.providers });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  expect(FakeWorker.instances).toHaveLength(1);
  expect(FakeWorker.last.sent[0]).toMatchObject({
    type: 'start',
    settings: DEFAULT_SETTINGS,
  });
});
