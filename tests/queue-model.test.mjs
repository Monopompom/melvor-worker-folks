import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as q from '../src/queue-model.mjs';
import { QUEUE_MAX as SAVE_MAX, normalizeQueue } from '../src/folk.mjs';

test('the queue holds as many steps as the save keeps', () => {
  assert.equal(q.QUEUE_MAX, SAVE_MAX);
  assert.equal(q.QUEUE_MAX, 3);
});

test('steps are added at the end, up to three; a bad count or recipe is refused', () => {
  let queue = [];
  ({ queue } = q.addStep(queue, 'a:Bar', 100));
  ({ queue } = q.addStep(queue, 'a:Dagger', null));
  ({ queue } = q.addStep(queue, 'a:Bar', 5));
  assert.deepEqual(queue, [
    { recipeId: 'a:Bar', count: 100, made: 0 },
    { recipeId: 'a:Dagger', count: null, made: 0 },
    { recipeId: 'a:Bar', count: 5, made: 0 },
  ]);
  assert.deepEqual(q.addStep(queue, 'a:Helm', 1), { error: 'full' });
  assert.deepEqual(q.addStep([], 'a:Helm', 0), { error: 'count' });
  assert.deepEqual(q.addStep([], 'a:Helm', 1.5), { error: 'count' });
  assert.deepEqual(q.addStep([], 'a:Helm', q.COUNT_MAX + 1), { error: 'count' });
  assert.deepEqual(q.addStep([], '', 1), { error: 'recipe' });
  // What the save reads back is the same queue.
  assert.deepEqual(normalizeQueue(JSON.parse(JSON.stringify(queue))), queue);
});

test('adding never changes the queue it was given', () => {
  const queue = [{ recipeId: 'a:Bar', count: 10, made: 3 }];
  const { queue: next } = q.addStep(queue, 'a:Dagger', 2);
  next[0].made = 9;
  assert.equal(queue[0].made, 3);
  assert.equal(queue.length, 1);
});

test('a step is removed by its place', () => {
  const queue = [{ recipeId: 'a', count: 1, made: 0 }, { recipeId: 'b', count: null, made: 0 }, { recipeId: 'c', count: 2, made: 0 }];
  assert.deepEqual(q.removeStep(queue, 1).map((s) => s.recipeId), ['a', 'c']);
  assert.deepEqual(q.removeStep(queue, 7).map((s) => s.recipeId), ['a', 'b', 'c']);
  assert.equal(queue.length, 3);
});

test('the count field reads whole numbers only; empty is not "for ever"', () => {
  assert.deepEqual(q.countOf('250'), { kind: 'qty', qty: 250 });
  assert.deepEqual(q.countOf(' １２ '), { kind: 'qty', qty: 12 });
  assert.deepEqual(q.countOf('1,000'), { kind: 'qty', qty: 1000 });
  assert.deepEqual(q.countOf('1 000'), { kind: 'qty', qty: 1000 });
  for (const bad of ['', '0', '-3', '2.5e3', 'abc', '1e3', String(q.COUNT_MAX + 1), undefined, null]) {
    assert.deepEqual(q.countOf(bad), { kind: 'bad' }, String(bad));
  }
});

test('what the Folk makes counts towards the head step, only of that step\'s products', () => {
  const queue = [{ recipeId: 'a:BronzeBar', count: 10, made: 0 }, { recipeId: 'a:Dagger', count: 3, made: 0 }];
  assert.equal(q.countMade(queue, 'i:BronzeBar', 4, ['i:BronzeBar']), 4);
  assert.equal(q.countMade(queue, 'i:Slag', 4, ['i:BronzeBar']), 0);
  assert.equal(q.countMade(queue, 'i:BronzeBar', 0, ['i:BronzeBar']), 0);
  assert.equal(queue[0].made, 4);
  assert.equal(q.stepDone(queue[0]), false);
  q.countMade(queue, 'i:BronzeBar', 7, ['i:BronzeBar']);
  assert.equal(q.stepDone(queue[0]), true, 'past the count is done too');
  assert.deepEqual(q.progressOf(queue[0]), { made: 10, count: 10, left: 0 });
  assert.equal(q.countMade([], 'i:BronzeBar', 1, ['i:BronzeBar']), 0);
});

test('"until inputs run out" never ends on a count', () => {
  const step = { recipeId: 'a', count: null, made: 1e6 };
  assert.equal(q.stepDone(step), false);
  assert.deepEqual(q.progressOf(step), { made: 1e6, count: null, left: null });
  assert.equal(q.stepDone(undefined), false);
});

test('advancing drops the head; the next step starts from nothing', () => {
  const queue = [{ recipeId: 'a', count: 2, made: 2 }, { recipeId: 'b', count: 5, made: 3 }];
  assert.deepEqual(q.advance(queue), [{ recipeId: 'b', count: 5, made: 0 }]);
  assert.deepEqual(q.advance([{ recipeId: 'a', count: 1, made: 1 }]), []);
  assert.deepEqual(q.advance([]), []);
  assert.equal(q.headOf([]), undefined);
});

test('a chain keeps the head\'s products that a later step uses', () => {
  assert.deepEqual(q.chainItems(['bar'], [['bar', 'coal'], ['log']]), ['bar']);
  assert.deepEqual(q.chainItems(['potA', 'potB'], [['potB'], ['potA']]), ['potA', 'potB']);
  assert.deepEqual(q.chainItems(['bar'], [['ore']]), []);
  assert.deepEqual(q.chainItems(['bar'], []), []);
});

test('the room takes whole items as far as its free time goes', () => {
  assert.equal(q.roomFor(10, 5000, 1000), 5);
  assert.equal(q.roomFor(3, 5000, 1000), 3);
  assert.equal(q.roomFor(3, 999, 1000), 0);
  assert.equal(q.roomFor(3, 0, 1000), 0);
  assert.equal(q.roomFor(3, 5000, 0), 0, 'an item the next step does not use takes no room');
  assert.equal(q.roomFor(2.5, 5000, 10), 0);
});
