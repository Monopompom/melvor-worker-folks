import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createFolk, normalizeFolk, migrateRoot, parseRoot, serializeRoot, normalizeLost, SAVE_VERSION, TIERS } from '../src/folk.mjs';

test('createFolk fills defaults and rejects bad input', () => {
  const f = createFolk({ id: 'a', slot: 0, tier: 'Newbie', name: 'Ada' });
  assert.deepEqual(f, { id: 'a', slot: 0, tier: 'Newbie', name: 'Ada', skillId: null, loadout: {}, debt: 0, debtCurrency: null, debtMs: 0, onStrike: false, cooldownTicks: 0, wageCarry: 0, overtime: false, strikes: 0, restartWhenReady: false, restartPick: null, hp: null, place: null, travel: 'idle', hiredAt: 0, traitState: { traits: [], waiting: [], counts: {} }, paid: null, room: { haul: {}, stock: {}, town: {}, purse: {} }, ownStock: false, restockAt: null, townsfolk: false, demand: [] });
  assert.equal(createFolk({ id: 'a', slot: 0, tier: 'Newbie', name: 'Ada', paid: 4200 }).paid, 4200);
  assert.throws(() => createFolk({ id: 'a', slot: -1, tier: 'Newbie', name: 'Ada' }));
  assert.throws(() => createFolk({ id: 'a', slot: 0, tier: 'Boss', name: 'Ada' }));
  assert.throws(() => createFolk({ id: '', slot: 0, tier: 'Newbie', name: 'Ada' }));
});

test('normalizeFolk repairs optional fields and rejects impossible records', () => {
  const ok = normalizeFolk({ id: 'x', slot: 3, tier: 'Expert', name: 'Bram', debt: -5, strikes: 'two', loadout: [1], skillId: 42 });
  assert.equal(ok.debt, 0);
  assert.equal(ok.strikes, 0);
  assert.deepEqual(ok.loadout, {});
  assert.equal(ok.skillId, null);
  assert.equal(normalizeFolk(null), null);
  assert.equal(normalizeFolk({ slot: 0, tier: 'Newbie', name: 'x' }), null);
  assert.equal(normalizeFolk({ id: 'a', slot: 1.5, tier: 'Newbie', name: 'x' }), null);
});

