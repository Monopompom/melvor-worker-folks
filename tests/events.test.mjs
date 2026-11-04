import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createEventBus, EVENT_NAMES } from '../src/events.mjs';

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

test('every event a module emits or listens to by name is a known one', () => {
  const dir = new URL('../src/', import.meta.url);
  const names = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    for (const m of src.matchAll(/events\.(?:emit|on)\('([A-Za-z]+)'/g)) names.add(m[1]);
  }
  assert.ok(names.size >= 15);
  for (const name of names) assert.ok(EVENT_NAMES.includes(name), `unknown event ${name}`);
});
