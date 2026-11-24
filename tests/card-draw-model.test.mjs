import test from 'node:test';
import assert from 'node:assert/strict';
import { planCardDraw, nextSweepSlice, CARD_INPUT_MS, CARD_SWEEP_MS, CARD_SWEEP_SIZE, CARD_WORK_MS } from '../src/card-draw-model.mjs';

const base = { all: false, marked: 0, stale: false, now: 100000, lastInput: -Infinity, nextDraw: 0, nextSweep: 100000 + CARD_SWEEP_MS };

test('nothing new draws nothing, even when a sweep is due', () => {
  assert.equal(planCardDraw({ ...base, nextSweep: 0 }), 'none');
});

test('work on one Folk redraws only the marked cards', () => {
  assert.equal(planCardDraw({ ...base, marked: 1, stale: true }), 'some');
});

test('work waits for the once-a-second cap', () => {
  assert.equal(planCardDraw({ ...base, marked: 1, stale: true, nextDraw: base.now + CARD_WORK_MS }), 'none');
});

test('a press draws at once, past the cap', () => {
  const pressed = { ...base, all: true, nextDraw: base.now + CARD_WORK_MS, lastInput: base.now - CARD_INPUT_MS };
  assert.equal(planCardDraw(pressed), 'all');
  assert.equal(planCardDraw({ ...pressed, lastInput: base.now - CARD_INPUT_MS - 1 }), 'none');
});

test('a request for every card draws every card', () => {
  assert.equal(planCardDraw({ ...base, all: true, marked: 2 }), 'all');
});

test('stale cards wait for the sweep, then a catch-up starts', () => {
  assert.equal(planCardDraw({ ...base, stale: true }), 'none');
  assert.equal(planCardDraw({ ...base, stale: true, nextSweep: base.now }), 'sweep');
});

test('marked cards start the catch-up when it is due', () => {
  assert.equal(planCardDraw({ ...base, marked: 3, stale: true, nextSweep: base.now }), 'sweep');
});

test('a press beats a catch-up that is due', () => {
  assert.equal(planCardDraw({ ...base, all: true, stale: true, nextSweep: base.now }), 'all');
});

test('a catch-up walks every card once, a few at a time', () => {
  let left = Array.from({ length: 15 }, (_, i) => `f${i}`);
  const seen = [];
  while (left.length > 0) {
    const next = nextSweepSlice(left);
    assert.ok(next.slice.length <= CARD_SWEEP_SIZE);
    seen.push(...next.slice);
    left = next.left;
  }
  assert.deepEqual(seen, Array.from({ length: 15 }, (_, i) => `f${i}`));
});

test('a catch-up skips the cards just redrawn', () => {
  const next = nextSweepSlice(['a', 'b', 'c', 'd', 'e'], new Set(['a', 'c']), 2);
  assert.deepEqual(next.slice, ['b', 'd']);
  assert.deepEqual(next.left, ['e']);
});
