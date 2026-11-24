import test from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../src/jobs.mjs';

function jobs() {
  globalThis.Game = class {};
  const ctx = { patch: () => ({ after() {} }), onModsLoaded() {} };
  const api = install(ctx, { getHiring: () => undefined, log() {} });
  const job = { work: () => '', everyMs: () => 5000 };
  api.register({ ...job, id: 'test:Carrier', roomScale: 3 });
  api.register({ ...job, id: 'test:Clerk' });
  return api;
}

test('a Folk coming back to a carrier job after a strike counts as returning', () => {
  const api = jobs();
  const folk = { job: null, restartWhenReady: true, restartPick: { job: 'test:Carrier' } };
  assert.equal(api.isReturningCarrier(folk), true);
  assert.equal(api.isCarrier(folk), false);
});

test('no way back, or a job that carries nothing, is not returning', () => {
  const api = jobs();
  assert.equal(api.isReturningCarrier({ job: null, restartWhenReady: false, restartPick: { job: 'test:Carrier' } }), false);
  assert.equal(api.isReturningCarrier({ job: null, restartWhenReady: true, restartPick: null }), false);
  assert.equal(api.isReturningCarrier({ job: null, restartWhenReady: true, restartPick: { job: 'test:Clerk' } }), false);
  assert.equal(api.isReturningCarrier({ job: null, restartWhenReady: true, restartPick: { job: 'test:Gone' } }), false);
  assert.equal(api.isReturningCarrier({ job: null, restartWhenReady: true, restartPick: { skill: 'melvorD:Mining' } }), false);
});
