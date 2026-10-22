import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  STEWARD_ID, STEWARD_ITEM_ID, STEWARD_LEVEL, STEWARD_TIER, STEWARD_XP, FOLK_SKILL_XP, STEWARD_SKILL_XP,
  STEWARD_CHARGE_MS, TABLET_MS, MARK_MS, SYNERGIES, bookWork, markChance, tabletXP, stewardPackage,
} from '../src/steward-model.mjs';
import { LANG, HIRING_ID } from '../src/gear-data.mjs';

const root = new URL('../', import.meta.url);
const lang = JSON.parse(readFileSync(new URL('languages/en.json', root), 'utf8'));
const pkg = stewardPackage();
// the game's own familiars (Summoning recipes of the melvorF namespace), the synergy partners come from here
const BASE_FAMILIARS = ['Ent', 'Mole', 'Octopus', 'Minotaur', 'Centaur', 'Witch', 'Pig', 'Crow', 'Leprechaun', 'Cyclops', 'Yak',
  'Unicorn', 'Dragon', 'Monkey', 'Salamander', 'Bear', 'Devil', 'Wolf', 'Abyssal_Leech'].map((id) => `melvorF:${id}`);

test('the Steward: a tier 2 familiar at Summoning 30, made of shards and 1,000 GP, +5% skill XP for every Folk', () => {
  assert.equal(STEWARD_LEVEL, 30);
  assert.equal(STEWARD_TIER, 2);
  assert.equal(STEWARD_XP, 17);
  assert.equal(STEWARD_SKILL_XP, 5);
  const [item] = pkg.items;
  assert.equal(item.id, STEWARD_ITEM_ID);
  assert.equal(item.itemType, 'Equipment');
  assert.equal(item.category, 'Summoning');
  assert.equal(item.type, 'Familiar');
  assert.equal(item.tier, 'Tier 2 Summon');
  assert.deepEqual(item.validSlots, ['Summon1', 'Summon2']);
  assert.deepEqual(item.modifiers, { [`worker_folks:${FOLK_SKILL_XP}`]: STEWARD_SKILL_XP });
  assert.deepEqual(item.consumesOn, [], 'the engine never spends it on the player\'s own actions');
  assert.equal(item.sellsFor, 0);
  assert.deepEqual(item.equipRequirements, []);
  const [sd] = pkg.skillData;
  assert.equal(sd.skillID, 'melvorD:Summoning');
  const [r] = sd.data.recipes;
  assert.equal(r.id, STEWARD_ID);
  assert.equal(r.level, STEWARD_LEVEL);
  assert.equal(r.tier, STEWARD_TIER);
  assert.equal(r.baseExperience, STEWARD_XP);
  assert.equal(r.baseQuantity, 25);
  assert.equal(r.productID, `worker_folks:${STEWARD_ITEM_ID}`);
  assert.equal(r.categoryID, 'melvorD:TabletsFamiliars');
  assert.deepEqual(r.itemCosts, [{ id: 'melvorF:Summoning_Shard_Green', quantity: 8 }, { id: 'melvorF:Summoning_Shard_Silver', quantity: 6 }]);
  assert.deepEqual(r.currencyCosts, [{ id: 'melvorD:GP', quantity: 1000 }]);
  assert.deepEqual(r.nonShardItemCosts, []);
  assert.deepEqual(r.skillIDs, [HIRING_ID]);
});

test('the folkSkillXP modifier is declared once, positive is good, its text in the language file', () => {
  assert.equal(pkg.modifiers.length, 1);
  const [m] = pkg.modifiers;
  assert.equal(m.id, FOLK_SKILL_XP);
  assert.equal(m.inverted, undefined);
  const [d] = m.allowedScopes[0].descriptions;
  assert.equal(d.lang, `MOD_WF_MODIFIER_${FOLK_SKILL_XP}`);
  assert.equal(lang[d.lang], d.text);
  assert.equal(d.includeSign, false);
});

test('names and art: the tablet is named from the language file, the icon and the mark ship', () => {
  assert.equal(LANG.items[STEWARD_ITEM_ID].name, `MOD_WF_ITEM_${STEWARD_ITEM_ID}`);
  assert.equal(lang[`MOD_WF_ITEM_${STEWARD_ITEM_ID}`], 'Steward');
  assert.ok(existsSync(new URL(pkg.items[0].media, root)), pkg.items[0].media);
  assert.ok(existsSync(new URL(pkg.skillData[0].data.recipes[0].markMedia, root)), 'the mark');
});

