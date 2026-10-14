import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrew } from '../src/crew.mjs';
import { createEventBus } from '../src/events.mjs';
import * as model from '../src/folk.mjs';
import { pickName } from '../src/names.mjs';

function make(maxSlots = 3) {
  const bus = createEventBus();
  let n = 0;
  const crew = createCrew({ bus, model, pickName, maxSlots, now: () => 1000, makeId: () => `id${(n += 1)}`, rng: () => 0 });
  return { bus, crew };
}

test('hire fills the lowest free slot, emits folkHired and refuses when full', () => {
  const { bus, crew } = make(2);
  const hired = [];
  bus.on('folkHired', ({ folk, source }) => hired.push([folk.slot, source]));
  const a = crew.hire('Newbie', { source: 'dev' });
  const b = crew.hire('Expert');
  assert.equal(a.slot, 0);
  assert.equal(b.slot, 1);
  assert.equal(crew.hire('Newbie'), null);
  assert.deepEqual(hired, [[0, 'dev'], [1, 'shop']]);
  assert.notEqual(a.name, b.name);
  crew.fire(a.id);
  assert.equal(crew.hire('Junior').slot, 0);
});

test('assign keeps one Folk per skill and emits folkAssigned for both sides', () => {
  const { bus, crew } = make();
  const events = [];
  bus.on('folkAssigned', ({ folk, skillId }) => events.push(`${folk.id}:${skillId}`));
  const a = crew.hire('Newbie');
  const b = crew.hire('Newbie');
  crew.assign(a.id, 'melvorD:Mining');
  crew.assign(b.id, 'melvorD:Mining');
  assert.equal(crew.byId(a.id).skillId, null);
  assert.equal(crew.bySkill('melvorD:Mining').id, b.id);
  assert.deepEqual(events, ['id1:melvorD:Mining', 'id1:null', 'id2:melvorD:Mining']);
  assert.equal(crew.assign('missing', 'x'), false);
});

test('serialize/load round-trip, slot cap on load and crewChanged emission', () => {
  const { bus, crew } = make(2);
  let changes = 0;
  bus.on('crewChanged', () => { changes += 1; });
  crew.hire('Middle');
  crew.hire('Senior');
  const json = crew.serialize();
  const { crew: other } = make(1);
  const report = other.load(json);
  assert.equal(other.size, 1);
  assert.equal(report.dropped, 1);
  const { crew: same } = make(2);
  same.load(json);
  assert.deepEqual(same.all, crew.all);
  assert.equal(changes, 2);
  assert.deepEqual(crew.load('garbage').root.folks, []);
  assert.equal(crew.size, 0);
});

test('load migrates a pre-version root', () => {
  const { crew } = make(4);
  const report = crew.load({ folks: [{ id: 'old', slot: 1, tier: 'Junior', name: 'Old' }] });
  assert.deepEqual(report.applied, [0, 1, 2]);
  assert.equal(crew.bySlot(1).strikes, 0);
});

test('reserve survives serialize/load and never goes negative', () => {
  const { crew } = make();
  assert.equal(crew.adjustReserve('gp', 500), 500);
  assert.equal(crew.adjustReserve('gp', -800), 0);
  crew.adjustReserve('gp', 120.9);
  const { crew: other } = make();
  other.load(crew.serialize());
  assert.equal(other.reserveOf('gp'), 120);
  assert.equal(other.reserveOf('ap'), 0);
});

test('promote changes the tier and emits folkPromoted', () => {
  const { bus, crew } = make();
  const folk = crew.hire('Newbie');
  const seen = [];
  bus.on('folkPromoted', (e) => seen.push([e.from, e.to]));
  assert.equal(crew.promote(folk.id, 'Junior'), true);
  assert.equal(folk.tier, 'Junior');
  assert.deepEqual(seen, [['Newbie', 'Junior']]);
  assert.equal(crew.countByTier('Junior'), 1);
});

test('frozen slots are skipped by hire, expire with the clock and survive a round-trip', () => {
  let t = 1000;
  const build = () => createCrew({ bus: createEventBus(), model, pickName, maxSlots: 3, now: () => t, makeId: () => `f${t}`, rng: () => 0 });
  const crew = build();
  const a = crew.hire('Newbie');
  crew.freeze(1, 5000);
  assert.equal(crew.freeSlot(), 2);
  assert.deepEqual([...crew.frozenSlots().keys()], [1]);
  assert.equal(crew.nextThaw(), 5000);
  const copy = build();
  copy.load(crew.serialize());
  assert.equal(copy.freeSlot(), 2);
  t = 6000;
  assert.equal(crew.freeSlot(), 1);
  assert.equal(crew.frozenSlots().size, 0);
  assert.equal(crew.freeSlot({ limit: 1 }), -1);
  assert.ok(a);
});
