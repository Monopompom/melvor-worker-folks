import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeOrder, fitStacks, giveStacks, inputsPlan, raidPlan } from '../src/carry-model.mjs';

const stack = (id, qty, ms) => ({ id, qty, ms });
const stock = (o) => (id) => o[id] ?? 0;

test('takeOrder puts linked items first and keeps the rest in order', () => {
  const list = [stack('a', 1, 1), stack('b', 1, 1), stack('c', 1, 1)];
  assert.deepEqual(takeOrder(list, ['c']).map((s) => s.id), ['c', 'a', 'b']);
  assert.deepEqual(takeOrder(list).map((s) => s.id), ['a', 'b', 'c']);
});

test('takeOrder with only leaves everything else behind', () => {
  const list = [stack('a', 1, 1), stack('b', 1, 1), stack('c', 1, 1)];
  assert.deepEqual(takeOrder(list, ['c'], ['b', 'c']).map((s) => s.id), ['c', 'b']);
  assert.deepEqual(takeOrder(list, [], []), []);
});

test('fitStacks takes whole stacks, then whole units of the next, each with its share of the work', () => {
  const { moves, ms } = fitStacks([stack('a', 10, 1000), stack('b', 10, 1000)], 1500);
  assert.deepEqual(moves, [{ id: 'a', qty: 10, ms: 1000 }, { id: 'b', qty: 5, ms: 500 }]);
  assert.equal(ms, 1500);
});

test('fitStacks: a stack worth no work always fits, and no room takes nothing else', () => {
  assert.deepEqual(fitStacks([stack('a', 3, 0), stack('b', 1, 100)], 0).moves, [{ id: 'a', qty: 3, ms: 0 }]);
  assert.deepEqual(fitStacks([stack('b', 4, 400)], 50).moves, []);
  assert.deepEqual(fitStacks([stack('b', 4, 400)], Infinity).moves, [{ id: 'b', qty: 4, ms: 400 }]);
});

test('giveStacks re-weighs by the recipe and is held by the free room', () => {
  const steel = [{ id: 'ore', qty: 1 }, { id: 'coal', qty: 2 }];
  const out = giveStacks({ perAction: steel, intervalMs: 2000, freeMs: 6000, aboard: stock({ ore: 100, coal: 100 }) });
  assert.deepEqual(out, [{ id: 'ore', qty: 3, ms: 3000 }, { id: 'coal', qty: 6, ms: 3000 }]);
});

test('giveStacks: an input it lacks does not hold back the other, and nothing fits under one action', () => {
  const steel = [{ id: 'ore', qty: 1 }, { id: 'coal', qty: 2 }];
  assert.deepEqual(giveStacks({ perAction: steel, intervalMs: 2000, freeMs: 4000, aboard: stock({ coal: 3 }) }), [{ id: 'coal', qty: 3, ms: 1500 }]);
  assert.deepEqual(giveStacks({ perAction: steel, intervalMs: 2000, freeMs: 1999, aboard: stock({ ore: 9, coal: 9 }) }), []);
  assert.deepEqual(giveStacks({ perAction: [], intervalMs: 2000, freeMs: 4000, aboard: stock({ ore: 9 }) }), []);
});

test('inputsPlan fills each stop when load and bank allow', () => {
  const plan = inputsPlan({
    demands: [{ key: 'a', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 5000 }],
    freeMs: 100000,
    aboard: stock({}),
    bankQty: stock({ ore: 100 }),
  });
  assert.equal(plan.short, null);
  assert.deepEqual(plan.take, [{ id: 'ore', qty: 5, ms: 5000 }]);
  assert.equal(plan.stops[0].actions, 5);
});

