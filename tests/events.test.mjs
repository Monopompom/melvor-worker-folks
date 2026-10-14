import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/events.mjs';

test('on/emit/off and unknown names', () => {
  const bus = createEventBus();
  const seen = [];
  const off = bus.on('folkHired', (p) => seen.push(p));
  assert.equal(bus.emit('folkHired', { id: 1 }), 1);
  off();
  assert.equal(bus.emit('folkHired', { id: 2 }), 0);
  assert.deepEqual(seen, [{ id: 1 }]);
  assert.throws(() => bus.on('folkDanced', () => {}));
  assert.throws(() => bus.emit('folkDanced'));
  assert.throws(() => bus.on('folkHired', 'nope'));
});

test('a throwing listener does not block the others', () => {
  const errors = [];
  const bus = createEventBus(['a'], { onError: (e) => errors.push(e.message) });
  let hit = 0;
  bus.on('a', () => { throw new Error('boom'); });
  bus.on('a', () => { hit += 1; });
  assert.equal(bus.emit('a'), 2);
  assert.equal(hit, 1);
  assert.deepEqual(errors, ['boom']);
});
