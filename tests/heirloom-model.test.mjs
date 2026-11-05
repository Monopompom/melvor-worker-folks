import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  HEIRLOOMS, HEIRLOOM_IDS, BASE_CHANCE, ROLLING_TIERS, heirloomOf, findChance, findMultiplier, pickHeirloom, effectsOf, missingHeirlooms,
  addEffects, heirloomPackage,
} from '../src/heirloom-model.mjs';
import { FOLK_OWN_ITEMS, isFolkGear, isFolkOwnItem, slotLayout } from '../src/loadout-model.mjs';
import { effectsOf as traitEffectsOf } from '../src/traits-model.mjs';

const ns = (id) => `worker_folks:${id}`;
const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));

test('six heirlooms, one slot each, all of them Folk gear the loadout takes', () => {
  assert.equal(HEIRLOOMS.length, 6);
  assert.equal(new Set(HEIRLOOMS.map((h) => h.slot)).size, 6, 'no two in one slot');
  HEIRLOOM_IDS.forEach((id) => {
    assert.ok(FOLK_OWN_ITEMS.includes(id), id);
    assert.ok(isFolkOwnItem(ns(id)) && isFolkGear(ns(id)), id);
  });
});

test('Apprentices wear four of them, Journeymen all six; a Trainee none', () => {
  const opensAt = (slot) => slotLayout('Expert').find((s) => s.id === `melvorD:${slot}`).opensAt;
  assert.deepEqual(HEIRLOOMS.map((h) => opensAt(h.slot)), ['Junior', 'Junior', 'Junior', 'Junior', 'Middle', 'Middle']);
});

test('the find chance: 1 in 500,000 with a Hall, times the town; nothing for a Trainee, without a Hall or with all six held', () => {
  assert.equal(BASE_CHANCE, 1 / 500000);
  assert.equal(findChance({ tier: 'Junior', hallBuilt: true, findPercent: 0, missing: 6 }), BASE_CHANCE);
  assert.ok(Math.abs(findChance({ tier: 'Expert', hallBuilt: true, findPercent: 200, missing: 1 }) - 3 * BASE_CHANCE) < 1e-15);
  assert.equal(findChance({ tier: 'Newbie', hallBuilt: true, findPercent: 200, missing: 6 }), 0);
  assert.equal(findChance({ tier: 'Expert', hallBuilt: false, findPercent: 200, missing: 6 }), 0);
  assert.equal(findChance({ tier: 'Expert', hallBuilt: true, findPercent: 50, missing: 0 }), 0);
  assert.deepEqual(ROLLING_TIERS, ['Junior', 'Middle', 'Senior', 'Expert']);
  assert.equal(findMultiplier(60), 1.6);
  assert.equal(findMultiplier(-20), 1, 'never under the base');
  assert.equal(findMultiplier(undefined), 1);
});

test('a find can give only an heirloom no one holds; a lost or sold one is missing again', () => {
  assert.deepEqual(missingHeirlooms(() => false), HEIRLOOM_IDS);
  assert.deepEqual(missingHeirlooms((id) => id !== 'Guild_Ledger'), ['Guild_Ledger']);
  assert.deepEqual(missingHeirlooms(() => true), []);
});

test('a find picks among the missing only', () => {
  assert.equal(pickHeirloom([], () => 0), undefined);
  assert.equal(pickHeirloom(['Lucky_Apron'], () => 0.99), 'Lucky_Apron');
  assert.equal(pickHeirloom(['Lucky_Apron', 'Guild_Ledger'], () => 0.5), 'Guild_Ledger');
  assert.equal(pickHeirloom(['Lucky_Apron', 'Guild_Ledger'], () => 0.9999999), 'Guild_Ledger');
  assert.equal(pickHeirloom(['Nope', 'Lucky_Apron'], () => 0), 'Lucky_Apron', 'unknown ids are skipped');
});

test('worn heirlooms add to the trait effects: sums for percents, products for factors', () => {
  const e = effectsOf([ns('Golden_Hardhat'), ns('Lucky_Apron'), ns('Guild_Ledger'), ns('Union_Charter'), ns('Foremans_Whistle'), ns('Timekeepers_Bell'), 'melvorD:Bronze_Helmet']);
  assert.equal(e.masteryXP, 15);
  assert.equal(e.doubling, 4);
  assert.equal(e.interval, -5);
  assert.equal(e.tiersOff, 1);
  assert.ok(Math.abs(e.wageFactor - 0.85) < 1e-12);
  assert.ok(Math.abs(e.cooldownFactor - 0.7) < 1e-12);
  assert.equal(e.graceFactor, 1);
  assert.equal(effectsOf([ns('Lucky_Apron'), ns('Lucky_Apron')]).doubling, 4, 'one counts once');
  assert.equal(effectsOf(undefined).tiersOff, 0);

  const lucky = traitEffectsOf([{ id: 'Lucky' }]);
  const both = addEffects(lucky, effectsOf([ns('Lucky_Apron'), ns('Guild_Ledger')]));
  assert.equal(both.doubling, lucky.doubling + 4);
  assert.ok(Math.abs(both.wageFactor - lucky.wageFactor * 0.85) < 1e-12);
  assert.equal(both.neverStrikes, false);
  assert.equal(addEffects(lucky, undefined), lucky);
  assert.deepEqual(Object.keys(lucky).filter((k) => !(k in both)), [], 'every trait key survives');
});

test('heirloomOf reads only our namespace', () => {
  assert.equal(heirloomOf(ns('Lucky_Apron')).slot, 'Platebody');
  assert.equal(heirloomOf('other:Lucky_Apron'), undefined);
  assert.equal(heirloomOf(ns('Folk_Satchel')), undefined);
  assert.equal(heirloomOf(undefined), undefined);
});

test('the package: equipment for its slot, no modifiers, counted in completion; art and strings exist', () => {
  const pkg = heirloomPackage((id) => ({ name: `N${id}`, description: `D${id}` }));
  assert.equal(pkg.items.length, 6);
  pkg.items.forEach((item, i) => {
    assert.equal(item.id, HEIRLOOMS[i].id);
    assert.deepEqual(item.validSlots, [HEIRLOOMS[i].slot]);
    assert.equal(item.modifiers, undefined, 'nothing for the player who wears one');
    assert.equal(item.ignoreCompletion, false);
    assert.equal(item.name, `N${item.id}`);
    assert.ok(existsSync(new URL(`../${item.media}`, import.meta.url)), item.media);
    for (const key of [`MOD_WF_ITEM_${item.id}`, `MOD_WF_ITEM_${item.id}_DESC`, `MOD_WF_HEIRLOOM_EFFECT_${item.id}`]) assert.ok(lang[key], key);
  });
  assert.ok(lang.MOD_WF_HEIRLOOM_FOUND && lang.MOD_WF_MODIFIER_heirloomFind);
});
