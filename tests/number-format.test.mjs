import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortNumber } from '../src/number-format.mjs';

test('shortNumber keeps small numbers whole and shortens big ones, rounded down', () => {
  assert.equal(shortNumber(0), '0');
  assert.equal(shortNumber(9999), '9999');
  assert.equal(shortNumber(12345), '12.3K');
  assert.equal(shortNumber(125000), '125K');
  assert.equal(shortNumber(511842), '511K');
  assert.equal(shortNumber(999999), '999K');
  assert.equal(shortNumber(1005430), '1M');
  assert.equal(shortNumber(2500000), '2.5M');
  assert.equal(shortNumber(99_990_000), '99.9M');
  assert.equal(shortNumber(100_000_000), '100M');
  assert.equal(shortNumber(123_456_789_000), '123B');
  assert.equal(shortNumber(-2500000), '-2.5M');
  assert.equal(shortNumber(1234.9), '1234');
});

test('shortNumber passes a value that is not a number through', () => {
  assert.equal(shortNumber(Infinity), 'Infinity');
  assert.equal(shortNumber('x'), 'x');
});
