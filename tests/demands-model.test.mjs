import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRAIT_DEMANDS, OTHER_DEMAND, CHESTS, strikeFactor, rollDemands, progressOf, allMet, itemsToTake,
} from '../src/demands-model.mjs';
import { TRAITS } from '../src/traits-model.mjs';
import { normalizeFolk, normalizeDemands, TIERS } from '../src/folk.mjs';

const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));

test('every trait wants something, five amounts each, rising with the tier', () => {
  TRAITS.forEach((t) => assert.ok(TRAIT_DEMANDS[t.id], t.id));
  [...Object.values(TRAIT_DEMANDS), OTHER_DEMAND].forEach((spec) => {
    for (const qty of [spec.qty, spec.fallback?.qty].filter(Boolean)) {
      assert.equal(qty.length, 5);
      qty.forEach((n, i) => assert.ok(n > 0 && (i === 0 || n >= qty[i - 1])));
    }
    // A kill, clear or chest always has an item to fall back on.
    if (spec.kill || spec.dungeon || spec.chest) assert.ok(spec.fallback?.item, 'fallback');
  });
  assert.ok(CHESTS.every((id) => /^melvor[DF]:/.test(id)));
});

test('the model\'s tiers are the Folk tiers', () => {
  assert.deepEqual(TIERS, ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert']);
});

test('the strike count: ×1, then +50% a strike, at most ×3', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 9].map(strikeFactor), [1, 1, 1.5, 2, 3, 3]);
});

test('no trait, no demand: GP only, as without the option', () => {
  assert.deepEqual(rollDemands({ traits: [], tier: 'Expert' }), []);
});

test('items by tier and strike count; the first registered item of a list', () => {
  const d = rollDemands({ traits: ['Clumsy', 'Wasteful'], tier: 'Middle', strikes: 2, world: { hasItem: (id) => id !== 'melvorF:Ash' } });
  assert.deepEqual(d, [
    { kind: 'item', id: 'melvorD:Old_Boot', qty: 60 },
    { kind: 'item', id: 'melvorD:Burnt_Shrimp', qty: 1500 },
  ]);
});

test('kills and clears from what you have done before, counted from now; the fallback without', () => {
  const world = { monsters: [{ id: 'melvorD:Plant', count: 7 }, { id: 'melvorD:Cow', count: 3 }], dungeons: [{ id: 'melvorD:Chicken_Coop', count: 4 }] };
  const d = rollDemands({ traits: ['Resentful', 'Ambitious'], tier: 'Newbie', rng: () => 0.9, world });
  assert.deepEqual(d, [
    { kind: 'kill', id: 'melvorD:Cow', qty: 50, start: 3 },
    { kind: 'dungeon', id: 'melvorD:Chicken_Coop', qty: 1, start: 4 },
  ]);
  const none = rollDemands({ traits: ['Resentful', 'Ambitious', 'Veteran'], tier: 'Newbie', world: {} });
  assert.deepEqual(none, [
    { kind: 'item', id: 'melvorD:Bones', qty: 100 },
    { kind: 'item', id: 'melvorD:Big_Bones', qty: 20 },
    { kind: 'item', id: 'melvorD:Bird_Nest', qty: 2 },
  ]);
});

test('a Veteran wants a chest you have found; two lines for one thing merge; another mod\'s trait asks too', () => {
  const d = rollDemands({ traits: ['Veteran', 'NightOwl', 'Resentful', 'voyage:Seafarer'], tier: 'Junior', rng: () => 0,
    world: { chests: ['melvorD:Spider_Chest'], monsters: [{ id: 'melvorD:Plant', count: 10 }] } });
  assert.deepEqual(d, [
    { kind: 'item', id: 'melvorD:Spider_Chest', qty: 2 },
    { kind: 'kill', id: 'melvorD:Plant', qty: 140, start: 10 },
    { kind: 'item', id: 'melvorD:Rusty_Key', qty: 20 },
  ]);
});

test('progress: items in the bank now, kills and clears since the strike; met only in full', () => {
  const read = { bankQty: () => 30, kills: () => 25, clears: () => 5 };
  assert.deepEqual(progressOf({ kind: 'item', id: 'x', qty: 40 }, read), { have: 30, need: 40, met: false, gone: false, locked: false });
  assert.deepEqual(progressOf({ kind: 'kill', id: 'm', qty: 20, start: 10 }, read), { have: 15, need: 20, met: false, gone: false, locked: false });
  assert.deepEqual(progressOf({ kind: 'dungeon', id: 'd', qty: 1, start: 4 }, read), { have: 1, need: 1, met: true, gone: false, locked: false });
  assert.deepEqual(progressOf({ kind: 'item', id: 'x', qty: 10 }, read), { have: 10, need: 10, met: true, gone: false, locked: false });
  assert.equal(allMet([], read), true);
  assert.equal(allMet([{ kind: 'item', id: 'x', qty: 10 }, { kind: 'kill', id: 'm', qty: 20, start: 10 }], read), false);
  assert.deepEqual(itemsToTake([{ kind: 'item', id: 'x', qty: 10 }, { kind: 'kill', id: 'm', qty: 20, start: 10 }]), [{ id: 'x', qty: 10 }]);
});

