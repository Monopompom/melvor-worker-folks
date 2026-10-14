import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promotionPlan, promotionCost, diplomaFor } from '../src/promotion.mjs';

test('promotion cost is 60% of the next hire price, rounded up', () => {
  assert.equal(promotionCost(100000), 60000);
  assert.equal(promotionCost(1), 1);
});

test('diplomas by target tier, Expert depends on TotH', () => {
  assert.equal(diplomaFor('Junior'), 'melvorD:Amulet_of_Torture');
  assert.equal(diplomaFor('Expert'), 'melvorF:Elder_Crown');
  assert.equal(diplomaFor('Expert', { hasTotH: true }), 'melvorTotH:FrostSpark_Amulet');
  assert.equal(diplomaFor('Newbie'), null);
});

test('promotionPlan lists every unmet requirement and refuses at the top tier', () => {
  const ok = { tier: 'Newbie', masteryLevel: 20, hasLicence: true, nextHirePrice: 100000, hasDiploma: true, gp: 60000 };
  assert.deepEqual(promotionPlan(ok), { nextTier: 'Junior', cost: 60000, gate: 20, blockers: [], ok: true });
  assert.deepEqual(promotionPlan({ ...ok, masteryLevel: 19, hasLicence: false, hasDiploma: false, gp: 0 }).blockers, ['licence', 'mastery', 'diploma', 'gp']);
  assert.equal(promotionPlan({ ...ok, tier: 'Expert' }).ok, false);
  assert.deepEqual(promotionPlan({ ...ok, tier: 'Senior', masteryLevel: 80 }).nextTier, 'Expert');
});

test('promotion is gated on the Hiring level and the cost rate can drop', () => {
  const ok = { tier: 'Newbie', masteryLevel: 20, hasLicence: true, nextHirePrice: 100000, hasDiploma: true, gp: 1e9 };
  assert.deepEqual(promotionPlan({ ...ok, hiringLevel: 9, promotionLevel: 10 }).blockers, ['level']);
  assert.equal(promotionPlan({ ...ok, hiringLevel: 10, promotionLevel: 10 }).ok, true);
  assert.equal(promotionPlan({ ...ok, costRate: 0.5 }).cost, 50000);
});