test('inputsPlan gives two Folks the same hours when the load is short', () => {
  const plan = inputsPlan({
    demands: [
      { key: 'fast', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
      { key: 'slow', perAction: [{ id: 'log', qty: 1 }], intervalMs: 4000, freeMs: 100000 },
    ],
    freeMs: 40000,
    aboard: stock({}),
    bankQty: stock({ ore: 9999, log: 9999 }),
  });
  assert.equal(plan.short, 'load');
  const [fast, slow] = plan.stops;
  assert.ok(Math.abs(fast.actions * 1000 - slow.actions * 4000) <= 4000, 'within one action of the same hours');
  assert.ok(plan.ms <= 40000);
  assert.ok(plan.ms > 36000, 'the load is used');
});

test('inputsPlan: a short bank shares an item fairly and says so', () => {
  const plan = inputsPlan({
    demands: [
      { key: 'a', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
      { key: 'b', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
    ],
    freeMs: 1000000,
    aboard: stock({}),
    bankQty: stock({ ore: 10 }),
  });
  assert.equal(plan.short, 'bank');
  assert.deepEqual(plan.stops.map((s) => s.actions), [5, 5]);
  assert.deepEqual(plan.take, [{ id: 'ore', qty: 10, ms: 10000 }]);
});

test('inputsPlan: a stop that wants less than its share leaves the rest to the other', () => {
  const plan = inputsPlan({
    demands: [
      { key: 'small', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 2000 },
      { key: 'big', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
    ],
    freeMs: 10000,
    aboard: stock({}),
    bankQty: stock({ ore: 999 }),
  });
  assert.deepEqual(plan.stops.map((s) => s.actions), [2, 8]);
});

test('inputsPlan: a stop whose item the bank lacks does not starve the others', () => {
  const plan = inputsPlan({
    demands: [
      { key: 'smith', perAction: [{ id: 'ore', qty: 1 }, { id: 'coal', qty: 2 }], intervalMs: 1000, freeMs: 50000 },
      { key: 'cook', perAction: [{ id: 'beef', qty: 1 }], intervalMs: 1000, freeMs: 50000 },
    ],
    freeMs: 1000000,
    aboard: stock({}),
    bankQty: stock({ ore: 999, coal: 999 }),
  });
  assert.deepEqual(plan.stops.map((s) => s.actions), [50, 0]);
  assert.equal(plan.short, 'bank');
  assert.deepEqual(plan.take.map(({ id, qty }) => [id, qty]), [['ore', 50], ['coal', 100]]);
});

test('inputsPlan: a stop stops rising when its own item runs out, the others go on', () => {
  const plan = inputsPlan({
    demands: [
      { key: 'few', perAction: [{ id: 'beef', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
      { key: 'a', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
      { key: 'b', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
    ],
    freeMs: 1000000,
    aboard: stock({}),
    bankQty: stock({ beef: 3, ore: 40 }),
  });
  assert.deepEqual(plan.stops.map((s) => s.actions), [3, 20, 20]);
  assert.equal(plan.short, 'bank');
});

test('inputsPlan: after one stop runs out, a short load is shared by the rest', () => {
  const plan = inputsPlan({
    demands: [
      { key: 'none', perAction: [{ id: 'beef', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
      { key: 'a', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
      { key: 'b', perAction: [{ id: 'log', qty: 1 }], intervalMs: 1000, freeMs: 100000 },
    ],
    freeMs: 10000,
    aboard: stock({}),
    bankQty: stock({ ore: 999, log: 999 }),
  });
  assert.deepEqual(plan.stops.map((s) => s.actions), [0, 5, 5]);
  assert.equal(plan.ms, 10000);
});

test('inputsPlan counts what is aboard first and names what no stop uses', () => {
  const plan = inputsPlan({
    demands: [{ key: 'a', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 5000 }],
    freeMs: 100000,
    aboard: stock({ ore: 3, old: 7 }),
    aboardIds: ['ore', 'old'],
    bankQty: stock({ ore: 100 }),
  });
  assert.deepEqual(plan.take, [{ id: 'ore', qty: 2, ms: 2000 }]);
  assert.deepEqual(plan.spare, ['old']);
});

test('inputsPlan: an empty route, or a stop with a full room, asks for nothing', () => {
  const none = inputsPlan({ demands: [], freeMs: 1000, aboard: stock({}), bankQty: stock({}) });
  assert.deepEqual(none, { stops: [], take: [], spare: [], ms: 0, short: null });
  const full = inputsPlan({ demands: [{ key: 'a', perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000, freeMs: 0 }], freeMs: 1000, aboard: stock({ ore: 4 }), aboardIds: ['ore'], bankQty: stock({ ore: 9 }) });
  assert.deepEqual(full.take, []);
  assert.deepEqual(full.spare, [], 'its recipe still uses what is aboard');
});

test('raidPlan: purse first, then each side dearest stack first, whole units, never past the value', () => {
  const sides = [
    { side: 'haul', stacks: [{ id: 'ore', qty: 100, unit: 5 }, { id: 'gem', qty: 2, unit: 400 }, { id: 'junk', qty: 50, unit: 0 }] },
    { side: 'stock', stacks: [{ id: 'coal', qty: 10, unit: 20 }] },
    { side: 'town', stacks: [{ id: 'plank', qty: 10, unit: 100 }] },
  ];
  assert.deepEqual(raidPlan({ purseGp: 300, sides }, 250), { purse: 250, moves: [], gp: 250 });
  // 300 purse, then the gems (800, the dearest stack), then ore for what is left.
  assert.deepEqual(raidPlan({ purseGp: 300, sides }, 1400), { purse: 300, moves: [{ side: 'haul', id: 'gem', qty: 2 }, { side: 'haul', id: 'ore', qty: 60 }], gp: 1400 });
  // Everything worth something, town goods last, the worthless stack never.
  const all = raidPlan({ purseGp: 0, sides }, 1e9);
  assert.deepEqual(all.moves, [{ side: 'haul', id: 'gem', qty: 2 }, { side: 'haul', id: 'ore', qty: 100 }, { side: 'stock', id: 'coal', qty: 10 }, { side: 'town', id: 'plank', qty: 10 }]);
  assert.equal(all.gp, 800 + 500 + 200 + 1000);
});

test('raidPlan skips a unit worth more than what is left for cheaper ones, and stays under the value', () => {
  const sides = [{ side: 'haul', stacks: [{ id: 'gem', qty: 3, unit: 400 }, { id: 'ore', qty: 100, unit: 7 }] }];
  const plan = raidPlan({ sides }, 1000);
  assert.deepEqual(plan.moves, [{ side: 'haul', id: 'gem', qty: 2 }, { side: 'haul', id: 'ore', qty: 28 }]);
  assert.equal(plan.gp, 996);
  assert.deepEqual(raidPlan({ sides }, 0), { purse: 0, moves: [], gp: 0 });
  assert.deepEqual(raidPlan({ purseGp: NaN, sides: [] }, NaN), { purse: 0, moves: [], gp: 0 });
});
