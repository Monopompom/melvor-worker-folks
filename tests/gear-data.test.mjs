import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OUTFIT, OUTFIT_GATES, OUTFIT_PRICE, OUTFIT_XP_PER_PIECE, SKILLCAPE_ID, SUPERIOR_SKILLCAPE_ID, PET_ID, RELICS, HIRING_ID, LANG, CAPE_OF_COMPLETION, SUPERIOR_CAPE_OF_COMPLETION, SKILLING_OUTFIT_UPGRADE, superiorSkillcapePackage, expansionGearPackages, skillcapeDisplayOrder, outfitDisplayOrder, lesserRelicPackage, LESSER_RELIC_ID } from '../src/gear-data.mjs';

const extras = JSON.parse(readFileSync(new URL('../data/extras.json', import.meta.url), 'utf8'));
const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
const data = extras.data;
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

test('extras package targets the mod namespace and the Hiring skill', () => {
  assert.equal(extras.namespace, 'worker_folks');
  assert.deepEqual(data.skillData.map((s) => s.skillID), [HIRING_ID]);
  assert.deepEqual(data.ancientRelicsDisplayOrder, [{ insertAt: 'End', ids: [HIRING_ID] }]);
});

test('Overseers Outfit: four pieces in the game\'s format, +2% Hiring XP each, set bonus needs all four', () => {
  const items = byId(data.items);
  for (const [id, slot] of Object.entries(OUTFIT)) {
    const item = items[id];
    assert.ok(item, `${id} missing`);
    assert.deepEqual(item.validSlots, [slot]);
    assert.deepEqual(item.modifiers, { skillXP: [{ skillID: HIRING_ID, value: OUTFIT_XP_PER_PIECE }] });
    assert.equal(item.itemType, 'Equipment');
    assert.deepEqual(item.equipRequirements, []);
    assert.match(item.media, /^img\/town_\w+\.webp$/);
  }
  assert.equal(new Set(Object.values(OUTFIT)).size, 4);
  assert.deepEqual(Object.values(OUTFIT), ['Helmet', 'Platebody', 'Platelegs', 'Boots']);
  assert.equal(data.itemSynergies.length, 1);
  assert.deepEqual(data.itemSynergies[0].itemIDs, Object.keys(OUTFIT).map((id) => `worker_folks:${id}`));
  assert.deepEqual(data.itemSynergies[0].playerModifiers, { masteryXP: [{ skillID: HIRING_ID, value: 8 }] });
  Object.keys(OUTFIT).forEach((id) => assert.equal(items[id].sellsFor, 2000));
});

test('outfit purchases sit in the Township shop tab with the game\'s outfit gating and price', () => {
  const purchases = byId(data.shopPurchases);
  Object.keys(OUTFIT).forEach((id, i) => {
    const p = purchases[id];
    assert.ok(p, `${id} purchase missing`);
    assert.equal(p.category, 'melvorF:Township');
    assert.deepEqual(p.contains.items, [{ id: `worker_folks:${id}`, quantity: 1 }]);
    const [level, tasks] = OUTFIT_GATES[i];
    assert.deepEqual(p.purchaseRequirements, [
      { type: 'SkillLevel', skillID: 'melvorD:Township', level },
      { type: 'TownshipTask', count: tasks },
    ]);
    assert.equal(p.cost.currencies[0].cost, OUTFIT_PRICE);
    assert.equal(p.defaultBuyLimit, 0);
  });
  assert.ok(data.shopPurchases.every((p) => p.category !== 'worker_folks:WorkerFolks'), 'nothing of this package in the Worker Folks category');
  // placement is decided at load (see outfitDisplayOrder), so the static package carries none
  assert.equal(data.shopDisplayOrder, undefined);
  const ids = Object.keys(OUTFIT).map((id) => `worker_folks:${id}`);
  assert.deepEqual(outfitDisplayOrder(), [{ insertAt: 'Before', beforeID: SKILLING_OUTFIT_UPGRADE, ids }]);
  assert.deepEqual(outfitDisplayOrder({ hasSkillingOutfitUpgrade: false }), [{ insertAt: 'End', ids }]);
});

test('Hiring Skillcape: level 99, Skillcapes category, one per character', () => {
  const item = byId(data.items)[SKILLCAPE_ID];
  assert.equal(item.tier, 'Skillcape');
  assert.deepEqual(item.validSlots, ['Cape']);
  assert.deepEqual(item.equipRequirements, [{ type: 'SkillLevel', skillID: HIRING_ID, level: 99 }]);
  assert.equal(item.modifiers['worker_folks:folkWageDiscount'], 5);
  assert.ok(item.modifiers['worker_folks:folkCooldown'] < 0, 'cooldown modifier is inverted: negative is shorter');
  const p = byId(data.shopPurchases)[SKILLCAPE_ID];
  assert.equal(p.category, 'melvorD:Skillcapes');
  assert.equal(p.defaultBuyLimit, 1);
  assert.deepEqual(p.purchaseRequirements, [{ type: 'SkillLevel', skillID: HIRING_ID, level: 99 }]);
  assert.equal(p.cost.currencies[0].cost, 1000000);
});

