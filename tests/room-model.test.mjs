import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_HOURS, BAG_HOURS, BAG_SHARE, BAG_RECIPES, bagHours, bagRange, bagPackage, capacityMs, isEmpty, usedMs, fits, put, take, qtyOf, entries, stockCovers, restockPlan, fillView, splitForBank } from '../src/room-model.mjs';
import { FOLK_OWN_ITEMS, isFolkGear } from '../src/loadout-model.mjs';
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
  assert.deepEqual(normalizeRoom(undefined), { haul: {}, stock: {} });
  assert.deepEqual(normalizeRoom({ haul: [1] }), { haul: {}, stock: {} });
  const room = normalizeRoom({ haul: { a: { qty: 3, ms: 900 }, b: { qty: 0, ms: 5 }, c: { qty: 2, ms: -1 }, d: null, e: { qty: 'x' } } });
  assert.deepEqual(room, { haul: { a: { qty: 3, ms: 900 }, c: { qty: 2, ms: 0 } }, stock: {} });
  assert.deepEqual(normalizeRoom({ stock: { a: { qty: 5, ms: 10 }, b: { qty: 1.5 } } }), { haul: {}, stock: { a: { qty: 5, ms: 10 } } });
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

test('bags: a Satchel adds a third of the tier’s bag room, a Pack two thirds, a Frame Pack all of it', () => {
  assert.deepEqual(TIERS.map((t) => ROOM_HOURS[t] + BAG_HOURS[t]), [4, 6, 8, 10, 12]);
  assert.equal(bagHours('Newbie', 'worker_folks:Folk_Frame_Pack'), 2);
  assert.equal(bagHours('Expert', 'worker_folks:Folk_Pack'), 4 * (2 / 3));
  assert.equal(bagHours('Middle', 'worker_folks:Folk_Satchel'), 1);
  assert.equal(bagHours('Middle', 'melvorF:Cape_of_Completion'), 0);
  assert.equal(bagHours('Middle', 'other_mod:Folk_Pack'), 0);
  assert.equal(bagHours('Middle', undefined), 0);
  assert.equal(capacityMs('Expert', bagHours('Expert', 'worker_folks:Folk_Frame_Pack')), 12 * H);
});

test('bags are the one kind of Hiring item a Folk may wear', () => {
  assert.deepEqual(FOLK_OWN_ITEMS.slice().sort(), Object.keys(BAG_SHARE).sort());
  FOLK_OWN_ITEMS.forEach((id) => assert.equal(isFolkGear(`worker_folks:${id}`), true));
  assert.equal(isFolkGear('worker_folks:Overseers_Hat'), false);
});

test('stock and haul share one size; each side keeps its own stacks', () => {
  const room = createRoom();
  put(room, 'melvorD:Coal_Ore', 40, 60_000, 'stock');
  put(room, 'melvorD:Iron_Ore', 20, 60_000, 'stock');
  put(room, 'melvorD:Steel_Bar', 3, 6_000);
  assert.equal(usedMs(room), 126_000);
  assert.equal(qtyOf(room, 'melvorD:Coal_Ore', 'stock'), 40);
  assert.equal(qtyOf(room, 'melvorD:Coal_Ore'), 0);
  assert.equal(isEmpty(room), false);
  assert.deepEqual(entries(room, 'stock').map((e) => e.id), ['melvorD:Coal_Ore', 'melvorD:Iron_Ore']);
  assert.equal(stockCovers(room, [{ id: 'melvorD:Coal_Ore', qty: 2 }, { id: 'melvorD:Iron_Ore', qty: 1 }]), true);
  assert.deepEqual(take(room, 'melvorD:Coal_Ore', 2, 'stock'), { qty: 2, ms: 3_000 });
  assert.equal(stockCovers(room, [{ id: 'melvorD:Gold_Ore', qty: 1 }]), false);
  take(room, 'melvorD:Steel_Bar');
  assert.equal(isEmpty(room), true);
  assert.equal(isEmpty(room, 'stock'), false);
  // An old save's room has no stock side: put makes it.
  const old = { haul: {} };
  put(old, 'melvorD:Coal_Ore', 1, 10, 'stock');
  assert.equal(qtyOf(old, 'melvorD:Coal_Ore', 'stock'), 1);
});

