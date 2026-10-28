import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MILESTONES, visibleMilestones, milestoneState, reserveCapacityHours, promotionsUnlocked, apologyUnlocked,
  autoRestartUnlocked, overtimeWageFactor, freeShiftSlots, levelWageDiscount, promotionCostRate, hiringXPForWork, xpToastSplit,
  reserveRoom, capIncreaseModifications, capacityText, RESERVE_STEPS, firingSeveranceRate, firingSeverance, folkMarkShare,
  crewBonusMax,
} from '../src/milestones.mjs';

const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));
/** The game's template: ${name} from vars. */
const t = (key, vars) => lang[key].replace(/\$\{(\w+)\}/g, (_, k) => vars[k]);

test('milestones are sorted by level and match the design table', () => {
  const levels = MILESTONES.map((m) => m.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.deepEqual(levels, [5, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 50, 55, 60, 65, 70, 80, 85, 90, 95, 99, 99, 100, 110, 120]);
  assert.equal(visibleMilestones(99).length, 22);
  assert.equal(visibleMilestones(120).length, 25);
  MILESTONES.forEach((m) => assert.equal(typeof lang[`MOD_WF_MILESTONE_${m.key}`], 'string', m.key));
});

test('milestone state respects the level cap', () => {
  assert.equal(milestoneState(5, { level: 7, levelCap: 10 }), 'reached');
  assert.equal(milestoneState(10, { level: 7, levelCap: 10 }), 'next');
  assert.equal(milestoneState(20, { level: 7, levelCap: 10 }), 'capped');
});

test('reserve capacity steps', () => {
  assert.equal(reserveCapacityHours(4), 0);
  assert.equal(reserveCapacityHours(5), 24);
  assert.equal(reserveCapacityHours(35), 72);
  assert.equal(reserveCapacityHours(65), 168);
  assert.equal(reserveCapacityHours(99), 720);
});

test('capacityText: hours under a week, days from one; the same words as the milestone names', () => {
  assert.equal(capacityText(24, t), '24 h');
  assert.equal(capacityText(72, t), '72 h');
  assert.equal(capacityText(168, t), '7 days');
  assert.equal(capacityText(720, t), '30 days');
  // Every reserve step's milestone name ends with the same text the helper writes.
  for (const [level, hours] of RESERVE_STEPS) {
    const m = MILESTONES.find((x) => x.level === level);
    assert.ok(lang[`MOD_WF_MILESTONE_${m.key}`].endsWith(capacityText(hours, t)), `${m.key} says ${capacityText(hours, t)}`);
  }
});

test('feature gates by level', () => {
  assert.equal(promotionsUnlocked(9), false);
  assert.equal(promotionsUnlocked(10), true);
  assert.equal(apologyUnlocked(25), true);
  assert.equal(autoRestartUnlocked(54), false);
  assert.equal(overtimeWageFactor(84), 2);
  assert.equal(overtimeWageFactor(85), 1.5);
  assert.deepEqual([freeShiftSlots(98), freeShiftSlots(99), freeShiftSlots(110)], [0, 1, 2]);
  assert.deepEqual([levelWageDiscount(99), levelWageDiscount(100)], [0, 10]);
  assert.deepEqual([promotionCostRate(119), promotionCostRate(120)], [0.6, 0.5]);
  assert.deepEqual([folkMarkShare(49), folkMarkShare(50)], [0, 0.5]);
  assert.deepEqual([crewBonusMax(98), crewBonusMax(99)], [15, 20]);
});

test('firing severance: 10% of what the Folk cost, 5% from Hiring 45, nothing from 90, rounded up', () => {
  assert.deepEqual([firingSeveranceRate(1), firingSeveranceRate(44), firingSeveranceRate(45), firingSeveranceRate(89), firingSeveranceRate(90)], [0.1, 0.1, 0.05, 0.05, 0]);
  assert.equal(firingSeverance(10000, 1), 1000);
  assert.equal(firingSeverance(10001, 1), 1001);
  assert.equal(firingSeverance(10000, 45), 500);
  assert.equal(firingSeverance(10000, 90), 0);
  assert.equal(firingSeverance(null, 1), 0);
  assert.equal(firingSeverance(-50, 1), 0);
});

test('xpToastSplit carries fractions until a whole XP can be shown', () => {
  let s = xpToastSplit(0.5, 0);
  assert.deepEqual(s, { extra: 0, carry: 0.5 });
  s = xpToastSplit(0.5, s.carry);
  assert.deepEqual(s, { extra: 1, carry: 0 });
  s = xpToastSplit(2.75, 0.5); // engine toasts the 2; the 0.75 joins the carry
  assert.equal(s.extra, 1);
  assert.ok(Math.abs(s.carry - 0.25) < 1e-9);
  assert.deepEqual(xpToastSplit(0, 0.3), { extra: 0, carry: 0.3 });
  assert.deepEqual(xpToastSplit(3, 0), { extra: 0, carry: 0 });
});

test('Hiring XP is the tier rate for the time worked', () => {
  assert.equal(hiringXPForWork('Newbie', 3600000), 60);
  assert.equal(hiringXPForWork('Expert', 3600000), 600);
  assert.ok(Math.abs(hiringXPForWork('Middle', 3000) - 220 / 1200) < 1e-12, 'a 3 s action is 1/1200 of an hour');
  assert.equal(hiringXPForWork('Senior', 3600000, 200), 760, 'the rate setting scales it');
  assert.equal(hiringXPForWork('Junior', 3600000, 0), 0);
  assert.equal(hiringXPForWork('Junior', 0), 0);
  assert.equal(hiringXPForWork('Nobody', 3600000), 0);
});

test('reserve room', () => {
  assert.deepEqual(reserveRoom({ hours: 24, perHour: 1000, reserve: 4000 }), { capacity: 24000, room: 20000 });
  assert.deepEqual(reserveRoom({ hours: 0, perHour: 1000, reserve: 0 }), { capacity: 0, room: 0 });
  assert.deepEqual(reserveRoom({ hours: 24, perHour: 100, reserve: 5000 }), { capacity: 2400, room: 0 });
});

test('cap increase modifications only for loaded expansions', () => {
  assert.equal(capIncreaseModifications({}), undefined);
  const both = capIncreaseModifications({ hasAoD: true, hasTotH: true });
  assert.equal(both.skillLevelCapIncreases.length, 2);
  assert.equal(both.skillLevelCapIncreases[0].randomIncreases.add[0].skillID, 'worker_folks:Hiring');
});
