import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuards, GUARD_KINDS } from '../src/guards.mjs';
import { createApi, folkView, API_VERSION } from '../src/api.mjs';
import { createEventBus } from '../src/events.mjs';
import { createCrew } from '../src/crew.mjs';
import * as model from '../src/folk.mjs';

test('guards: none means allowed; the first refusal wins; a throwing or odd guard allows', () => {
  const errors = [];
  const g = createGuards({ onError: (err, kind) => errors.push(kind) });
  assert.deepEqual(GUARD_KINDS, ['staff', 'work', 'gear']);
  assert.equal(g.check('staff', { action: 'hire' }), undefined);
  g.register('staff', () => { throw new Error('boom'); });
  g.register('staff', () => 'no');
  g.register('staff', () => ({ reason: '' }));
  assert.equal(g.check('staff', { action: 'hire' }), undefined);
  assert.deepEqual(errors, ['staff']);
  const off = g.register('staff', (r) => (r.action === 'hire' ? { reason: 'Hiring works only in a town.' } : undefined));
  g.register('staff', () => ({ reason: 'second' }));
  assert.deepEqual(g.check('staff', { action: 'hire' }), { reason: 'Hiring works only in a town.' });
  assert.deepEqual(g.check('staff', { action: 'fire' }), { reason: 'second' });
  off();
  assert.deepEqual(g.check('staff', { action: 'hire' }), { reason: 'second' });
  assert.equal(g.count('work'), 0);
  assert.throws(() => g.register('travel', () => undefined));
  assert.throws(() => g.register('work', 'nope'));
});

function makeHiring() {
  let n = 0;
  const events = createEventBus();
  const crew = createCrew({ bus: events, model, pickName: () => `Folk${n}`, maxSlots: 4, makeId: () => `id${(n += 1)}`, now: () => 0 });
  const guards = createGuards();
  let refreshed = 0;
  const pending = new Map();
  const hiring = {
    events, crew, guards, pending,
    statusOf: () => 'idle',
    refreshGuarded: () => { refreshed += 1; },
    clearPending: (skill) => pending.delete(skill),
    delegableSkills: [],
  };
  return { hiring, refreshed: () => refreshed };
}

test('api: version, read-only views, places and travel with a folkMoved event', () => {
  const { hiring } = makeHiring();
  const api = createApi({ getHiring: () => hiring, model });
  assert.equal(api.version, API_VERSION);
  const folk = hiring.crew.hire('Junior');
  const v = api.folkById(folk.id);
  assert.deepEqual(v, { id: folk.id, name: folk.name, tier: 'Junior', slot: 0, skillId: null, status: 'idle', place: null, travel: 'idle', hp: null, maxHp: undefined, portrait: undefined });
  assert.ok(Object.isFrozen(v));
  assert.equal(api.folkById('nobody'), undefined);

  const moves = [];
  api.on('folkMoved', (p) => moves.push(p));
  assert.equal(api.setPlace(folk.id, { q: 14, r: 16 }), true);
  assert.deepEqual(folk.place, { q: 14, r: 16 });
  assert.deepEqual(api.placeOf(folk.id), { q: 14, r: 16 });
  // A returned place is a copy: writing to it does not move the Folk.
  assert.throws(() => { api.placeOf(folk.id).q = 0; });
  assert.equal(api.setPlace(folk.id, { q: 14, r: 16 }), true, 'same hex: no event');
  assert.equal(api.setPlace(folk.id, { q: 1.5, r: 0 }), false);
  assert.equal(api.setPlace('nobody', { q: 0, r: 0 }), false);
  assert.equal(api.setTravel(folk.id, 'with'), true);
  assert.equal(api.travelOf(folk.id), 'with');
  assert.equal(api.setTravel(folk.id, 'flying'), false);
  assert.equal(api.setPlace(folk.id, null), true);
  assert.equal(moves.length, 3);
  assert.deepEqual(moves[0].from, null);
  assert.deepEqual(moves[0].folk.place, { q: 14, r: 16 });
  assert.equal(moves[1].fromTravel, 'idle');
  assert.deepEqual(moves[2].from, { q: 14, r: 16 });
  assert.ok(Object.isFrozen(moves[0].folk), 'listeners get views, not records');
});

test('api: guards registered through it reach the skill and redraw its buttons', () => {
  const { hiring, refreshed } = makeHiring();
  const api = createApi({ getHiring: () => hiring, model });
  const off = api.registerGuard('staff', (r) => (r.action === 'hire' ? { reason: 'In a town only.' } : undefined));
  assert.equal(refreshed(), 1);
  assert.deepEqual(hiring.guards.check('staff', { action: 'hire' }), { reason: 'In a town only.' });
  off();
  assert.equal(refreshed(), 2);
  assert.equal(hiring.guards.check('staff', { action: 'hire' }), undefined);
  assert.throws(() => api.registerGuard('staff'));
});

test('folkView copies the place and leaves the record alone', () => {
  const folk = model.createFolk({ id: 'a', slot: 0, tier: 'Newbie', name: 'A' });
  folk.place = { q: 2, r: 3 };
  const v = folkView(folk, 'working');
  folk.place.q = 9;
  assert.deepEqual(v.place, { q: 2, r: 3 });
  assert.equal(v.status, 'working');
});