test('restock fills the free room with whole actions, the bank’s shortest input first', () => {
  const steel = [{ id: 'melvorD:Iron_Ore', qty: 1 }, { id: 'melvorD:Coal_Ore', qty: 2 }];
  const plenty = () => 1e9;
  // 2 h free at 2 s an action: 3,600 actions, each input half the time.
  const full = restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: 2 * H, bankQty: plenty });
  assert.equal(full.actions, 3_600);
  assert.deepEqual(full.items, [{ id: 'melvorD:Iron_Ore', qty: 3_600, ms: H }, { id: 'melvorD:Coal_Ore', qty: 7_200, ms: H }]);
  assert.equal(full.short, null);
  // The bank has 1,001 Coal: 500 actions.
  const coal = restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: 2 * H, bankQty: (id) => (id === 'melvorD:Coal_Ore' ? 1_001 : 1e9) });
  assert.equal(coal.actions, 500);
  assert.equal(coal.short, 'melvorD:Coal_Ore');
  assert.equal(coal.items.reduce((sum, e) => sum + e.ms, 0), 500 * 2_000);
  // No space: nothing, and the bank is not to blame. No inputs or no interval: nothing.
  assert.deepEqual(restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: 1_999, bankQty: plenty }), { actions: 0, items: [], short: null });
  assert.equal(restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: H, bankQty: () => 0 }).short, 'melvorD:Iron_Ore');
  assert.equal(restockPlan({ perAction: [], intervalMs: 2_000, freeMs: H, bankQty: plenty }).actions, 0);
  assert.equal(restockPlan({ perAction: steel, intervalMs: 0, freeMs: H, bankQty: plenty }).actions, 0);
  // An asked amount below the free room caps it; above the free room, the room is the limit.
  assert.equal(restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: 2 * H, bankQty: plenty, maxActions: 900 }).actions, 900);
  assert.equal(restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: 2 * H, bankQty: plenty, maxActions: 9_000 }).actions, 3_600);
  assert.deepEqual(restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: 2 * H, bankQty: plenty, maxActions: 0 }), { actions: 0, items: [], short: null });
  assert.equal(restockPlan({ perAction: steel, intervalMs: 2_000, freeMs: 2 * H, bankQty: (id) => (id === 'melvorD:Coal_Ore' ? 1_001 : 1e9), maxActions: 900 }).actions, 500);
});

test('the bags: Cape-slot items, a Crafting chain of 1, 6 and 12 Amulets of Looting, recipes only with the full game', () => {
  const pkg = bagPackage({ hasFull: true }, (id) => ({ name: `N ${id}`, description: `D ${id}` }));
  assert.deepEqual(pkg.items.map((i) => i.id), Object.keys(BAG_SHARE));
  pkg.items.forEach((i) => {
    assert.deepEqual(i.validSlots, ['Cape']);
    assert.equal(i.name, `N ${i.id}`);
    assert.equal(i.modifiers, undefined);
  });
  const recipes = pkg.skillData[0].data.recipes;
  assert.equal(pkg.skillData[0].skillID, 'melvorD:Crafting');
  assert.deepEqual(recipes.map((r) => r.level), [20, 50, 80]);
  // No more XP than the game's best Crafting recipe at the same level (Gold Sapphire, Emerald, Diamond Necklace).
  assert.deepEqual(recipes.map((r) => r.baseExperience), [45, 130, 250]);
  const amulets = recipes.map((r) => r.itemCosts.find((c) => c.id === 'melvorD:Amulet_of_Looting').quantity);
  assert.deepEqual(amulets, [1, 6, 12]);
  // Each bag after the first is made from the one before.
  assert.equal(recipes[1].itemCosts[0].id, 'worker_folks:Folk_Satchel');
  assert.equal(recipes[2].itemCosts[0].id, 'worker_folks:Folk_Pack');
  recipes.forEach((r) => assert.equal(r.categoryID, 'melvorF:Bags'));
  assert.equal(bagPackage({ hasFull: false }).skillData, undefined);
  assert.equal(BAG_RECIPES.length, 3);
  assert.deepEqual(bagRange('Folk_Satchel'), { low: '0.7', high: '1.3' });
  assert.deepEqual(bagRange('Folk_Frame_Pack'), { low: '2', high: '4' });
});

test('bags past the Satchel cost nothing the Shop sells: rare finds, drops and bars', () => {
  const costs = (id) => Object.fromEntries(BAG_RECIPES.find((r) => r.id === id).costs);
  const shopSold = ['melvorD:Leather', 'melvorD:Green_Dragonhide', 'melvorD:Blue_Dragonhide', 'melvorD:Red_Dragonhide'];
  ['Folk_Pack', 'Folk_Frame_Pack'].forEach((id) => shopSold.forEach((item) => assert.equal(costs(id)[item], undefined, `${id} takes ${item}`)));
  assert.equal(costs('Folk_Pack')['melvorF:Bobbys_Pocket'], 10);
  assert.equal(costs('Folk_Pack')['melvorD:Mithril_Bar'], 150);
  assert.equal(costs('Folk_Frame_Pack')['melvorD:Black_Dragonhide'], 250);
  assert.equal(costs('Folk_Frame_Pack')['melvorD:Runite_Bar'], 400);
});
