import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotsForTier, isSkillingItem, helpsSkill, normalizeLoadout, reconcileLoadout, equipQuantity, isFolkGear } from '../src/loadout-rules.mjs';

test('slots open cumulatively by tier; expansion slots need the expansion', () => {
  assert.deepEqual(slotsForTier('Newbie'), ['melvorD:Cape', 'melvorD:Gloves']);
  assert.equal(slotsForTier('Junior').length, 6);
  assert.equal(slotsForTier('Middle').length, 9);
  assert.equal(slotsForTier('Senior').length, 11);
  assert.equal(slotsForTier('Expert').length, 11);
  assert.equal(slotsForTier('Expert', { hasAoD: true }).length, 12);
  assert.equal(slotsForTier('Expert', { hasAoD: true, hasItA: true }).length, 15);
  assert.equal(slotsForTier('Expert', { hasAoD: true })[0], 'melvorD:Cape');
  assert.throws(() => slotsForTier('Boss'));
});

test('skilling filter', () => {
  assert.equal(isSkillingItem({}), false);
  assert.equal(isSkillingItem({ hasNonCombatModifier: true }), true);
  assert.equal(isSkillingItem({ isSummon: true }), true);
});

test('helpsSkill narrows the picker to one skill', () => {
  const wc = 'melvorD:Woodcutting';
  assert.equal(helpsSkill({ scopes: [wc], skillId: wc }), true);
  assert.equal(helpsSkill({ scopes: ['melvorD:Mining'], skillId: wc }), false);
  assert.equal(helpsSkill({ scopes: [null], skillId: wc }), true); // applies to every skill
  assert.equal(helpsSkill({ scopes: [], familiarSkillIds: [wc], skillId: wc }), true);
  assert.equal(helpsSkill({ scopes: [], familiarSkillIds: ['melvorD:Mining'], skillId: wc }), false);
  assert.equal(helpsSkill({ providesRunes: true, skillId: 'melvorD:Magic' }), true);
  assert.equal(helpsSkill({ providesRunes: true, skillId: wc }), false);
  assert.equal(helpsSkill({ scopes: [null], skillId: undefined }), false);
});

test('normalizeLoadout drops junk and defaults quantities', () => {
  assert.deepEqual(normalizeLoadout({ a: { id: 'x', qty: 3 }, b: { id: '' }, c: null, d: { id: 'y', qty: -2 } }), { a: { id: 'x', qty: 3 }, d: { id: 'y', qty: 1 } });
  assert.deepEqual(normalizeLoadout([1]), {});
});

test('reconcileLoadout keeps valid entries, returns disallowed slots and Hiring gear, drops missing items', () => {
  const r = reconcileLoadout({ cape: { id: 'c', qty: 1 }, ring: { id: 'r', qty: 1 }, gone: { id: 'z', qty: 2 }, consumable: { id: 'worker_folks:Hiring_Lesser_Relic', qty: 300 } }, { allowedSlots: ['cape', 'consumable'], itemExists: (id) => id !== 'z' });
  assert.deepEqual(r.kept, { cape: { id: 'c', qty: 1 } });
  assert.deepEqual(r.returned, [{ slot: 'ring', id: 'r', qty: 1 }, { slot: 'consumable', id: 'worker_folks:Hiring_Lesser_Relic', qty: 300 }]);
  assert.deepEqual(r.dropped, [{ slot: 'gone', id: 'z', qty: 2 }]);
});

test('Hiring gear is never Folk gear', () => {
  assert.equal(isFolkGear('melvorD:Bronze_Axe'), true);
  assert.equal(isFolkGear('melvorAoD:Woodcutting_Lesser_Relic'), true);
  assert.equal(isFolkGear('worker_folks:Hiring_Lesser_Relic'), false);
  assert.equal(isFolkGear('worker_folks:Overseers_Hat'), false);
  assert.equal(isFolkGear(undefined), false);
});

test('equipQuantity caps stacks to what the bank holds and forces 1 for single slots', () => {
  assert.equal(equipQuantity(50, { allowQuantity: true, available: 20 }), 20);
  assert.equal(equipQuantity('7', { allowQuantity: true, available: 20 }), 7);
  assert.equal(equipQuantity(0, { allowQuantity: true, available: 20 }), 0);
  assert.equal(equipQuantity(99, { allowQuantity: false, available: 3 }), 1);
  assert.equal(equipQuantity(1, { allowQuantity: false, available: 0 }), 0);
});
