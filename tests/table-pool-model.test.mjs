import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTablePool } from '../src/table-pool-model.mjs';

test('a key gets the same object on every ask', () => {
  const pool = createTablePool(() => ({}));
  const first = pool.get('ada');
  for (let i = 0; i < 1000; i += 1) assert.equal(pool.get('ada'), first);
  assert.equal(pool.made, 1);
});

test('each key has its own object', () => {
  const pool = createTablePool(() => ({}));
  assert.notEqual(pool.get('ada'), pool.get('bram'));
  assert.equal(pool.made, 2);
});

test('a released object goes to the next new key instead of a new one', () => {
  const pool = createTablePool(() => ({}));
  const ada = pool.get('ada');
  pool.release('ada');
  assert.equal(pool.get('cora'), ada);
  assert.equal(pool.made, 1);
});

test('hiring and firing over and over never makes more objects than Folks at once', () => {
  const pool = createTablePool(() => ({}));
  for (let i = 0; i < 500; i += 1) {
    pool.get(`folk-${i}`);
    pool.get(`folk-${i + 1}`);
    pool.release(`folk-${i}`);
  }
  assert.equal(pool.made, 2);
});

test('releasing an unknown key does nothing', () => {
  const pool = createTablePool(() => ({}));
  pool.release('nobody');
  pool.get('ada');
  assert.equal(pool.made, 1);
});
