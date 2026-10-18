import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MILESTONES } from '../src/milestones.mjs';
import {
  TIP_COUNT, WAGE_TIPS, createTally, nextMilestone, progressTo, rosterOrder, tipNumbers, topEntries,
} from '../src/dashboard-model.mjs';

const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));

test('tips: all with wages on, the wage ones left out with wages off, each with a head and a text', () => {
  assert.equal(tipNumbers(true).length, TIP_COUNT);
  assert.deepEqual(tipNumbers(false), [3, 4, 7, 8, 10]);
  for (let n = 1; n <= TIP_COUNT; n += 1) {
    assert.ok(lang[`MOD_WF_TIP_${n}_HEAD`], `head ${n}`);
    assert.ok(lang[`MOD_WF_TIP_${n}`], `tip ${n}`);
  }
  for (const n of WAGE_TIPS) assert.ok(n >= 1 && n <= TIP_COUNT);
});

test('the tally adds up and ignores nothing-gained', () => {
  const t = createTally();
  assert.equal(t.empty, true);
  t.addXP('melvorD:Mining', 10);
  t.addXP('melvorD:Mining', 5.5);
  t.addItem('melvorD:Copper_Ore', 2);
  t.addItem('melvorD:Copper_Ore', 0);
  t.addItem('melvorD:Copper_Ore', -3);
  t.addCurrency('melvorD:GP', 40);
  t.addXP(undefined, 3);
  t.addItem('melvorD:Tin_Ore', NaN);
  assert.equal(t.empty, false);
  assert.deepEqual([...t.xp], [['melvorD:Mining', 15.5]]);
  assert.deepEqual([...t.items], [['melvorD:Copper_Ore', 2]]);
  assert.deepEqual([...t.currencies], [['melvorD:GP', 40]]);
});

test('topEntries: most first, ties by id, the rest counted', () => {
  const m = new Map([['b', 3], ['a', 3], ['c', 9], ['d', 1]]);
  assert.deepEqual(topEntries(m, 2), { shown: [['c', 9], ['a', 3]], more: 2 });
  assert.deepEqual(topEntries(m, 10).more, 0);
  assert.deepEqual(topEntries(new Map(), 3), { shown: [], more: 0 });
});

test('nextMilestone: the first above the level, capped above the cap, null at the end', () => {
  assert.deepEqual(nextMilestone(MILESTONES, { level: 1, levelCap: 99 }), { level: 5, key: 'RESERVE_24', capped: false });
  assert.deepEqual(nextMilestone(MILESTONES, { level: 5, levelCap: 99 }), { level: 10, key: 'PROMOTIONS', capped: false });
  assert.deepEqual(nextMilestone(MILESTONES, { level: 99, levelCap: 99 }), { level: 100, key: 'WAGES_10', capped: true });
  assert.equal(nextMilestone(MILESTONES, { level: 120, levelCap: 120 }), null);
  for (const m of MILESTONES) assert.ok(lang[`MOD_WF_MILESTONE_${m.key}`], m.key);
});

test('progressTo stays within 0..1', () => {
  assert.equal(progressTo(50, 0, 100), 0.5);
  assert.equal(progressTo(-5, 0, 100), 0);
  assert.equal(progressTo(500, 0, 100), 1);
  assert.equal(progressTo(5, 10, 10), 1);
});

test('rosterOrder: strike, debt, cooldown, idle, overtime, working; slot order within', () => {
  const rows = [
    { slot: 0, status: 'working' }, { slot: 1, status: 'idle' }, { slot: 2, status: 'strike' },
    { slot: 3, status: 'working' }, { slot: 4, status: 'debt' }, { slot: 5, status: 'overtime' }, { slot: 6, status: 'cooldown' },
  ];
  assert.deepEqual(rosterOrder(rows).map((r) => r.slot), [2, 4, 6, 1, 5, 0, 3]);
  assert.deepEqual(rows.map((r) => r.slot), [0, 1, 2, 3, 4, 5, 6], 'the input stays as it was');
});

test('every literal lang key the Overview code uses exists in en.json', () => {
  const src = readFileSync(new URL('../src/dashboard.mjs', import.meta.url), 'utf8');
  const keys = [...src.matchAll(/'(MOD_WF_[A-Z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 8, 'the Overview code names its keys literally');
  keys.forEach((k) => assert.ok(typeof lang[k] === 'string' && lang[k].length > 0, `missing lang ${k}`));
});
