import { test } from 'node:test';
import assert from 'node:assert/strict';
import { produceRate, rollOutcome, tierModifiers, crewBonus, rollsPets } from '../src/produce-rate.mjs';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('produceRate ladder', () => {
  assert.deepEqual(['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'].map(produceRate), [60, 80, 100, 120, 140]);
  assert.throws(() => produceRate('Boss'));
});

test('rollOutcome: Trainee fails ~40%, Journeyman never fails, Foreman bonus ~40%', () => {
  const rng = lcg(42);
  const count = (rate, n = 20000) => {
    const c = { fail: 0, ok: 0, bonus: 0 };
    for (let i = 0; i < n; i += 1) c[rollOutcome(rate, rng)] += 1;
    return c;
  };
  const t = count(60);
  assert.ok(t.fail / 20000 > 0.37 && t.fail / 20000 < 0.43, `fail ${t.fail}`);
  assert.equal(t.bonus, 0);
  const j = count(100);
  assert.equal(j.fail + j.bonus, 0);
  const f = count(140);
  assert.equal(f.fail, 0);
  assert.ok(f.bonus / 20000 > 0.37 && f.bonus / 20000 < 0.43, `bonus ${f.bonus}`);
  assert.equal(rollOutcome(60, () => 0.599), 'ok');
  assert.equal(rollOutcome(60, () => 0.6), 'fail');
  assert.equal(rollOutcome(140, () => 0.399), 'bonus');
  assert.equal(rollOutcome(140, () => 0.4), 'ok');
});

test('tierModifiers follow DESIGN §5.2 and substitute preservation when disabled', () => {
  assert.deepEqual(tierModifiers('Newbie'), { skillInterval: 10, skillPreservationChance: 0, skillXP: 0 });
  assert.deepEqual(tierModifiers('Senior'), { skillInterval: -5, skillPreservationChance: 10, skillXP: 0 });
  assert.deepEqual(tierModifiers('Expert'), { skillInterval: -10, skillPreservationChance: 20, skillXP: 0 });
  assert.deepEqual(tierModifiers('Expert', { preservationDisabled: true }), { skillInterval: -10, skillPreservationChance: 0, skillXP: 5 });
  assert.deepEqual(tierModifiers('Senior', { preservationDisabled: true }), { skillInterval: -5, skillPreservationChance: 0, skillXP: 2 });
  assert.deepEqual(tierModifiers('Newbie', { preservationDisabled: true }), { skillInterval: 10, skillPreservationChance: 0, skillXP: 0 });
});

test('crew bonus and pets', () => {
  assert.equal(crewBonus(0), 0);
  assert.equal(crewBonus(2), 6);
  assert.equal(crewBonus(9), 15);
  assert.equal(rollsPets('Newbie'), false);
  assert.equal(rollsPets('Junior'), false);
  assert.equal(rollsPets('Middle'), true);
});
