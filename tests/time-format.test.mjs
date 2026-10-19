import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortTime, hoursText } from '../src/time-format.mjs';

test('shortTime never shows 60s or a leading 0h (scan A-12, C-26)', () => {
  assert.equal(shortTime(299500), '5m 0s');
  assert.equal(shortTime(299000), '4m 59s');
  assert.equal(shortTime(184000), '3m 4s');
  assert.equal(shortTime(86400000 - 3), '24h 0m');
  assert.equal(shortTime(86_100_000), '23h 55m');
  assert.equal(shortTime(17_200), '18s');
  assert.equal(shortTime(0), '0s');
  assert.equal(shortTime(-5), '0s');
  assert.equal(shortTime(1), '1s');
});

test('hoursText rounds down to one decimal under 100 h', () => {
  assert.equal(hoursText(0.27), '0.2');
  assert.equal(hoursText(99.99), '99.9');
  assert.equal(hoursText(123.7), '123');
  assert.equal(hoursText(Infinity), '∞');
});