test('a Townsfolk\'s Local trait asks too', () => {
  assert.deepEqual(rollDemands({ traits: ['Local'], tier: 'Senior' }), [{ kind: 'item', id: 'melvorD:Cabbage', qty: 400 }]);
});

test('a line for something the game no longer has counts as met, so the strike can still end', () => {
  const read = { bankQty: () => null, kills: () => null, clears: () => 3 };
  assert.deepEqual(progressOf({ kind: 'item', id: 'gone:Item', qty: 40 }, read), { have: 40, need: 40, met: true, gone: true, locked: false });
  assert.equal(progressOf({ kind: 'kill', id: 'gone:Monster', qty: 9, start: 2 }, read).met, true);
  assert.deepEqual(progressOf({ kind: 'dungeon', id: 'd', qty: 2, start: 2 }, read), { have: 1, need: 2, met: false, gone: false, locked: false });
  assert.equal(allMet([{ kind: 'item', id: 'gone:Item', qty: 40 }, { kind: 'kill', id: 'gone:Monster', qty: 9 }], read), true);
});

test('a locked item is never handed over: its line waits until you unlock it', () => {
  const read = { bankQty: () => 500, locked: (id) => id === 'melvorD:Topaz' };
  assert.deepEqual(progressOf({ kind: 'item', id: 'melvorD:Topaz', qty: 20 }, read), { have: 20, need: 20, met: false, gone: false, locked: true });
  assert.equal(progressOf({ kind: 'item', id: 'melvorD:Old_Boot', qty: 20 }, read).met, true);
  assert.equal(progressOf({ kind: 'kill', id: 'melvorD:Topaz', qty: 1, start: 0 }, read).locked, false, 'only items lock');
  assert.equal(allMet([{ kind: 'item', id: 'melvorD:Topaz', qty: 20 }], read), false);
  assert.equal(allMet([{ kind: 'item', id: 'melvorD:Topaz', qty: 20 }], { ...read, locked: () => false }), true);
});

test('the save: clean lines only, kept while the Folk strikes', () => {
  assert.deepEqual(normalizeDemands([
    { kind: 'item', id: 'a', qty: 3, start: 9 }, { kind: 'kill', id: 'm', qty: 2 }, { kind: 'bribe', id: 'z', qty: 1 },
    { kind: 'item', id: '', qty: 1 }, { kind: 'item', id: 'b', qty: 0 }, null,
  ]), [{ kind: 'item', id: 'a', qty: 3 }, { kind: 'kill', id: 'm', qty: 2, start: 0 }]);
  const base = { id: 'f', slot: 0, tier: 'Newbie', name: 'A', debt: 5, debtCurrency: 'melvorD:GP' };
  const demand = [{ kind: 'item', id: 'melvorD:Old_Boot', qty: 10 }];
  assert.deepEqual(normalizeFolk({ ...base, onStrike: true, demand }).demand, demand);
  assert.deepEqual(normalizeFolk({ ...base, onStrike: false, demand }).demand, []);
  assert.deepEqual(normalizeFolk({ ...base }).demand, []);
});

test('Welcome Back keeps a Folk\'s action count and the word "actions" on one line', () => {
  assert.ok(lang.MOD_WF_OFFLINE_LINE.includes('${count}\u00a0actions'));
  assert.ok(lang.MOD_WF_OFFLINE_LINE_ONE.includes('1\u00a0action'));
});

test('the strings exist', () => {
  for (const key of ['MOD_WF_SETTING_DEMANDS', 'MOD_WF_SETTING_DEMANDS_HINT', 'MOD_WF_DEMAND_ITEM', 'MOD_WF_DEMAND_KILL',
    'MOD_WF_DEMAND_DUNGEON', 'MOD_WF_DEMAND_GONE', 'MOD_WF_DEMAND_LOCKED', 'MOD_WF_DEMAND_UNLOCK', 'MOD_WF_DEMANDS_HEAD', 'MOD_WF_SETTLE_DEMANDS', 'MOD_WF_AUTO_SETTLED_ITEMS',
    'MOD_WF_OFFLINE_STRUCK_SETTLED_ITEMS', 'MOD_WF_OFFLINE_STRUCK_FIX_DEMANDS']) assert.ok(lang[key], key);
});
