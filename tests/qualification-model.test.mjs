import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALIFICATION_LEVELS, LOWERING_MASTERY, requirement, check, reached } from '../src/qualification-model.mjs';
import { LEVEL_MILESTONES } from '../src/mastery-perks.mjs';
import { TIERS } from '../src/folk.mjs';

test('every tier needs its own level from you: 10 / 30 / 50 / 70 / 90', () => {
  assert.deepEqual(TIERS.map((tier) => requirement({ tier }).level), [10, 30, 50, 70, 90]);
  assert.deepEqual(Object.keys(QUALIFICATION_LEVELS), TIERS);
});

test('from Folk mastery 50 the tier below is enough, never below a Newbie', () => {
  assert.deepEqual(requirement({ tier: 'Senior', masteryLevel: LOWERING_MASTERY - 1 }), { level: 70, lowered: false });
  assert.deepEqual(requirement({ tier: 'Senior', masteryLevel: LOWERING_MASTERY }), { level: 50, lowered: true });
  assert.deepEqual(requirement({ tier: 'Expert', masteryLevel: 99 }), { level: 70, lowered: true });
  assert.deepEqual(requirement({ tier: 'Newbie', masteryLevel: 99 }), { level: 10, lowered: false });
  assert.throws(() => requirement({ tier: 'Boss' }));
});

test('a Newbie cannot take a level-9 skill; a mastery-50 Senior can take a level-50 one', () => {
  assert.deepEqual(check({ tier: 'Newbie', masteryLevel: 1, playerLevel: 9 }), { level: 10, lowered: false, now: 9, ok: false });
  assert.equal(check({ tier: 'Newbie', playerLevel: 10 }).ok, true);
  assert.equal(check({ tier: 'Senior', masteryLevel: 50, playerLevel: 50 }).ok, true);
  assert.equal(check({ tier: 'Senior', masteryLevel: 49, playerLevel: 50 }).ok, false);
});

test('a promotion can lift the requirement past your level', () => {
  // A Newbie promoted at mastery 20 on a level-25 skill: the Apprentice needs 30.
  assert.equal(check({ tier: 'Newbie', masteryLevel: 20, playerLevel: 25 }).ok, true);
  assert.equal(check({ tier: 'Junior', masteryLevel: 20, playerLevel: 25 }).ok, false);
  // Promoted to Master at mastery 60, it keeps the tier-below rule: Journeyman's 50.
  assert.equal(check({ tier: 'Senior', masteryLevel: 60, playerLevel: 55 }).ok, true);
});

test('a level-up reaches a requirement only when it crosses it', () => {
  assert.equal(reached(30, 29, 30), true);
  assert.equal(reached(30, 25, 40), true);
  assert.equal(reached(30, 30, 31), false);
  assert.equal(reached(30, 20, 29), false);
});

test('the card lists the qualification perk at the lowering mastery level', () => {
  assert.deepEqual(LEVEL_MILESTONES.find(([, key]) => key === 'qualify'), [LOWERING_MASTERY, 'qualify']);
  const levels = LEVEL_MILESTONES.map(([at]) => at);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
});
