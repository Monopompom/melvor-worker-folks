import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { install } from '../src/carry.mjs';
import * as model from '../src/carry-model.mjs';
import * as roomModel from '../src/room-model.mjs';
import * as depotModel from '../src/depot-model.mjs';

const emptyRoom = () => ({ haul: {}, stock: {}, town: {}, purse: {} });
const HOUR = 3_600_000;

/** A small crew around the real room rules, with a bank of plain counts. */
function world({ bank = {} } = {}) {
  const counts = { ...bank };
  const items = new Map();
  const itemOf = (id) => {
    if (!items.has(id)) items.set(id, { id });
    return items.get(id);
  };
  globalThis.game = {
    items: { getObjectByID: itemOf },
    bank: {
      getQty: (item) => counts[item.id] ?? 0,
      removeItemQuantity: (item, qty) => { counts[item.id] -= qty; },
    },
  };
  const folks = new Map();
  const recipes = new Map();
  const depots = new Map();
  const woken = [];
  const moved = [];
  const hiring = {
    crew: { byId: (id) => folks.get(id) },
    room: {
      isCarrier: (f) => f.carrier === true,
      capMs: (f) => f.capMs,
      inputsOf: (f) => recipes.get(f.id) ?? { perAction: [], intervalMs: 0 },
      membersOf: (depotId) => [...folks.values()].filter((f) => f.depot === depotId),
      roomMoved: (f) => moved.push(f.id),
      wake: (f) => woken.push(f.id),
      wakeDepot: (id) => woken.push(id),
      collect: (f) => ({ collected: f.id }),
      stockHome: (f, ids) => {
        const out = [];
        ids.forEach((id) => {
          const { qty } = roomModel.take(f.room, id, Infinity, 'stock');
          counts[id] = (counts[id] ?? 0) + qty;
          out.push({ itemId: id, qty });
        });
        return { items: out, left: [] };
      },
    },
    depots: {
      roomFor: (id) => depots.get(id),
      touched: () => {},
    },
  };
  const ctx = { onModsLoaded: (fn) => fn() };
  const api = install(ctx, { getHiring: () => hiring, model, roomModel, depotModel, log: () => {} });
  const addFolk = (id, o = {}) => {
    const f = { id, name: id, room: emptyRoom(), capMs: HOUR, ...o };
    folks.set(id, f);
    return f;
  };
  return { api, counts, hiring, addFolk, recipes, depots, woken, moved };
}

let w;
beforeEach(() => { w = world({ bank: { ore: 100, coal: 100 } }); });

test('carryTake moves what a Folk made and its purse, keeping each stack\'s work', () => {
  const courier = w.addFolk('c', { carrier: true });
  const miner = w.addFolk('m');
  roomModel.put(miner.room, 'ore', 10, 10_000);
  roomModel.putPurse(miner.room, 'melvorD:GP', 500);
  const r = w.api.take('c', { folk: 'm' });
  assert.deepEqual(r.items, [{ itemId: 'ore', qty: 10, ms: 10_000, side: 'haul' }]);
  assert.deepEqual(r.purse, [{ currencyId: 'melvorD:GP', amount: 500 }]);
  assert.equal(roomModel.isEmpty(miner.room), true);
  assert.equal(roomModel.qtyOf(courier.room, 'ore'), 10);
  assert.equal(courier.room.purse['melvorD:GP'], 500);
  assert.equal(roomModel.usedMs(courier.room), 10_000);
});

test('carryTake stops at the free room and maxMs, leaving the rest', () => {
  const courier = w.addFolk('c', { carrier: true, capMs: 4_000 });
  const miner = w.addFolk('m');
  roomModel.put(miner.room, 'ore', 10, 10_000);
  assert.equal(w.api.take('c', { folk: 'm' }, { maxMs: 1_000 }).items[0].qty, 1);
  assert.equal(w.api.take('c', { folk: 'm' }).items[0].qty, 3);
  assert.equal(roomModel.qtyOf(miner.room, 'ore'), 6);
  assert.equal(roomModel.usedMs(courier.room), 4_000);
});

