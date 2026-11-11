import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/depot-model.mjs';
import { normalizeAnswer, restockPlan } from '../src/room-model.mjs';
import { parseRoot, serializeRoot } from '../src/folk.mjs';
import { heldBy } from '../src/backup-model.mjs';

test('a depot is 48 hours of work unless the other mod says otherwise', () => {
  assert.equal(D.DEPOT_HOURS, 48);
  assert.equal(D.hoursOf(24), 24);
  assert.equal(D.hoursOf(0), 48);
  assert.equal(D.hoursOf('x'), 48);
  assert.equal(D.capMs(2), 7_200_000);
});

test('saved depots keep only clean stacks, a name and the dropped mark', () => {
  const saved = {
    tent1: { name: 'Camp', hours: 24, room: { haul: { a: { qty: 3.7, ms: 100 }, b: { qty: 0, ms: 5 } }, stock: { c: { qty: 2, ms: -4 } }, town: { d: { qty: 1, ms: 1 } } } },
    tent2: { dropped: true, room: 'bad' },
    '': {},
    tent3: 7,
  };
  assert.deepEqual(D.normalize(saved), {
    tent1: { name: 'Camp', hours: 24, room: { haul: { a: { qty: 3, ms: 100 } }, stock: { c: { qty: 2, ms: 0 } }, town: {}, purse: {} }, dropped: false },
    tent2: { name: '', hours: 48, room: { haul: {}, stock: {}, town: {}, purse: {} }, dropped: true },
  });
  assert.deepEqual(D.normalize(null), {});
  assert.equal(D.isEmpty(D.emptyRoom()), true);
  assert.equal(D.isEmpty({ haul: {}, stock: { c: { qty: 1, ms: 1 } } }), false);
});

test('a Folk fills its own room first, then the depot, and stops only when both are full', () => {
  assert.equal(D.target({ roomFreeMs: 5000, depotFreeMs: 9000, chargeMs: 3000 }), 'room');
  assert.equal(D.target({ roomFreeMs: 1000, depotFreeMs: 9000, chargeMs: 3000 }), 'depot');
  assert.equal(D.target({ roomFreeMs: 1000, depotFreeMs: 2000, chargeMs: 3000 }), 'over');
  assert.equal(D.target({ roomFreeMs: 1000, depotFreeMs: undefined, chargeMs: 3000 }), 'over', 'no depot');
});

test('inputs come from the Folk\'s stock first, then the depot', () => {
  assert.deepEqual(D.draw(5, 3, 10), { fromStock: 3, fromDepot: 2, short: 0 });
  assert.deepEqual(D.draw(5, 9, 10), { fromStock: 5, fromDepot: 0, short: 0 });
  assert.deepEqual(D.draw(5, 1, 2), { fromStock: 1, fromDepot: 2, short: 2 });
});

test('Restock all gives each member an equal share of the free hours', () => {
  assert.equal(D.shares(90_000, 3), 30_000);
  assert.equal(D.shares(90_000, 0), 0);
  assert.equal(D.shares(0, 2), 0);
});

test('a Restock all that moves nothing says the depot is full when a share is under one action', () => {
  const plan = (freeMs, bank) => restockPlan({ perAction: [{ id: 'a', qty: 1 }], intervalMs: 2400, freeMs, bankQty: () => bank });
  // 850 ms each of a nearly full depot, the bank holding plenty: the room is the limit.
  assert.equal(D.restockRefusal([plan(850, 100_000), plan(850, 100_000)]), 'noRoom');
  // Room for hours, an empty bank: the bank is the limit.
  assert.equal(D.restockRefusal([plan(3_600_000, 0), plan(3_600_000, 0)]), 'noBank');
  // Both short at once: the depot is full first.
  assert.equal(D.restockRefusal([plan(850, 0)]), 'noRoom');
  assert.equal(D.restockRefusal([]), 'noBank');
});

test('the bank-access answer may name a depot, only for a Folk on its room', () => {
  assert.deepEqual(normalizeAnswer('room'), { access: 'room', depot: null });
  assert.deepEqual(normalizeAnswer('nonsense'), { access: 'bank', depot: null });
  assert.deepEqual(normalizeAnswer({ access: 'room', depot: 'tent1' }), { access: 'room', depot: 'tent1' });
  assert.deepEqual(normalizeAnswer({ access: 'bank', depot: 'tent1' }), { access: 'bank', depot: null });
  assert.deepEqual(normalizeAnswer({ access: 'room', depot: 5 }), { access: 'room', depot: null });
  assert.deepEqual(normalizeAnswer(null), { access: 'bank', depot: null });
});

test('depots ride in the save root and count with what the crew holds for a backup', () => {
  const depots = { tent1: { name: 'Camp', hours: 48, room: { haul: { 'melvorD:Coal_Ore': { qty: 40, ms: 1 } }, stock: { 'melvorD:Iron_Ore': { qty: 5, ms: 1 } } }, dropped: false } };
  const record = serializeRoot([], {}, {}, null, {}, null, depots);
  assert.deepEqual(parseRoot(record).root.depots, depots);
  assert.deepEqual(parseRoot(serializeRoot([])).root.depots, {}, 'an older root: none');
  assert.deepEqual(heldBy(record).items, { 'melvorD:Coal_Ore': 40, 'melvorD:Iron_Ore': 5 });
  assert.deepEqual(D.heldBy(depots), { 'melvorD:Coal_Ore': 40, 'melvorD:Iron_Ore': 5 });
});
