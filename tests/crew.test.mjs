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

test('assignJob keeps one Folk per job, ends its skill, and a skill ends its job', () => {
  const { bus, crew } = make();
  const events = [];
  bus.on('folkJobChanged', ({ folk, previous, jobId }) => events.push(`${folk.id}:${previous}>${jobId}`));
  const a = crew.hire('Junior');
  const b = crew.hire('Junior');
  crew.assign(a.id, 'melvorD:Mining');
  crew.byId(a.id).travel = 'with';
  assert.equal(crew.assignJob(a.id, 'worker_folks:Quartermaster'), true);
  assert.equal(crew.byId(a.id).skillId, null, 'the job takes the Folk off its skill');
  assert.equal(crew.byId(a.id).travel, 'idle');
  crew.byId(a.id).jobMemory = { food0: 'melvorD:Shark' };
  crew.assignJob(b.id, 'worker_folks:Quartermaster');
  assert.equal(crew.byId(a.id).job, null, 'one Folk per job');
  assert.deepEqual(crew.byId(a.id).jobMemory, {});
  assert.equal(crew.byJob('worker_folks:Quartermaster').id, b.id);
  crew.assign(b.id, 'melvorD:Fishing');
  assert.equal(crew.byId(b.id).job, null, 'a skill ends the job');
  assert.equal(crew.byJob('worker_folks:Quartermaster'), undefined);
  assert.deepEqual(events, ['id1:null>worker_folks:Quartermaster', 'id1:worker_folks:Quartermaster>null', 'id2:null>worker_folks:Quartermaster', 'id2:worker_folks:Quartermaster>null']);
  assert.equal(crew.assignJob('nobody', 'x'), false);
});

test('supply lines: set on the supplier, never itself, ended by a job or by either Folk leaving', () => {
  const { bus, crew } = make();
  const events = [];
  bus.on('folkSupplyChanged', ({ folk, receiverId }) => events.push(`${folk.id}>${receiverId}`));
  const a = crew.hire('Junior');
  const b = crew.hire('Junior');
  const c = crew.hire('Junior');
  assert.equal(crew.setSupply(a.id, a.id), false, 'never itself');
  assert.equal(crew.setSupply(a.id, 'nobody'), false);
  assert.equal(crew.setSupply(a.id, b.id), true);
  assert.equal(crew.setSupply(c.id, b.id), true);
  assert.deepEqual(crew.links, [{ supplierId: a.id, receiverId: b.id }, { supplierId: c.id, receiverId: b.id }]);
  assert.deepEqual(crew.suppliersOf(b.id).map((f) => f.id), [a.id, c.id]);
  crew.assignJob(c.id, 'worker_folks:Quartermaster');
  assert.equal(crew.byId(c.id).supplies, null, 'a job ends its line');
  crew.fire(b.id);
  assert.equal(crew.byId(a.id).supplies, null, 'its receiver left');
  assert.deepEqual(crew.links, []);
  assert.deepEqual(events, [`${a.id}>${b.id}`, `${c.id}>${b.id}`, `${c.id}>null`, `${a.id}>null`]);
});

test('load ends a supply line whose receiver is not in the crew', () => {
  const { crew } = make(3);
  const a = crew.hire('Junior');
  const b = crew.hire('Junior');
  const c = crew.hire('Junior');
  crew.setSupply(a.id, c.id);
  crew.setSupply(b.id, a.id);
  const { crew: small } = make(2);
  small.load(crew.serialize());
  assert.equal(small.byId(a.id).supplies, null, 'its receiver was past the slot cap');
  assert.equal(small.byId(b.id).supplies, a.id);
});

test('a job that travels leaves the Folk where it is, along with the player included', () => {
  const { crew } = make();
  const a = crew.hire('Junior');
  crew.byId(a.id).travel = 'with';
  crew.assignJob(a.id, 'worker_folks:Quartermaster', { travels: true });
  assert.equal(crew.byId(a.id).travel, 'with');
  assert.equal(crew.byId(a.id).job, 'worker_folks:Quartermaster');
});