test('carryTake takes commission goods first, onto its town side, and never the stock', () => {
  const courier = w.addFolk('c', { carrier: true, capMs: 2_500 });
  const miner = w.addFolk('m');
  roomModel.put(miner.room, 'ore', 5, 5_000);
  roomModel.put(miner.room, 'bar', 2, 2_000, 'town');
  roomModel.put(miner.room, 'coal', 3, 3_000, 'stock');
  const r = w.api.take('c', { folk: 'm' });
  assert.deepEqual(r.items, [
    { itemId: 'bar', qty: 2, ms: 2_000, side: 'town' },
  ]);
  assert.equal(roomModel.qtyOf(courier.room, 'bar', 'town'), 2);
  assert.equal(roomModel.qtyOf(miner.room, 'bar', 'town'), 0);
  assert.equal(roomModel.qtyOf(miner.room, 'coal', 'stock'), 3);
});

test('carryTake leaves the town side of a Folk on its own run', () => {
  w.addFolk('c', { carrier: true });
  const miner = w.addFolk('m');
  w.hiring.commissions = { onRun: (f) => f.id === 'm' };
  roomModel.put(miner.room, 'bar', 2, 2_000, 'town');
  assert.deepEqual(w.api.take('c', { folk: 'm' }).items, []);
  assert.equal(roomModel.qtyOf(miner.room, 'bar', 'town'), 2);
});

test('a carried line\'s goods stay unless this carrier takes them for their receiver', () => {
  const courier = w.addFolk('c', { carrier: true });
  const miner = w.addFolk('m');
  w.addFolk('smith');
  w.recipes.set('smith', { perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000 });
  w.hiring.supply = { carriedIds: (f) => (f.id === 'm' ? ['ore'] : []) };
  roomModel.put(miner.room, 'ore', 4, 4_000);
  roomModel.put(miner.room, 'gem', 1, 1_000);
  assert.deepEqual(w.api.take('c', { folk: 'm' }).items.map((e) => e.itemId), ['gem']);
  assert.equal(roomModel.qtyOf(miner.room, 'ore'), 4);
  const r = w.api.take('c', { folk: 'm' }, { forReceiver: 'smith' });
  assert.deepEqual(r.items, [{ itemId: 'ore', qty: 4, ms: 4_000, side: 'stock' }]);
  assert.equal(roomModel.qtyOf(courier.room, 'ore', 'stock'), 4);
});

test('carryTake with forReceiver puts that recipe\'s items first, on the stock side', () => {
  const courier = w.addFolk('c', { carrier: true, capMs: 3_000 });
  const miner = w.addFolk('m');
  w.addFolk('smith');
  w.recipes.set('smith', { perAction: [{ id: 'coal', qty: 1 }], intervalMs: 1000 });
  roomModel.put(miner.room, 'ore', 5, 5_000);
  roomModel.put(miner.room, 'coal', 2, 2_000);
  const r = w.api.take('c', { folk: 'm' }, { forReceiver: 'smith' });
  assert.deepEqual(r.items.map((e) => [e.itemId, e.qty, e.side]), [['coal', 2, 'stock'], ['ore', 1, 'haul']]);
  assert.equal(roomModel.qtyOf(courier.room, 'coal', 'stock'), 2);
});

test('with only, the purse stays', () => {
  w.addFolk('c', { carrier: true });
  const miner = w.addFolk('m');
  roomModel.put(miner.room, 'ore', 1, 1_000);
  roomModel.put(miner.room, 'log', 1, 1_000);
  roomModel.putPurse(miner.room, 'melvorD:GP', 5);
  const r = w.api.take('c', { folk: 'm' }, { only: ['log'] });
  assert.deepEqual(r.items.map((e) => e.itemId), ['log']);
  assert.deepEqual(r.purse, []);
  assert.equal(miner.room.purse['melvorD:GP'], 5);
});

