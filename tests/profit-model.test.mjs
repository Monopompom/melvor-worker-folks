import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MS_PER_HOUR, expectedPrimaryQuantity, folkYield, netPerHour } from '../src/profit-model.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('primary quantity: the base alone, never below 1', () => {
  assert.equal(expectedPrimaryQuantity({ base: 1 }), 1);
  assert.equal(expectedPrimaryQuantity({ base: 15 }), 15);
  assert.equal(expectedPrimaryQuantity({ base: 0 }), 1);
});

test('primary quantity: doubling, whole doublings and the flat addition', () => {
  close(expectedPrimaryQuantity({ base: 1, doublingChance: 20 }), 1.2);
  close(expectedPrimaryQuantity({ base: 1, doublingChance: 150 }), 2);
  assert.equal(expectedPrimaryQuantity({ base: 3, doublePowers: 1 }), 6);
  // The flat addition comes after doubling, so it is never doubled.
  close(expectedPrimaryQuantity({ base: 1, doublingChance: 50, flatAdditional: 2 }), 0.5 * 3 + 0.5 * 4);
});

test('primary quantity: the base percent rounds down before doubling, as the game does', () => {
  // 1 × 1.5 = 1.5 → 1; with the +1 chance half the time: 2 × 1.5 = 3.
  assert.equal(expectedPrimaryQuantity({ base: 1, basePercent: 50 }), 1);
  close(expectedPrimaryQuantity({ base: 1, basePercent: 50, plusOneChance: 50 }), 0.5 * 1 + 0.5 * 3);
  close(expectedPrimaryQuantity({ base: 2, flatBase: 1, basePercent: 10 }), 3);
});

test('primary quantity: the +1 to +8 chances add their expected amount', () => {
  close(expectedPrimaryQuantity({ base: 1, additionalChances: { 1: 50, 2: 25, 3: 0, 5: 10, 8: 100 } }), 1 + 0.5 + 0.5 + 0.5 + 8);
});

test('Produce Rate as odds: a chance below 100, extra batches above', () => {
  assert.deepEqual(folkYield(60), { chance: 0.6, batches: 1 });
  assert.deepEqual(folkYield(100), { chance: 1, batches: 1 });
  assert.deepEqual(folkYield(140), { chance: 1, batches: 1.4 });
  assert.deepEqual(folkYield(-5), { chance: 0, batches: 1 });
});

test('net per hour: makes, spends and wage over an hour of actions', () => {
  // 3 s actions: 1,200 an hour. One bar at 50 GP from 1 ore at 5 and 1 coal at 2.
  const r = netPerHour({ intervalMs: 3000, outputs: [{ qty: 1, value: 50 }], inputs: [{ qty: 1, value: 5 }, { qty: 1, value: 2 }], wagePerHour: 10_000 });
  assert.equal(r.actionsPerHour, 1200);
  assert.equal(r.makes, 60_000);
  assert.equal(r.spends, 8400);
  assert.equal(r.wage, 10_000);
  assert.equal(r.net, 60_000 - 8400 - 10_000);
});

test('net per hour: a failed action still takes its inputs, preservation saves them', () => {
  const r = netPerHour({ intervalMs: 2000, outputs: [{ qty: 1, value: 100 }], inputs: [{ qty: 2, value: 10 }], chance: 0.6, preservation: 25 });
  assert.equal(r.actionsPerHour, 1800);
  close(r.makes, 1800 * 0.6 * 100);
  close(r.spends, 1800 * 0.75 * 20);
});

test('net per hour: extra batches above 100 and a stun after a failure', () => {
  const r = netPerHour({ intervalMs: 3000, outputs: [{ qty: 100, value: 1 }], chance: 0.5, batches: 1.2, failExtraMs: 3000 });
  // Half the actions take 3 s more: 4.5 s on average, 800 an hour.
  close(r.actionsPerHour, MS_PER_HOUR / 4500);
  close(r.makes, 800 * 0.5 * 1.2 * 100);
  assert.equal(r.spends, 0);
});

test('net per hour: no time, no estimate; bad numbers count as nothing', () => {
  assert.equal(netPerHour({ intervalMs: 0 }), null);
  assert.equal(netPerHour({ intervalMs: NaN }), null);
  const r = netPerHour({ intervalMs: 1000, outputs: [{ qty: 'x', value: 5 }, { qty: 2, value: -3 }, null], wagePerHour: -1 });
  assert.equal(r.makes, 0);
  assert.equal(r.wage, 0);
  assert.equal(r.net, 0);
});