test('api v2: workerOf asks the skill who would act; registerLocationText sets and clears the line', () => {
  const { hiring, refreshed } = makeHiring();
  const folk = hiring.crew.hire('Junior');
  const mining = { id: 'melvorD:Mining' };
  hiring.game = { skills: { getObjectByID: (id) => (id === mining.id ? mining : undefined) } };
  hiring.actorFor = (skill) => (skill === mining ? folk : undefined);
  const api = createApi({ getHiring: () => hiring, model });
  assert.ok(api.version >= 2);
  assert.equal(api.workerOf('melvorD:Mining').id, folk.id);
  assert.equal(api.workerOf('melvorD:Fishing'), undefined);
  const fn = (v) => `At ${v.name}'s hex`;
  const off = api.registerLocationText(fn);
  assert.equal(hiring.locationText, fn);
  off();
  assert.equal(hiring.locationText, undefined);
  assert.equal(refreshed(), 2);
});

test('api v3: a Folk going along stops its work and its pending move; skills, assign and maxHp', () => {
  const { hiring } = makeHiring();
  const mining = { id: 'melvorD:Mining', name: 'Mining' };
  const fishing = { id: 'melvorD:Fishing', name: 'Fishing' };
  hiring.delegableSkills = [mining, fishing];
  const set = [];
  hiring.setWorker = (skill, id) => { set.push([skill.id, id]); return hiring.crew.assign(id, skill.id); };
  hiring.health = { maxHpOf: () => 200 };
  const folk = hiring.crew.hire('Junior');
  const api = createApi({ getHiring: () => hiring, model });
  assert.ok(api.version >= 3);
  assert.equal(api.folkById(folk.id).maxHp, 200);
  hiring.portrait = (tier) => `assets/worker_folk_${tier.toLowerCase()}.webp`;
  assert.equal(api.folkById(folk.id).portrait, `assets/worker_folk_${folk.tier.toLowerCase()}.webp`);

  assert.equal(api.assign(folk.id, 'melvorD:Mining'), true);
  assert.deepEqual(set, [['melvorD:Mining', folk.id]], 'assign goes through the Worker box path, guards included');
  assert.deepEqual(api.skills().map((s) => [s.id, s.holder]), [['melvorD:Mining', folk.id], ['melvorD:Fishing', null]]);
  assert.equal(api.assign(folk.id, 'melvorD:Nope'), false);
  assert.equal(api.assign('nobody', 'melvorD:Mining'), false);

  hiring.pending.set(fishing, folk.id);
  assert.equal(api.setTravel(folk.id, 'with'), true);
  assert.equal(folk.skillId, null, 'going along unassigns');
  assert.equal(hiring.pending.has(fishing), false, 'and drops a move waiting for it');
  assert.equal(api.travelOf(folk.id), 'with');

  assert.equal(api.assign(folk.id, null), true);
  hiring.setWorker = () => false;
  assert.equal(api.assign(folk.id, 'melvorD:Mining'), false, 'a refused pick is false');
});

test('api v4: a Folk walking alone stops its work as one going along does', () => {
  const { hiring } = makeHiring();
  const mining = { id: 'melvorD:Mining', name: 'Mining' };
  hiring.delegableSkills = [mining];
  hiring.setWorker = (skill, id) => hiring.crew.assign(id, skill.id);
  const folk = hiring.crew.hire('Middle');
  const api = createApi({ getHiring: () => hiring, model });
  assert.equal(api.version, 4);
  assert.equal(api.assign(folk.id, 'melvorD:Mining'), true);
  hiring.pending.set(mining, folk.id);
  assert.equal(api.setTravel(folk.id, 'walking'), true);
  assert.equal(api.travelOf(folk.id), 'walking');
  assert.equal(folk.skillId, null, 'walking unassigns');
  assert.equal(hiring.pending.has(mining), false);
  assert.equal(api.folkById(folk.id).travel, 'walking');
  // Arriving: given its work, it is no longer walking.
  assert.equal(api.assign(folk.id, 'melvorD:Mining'), true);
  assert.equal(api.travelOf(folk.id), 'idle');
});

test('api v3: hurt never eats, names the cause and reports a death', () => {
  const { hiring } = makeHiring();
  const folk = hiring.crew.hire('Junior');
  const calls = [];
  let hp = 100;
  hiring.health = {
    maxHpOf: () => 100,
    hpOf: () => hp,
    damage: (f, amount, opts) => { calls.push([f.id, amount, opts]); hp -= amount; return hp <= 0; },
  };
  const api = createApi({ getHiring: () => hiring, model });
  assert.deepEqual(api.hurt(folk.id, 10, { cause: 'hunger' }), { hp: 90, dead: false });
  assert.deepEqual(calls[0], [folk.id, 10, { eat: false, cause: 'hunger' }]);
  assert.deepEqual(api.hurt(folk.id, 90, { cause: 'hunger' }), { hp: 0, dead: true });
  assert.equal(api.hurt('nobody', 5), undefined);
});