test('only a carrier may carry, and an unknown place answers undefined', () => {
  w.addFolk('plain');
  w.addFolk('c', { carrier: true });
  assert.equal(w.api.take('plain', { folk: 'c' }), undefined);
  assert.equal(w.api.take('c', { folk: 'nobody' }), undefined);
  assert.equal(w.api.take('c', { folk: 'c' }), undefined, 'not from itself');
  assert.equal(w.api.take('c', {}), undefined);
  assert.equal(w.api.give('plain', { folk: 'c' }), undefined);
  assert.equal(w.api.toBank('plain'), undefined);
  assert.equal(w.api.inputsPlan('plain', []), undefined);
  assert.equal(w.api.loadInputs('plain', { take: [] }), undefined);
});

test('the bank stop: plan, load from the bank, spare goes home', () => {
  const courier = w.addFolk('c', { carrier: true, capMs: 10_000 });
  w.addFolk('smith', { capMs: 5_000 });
  w.recipes.set('smith', { perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000 });
  roomModel.put(courier.room, 'old', 4, 400, 'stock');
  const plan = w.api.inputsPlan('c', [{ folk: 'smith' }]);
  assert.deepEqual(plan.stops, [{ folk: 'smith', actions: 5, items: [{ itemId: 'ore', qty: 5 }] }]);
  assert.deepEqual(plan.spare, ['old']);
  assert.equal(w.counts.ore, 100, 'a plan moves nothing');
  const done = w.api.loadInputs('c', plan);
  assert.deepEqual(done.items, [{ itemId: 'ore', qty: 5, ms: 5_000 }]);
  assert.deepEqual(done.home, [{ itemId: 'old', qty: 4 }]);
  assert.equal(w.counts.ore, 95);
  assert.equal(w.counts.old, 4);
  assert.equal(roomModel.qtyOf(courier.room, 'ore', 'stock'), 5);
});

test('carryLoadInputs cuts a stale plan to what the bank and the load hold now', () => {
  const courier = w.addFolk('c', { carrier: true, capMs: 3_000 });
  w.counts.ore = 2;
  const done = w.api.loadInputs('c', { take: [{ itemId: 'ore', qty: 5, ms: 5_000 }] });
  assert.equal(done.items[0].qty, 2);
  assert.equal(w.counts.ore, 0);
  w.counts.ore = 50;
  assert.equal(w.api.loadInputs('c', { take: [{ itemId: 'ore', qty: 5, ms: 5_000 }] }).items[0].qty, 1, 'one more fits');
  assert.equal(roomModel.usedMs(courier.room), 3_000);
});

test('carryGive hands over what the recipe uses, re-weighed, wakes it, and the rest rides on', () => {
  const courier = w.addFolk('c', { carrier: true });
  const smith = w.addFolk('smith', { capMs: 4_000 });
  w.recipes.set('smith', { perAction: [{ id: 'ore', qty: 1 }, { id: 'coal', qty: 2 }], intervalMs: 2000 });
  roomModel.put(courier.room, 'ore', 10, 90_000, 'stock');
  roomModel.put(courier.room, 'coal', 10, 90_000, 'stock');
  roomModel.put(courier.room, 'old', 3, 300, 'stock');
  const r = w.api.give('c', { folk: 'smith' });
  assert.deepEqual(r.items, [{ itemId: 'ore', qty: 2 }, { itemId: 'coal', qty: 4 }]);
  assert.equal(r.ms, 4_000);
  assert.equal(roomModel.usedMs(smith.room), 4_000, 'weighed by its recipe');
  assert.equal(roomModel.qtyOf(courier.room, 'old', 'stock'), 3);
  assert.deepEqual(w.woken, ['smith']);
});

test('carryGive to a depot shares its free room among its members', () => {
  const courier = w.addFolk('c', { carrier: true });
  w.addFolk('a', { depot: 'tent' });
  w.addFolk('b', { depot: 'tent' });
  w.recipes.set('a', { perAction: [{ id: 'ore', qty: 1 }], intervalMs: 1000 });
  w.recipes.set('b', { perAction: [{ id: 'coal', qty: 1 }], intervalMs: 1000 });
  const depot = { id: 'tent', name: 'Tent', room: depotModel.emptyRoom(), capMs: 4_000 };
  w.depots.set('tent', depot);
  roomModel.put(courier.room, 'ore', 9, 9_000, 'stock');
  roomModel.put(courier.room, 'coal', 9, 9_000, 'stock');
  const r = w.api.give('c', { depot: 'tent' });
  assert.deepEqual(r.items, [{ itemId: 'ore', qty: 2 }, { itemId: 'coal', qty: 2 }]);
  assert.equal(roomModel.usedMs(depot.room), 4_000);
  assert.deepEqual(w.woken, ['tent']);
});