test('six synergies with the game\'s own familiars, one modifier each, no wage source over 10%', () => {
  assert.equal(SYNERGIES.length, 6);
  const syn = pkg.skillData[0].data.synergies;
  assert.equal(syn.length, SYNERGIES.length);
  const partners = new Set();
  syn.forEach((s, i) => {
    assert.deepEqual(s.summonIDs, [`worker_folks:${STEWARD_ID}`, SYNERGIES[i].with]);
    assert.ok(BASE_FAMILIARS.includes(SYNERGIES[i].with), SYNERGIES[i].with);
    assert.equal(Object.keys(s.modifiers).length, 1, 'one plain modifier: a mod synergy has no custom text');
    assert.deepEqual(s.consumesOn, []);
    partners.add(SYNERGIES[i].with);
  });
  assert.equal(partners.size, 6, 'six different partners');
  const wage = syn.map((s) => s.modifiers['worker_folks:folkWageDiscount']).filter((v) => v !== undefined);
  assert.deepEqual(wage, [5]);
  assert.ok(wage.every((v) => v <= 10));
  // the Pig doubles the Steward's own gift, the Devil cuts the cooldown (negative is good there: folkCooldown is inverted)
  assert.equal(syn.find((s) => s.summonIDs[1] === 'melvorF:Pig').modifiers[`worker_folks:${FOLK_SKILL_XP}`], 5);
  assert.equal(syn.find((s) => s.summonIDs[1] === 'melvorF:Devil').modifiers['worker_folks:folkCooldown'], -10);
  assert.deepEqual(syn.find((s) => s.summonIDs[1] === 'melvorF:Ent').modifiers, { skillXP: [{ skillID: HIRING_ID, value: 10 }] });
  assert.deepEqual(syn.find((s) => s.summonIDs[1] === 'melvorF:Octopus').modifiers, { masteryXP: [{ skillID: HIRING_ID, value: 10 }] });
  assert.equal(syn.find((s) => s.summonIDs[1] === 'melvorF:Monkey').modifiers['worker_folks:folkStrikeGrace'], 10);
});

test('a charge per 30 s of crew work: a bigger crew spends no faster, the rest carries over', () => {
  assert.equal(STEWARD_CHARGE_MS, 30000);
  assert.equal(MARK_MS, STEWARD_CHARGE_MS);
  assert.equal(TABLET_MS, 3000);
  assert.deepEqual(bookWork(0, 3000, 1), { budget: 3000, charges: 0 });
  assert.deepEqual(bookWork(27000, 3000, 1), { budget: 0, charges: 1 });
  assert.deepEqual(bookWork(28000, 3000, 1), { budget: 1000, charges: 1 });
  // ten Folks on 3 s actions: ten actions make one 3 s step, not ten
  let b = 0;
  let charges = 0;
  for (let i = 0; i < 100; i++) { const r = bookWork(b, 3000, 10); b = r.budget; charges += r.charges; }
  assert.equal(charges, 1);
  assert.equal(b, 0);
  // one Folk on 3 s actions: a charge every ten actions
  b = 0; charges = 0;
  for (let i = 0; i < 100; i++) { const r = bookWork(b, 3000, 1); b = r.budget; charges += r.charges; }
  assert.equal(charges, 10);
  // a long action (offline catch-up hands the whole interval) books several charges at once
  assert.deepEqual(bookWork(0, 90000, 1), { budget: 0, charges: 3 });
  // bad inputs count as nothing
  assert.deepEqual(bookWork(NaN, -5, 0), { budget: 0, charges: 0 });
  assert.deepEqual(bookWork(0, 3000, 2.5), { budget: 3000, charges: 0 });
});

test('the engine\'s numbers: a 4.2% mark roll per charge worn (1.7% bare), 22.5 Summoning XP per charge at level 30', () => {
  assert.equal(Math.round(markChance(MARK_MS, true) * 100) / 100, 4.17);
  assert.equal(Math.round(markChance(MARK_MS, false) * 100) / 100, 1.67);
  assert.equal(tabletXP(STEWARD_LEVEL, TABLET_MS), 22.5);
});