test('the Hiring Skillcape is placed right before the Cape of Completion, or last when that cape is absent', () => {
  assert.deepEqual(skillcapeDisplayOrder(), [{ insertAt: 'Before', beforeID: CAPE_OF_COMPLETION, ids: [`worker_folks:${SKILLCAPE_ID}`] }]);
  assert.deepEqual(skillcapeDisplayOrder({ hasCapeOfCompletion: false }), [{ insertAt: 'End', ids: [`worker_folks:${SKILLCAPE_ID}`] }]);
  const [placement] = expansionGearPackages({});
  assert.deepEqual(placement, { shopDisplayOrder: [...outfitDisplayOrder(), ...skillcapeDisplayOrder()] });
  const [fallback] = expansionGearPackages({}, () => false);
  assert.ok(fallback.shopDisplayOrder.every((o) => o.insertAt === 'End'));
});

test('Superior Hiring Skillcape only ships with Throne of the Herald, before the Superior Cape of Completion', () => {
  assert.equal(expansionGearPackages({}).length, 1);
  assert.equal(expansionGearPackages({ hasItA: true }).length, 1);
  assert.deepEqual(expansionGearPackages({ hasAoD: true })[1], lesserRelicPackage());
  const [, pkg] = expansionGearPackages({ hasTotH: true });
  assert.deepEqual(pkg, superiorSkillcapePackage());
  assert.deepEqual(pkg.shopDisplayOrder, [{ insertAt: 'Before', beforeID: SUPERIOR_CAPE_OF_COMPLETION, ids: [`worker_folks:${SUPERIOR_SKILLCAPE_ID}`] }]);
  assert.equal(expansionGearPackages({ hasTotH: true }, (id) => id !== SUPERIOR_CAPE_OF_COMPLETION)[1].shopDisplayOrder[0].insertAt, 'End');
  const item = pkg.items[0];
  assert.equal(item.id, SUPERIOR_SKILLCAPE_ID);
  assert.deepEqual(item.equipRequirements, [{ type: 'SkillLevel', skillID: HIRING_ID, level: 120 }]);
  assert.ok(item.modifiers['worker_folks:folkWageDiscount'] > byId(data.items)[SKILLCAPE_ID].modifiers['worker_folks:folkWageDiscount']);
  const p = pkg.shopPurchases[0];
  assert.equal(p.category, 'melvorTotH:SuperiorSkillcapes');
  assert.deepEqual(p.contains.items, [{ id: `worker_folks:${SUPERIOR_SKILLCAPE_ID}`, quantity: 1 }]);
  assert.equal(p.defaultBuyLimit, 1);
});

test('the Hiring minibar quick-equips the cape and the outfit and shows the pet', () => {
  const minibar = data.skillData[0].data.minibar;
  assert.deepEqual(minibar.pets, [`worker_folks:${PET_ID}`]);
  assert.deepEqual(minibar.defaultItems, [`worker_folks:${SKILLCAPE_ID}`, ...Object.keys(OUTFIT).map((id) => `worker_folks:${id}`)]);
  minibar.defaultItems.forEach((id) => assert.ok(data.items.some((i) => `worker_folks:${i.id}` === id), `${id} is not an item of the package`));
  assert.deepEqual(superiorSkillcapePackage().skillData[0].data.minibar.defaultItems, [`worker_folks:${SUPERIOR_SKILLCAPE_ID}`]);
});

test('pet Bruno belongs to Hiring and is registered on the skill', () => {
  const pet = byId(data.pets)[PET_ID];
  assert.equal(pet.skillID, HIRING_ID);
  assert.equal(pet.scaleChanceWithMasteryPool, false);
  assert.equal(pet.ignoreCompletion, false);
  assert.ok(pet.modifiers['worker_folks:folkStrikeGrace'] > 0);
  assert.deepEqual(data.skillData[0].data.pets, [`worker_folks:${PET_ID}`]);
});

