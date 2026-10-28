import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slotsFor, sizesFor, rerollUnlocked, rollGpRate, niceQuantity, quantityFor, candidatePool, rollExtra, rollOrder, createBoard,
  normalizeBoard, normalizeOrder, fill, refresh, advance, ticksLeft, orderFor, deliver, rewardFor, reroll, canReroll, pickWeighted,
  REFRESH_TICKS, RECENT_RECIPES, GP_RATE,
} from '../src/work-orders-model.mjs';

/** A repeatable rng: the values in turn, then the last one again. */
const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
const ids = () => { let n = 0; return () => `o${++n}`; };
const wc = (level, itemId, intervalMs = 3000) => ({ skillId: 'wc', itemId, level, intervalMs, perAction: 1 });
const CANDIDATES = [
  wc(1, 'Normal_Logs'), wc(15, 'Oak_Logs', 4000), wc(30, 'Willow_Logs', 5000),
  { skillId: 'mine', itemId: 'Copper_Ore', level: 1, intervalMs: 3000, perAction: 1 },
  { skillId: 'herb', itemId: 'Potion_I', itemIds: ['Potion_II', 'Potion_III'], level: 5, intervalMs: 2000, perAction: 1 },
];

test('board size and sizes by Hiring level', () => {
  assert.deepEqual([slotsFor(7), slotsFor(8), slotsFor(29), slotsFor(30), slotsFor(69), slotsFor(70), slotsFor(120)], [0, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(sizesFor(7), []);
  assert.deepEqual(sizesFor(8), ['Small']);
  assert.deepEqual(sizesFor(30), ['Small', 'Medium']);
  assert.deepEqual(sizesFor(70), ['Small', 'Medium', 'Large']);
  assert.deepEqual([rerollUnlocked(49), rerollUnlocked(50)], [false, true]);
});

test('the GP share is 0.5× to 3× in quarter steps', () => {
  assert.equal(rollGpRate(() => 0), GP_RATE.min);
  assert.equal(rollGpRate(() => 0.9999), GP_RATE.max);
  for (let r = 0; r < 1; r += 0.07) {
    const g = rollGpRate(() => r);
    assert.ok(g >= 0.5 && g <= 3 && Number.isInteger(g * 4), `${g}`);
  }
});

test('quantities are hours of work, rounded to two significant digits', () => {
  assert.deepEqual([niceQuantity(0), niceQuantity(7.4), niceQuantity(87), niceQuantity(1234), niceQuantity(2399)], [1, 7, 87, 1200, 2400]);
  assert.equal(quantityFor({ hours: 2, intervalMs: 3000 }), 2400);
  assert.equal(quantityFor({ hours: 2, intervalMs: 2000, perAction: 5 }), 18000);
  assert.equal(quantityFor({ hours: 16, intervalMs: 60000 }), 960);
});

test('candidates: the newest recipes per skill, broken entries dropped', () => {
  const many = Array.from({ length: 9 }, (_, i) => wc(i * 10, `Log_${i}`));
  const pool = candidatePool([...many, null, { skillId: 'x', itemId: 'y', intervalMs: 0 }]);
  assert.equal(pool.length, RECENT_RECIPES);
  assert.deepEqual(pool.map((c) => c.level), [80, 70, 60, 50, 40]);
});

test('a Large extra is one pick from the pool; without a diploma or junk those are skipped', () => {
  assert.deepEqual(rollExtra({ rng: seq(0, 0), diplomaId: 'Amulet', junkIds: ['Boot'] }), { kind: 'tokens', qty: 1 });
  assert.deepEqual(rollExtra({ rng: seq(0.35, 0), diplomaId: 'Amulet', junkIds: ['Boot'] }), { kind: 'item', itemId: 'Amulet', qty: 1 });
  assert.deepEqual(rollExtra({ rng: seq(0.6, 0, 0), diplomaId: 'Amulet', junkIds: ['Boot'] }), { kind: 'item', itemId: 'Boot', qty: 20 });
  assert.deepEqual(rollExtra({ rng: seq(0.95, 0.999) }), { kind: 'gems', qty: 15 });
  for (let r = 0; r < 1; r += 0.05) {
    const e = rollExtra({ rng: () => r });
    assert.ok(e.kind === 'tokens' || e.kind === 'gems', 'no diploma, no junk');
    if (e.kind === 'tokens') assert.ok(e.qty >= 1 && e.qty <= 2);
  }
});

test('rollOrder: a new skill first, never an item twice, Small only at Hiring 8', () => {
  const makeId = ids();
  const first = rollOrder({ candidates: CANDIDATES, level: 8, rng: seq(0), makeId });
  assert.equal(first.skillId, 'wc');
  assert.equal(first.itemId, 'Willow_Logs');
  assert.equal(first.size, 'Small');
  assert.equal(first.qty, 1400);
  assert.deepEqual({ delivered: first.delivered, state: first.state, wages: first.wages, extra: first.extra }, { delivered: 0, state: 'open', wages: 0, extra: null });
  const second = rollOrder({ candidates: CANDIDATES, level: 8, rng: seq(0), makeId, onBoard: [first] });
  assert.notEqual(second.skillId, 'wc');
  const herb = rollOrder({ candidates: CANDIDATES, level: 8, rng: seq(0.99), makeId });
  assert.deepEqual(herb.itemIds, ['Potion_I', 'Potion_II', 'Potion_III']);
  const onlyWc = rollOrder({ candidates: [wc(1, 'A')], level: 8, rng: seq(0), makeId, onBoard: [{ ...first, itemId: 'A', itemIds: ['A'] }] });
  assert.equal(onlyWc, null, 'nothing left to ask for');
  assert.equal(rollOrder({ candidates: CANDIDATES, level: 7, makeId }), null);
});

test('a Large order carries its extra', () => {
  // Size roll: weights 6 / 3 / 1 of 10, so 0.95 is Large.
  const o = rollOrder({ candidates: [wc(1, 'A')], level: 70, rng: seq(0, 0, 0.95, 0, 0), makeId: ids() });
  assert.equal(o.size, 'Large');
  assert.deepEqual(o.extra, { kind: 'tokens', qty: 1 });
});

test('fill and refresh: delivered and untouched orders go, one in progress gets one more day', () => {
  const opts = { candidates: CANDIDATES, level: 30, rng: seq(0), makeId: ids() };
  const board = createBoard();
  assert.equal(fill(board, opts).length, 3);
  assert.equal(new Set(board.orders.map((o) => o.itemId)).size, 3);
  const [a, b] = board.orders;
  deliver(a, a.qty); // delivered
  deliver(b, 1); // in progress
  assert.equal(advance(board, REFRESH_TICKS - 1), false);
  assert.equal(ticksLeft(board), 1);
  assert.equal(advance(board), true);
  const r1 = refresh(board, opts);
  assert.deepEqual(r1.kept.map((o) => o.id), [b.id]);
  assert.equal(b.aged, 1);
  assert.equal(board.orders.length, 3);
  assert.equal(board.ticks, 0);
  const r2 = refresh(board, opts);
  assert.deepEqual(r2.expired.map((o) => o.id), [b.id], 'a second day undelivered: gone');
});

test('deliver counts up to the quantity; orderFor finds the open order an item fills', () => {
  const board = createBoard();
  fill(board, { candidates: CANDIDATES, level: 8, rng: seq(0.99), makeId: ids() });
  const herb = board.orders.find((o) => o.skillId === 'herb');
  assert.equal(orderFor(board, 'Potion_III'), herb);
  assert.deepEqual(deliver(herb, herb.qty - 1), { added: herb.qty - 1, done: false });
  assert.deepEqual(deliver(herb, 50), { added: 1, done: true });
  assert.equal(orderFor(board, 'Potion_III'), undefined, 'a delivered order takes nothing more');
  assert.deepEqual(deliver(herb, 5), { added: 0, done: false });
});

test('rewards: a GP share of the wages, XP in levels worth, tokens and the Large extra; no GP with wages off', () => {
  const base = { size: 'Small', wages: 1000, gpRate: 1.75, extra: null };
  assert.deepEqual(rewardFor(base, { xpToNext: 1000 }), { gp: 1750, xp: 500, tokens: 0, items: [], gems: 0 });
  assert.equal(rewardFor(base, { xpToNext: 1000, wagesOn: false }).gp, 0);
  assert.equal(rewardFor({ ...base, size: 'Medium' }, { xpToNext: 1000 }).tokens, 1);
  assert.deepEqual(rewardFor({ ...base, size: 'Large', extra: { kind: 'tokens', qty: 2 } }, { xpToNext: 1000 }), { gp: 1750, xp: 2000, tokens: 2, items: [], gems: 0 });
  assert.deepEqual(rewardFor({ ...base, size: 'Large', extra: { kind: 'item', itemId: 'Boot', qty: 40 } }, { xpToNext: 10 }).items, [{ itemId: 'Boot', qty: 40 }]);
  assert.equal(rewardFor({ ...base, size: 'Large', extra: { kind: 'gems', qty: 7 } }, { xpToNext: 10 }).gems, 7);
});

test('reroll replaces untouched open orders with other items and keeps the rest', () => {
  const opts = { candidates: [...CANDIDATES, wc(20, 'Teak_Logs'), { skillId: 'mine', itemId: 'Tin_Ore', level: 1, intervalMs: 3000 }], level: 50, rng: seq(0), makeId: ids() };
  const board = createBoard();
  fill(board, opts);
  const [a, b, c] = board.orders;
  deliver(a, 1);
  assert.equal(canReroll(board), true);
  const before = [b.itemId, c.itemId];
  assert.equal(reroll(board, opts), 2);
  assert.equal(board.orders.length, 3);
  assert.equal(board.orders[0], a);
  board.orders.slice(1).forEach((o) => assert.ok(!before.includes(o.itemId), `${o.itemId} was on the board`));
  board.orders.slice(1).forEach((o) => deliver(o, 1));
  assert.equal(canReroll(board), false);
  assert.equal(reroll(board, opts), 0);
});

test('normalizeBoard repairs a saved board and drops what cannot be read', () => {
  assert.deepEqual(normalizeBoard(null), createBoard());
  assert.deepEqual(normalizeBoard('x'), createBoard());
  const good = { id: 'a', skillId: 'wc', itemId: 'Oak', qty: 100, size: 'Medium', delivered: 150, gpRate: 9, wages: -3, aged: 'x', extra: { kind: 'tokens', qty: 1 } };
  const board = normalizeBoard({ ticks: REFRESH_TICKS * 3, orders: [good, good, { id: 'b' }, 5] });
  assert.deepEqual(normalizeOrder({ ...good, paid: { gp: 500, xp: 1200 } }).paid, { gp: 500, xp: 1200 });
  assert.equal(normalizeOrder({ ...good, paid: { gp: 'x' } }).paid, null);
  assert.equal(board.ticks, REFRESH_TICKS);
  assert.equal(board.orders.length, 1);
  assert.deepEqual(board.orders[0], { id: 'a', skillId: 'wc', itemId: 'Oak', itemIds: ['Oak'], qty: 100, delivered: 100, size: 'Medium', gpRate: 3, wages: 0, state: 'done', aged: 0, extra: null, paid: null });
  // A board round-trips through JSON unchanged.
  const fresh = createBoard();
  fill(fresh, { candidates: CANDIDATES, level: 70, rng: seq(0.97, 0.5), makeId: ids() });
  assert.deepEqual(normalizeBoard(JSON.parse(JSON.stringify(fresh))), fresh);
});

test('pickWeighted', () => {
  assert.equal(pickWeighted([], () => 1), undefined);
  assert.equal(pickWeighted(['a', 'b'], (x) => (x === 'a' ? 0 : 1), () => 0), 'b');
});
