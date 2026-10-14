import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masteryXPForAction, levelPerks, poolPerks, combinedPerks, bonusPerks, totalWageDiscount, wageRaise, reliefCap, RELIEF_CAP_OF_RAISE, WAGE_RAISE_START } from '../src/mastery-perks.mjs';

test('mastery XP scales by tier, interval, level and the masteryXP modifier', () => {
  const base = masteryXPForAction({ level: 1, intervalMs: 3000, tier: 'Newbie' });
  assert.ok(Math.abs(base - 0.289) < 1e-9);
  assert.ok(Math.abs(masteryXPForAction({ level: 1, intervalMs: 3000, tier: 'Expert' }) - base * 1.4) < 1e-9);
  assert.ok(Math.abs(masteryXPForAction({ level: 1, intervalMs: 6000, tier: 'Newbie' }) - base * 2) < 1e-9);
  assert.ok(Math.abs(masteryXPForAction({ level: 2, intervalMs: 3000, tier: 'Newbie' }) - base * 1.07) < 1e-9);
  assert.ok(Math.abs(masteryXPForAction({ level: 1, intervalMs: 3000, tier: 'Newbie', modifierPercent: 50 }) - base * 1.5) < 1e-9);
  assert.throws(() => masteryXPForAction({ level: 1, intervalMs: 3000, tier: 'Boss' }));
});

test('pacing: a Trainee reaches mastery 20 in 6–8 h of 3 s actions', () => {
  const lvlXP = [0];
  let sum = 0;
  for (let l = 1; l < 130; l += 1) { sum += Math.floor(l + 300 * Math.pow(2, l / 7)); lvlXP.push(Math.floor(sum / 4)); }
  let xp = 0; let level = 1; let actions = 0;
  while (level < 20) { xp += masteryXPForAction({ level, intervalMs: 3000, tier: 'Newbie' }); actions += 1; while (level < 99 && xp > lvlXP[level + 1]) level += 1; }
  const hours = (actions * 3) / 3600;
  assert.ok(hours >= 6 && hours <= 8, `took ${hours.toFixed(1)} h`);
});

test('level perks: seniority raise from 40% to the full wage through the anchors; thresholds', () => {
  assert.equal(levelPerks(1).wageRaise, WAGE_RAISE_START);
  assert.equal(levelPerks(99).wageRaise, 1);
  assert.equal(levelPerks(0).wageRaise, WAGE_RAISE_START);
  assert.equal(levelPerks(120).wageRaise, 1);
  assert.ok(Math.abs(wageRaise(50) - 0.55) < 1e-9);
  assert.ok(Math.abs(wageRaise(90) - 0.74) < 1e-9);
  assert.ok(Math.abs(wageRaise(25) - 0.4735) < 1e-3, 'linear between anchors');
  for (let l = 2; l <= 99; l += 1) assert.ok(wageRaise(l) > wageRaise(l - 1), `monotonic at ${l}`);
  assert.equal(levelPerks(99).wageDiscount, undefined);
  assert.equal(levelPerks(24).graceMs, 15 * 60000);
  assert.equal(levelPerks(25).graceMs, 30 * 60000);
  assert.equal(levelPerks(29).overtime, false);
  assert.equal(levelPerks(30).overtime, true);
  assert.equal(levelPerks(60).cooldownMult, 0.75);
  assert.equal(levelPerks(90).cooldownMult, 0.5);
  assert.equal(levelPerks(75).skillXP, 5);
  assert.equal(levelPerks(99).trusted, true);
});

test('pool perks by checkpoint', () => {
  assert.deepEqual(poolPerks(9), { wageDiscount: 0, graceBonusMs: 0, autoSettle: false, cooldownMult: 1 });
  assert.deepEqual(poolPerks(50), { wageDiscount: 0.05, graceBonusMs: 15 * 60000, autoSettle: true, cooldownMult: 1 });
  assert.equal(poolPerks(95).cooldownMult, 0.75);
});