test('Ancient Relics: five drops plus the master relic, numbered, fixed chance, level unlocks', () => {
  const relics = byId(data.ancientRelics);
  RELICS.forEach((id, i) => {
    assert.ok(relics[id], `${id} missing`);
    assert.equal(relics[id].number, i + 1);
    assert.equal(relics[id].skillID, HIRING_ID);
    assert.ok(Object.keys(relics[id].modifiers).length > 0);
  });
  const [set] = data.skillData[0].data.ancientRelicSets;
  assert.equal(set.realmID, 'melvorD:Melvor');
  assert.deepEqual(set.relicDrops.map((d) => d.relicID), RELICS.slice(0, 5).map((id) => `worker_folks:${id}`));
  set.relicDrops.forEach((d) => assert.deepEqual(d.chance, { type: 'Fixed', chance: 0.0005 }));
  assert.equal(set.completedRelicID, `worker_folks:${RELICS[5]}`);
  assert.deepEqual(set.levelUpUnlocks, [20, 99]);
  // the master relic is a rule change (free overtime, declared in this package) plus a modest combat stat
  assert.equal(relics.HiringMasterRelic.modifiers['worker_folks:folkFreeOvertime'], 1);
  assert.equal(relics.HiringMasterRelic.modifiers.minHitBasedOnMaxHit, 5);
  assert.deepEqual(data.modifiers.map((m) => m.id), ['folkFreeOvertime']);
  // wage sources stay modest: no single relic or item cuts more than 15%
  data.ancientRelics.forEach((r) => assert.ok((r.modifiers['worker_folks:folkWageDiscount'] ?? 0) <= 10, r.id));
  data.items.forEach((i) => assert.ok((i.modifiers?.['worker_folks:folkWageDiscount'] ?? 0) <= 10, i.id));
  // named like the game's own sets, and no modifier the Ancient Relics mode disables
  RELICS.slice(0, 5).forEach((id, i) => assert.equal(relics[id].name, `Hiring Relic ${i + 1}`));
  assert.equal(relics.HiringMasterRelic.name, 'Hiring Master Relic');
  const disabled = ['globalItemDoublingChance', 'skillItemDoublingChance', 'skillPreservationChance', 'doubleItemsSkill'];
  data.ancientRelics.forEach((r) => Object.keys(r.modifiers).forEach((k) => assert.ok(!disabled.includes(k), `${r.id} uses ${k}, disabled in the Ancient Relics mode`)));
});

test('Hiring Lesser Relic: consumable rare drop of Folk actions in the Ancient Relics mode, AoD only', () => {
  const pkg = lesserRelicPackage();
  const [item] = pkg.items;
  assert.equal(item.id, LESSER_RELIC_ID);
  assert.equal(item.type, 'Consumable');
  assert.deepEqual(item.validSlots, ['Consumable']);
  assert.equal(item.ignoreCompletion, true);
  assert.ok(item.modifiers['worker_folks:folkWageDiscount'] > 0);
  assert.deepEqual(item.consumesOn, [{ type: 'PlayerAttack' }]);
  const [drop] = pkg.skillData[0].data.rareDrops;
  assert.equal(pkg.skillData[0].skillID, HIRING_ID);
  assert.equal(drop.itemID, `worker_folks:${LESSER_RELIC_ID}`);
  assert.equal(drop.quantity, 300);
  assert.deepEqual(drop.chance, { type: 'Fixed', chance: 0.1 });
  assert.deepEqual(drop.gamemodes, ['melvorAoD:AncientRelics']);
  assert.ok(LANG.items[LESSER_RELIC_ID]);
  assert.ok(!expansionGearPackages({ hasTotH: true, hasAoD: false }).some((p) => p.items?.some((i) => i.id === LESSER_RELIC_ID)));
  assert.ok(expansionGearPackages({ hasTotH: false, hasAoD: true }).some((p) => p.items?.some((i) => i.id === LESSER_RELIC_ID)));
});

test('every lang key the loader applies exists in en.json', () => {
  const keys = [];
  Object.values(LANG.items).forEach((k) => { keys.push(k.name); if (k.description) keys.push(k.description); });
  Object.values(LANG.pet).forEach((k) => keys.push(k.name, k.hint));
  keys.push(...Object.values(LANG.relics));
  keys.push(...data.modifiers.flatMap((m) => m.allowedScopes.flatMap((s) => s.descriptions.map((d) => d.lang))));
  keys.forEach((k) => assert.ok(typeof lang[k] === 'string' && lang[k].length > 0, `missing lang ${k}`));
  // every item, pet and relic in the package has a lang entry
  data.items.forEach((i) => assert.ok(LANG.items[i.id], `no lang for item ${i.id}`));
  data.pets.forEach((p) => assert.ok(LANG.pet[p.id], `no lang for pet ${p.id}`));
  data.ancientRelics.forEach((r) => assert.ok(LANG.relics[r.id], `no lang for relic ${r.id}`));
});
