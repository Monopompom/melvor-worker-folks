import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_HOURS, capacityMs, isEmpty, usedMs, fits, put, take, entries, fillView, splitForBank } from '../src/room-model.mjs';
import { TIERS, createRoom, normalizeRoom } from '../src/folk.mjs';

const H = 3_600_000;

test('room size: 2 h for a Trainee up to 8 h for a Foreman, plus extra hours', () => {
  assert.deepEqual(TIERS.map((t) => ROOM_HOURS[t]), [2, 3.5, 5, 6.5, 8]);
  assert.equal(capacityMs('Newbie'), 2 * H);
  assert.equal(capacityMs('Expert', 4), 12 * H);
  assert.equal(capacityMs('Middle', -3), 5 * H);
  assert.equal(capacityMs('Boss'), 0);
});

test('put and take keep each stack’s share of the work', () => {
  const room = createRoom();
  put(room, 'melvorD:Oak_Logs', 10, 30_000);
  put(room, 'melvorD:Oak_Logs', 10, 30_000);
  put(room, 'melvorD:Bird_Nest', 1, 0);
  assert.equal(usedMs(room), 60_000);
  assert.deepEqual(take(room, 'melvorD:Oak_Logs', 5), { qty: 5, ms: 15_000 });
  assert.equal(usedMs(room), 45_000);
  assert.deepEqual(take(room, 'melvorD:Oak_Logs'), { qty: 15, ms: 45_000 });
  assert.deepEqual(take(room, 'melvorD:Oak_Logs', 3), { qty: 0, ms: 0 });
  assert.deepEqual(entries(room), [{ id: 'melvorD:Bird_Nest', qty: 1, ms: 0 }]);
  take(room, 'melvorD:Bird_Nest');
  assert.equal(isEmpty(room), true);
});

test('put ignores a quantity that is not a whole positive number', () => {
  const room = createRoom();
  put(room, 'a', 0, 1000);
  put(room, 'a', 1.5, 1000);
  assert.equal(isEmpty(room), true);
});

test('fits counts the work held against the room’s size', () => {
  const room = createRoom();
  put(room, 'a', 1, 2 * H - 3000);
  assert.equal(fits(room, 2 * H, 3000), true);
  assert.equal(fits(room, 2 * H, 3001), false);
  assert.equal(fits(room, 2 * H, 0), true);
});

test('entries list the biggest share of work first', () => {
  const room = createRoom();
  put(room, 'b', 1, 100);
  put(room, 'a', 1, 500);
  put(room, 'c', 1, 100);
  assert.deepEqual(entries(room).map((e) => e.id), ['a', 'b', 'c']);
});

test('normalizeRoom keeps good stacks and drops the rest', () => {
  assert.deepEqual(normalizeRoom(undefined), { haul: {} });
  assert.deepEqual(normalizeRoom({ haul: [1] }), { haul: {} });
  const room = normalizeRoom({ haul: { a: { qty: 3, ms: 900 }, b: { qty: 0, ms: 5 }, c: { qty: 2, ms: -1 }, d: null, e: { qty: 'x' } } });
  assert.deepEqual(room, { haul: { a: { qty: 3, ms: 900 }, c: { qty: 2, ms: 0 } } });
});

test('fillView gives hours and a percent capped at 100', () => {
  const room = createRoom();
  put(room, 'a', 1, H);
  assert.deepEqual(fillView(room, 2 * H), { usedHours: 1, capHours: 2, percent: 50 });
  put(room, 'a', 1, 3 * H);
  assert.equal(fillView(room, 2 * H).percent, 100);
  assert.equal(fillView(room, 0).percent, 0);
});

test('splitForBank: kinds in the bank fit, new kinds take the free slots in order, the rest is lost', () => {
  const list = [{ id: 'axe', qty: 1 }, { id: 'logs', qty: 90 }, { id: 'ore', qty: 5 }, { id: 'axe', qty: 1 }, { id: 'gone', qty: 2 }, { id: 'bar', qty: 3 }];
  const r = splitForBank(list, { freeSlots: 1, inBank: (id) => id === 'logs', known: (id) => id !== 'gone' });
  assert.deepEqual(r.kept, [{ id: 'axe', qty: 1 }, { id: 'logs', qty: 90 }, { id: 'axe', qty: 1 }]);
  assert.deepEqual(r.lost, [{ id: 'ore', qty: 5 }, { id: 'gone', qty: 2 }, { id: 'bar', qty: 3 }]);
  assert.deepEqual(splitForBank(list.slice(0, 2), { freeSlots: -3, inBank: () => false }).lost.map((e) => e.id), ['axe', 'logs']);
});
