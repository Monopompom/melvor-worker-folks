import { test } from 'node:test';
import assert from 'node:assert/strict';
import { petRollIntervalMs, petChancePerHour, relicRollLevel, PET_ROLL_FACTOR } from '../src/discovery-model.mjs';

test('the crew shares one pet roll: interval halved and split across working Folks', () => {
  assert.equal(PET_ROLL_FACTOR, 0.5);
  assert.equal(petRollIntervalMs(3000, 1), 1500);
  assert.equal(petRollIntervalMs(3000, 3), 500);
  assert.equal(petRollIntervalMs(3000, 0), 1500); // nobody counted yet: treat as one
  assert.equal(petRollIntervalMs(0, 2), 0);
  assert.equal(petRollIntervalMs(-5, 2), 0);
  assert.equal(petRollIntervalMs(3000, 2, 1), 1500);
});

test('chance per hour does not grow with crew size and stays tiny', () => {
  const solo = petChancePerHour({ level: 99 });
  const crew = petChancePerHour({ level: 99, workingCount: 10 });
  assert.ok(Math.abs(solo - crew) < 1e-9);
  assert.ok(solo < 1, `${solo}% per hour at level 99`);
  assert.ok(petChancePerHour({ level: 10 }) < petChancePerHour({ level: 99 }));
});

test('relic roll level is a whole level of at least 1', () => {
  assert.equal(relicRollLevel(37.9), 37);
  assert.equal(relicRollLevel(0), 1);
  assert.equal(relicRollLevel(undefined), 1);
});