test('a shared job keeps every holder; a plain job still has one', () => {
  const { crew } = make();
  const a = crew.hire('Junior');
  const b = crew.hire('Junior');
  crew.assignJob(a.id, 'voyage:Courier', { travels: true, shared: true });
  crew.assignJob(b.id, 'voyage:Courier', { travels: true, shared: true });
  assert.deepEqual(crew.holdersOf('voyage:Courier').map((f) => f.id), [a.id, b.id]);
  assert.equal(crew.byJob('voyage:Courier').id, a.id, 'the first holder');
  crew.assignJob(a.id, null);
  assert.deepEqual(crew.holdersOf('voyage:Courier').map((f) => f.id), [b.id]);
  crew.assignJob(a.id, 'worker_folks:Quartermaster');
  crew.assignJob(b.id, 'worker_folks:Quartermaster');
  assert.deepEqual(crew.holdersOf('worker_folks:Quartermaster').map((f) => f.id), [b.id]);
});

test('load migrates a pre-version root', () => {
  const { crew } = make(4);
  const report = crew.load({ folks: [{ id: 'old', slot: 1, tier: 'Junior', name: 'Old' }] });
  assert.deepEqual(report.applied, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(crew.bySlot(1).strikes, 0);
  assert.equal(crew.bySlot(1).paid, null);
});

test('the Work Orders board rides in the save as it is, and clear() drops it', () => {
  const { crew } = make();
  assert.equal(crew.board, null);
  crew.board = { orders: [{ id: 'o1', qty: 5 }], ticks: 40 };
  const { crew: other } = make();
  other.load(crew.serialize());
  assert.deepEqual(other.board, { orders: [{ id: 'o1', qty: 5 }], ticks: 40 });
  other.load({ v: 6, folks: [], board: [1, 2] });
  assert.equal(other.board, null, 'not an object: no board');
  crew.clear();
  assert.equal(crew.board, null);
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

test('a reserve change emits reserveChanged with the new total, never crewChanged', () => {
  const { bus, crew } = make();
  const seen = [];
  bus.on('reserveChanged', (e) => seen.push(e));
  bus.on('crewChanged', () => seen.push('crewChanged'));
  crew.adjustReserve('gp', 500);
  crew.adjustReserve('gp', -41);
  crew.adjustReserve('gp', -1000);
  assert.deepEqual(seen, [
    { currencyId: 'gp', amount: 500 },
    { currencyId: 'gp', amount: 459 },
    { currencyId: 'gp', amount: 0 },
  ]);
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

test('paid: a hire keeps its price and a promotion adds its fee; an unknown cost stays unknown', () => {
  const { crew } = make();
  const known = crew.hire('Newbie', { paid: 1000 });
  assert.equal(known.paid, 1000);
  crew.promote(known.id, 'Junior', { paid: 4000 });
  assert.equal(known.paid, 5000);
  const unknown = crew.hire('Newbie');
  assert.equal(unknown.paid, null);
  crew.promote(unknown.id, 'Junior', { paid: 4000 });
  assert.equal(unknown.paid, null);
  const { crew: other } = make();
  other.load(crew.serialize());
  assert.equal(other.byId(known.id).paid, 5000);
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

test('a dead Folk’s lost items stay with its frozen slot, through a save, until it thaws', () => {
  let t = 1000;
  const build = () => createCrew({ bus: createEventBus(), model, pickName, maxSlots: 3, now: () => t, makeId: () => `f${t}`, rng: () => 0 });
  const crew = build();
  crew.setLost(0, [{ id: 'melvorD:Oak_Logs', qty: 5 }]);
  assert.deepEqual(crew.lostAt(0), [], 'not frozen: nothing kept');
  crew.freeze(0, 5000);
  crew.setLost(0, [{ id: 'melvorD:Oak_Logs', qty: 5 }, { id: 'bad', qty: 0 }]);
  assert.deepEqual(crew.lostAt(0), [{ id: 'melvorD:Oak_Logs', qty: 5 }]);
  const copy = build();
  copy.load(crew.serialize());
  assert.deepEqual(copy.lostAt(0), [{ id: 'melvorD:Oak_Logs', qty: 5 }]);
  crew.freeze(0, 6000);
  assert.deepEqual(crew.lostAt(0), [], 'a new death starts clean');
  t = 7000;
  copy.frozenSlots();
  assert.deepEqual(copy.lostAt(0), [], 'gone with the thaw');
});

test('a Folk going along with the player stops going along when given a skill', () => {
  const { crew } = make();
  const a = crew.hire('Newbie');
  a.travel = 'with';
  crew.assign(a.id, null);
  assert.equal(a.travel, 'with', 'taking a skill away keeps it on the road');
  crew.assign(a.id, 'melvorD:Mining');
  assert.equal(a.travel, 'idle');
  assert.equal(a.skillId, 'melvorD:Mining');
  const b = crew.hire('Newbie');
  b.travel = 'walking';
  crew.assign(b.id, 'melvorD:Fishing');
  assert.equal(b.travel, 'idle', 'a walking Folk given a skill has arrived');
});

test('load replaces the depots whole: a backup\'s or none', () => {
  const { crew } = make();
  crew.hire('Junior');
  crew.depots = { tent1: { name: 'Camp', hours: 48, room: { haul: {}, stock: {} }, dropped: false } };
  const saved = crew.serialize();
  crew.depots = { tent2: { name: 'Hill', hours: 24, room: { haul: {}, stock: {} }, dropped: false } };
  crew.load(saved);
  assert.deepEqual(Object.keys(crew.depots), ['tent1']);
  const { crew: older } = make();
  older.hire('Junior');
  const before = older.serialize();
  crew.load(before);
  assert.deepEqual(crew.depots, {}, 'a record from before depots');
});

test('going back to a hired name another Folk has taken is refused', () => {
  const { crew } = make();
  const a = crew.hire('Newbie');
  const b = crew.hire('Newbie');
  const hired = a.name;
  assert.equal(crew.rename(a.id, 'Boss'), null);
  assert.equal(crew.rename(b.id, hired), null);
  assert.equal(crew.rename(a.id, hired), 'taken');
  assert.equal(a.name, 'Boss');
});

test('a reserved word is refused as a new name, and a Folk keeps its own', () => {
  const { crew } = make();
  const a = crew.hire('Newbie');
  const was = a.name;
  assert.equal(crew.rename(a.id, 'You', { reserved: ['You'] }), 'reserved');
  assert.equal(a.name, was);
  assert.equal(crew.rename(a.id, was, { reserved: [was] }), null);
});

test('a cairn is kept on its frozen slot only, and goes when the slot thaws or freezes again', () => {
  const { crew } = make(4);
  crew.setCairn(1, 'dead');
  assert.equal(crew.cairnAt(1), undefined, 'not frozen: ignored');
  crew.freeze(1, 5000);
  crew.setLost(1, [{ id: 'ore', qty: 3 }]);
  crew.setCairn(1, 'dead');
  assert.equal(crew.cairnAt(1), 'dead');
  assert.deepEqual(crew.lostAt(1), [], 'a cairn means nothing was lost');
  const back = make(4).crew;
  back.load(crew.serialize());
  assert.equal(back.cairnAt(1), 'dead', 'saved with the slot');
  crew.thaw(1);
  assert.equal(crew.cairnAt(1), undefined);
  crew.freeze(2, 5000);
  crew.setCairn(2, 'x');
  crew.freeze(2, 9000);
  assert.equal(crew.cairnAt(2), undefined, 'a new death on the slot starts clean');
});

test('the moment clock and plans ride in the save', () => {
  const { crew } = make(4);
  crew.moments = { gapMs: 7200000, warned: true };
  crew.plans = [{ id: 'p1', name: 'Orders', entries: [] }];
  const back = make(4).crew;
  back.load(crew.serialize());
  assert.deepEqual(back.moments, { gapMs: 7200000, warned: true });
  assert.deepEqual(back.plans, [{ id: 'p1', name: 'Orders', entries: [] }]);
  back.clear();
  assert.deepEqual(back.moments, { gapMs: null, warned: false });
  assert.deepEqual(back.plans, []);
});
