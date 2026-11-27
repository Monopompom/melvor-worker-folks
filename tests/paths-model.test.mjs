import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_IDS, PATHS, RATE_FLOOR, isPath, stepOf, holdsPath, normalizePath, needsPick, pathEffects, rateWithPath, changeCost, pickPlan,
} from '../src/paths-model.mjs';
import { PATH_IDS as SAVED_IDS, TIERS } from '../src/folk.mjs';
import { produceRate } from '../src/produce-rate.mjs';

test('the save and the model name the same paths', () => {
  assert.deepEqual(SAVED_IDS, PATH_IDS);
  assert.deepEqual(Object.keys(PATHS), PATH_IDS);
});

test('only a Master and a Foreman hold a path, at steps 1 and 2', () => {
  assert.deepEqual(TIERS.map(stepOf), [0, 0, 0, 1, 2]);
  assert.deepEqual(TIERS.map(holdsPath), [false, false, false, true, true]);
});

test('normalizePath keeps a known id at Master or Foreman only', () => {
  assert.equal(normalizePath('Hustler', 'Senior'), 'Hustler');
  assert.equal(normalizePath('Scholar', 'Expert'), 'Scholar');
  assert.equal(normalizePath('Hustler', 'Middle'), null);
  assert.equal(normalizePath('Craftsman', 'Senior'), null);
  assert.equal(normalizePath({ id: 'Hustler' }, 'Senior'), null);
  assert.equal(normalizePath('toString', 'Senior'), null);
  assert.equal(isPath('__proto__'), false);
});

test('needsPick: a Master or Foreman with no path', () => {
  assert.equal(needsPick({ tier: 'Senior', path: null }), true);
  assert.equal(needsPick({ tier: 'Expert', path: 'Steady' }), false);
  assert.equal(needsPick({ tier: 'Middle', path: null }), false);
  assert.equal(needsPick(undefined), false);
});

test('pathEffects by step', () => {
  assert.deepEqual(pathEffects('Hustler', 'Senior'), { rate: 10, interval: 0, xp: 0, masteryXP: 0, wageFactor: 1.25 });
  assert.deepEqual(pathEffects('Hustler', 'Expert'), { rate: 15, interval: 0, xp: 0, masteryXP: 0, wageFactor: 1.35 });
  assert.deepEqual(pathEffects('Steady', 'Senior'), { rate: 0, interval: 5, xp: 0, masteryXP: 0, wageFactor: 0.8 });
  assert.deepEqual(pathEffects('Steady', 'Expert'), { rate: 0, interval: 5, xp: 0, masteryXP: 0, wageFactor: 0.7 });
  assert.deepEqual(pathEffects('Scholar', 'Senior'), { rate: -10, interval: 0, xp: 10, masteryXP: 50, wageFactor: 1 });
  assert.deepEqual(pathEffects('Scholar', 'Expert'), { rate: -10, interval: 0, xp: 15, masteryXP: 50, wageFactor: 1 });
});

test('pathEffects adds nothing without a path, below Master or on a job', () => {
  const none = { rate: 0, interval: 0, xp: 0, masteryXP: 0, wageFactor: 1 };
  assert.deepEqual(pathEffects(null, 'Senior'), none);
  assert.deepEqual(pathEffects('Hustler', 'Middle'), none);
  assert.deepEqual(pathEffects('Steady', 'Expert', { onJob: true }), none);
  // A fresh object each time: a caller may add to it.
  const a = pathEffects(null, 'Senior');
  a.rate = 5;
  assert.equal(pathEffects(null, 'Senior').rate, 0);
});

test('every step is a trade: something gained, something paid', () => {
  for (const id of PATH_IDS) {
    for (const tier of ['Senior', 'Expert']) {
      const e = pathEffects(id, tier);
      const gains = [e.rate > 0, e.interval < 0, e.xp > 0, e.masteryXP > 0, e.wageFactor < 1].filter(Boolean).length;
      const costs = [e.rate < 0, e.interval > 0, e.xp < 0, e.masteryXP < 0, e.wageFactor > 1].filter(Boolean).length;
      assert.ok(gains > 0 && costs > 0, `${id} at ${tier}`);
    }
  }
});

test('a path never takes Produce Rate below the floor', () => {
  for (const id of PATH_IDS) {
    for (const tier of ['Senior', 'Expert']) {
      assert.ok(rateWithPath(produceRate(tier), pathEffects(id, tier).rate) >= RATE_FLOOR, `${id} at ${tier}`);
    }
  }
  assert.equal(rateWithPath(120, -10), 110);
  assert.equal(rateWithPath(100, -10), 100);
  assert.equal(rateWithPath(140, 15), 155);
  // A rate already under the floor (never a Master's) is left where it is, not raised.
  assert.equal(rateWithPath(80, -10), 80);
});

test('changeCost is a quarter of the hire price, rounded up', () => {
  assert.equal(changeCost(40_000_000), 10_000_000);
  assert.equal(changeCost(10), 3);
  assert.equal(changeCost(-5), 0);
  assert.equal(changeCost(undefined), 0);
});

test('pickPlan: free first pick, paid change, refusals', () => {
  assert.deepEqual(pickPlan({ tier: 'Senior', path: null, onStrike: false }, 'Hustler'), { ok: true, free: true, why: null });
  assert.deepEqual(pickPlan({ tier: 'Senior', path: null, onStrike: true }, 'Hustler'), { ok: true, free: true, why: null });
  assert.deepEqual(pickPlan({ tier: 'Expert', path: 'Hustler', onStrike: false }, 'Scholar'), { ok: true, free: false, why: null });
  assert.equal(pickPlan({ tier: 'Expert', path: 'Hustler', onStrike: true }, 'Scholar').why, 'strike');
  assert.equal(pickPlan({ tier: 'Expert', path: 'Hustler', onStrike: false }, 'Hustler').why, 'same');
  assert.equal(pickPlan({ tier: 'Middle', path: null, onStrike: false }, 'Hustler').why, 'tier');
  assert.equal(pickPlan({ tier: 'Senior', path: null, onStrike: false }, 'Craftsman').why, 'unknown');
});