test('carryToBank goes through the room\'s collect', () => {
  w.addFolk('c', { carrier: true });
  assert.deepEqual(w.api.toBank('c'), { collected: 'c' });
});

test('carryToTown answers what the town took and what came home; only a carrier may', () => {
  w.addFolk('c', { carrier: true });
  w.addFolk('m');
  const seen = [];
  w.hiring.commissions = { handIn: (f) => { seen.push(f.id); return { delivered: [{ commissionId: 'x', figure: 'Miller', itemId: 'bar', qty: 2, done: true }], home: [{ itemId: 'ore', qty: 1 }] }; } };
  const r = w.api.toTown('c');
  assert.deepEqual(seen, ['c']);
  assert.equal(r.delivered[0].qty, 2);
  assert.deepEqual(r.home, [{ itemId: 'ore', qty: 1 }]);
  assert.equal(w.api.toTown('m'), undefined);
});

test('a Folk is served only by a carrier whose job runs, or still holds it just after a load', () => {
  const courier = w.addFolk('c', { carrier: true });
  const idle = w.addFolk('d', { carrier: true });
  const miner = w.addFolk('m');
  const running = new Set(['c']);
  w.hiring.jobs = { isRunning: (f) => running.has(f.id) };
  assert.deepEqual(w.api.servedBy(miner), []);
  w.hiring.routeShareHook = () => [{ courierId: 'c', share: 0, faresPerHour: 0 }, { courierId: 'd', share: 0, faresPerHour: 0 }, { courierId: 'nobody' }];
  assert.deepEqual(w.api.servedBy(miner), [courier]);
  assert.deepEqual(w.api.servedBy(miner, { running: false }), [courier, idle]);
  running.clear();
  assert.deepEqual(w.api.servedBy(miner), []);
  w.hiring.routeShareHook = () => { throw new Error('boom'); };
  assert.deepEqual(w.api.servedBy(miner), []);
  w.hiring.routeShareHook = () => null;
  assert.deepEqual(w.api.servedBy(miner), []);
});

test('a route answer keeps each running courier with its share and fares', () => {
  const courier = w.addFolk('c', { carrier: true });
  w.addFolk('d', { carrier: true });
  const miner = w.addFolk('m');
  w.hiring.jobs = { isRunning: (f) => f.id === 'c' };
  w.hiring.routeShareHook = () => [{ courierId: 'c', share: 0.25, faresPerHour: 400 }, { courierId: 'd', share: 0.5, faresPerHour: 90 }];
  assert.deepEqual(w.api.routesOf(miner), [{ courier, share: 0.25, faresPerHour: 400 }]);
  w.hiring.routeShareHook = () => null;
  assert.deepEqual(w.api.routesOf(miner), []);
});

test('48 offline hours of courier rounds leave the heap where it settled', () => {
  // A child process, since only a Node started with --expose-gc can force the full collections the reading needs.
  const script = fileURLToPath(new URL('./fixtures/courier-rounds.mjs', import.meta.url));
  const out = JSON.parse(execFileSync(process.execPath, ['--expose-gc', script, 'on', '1,24,48'], { encoding: 'utf8' }));
  const [, day, twoDays] = out.rows.map((r) => Number(r.deltaMB));
  assert.ok(out.bars > 0, 'the couriers carried ore to the smelters');
  assert.equal(out.rows.at(-1).rounds, 3 * 48 * 720);
  assert.ok(twoDays < 1, `heap grew ${twoDays} MB over 48 h`);
  assert.ok(twoDays - day < 0.1, `heap still growing after the first day: ${day} → ${twoDays} MB`);
});
