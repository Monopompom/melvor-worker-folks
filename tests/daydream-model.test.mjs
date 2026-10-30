import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DREAMS, DREAM_MS, dreamKey, hash, order, pickDream } from '../src/daydream-model.mjs';

const lang = JSON.parse(readFileSync(new URL('../languages/en.json', import.meta.url), 'utf8'));

test('a hundred daydreams, each with its own game icon and a line that names the Folk', () => {
  assert.equal(DREAMS.length, 100);
  assert.equal(new Set(DREAMS.map(([, id]) => id)).size, 100);
  DREAMS.forEach(([kind, id], i) => {
    assert.ok(['item', 'skill', 'pet', 'monster'].includes(kind), kind);
    assert.match(id, /^melvor[DF]:\w+$/);
    const line = lang[dreamKey(i)];
    assert.equal(typeof line, 'string', dreamKey(i));
    assert.ok(line.includes('${name}'), dreamKey(i));
  });
  assert.equal(dreamKey(0), 'MOD_WF_DREAM_001');
  assert.equal(dreamKey(99), 'MOD_WF_DREAM_100');
  assert.equal(lang.MOD_WF_DREAM_101, undefined);
});

test('the same seed gives the same order, a different seed another', () => {
  assert.equal(hash('folk-1'), hash('folk-1'));
  assert.notEqual(hash('folk-1'), hash('folk-2'));
  const a = order('folk-1', 100);
  assert.deepEqual(order('folk-1', 100), a);
  assert.deepEqual([...a].sort((x, y) => x - y), Array.from({ length: 100 }, (_, i) => i));
  assert.notDeepEqual(order('folk-2', 100), a);
});

test('a Folk keeps one daydream for a while, then moves on, and sees every one before a repeat', () => {
  const at = (now) => pickDream({ seed: 'folk-1', now, count: 100 });
  const start = 1_800_000_000_000;
  // Find where a change happens, then step one period at a time from there.
  let t = start;
  while (at(t + 1000) === at(t)) t += 1000;
  t += 1000;
  assert.equal(at(t + DREAM_MS - 1000), at(t));
  const seen = new Set();
  for (let k = 0; k < 100; k++) seen.add(at(t + k * DREAM_MS));
  assert.equal(seen.size, 100);
  for (let k = 0; k < 120; k++) assert.notEqual(at(t + k * DREAM_MS), at(t + (k + 1) * DREAM_MS));
});

test('Folks change at their own moments', () => {
  const changes = (seed) => {
    const out = [];
    for (let s = 0; s < DREAM_MS; s += 1000) {
      if (pickDream({ seed, now: s + 1000, count: 100 }) !== pickDream({ seed, now: s, count: 100 })) out.push(s);
    }
    return out;
  };
  assert.notDeepEqual(changes('folk-1'), changes('folk-2'));
});

test('a short pool still works: one daydream, or none', () => {
  assert.equal(pickDream({ seed: 'x', now: 5, count: 1 }), 0);
  assert.equal(pickDream({ seed: 'x', now: 5, count: 0 }), 0);
  const i = pickDream({ seed: 'x', now: 5, count: 7 });
  assert.ok(i >= 0 && i < 7);
});