test('migrateRoot upgrades a pre-version root (v0) to the current version', () => {
  const legacy = { folks: [{ id: 'a', slot: 0, tier: 'Junior', name: 'Cora' }] };
  const { root, applied } = migrateRoot(legacy);
  assert.deepEqual(applied, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(root.v, SAVE_VERSION);
  assert.equal(root.folks[0].strikes, 0);
  assert.equal(root.folks[0].cooldownTicks, 0);
  assert.equal('cooldownEnd' in root.folks[0], false);
  assert.deepEqual(root.reserve, {});
});

test('v1 → v2 converts a running wall-clock cooldown into ticks and flags unpaid debt as a strike', () => {
  const v1 = { v: 1, folks: [{ id: 'a', slot: 0, tier: 'Junior', name: 'Cora', debt: 50, cooldownEnd: Date.now() + 60000, strikes: 1 }] };
  const { root } = migrateRoot(v1);
  const folk = root.folks[0];
  assert.ok(folk.cooldownTicks > 1100 && folk.cooldownTicks <= 1200);
  assert.equal(folk.onStrike, true);
  assert.equal(folk.debtMs, 0);
});

test('v4 → v5 gives every Folk an empty trait state; parseRoot keeps a saved one', () => {
  const v4 = { v: 4, folks: [{ id: 'a', slot: 0, tier: 'Senior', name: 'Cora', strikes: 3 }] };
  const { root } = migrateRoot(v4);
  assert.deepEqual(root.folks[0].traitState, { traits: [], waiting: [], counts: {} });
  const saved = { traits: [{ id: 'Loyal' }], waiting: [{ id: 'Lucky' }], counts: { Frugal: 1000 } };
  const parsed = parseRoot({ v: 5, folks: [{ id: 'a', slot: 0, tier: 'Senior', name: 'Cora', traitState: saved }] });
  assert.deepEqual(parsed.root.folks[0].traitState, saved);
});

test('migrateRoot is a no-op on a current root and leaves newer roots alone', () => {
  const current = { v: SAVE_VERSION, folks: [] };
  const r1 = migrateRoot(current);
  assert.deepEqual(r1.applied, []);
  assert.equal(r1.root, current);
  const future = { v: SAVE_VERSION + 5, folks: [], extra: true };
  assert.equal(migrateRoot(future).root, future);
});

test('parseRoot never throws: corrupt JSON, wrong shapes and missing roots yield an empty crew', () => {
  for (const bad of ['{not json', '[]', 'null', '42', undefined, { v: 1, folks: 'nope' }]) {
    const r = parseRoot(bad);
    assert.deepEqual(r.root.folks, [], `input ${String(bad)}`);
  }
  assert.equal(parseRoot('{bad').corrupt, true);
  assert.equal(parseRoot({ v: 1, folks: 'nope' }).corrupt, false);
});

test('parseRoot drops invalid, duplicate-id and duplicate-slot records and sorts by slot', () => {
  const r = parseRoot({
    v: 1,
    folks: [
      { id: 'b', slot: 2, tier: 'Middle', name: 'B' },
      { id: 'a', slot: 0, tier: 'Newbie', name: 'A' },
      { id: 'a', slot: 5, tier: 'Newbie', name: 'dup id' },
      { id: 'c', slot: 2, tier: 'Senior', name: 'dup slot' },
      { id: 'd', slot: 1, tier: 'Nope', name: 'bad tier' },
    ],
  });
  assert.deepEqual(r.root.folks.map((f) => f.id), ['a', 'b']);
  assert.equal(r.dropped, 3);
});

test('serializeRoot / parseRoot round-trip preserves every field', () => {
  const folk = createFolk({ id: 'z', slot: 7, tier: TIERS[4], name: 'Zane', hiredAt: 123 });
  folk.skillId = 'melvorD:Mining';
  folk.loadout = { 'melvorD:Cape': { id: 'melvorF:Mining_Skillcape', qty: 1 } };
  folk.debt = 500;
  folk.debtCurrency = 'melvorD:GP';
  folk.debtMs = 6000;
  folk.onStrike = true;
  folk.cooldownTicks = 999;
  folk.wageCarry = 0.25;
  folk.strikes = 2;
  folk.place = { q: 14, r: 16 };
  folk.travel = 'with';
  const back = parseRoot(serializeRoot([folk], { 'melvorD:GP': 1500 }));
  assert.deepEqual(back.root.folks, [folk]);
  assert.deepEqual(back.root.reserve, { 'melvorD:GP': 1500 });
  assert.equal(back.applied.length, 0);
});

// A real save: slot 3 (FolksScanB) in the browser, Worker Folks 1.2.0, read from the game save on 20 Oct 2026.
const realV3 = readFileSync(new URL('./fixtures/save-v3-folksscanb.json', import.meta.url), 'utf8').trim();

test('a real v3 save migrates to v9: every Folk kept as it was, with no place, not travelling, no traits, no known cost and an empty room', () => {
  const before = JSON.parse(realV3);
  const r = parseRoot(realV3);
  assert.deepEqual(r.applied, [3, 4, 5, 6, 7, 8]);
  assert.equal(r.corrupt, false);
  assert.equal(r.dropped, 0);
  assert.equal(r.root.v, 9);
  assert.equal(r.root.commissions, null);
  assert.equal(r.root.folks.length, before.folks.length);
  r.root.folks.forEach((folk, i) => {
    const { place, travel, traitState, paid, room, ownStock, restockAt, townsfolk, restartPick, demand, ...rest } = folk;
    assert.equal(restockAt, null);
    assert.equal(townsfolk, false);
    assert.deepEqual(demand, []);
    assert.equal(restartPick, null);
    assert.equal(paid, null);
    assert.deepEqual(room, { haul: {}, stock: {}, town: {}, purse: {} });
    assert.equal(ownStock, false);
    assert.equal(place, null);
    assert.equal(travel, 'idle');
    assert.deepEqual(traitState, { traits: [], waiting: [], counts: {} });
    assert.deepEqual(rest, before.folks[i], folk.name);
  });
  assert.deepEqual(r.root.reserve, before.reserve);
  // Saved again, it reads back unchanged with nothing left to migrate.
  const again = parseRoot(serializeRoot(r.root.folks, r.root.reserve, r.root.frozen));
  assert.deepEqual(again.applied, []);
  assert.deepEqual(again.root, r.root);
});

test('place and travel: only plain integer hexes and known states survive', () => {
  const base = { id: 'a', slot: 0, tier: 'Newbie', name: 'A' };
  assert.deepEqual(normalizeFolk({ ...base, place: { q: -3, r: 7, extra: 1 } }).place, { q: -3, r: 7 });
  for (const bad of [{ q: 1.5, r: 0 }, { q: '1', r: 0 }, [1, 2], 'here', 5]) assert.equal(normalizeFolk({ ...base, place: bad }).place, null);
  assert.equal(normalizeFolk({ ...base, travel: 'flying' }).travel, 'idle');
  assert.equal(normalizeFolk({ ...base, travel: 'walking' }).travel, 'walking');
  assert.equal(normalizeFolk({ ...base, travel: 'with' }).travel, 'with');
});

test('a room rides in the save and reads back as it was', () => {
  const folk = createFolk({ id: 'r', slot: 0, tier: 'Junior', name: 'Rook' });
  folk.room.haul['melvorD:Bird_Nest'] = { qty: 4, ms: 12_000 };
  folk.room.stock['melvorD:Coal_Ore'] = { qty: 90, ms: 45_000 };
  folk.room.town['melvorD:Oak_Logs'] = { qty: 300, ms: 900_000 };
  folk.room.purse['melvorD:GP'] = 1_250;
  folk.ownStock = true;
  folk.restockAt = 1.5;
  const back = parseRoot(serializeRoot([folk]));
  assert.deepEqual(back.root.folks[0].room, { haul: { 'melvorD:Bird_Nest': { qty: 4, ms: 12_000 } }, stock: { 'melvorD:Coal_Ore': { qty: 90, ms: 45_000 } }, town: { 'melvorD:Oak_Logs': { qty: 300, ms: 900_000 } }, purse: { 'melvorD:GP': 1_250 } });
  assert.equal(back.root.folks[0].ownStock, true);
  assert.equal(back.root.folks[0].restockAt, 1.5);
  assert.deepEqual(normalizeFolk({ ...folk, room: { purse: { a: -1, b: 'x', c: 2.5, '': 3 } } }).room.purse, { c: 2.5 });
  for (const bad of [0, -2, 'x', Infinity]) assert.equal(normalizeFolk({ ...folk, restockAt: bad }).restockAt, null);
  assert.deepEqual(normalizeFolk({ ...folk, room: 'full' }).room, { haul: {}, stock: {}, town: {}, purse: {} });
  assert.equal(normalizeFolk({ ...folk, ownStock: 'yes' }).ownStock, false);
  assert.equal(normalizeFolk({ ...folk, ownStock: true }).ownStock, true);
});

test('a Townsfolk stays one through the save; anything but true is not one', () => {
  const folk = createFolk({ id: 't', slot: 0, tier: 'Newbie', name: 'Tam' });
  assert.equal(folk.townsfolk, false);
  folk.townsfolk = true;
  assert.equal(parseRoot(serializeRoot([folk])).root.folks[0].townsfolk, true);
  assert.equal(normalizeFolk({ ...folk, townsfolk: 'yes' }).townsfolk, false);
  assert.equal(normalizeFolk({ ...folk, townsfolk: undefined }).townsfolk, false);
});

test('normalizeLost keeps whole stacks of frozen slots only', () => {
  const frozen = { 1: 9000 };
  assert.deepEqual(normalizeLost(undefined, frozen), {});
  assert.deepEqual(normalizeLost({ 1: [{ id: 'a', qty: 2, x: 1 }, { id: 'b', qty: 1.5 }, null], 2: [{ id: 'c', qty: 1 }], 3: 'x' }, frozen), { 1: [{ id: 'a', qty: 2 }] });
  const back = parseRoot(serializeRoot([], {}, frozen, null, { 1: [{ id: 'a', qty: 2 }] }));
  assert.deepEqual(back.root.lost, { 1: [{ id: 'a', qty: 2 }] });
});

test('v7 → v8 keeps each room as it was, adds an empty town side and no commissions yet', () => {
  const v7 = { v: 7, folks: [{ id: 'a', slot: 0, tier: 'Middle', name: 'Ada', room: { haul: { x: { qty: 2, ms: 10 } }, stock: {} } }], board: null };
  const { root, applied } = migrateRoot(v7);
  assert.deepEqual(applied, [7, 8]);
  assert.deepEqual(root.folks[0].room, { haul: { x: { qty: 2, ms: 10 } }, stock: {}, town: {}, purse: {} });
  assert.equal(root.commissions, null);
});

test('v8 → v9 keeps each room as it was, adds an empty purse and auto-restock off', () => {
  const v8 = { v: 8, folks: [{ id: 'a', slot: 0, tier: 'Middle', name: 'Ada', ownStock: true, room: { haul: {}, stock: { c: { qty: 9, ms: 30 } }, town: { t: { qty: 1, ms: 5 } } } }], board: null, commissions: null };
  const { root, applied } = migrateRoot(v8);
  assert.deepEqual(applied, [8]);
  assert.equal(root.v, 9);
  assert.deepEqual(root.folks[0].room, { haul: {}, stock: { c: { qty: 9, ms: 30 } }, town: { t: { qty: 1, ms: 5 } }, purse: {} });
  assert.equal(root.folks[0].restockAt, null);
  assert.equal(root.folks[0].ownStock, true);
});

test('the commissions state rides in the save as an object; anything else reads as none', () => {
  const state = { commissions: [{ id: 'c1' }], ticks: 5, standing: { points: 12 } };
  assert.deepEqual(parseRoot(serializeRoot([], {}, {}, null, {}, state)).root.commissions, state);
  assert.equal(parseRoot({ v: 8, folks: [], commissions: [1, 2] }).root.commissions, null);
  assert.equal(parseRoot({ v: 8, folks: [], commissions: 'x' }).root.commissions, null);
});

test('the pick to restart on is kept only while a strike or its restart is pending', () => {
  const base = { id: 'x', slot: 0, tier: 'Newbie', name: 'Bram', debt: 10, debtCurrency: 'melvorD:GP' };
  assert.deepEqual(normalizeFolk({ ...base, onStrike: true, restartPick: { trees: ['melvorD:Oak'] } }).restartPick, { trees: ['melvorD:Oak'] });
  assert.deepEqual(normalizeFolk({ ...base, debt: 0, restartWhenReady: true, restartPick: { cook: 'melvorD:Fire' } }).restartPick, { cook: 'melvorD:Fire' });
  assert.equal(normalizeFolk({ ...base, debt: 0, restartPick: { cook: 'melvorD:Fire' } }).restartPick, null, 'nothing pending: dropped');
  assert.equal(normalizeFolk({ ...base, onStrike: true, restartPick: ['x'] }).restartPick, null);
  assert.equal(normalizeFolk({ ...base, onStrike: true }).restartPick, null);
});
