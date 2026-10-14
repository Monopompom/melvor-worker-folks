import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickName, toRoman, FIRST_NAMES, EPITHETS } from '../src/names.mjs';

test('pickName avoids taken names and falls back to numerals when exhausted', () => {
  const rng = () => 0;
  assert.equal(pickName([], rng, ['A', 'B'], []), 'A');
  assert.equal(pickName(['A'], rng, ['A', 'B'], []), 'B');
  assert.equal(pickName(['A', 'B'], rng, ['A', 'B'], []), 'A II');
  assert.equal(pickName(['A', 'B', 'A II'], rng, ['A', 'B'], []), 'A III');
  assert.ok(FIRST_NAMES.length >= 40);
  assert.equal(new Set(FIRST_NAMES).size, FIRST_NAMES.length);
});

test('pickName pairs a first name with an epithet, spreading first names before repeating', () => {
  const rng = () => 0;
  assert.equal(pickName([], rng, ['A', 'B'], ['the X', 'the Y']), 'A the X');
  assert.equal(pickName(['A the X'], rng, ['A', 'B'], ['the X', 'the Y']), 'B the X');
  assert.equal(pickName(['A the X', 'B the X'], rng, ['A', 'B'], ['the X', 'the Y']), 'A the Y');
  assert.equal(pickName(['A the X', 'A the Y', 'B the X', 'B the Y'], rng, ['A', 'B'], ['the X', 'the Y']), 'A the X II');
  assert.ok(EPITHETS.length >= 30);
  assert.equal(new Set(EPITHETS).size, EPITHETS.length);
  const sample = pickName([], Math.random);
  assert.match(sample, /^[A-Z][a-z]+ (the|of) /);
});

test('toRoman', () => {
  assert.equal(toRoman(4), 'IV');
  assert.equal(toRoman(9), 'IX');
  assert.equal(toRoman(14), 'XIV');
  assert.equal(toRoman(1994), 'MCMXCIV');
});