test('combined perks merge level and pool, overtime needs level 30 and the toggle', () => {
  const c = combinedPerks(30, 50, { overtimeOn: true });
  assert.equal(c.wageDiscount, 0.05);
  assert.equal(c.wageRaise, wageRaise(30));
  assert.equal(c.wageFactor, 2);
  assert.equal(c.intervalPercent, -20);
  assert.equal(c.graceMs, 45 * 60000);
  assert.equal(combinedPerks(29, 0, { overtimeOn: true }).wageFactor, 1);
  assert.equal(combinedPerks(99, 95).cooldownMult, 0.5 * 0.75);
  assert.equal(combinedPerks(99, 95).wageDiscount, 0.05);
  assert.equal(combinedPerks(99, 95).wageRaise, 1);
});

test('bonus perks read modifier values: percent discount, minutes of grace, inverted cooldown', () => {
  assert.deepEqual(bonusPerks(), { wageDiscount: 0, graceBonusMs: 0, autoSettle: false, cooldownMult: 1, freeOvertime: false });
  const b = bonusPerks({ wageDiscountPercent: 5, graceMinutes: 15, cooldownPercent: -25, autoSettle: true });
  assert.deepEqual({ ...b, freeOvertime: undefined }, { ...poolPerks(95), freeOvertime: undefined }); // the 95% pool reads the same through its modifiers
  assert.equal(bonusPerks({ cooldownPercent: -150 }).cooldownMult, 0);
  assert.equal(bonusPerks({ wageDiscountPercent: -10 }).wageDiscount, 0);
});

test('combined perks accept a bonus object and cap the discount', () => {
  const c = combinedPerks(50, bonusPerks({ wageDiscountPercent: 23, graceMinutes: 10, cooldownPercent: -20 }));
  assert.equal(c.wageDiscount, reliefCap(wageRaise(50))); // 23% asked, capped to 30% of the 41% raise
  assert.equal(combinedPerks(50, bonusPerks({ wageDiscountPercent: 5 })).wageDiscount, 0.05);
  assert.equal(c.graceMs, 40 * 60000);
  assert.equal(c.cooldownMult, 0.8);
  assert.equal(combinedPerks(99, bonusPerks({ wageDiscountPercent: 60 })).wageDiscount, RELIEF_CAP_OF_RAISE);
  assert.equal(totalWageDiscount(1, 0.25, 0.1, 0.3), RELIEF_CAP_OF_RAISE);
  assert.equal(totalWageDiscount(1, 0.2, -1, undefined), 0.2);
  // the cap follows the raise: a fresh Folk (40%) can only be relieved by 12%
  assert.ok(Math.abs(reliefCap(WAGE_RAISE_START) - 0.12) < 1e-9);
  assert.ok(Math.abs(totalWageDiscount(0.4, 0.05, 0.02, 0.15) - 0.12) < 1e-9);
  assert.ok(Math.abs(combinedPerks(1, bonusPerks({ wageDiscountPercent: 22 })).wageDiscount - 0.12) < 1e-9);
  assert.equal(RELIEF_CAP_OF_RAISE, 0.3);
});

test('free overtime (Master Relic) keeps the interval cut and drops the wage factor to 1', () => {
  const paid = combinedPerks(40, bonusPerks(), { overtimeOn: true, overtimeWageFactor: 1.5 });
  assert.equal(paid.wageFactor, 1.5);
  assert.equal(paid.intervalPercent, -20);
  const free = combinedPerks(40, bonusPerks({ freeOvertime: true }), { overtimeOn: true, overtimeWageFactor: 1.5 });
  assert.equal(free.wageFactor, 1);
  assert.equal(free.intervalPercent, -20);
  assert.equal(combinedPerks(40, bonusPerks({ freeOvertime: true }), { overtimeOn: false }).wageFactor, 1);
  assert.equal(combinedPerks(10, bonusPerks({ freeOvertime: true }), { overtimeOn: true }).overtimeActive, false);
});
