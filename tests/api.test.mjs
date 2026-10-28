import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuards, GUARD_KINDS } from '../src/guards.mjs';
import { createApi, folkView, API_VERSION } from '../src/api.mjs';
import { createEventBus } from '../src/events.mjs';
import { createCrew } from '../src/crew.mjs';
import * as model from '../src/folk.mjs';
import * as traitsModel from '../src/traits-model.mjs';

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
  assert.deepEqual(v, { id: folk.id, name: folk.name, tier: 'Junior', slot: 0, skillId: null, status: 'idle', place: null, travel: 'idle', hp: null, maxHp: undefined, portrait: undefined, traits: [] });
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
  assert.ok(api.version >= 4);
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

test('api v5: another mod registers a trait, teaches it, fades it; views list held ids', () => {
  const { hiring } = makeHiring();
  // The game side's earn, drop and idsOf over the real model, as src/traits.mjs does them.
  const where = () => ({ level: 1, tier: 'Newbie' });
  hiring.traits = {
    earn: (folk, id) => hiring.outsideTraits?.has(id) === true && traitsModel.earn(folk.traitState, id, where()).length > 0,
    drop: (folk, id) => traitsModel.drop(folk.traitState, id, where()).length > 0,
    idsOf: (folk) => ({ held: folk.traitState.traits.map((t) => t.id), waiting: folk.traitState.waiting.map((t) => t.id) }),
  };
  const api = createApi({ getHiring: () => hiring, model });
  assert.ok(api.version >= 5);
  const folk = hiring.crew.hire('Junior');
  const def = { id: 'voyage:Seafarer', kind: 'good', media: 'seafarer.webp', name: 'Seafarer', effect: () => 'Half fuel as crew', lasts: 'For good' };
  assert.equal(api.earnTrait(folk.id, 'voyage:Seafarer'), false, 'not registered yet');
  const off = api.registerTrait(def);
  assert.equal(hiring.outsideTraits.get('voyage:Seafarer').name, 'Seafarer');
  assert.equal(api.earnTrait(folk.id, 'voyage:Seafarer'), true);
  assert.equal(api.earnTrait(folk.id, 'voyage:Seafarer'), false, 'already held');
  assert.equal(api.earnTrait('nobody', 'voyage:Seafarer'), false);
  assert.deepEqual(api.folkById(folk.id).traits, ['voyage:Seafarer']);
  assert.ok(Object.isFrozen(api.folkById(folk.id).traits));
  api.registerTrait({ ...def, id: 'voyage:Hardy' });
  assert.equal(api.earnTrait(folk.id, 'voyage:Hardy'), true, 'waits: one slot open');
  assert.deepEqual(api.traitsOf(folk.id), { held: ['voyage:Seafarer'], waiting: ['voyage:Hardy'] });
  assert.equal(api.dropTrait(folk.id, 'voyage:Seafarer'), true);
  assert.deepEqual(api.traitsOf(folk.id), { held: ['voyage:Hardy'], waiting: [] });
  assert.equal(api.dropTrait(folk.id, 'voyage:Seafarer'), false);
  assert.equal(api.traitsOf('nobody'), undefined);
  off();
  assert.equal(hiring.outsideTraits.has('voyage:Seafarer'), false);
  // A bad definition is refused at once.
  assert.throws(() => api.registerTrait({ ...def, id: 'Seafarer' }), /namespace/);
  assert.throws(() => api.registerTrait({ ...def, kind: 'great' }), /kind/);
  assert.throws(() => api.registerTrait({ ...def, media: '' }), /media/);
  assert.throws(() => api.registerTrait({ ...def, lasts: 3 }), /lasts/);
});

test('api v6: hirePrice and hire on the Shop\'s terms (licence, a free slot, the price in GP)', async () => {
  const pricing = await import('../src/pricing.mjs');
  const { hiring } = makeHiring();
  const paid = [];
  const licences = new Set();
  hiring.hasLicence = (tier) => licences.has(tier);
  hiring.folkCap = 2;
  hiring.game = { gp: { amount: 400000, remove(n) { this.amount -= n; paid.push(n); } } };
  const moves = [];
  hiring.events.on('folkMoved', (e) => moves.push(e));
  const api = createApi({ getHiring: () => hiring, model, pricing });
  assert.equal(api.version, 7);
  assert.equal(api.hirePrice('Newbie'), 1000000);
  assert.equal(api.hirePrice('Captain'), undefined);
  assert.deepEqual(api.hire('Captain'), { refused: 'tier' });
  assert.deepEqual(api.hire('Newbie'), { refused: 'licence' });
  licences.add('Newbie');
  assert.deepEqual(api.hire('Newbie'), { refused: 'gp' });
  hiring.game.gp.amount = 2000000;
  const r = api.hire('Newbie', { name: 'Pip', travel: 'with', source: 'voyage' });
  assert.equal(r.folk.name, 'Pip');
  assert.equal(r.folk.travel, 'with');
  assert.equal(r.price, 1000000);
  assert.deepEqual(paid, [1000000]);
  assert.equal(moves.length, 1, 'coming along is told as a move');
  assert.equal(api.hirePrice('Newbie'), 1200000, 'the next one costs more, as in the Shop');
  hiring.crew.hire('Junior');
  assert.deepEqual(api.hire('Newbie'), { refused: 'full' }, 'the crew cap counts every Folk');
  assert.deepEqual(paid, [1000000], 'a refused hire pays nothing');
});

test('api v6: a hire at a share of the price pays that share, rounded up, and still raises the next price', async () => {
  const pricing = await import('../src/pricing.mjs');
  const { hiring } = makeHiring();
  const paid = [];
  hiring.hasLicence = () => true;
  hiring.folkCap = 5;
  hiring.game = { gp: { amount: 520000, remove(n) { this.amount -= n; paid.push(n); } } };
  const api = createApi({ getHiring: () => hiring, model, pricing });
  assert.deepEqual(api.hire('Newbie', { share: 0.6 }), { refused: 'gp' }, 'the share is what must be in hand');
  const r = api.hire('Newbie', { share: 0.5 });
  assert.equal(r.price, 500000);
  assert.deepEqual(paid, [500000]);
  assert.equal(api.hirePrice('Newbie'), 1200000);
  hiring.game.gp.amount = 1e9;
  assert.equal(api.hire('Newbie', { share: 1 / 3 }).price, 400000);
  assert.equal(api.hire('Newbie', { share: 7 }).price, pricing.hirePrice('Newbie', 2), 'never more than the full price');
  assert.equal(api.hire('Newbie', { share: 0 }).price, Math.ceil(pricing.hirePrice('Newbie', 3) * 0.25), 'never less than a quarter (v7)');
});

test('api v7: rules tells the hiring numbers another mod writes about', async () => {
  const pricing = await import('../src/pricing.mjs');
  const promotion = await import('../src/promotion.mjs');
  const milestones = await import('../src/milestones.mjs');
  const { hiring } = makeHiring();
  const api = createApi({ getHiring: () => hiring, model, rules: { promotion: { level: milestones.PROMOTION_LEVEL, mastery: promotion.MASTERY_GATE, costRate: promotion.PROMOTION_COST_RATE }, slotCaps: pricing.SHIFT_SLOT_CAP } });
  assert.deepEqual(api.rules(), { promotionLevel: 10, masteryGates: [20, 40, 60, 80], promotionCostRate: 0.6, slotCaps: [2, 4, 7, 10] });
  assert.deepEqual(createApi({ getHiring: () => hiring, model }).rules(), { promotionLevel: undefined, masteryGates: [], promotionCostRate: undefined, slotCaps: [] }, 'nothing injected: empty, never a throw');
});

test('api rules: the per-tier numbers and Hiring level steps, only when given (build .147)', async () => {
  const pricing = await import('../src/pricing.mjs');
  const milestones = await import('../src/milestones.mjs');
  const wages = await import('../src/wages.mjs');
  const produceRate = await import('../src/produce-rate.mjs');
  const qualification = await import('../src/qualification-model.mjs');
  const { hiring } = makeHiring();
  const api = createApi({ getHiring: () => hiring, model, rules: {
    tiers: { hireBase: pricing.HIRE_BASE_PRICE, wages: wages.WAGE_PER_HOUR, produceRates: produceRate.RATE_BY_TIER, hiringXPPerHour: milestones.HIRING_XP_PER_HOUR, qualification: qualification.QUALIFICATION_LEVELS },
    levels: { workOrders: 8, marks: 50, marksShare: 0.5, crewBonus: { per: 3, max: 15, topLevel: 99, topMax: 20 }, severance: [[1, 0.1], [45, 0.05], [90, 0]], qualificationLowering: 50 },
  } });
  const r = api.rules();
  assert.deepEqual(r.hireBase, [1000000, 5000000, 15000000, 40000000, 120000000]);
  assert.deepEqual(r.wages, [75000, 300000, 1000000, 3000000, 8000000]);
  assert.deepEqual(r.produceRates, [60, 80, 100, 120, 140]);
  assert.deepEqual(r.hiringXPPerHour, [60, 140, 220, 380, 600]);
  assert.deepEqual(r.qualification, [10, 30, 50, 70, 90]);
  assert.equal(r.workOrdersLevel, 8);
  assert.equal(r.marksLevel, 50);
  assert.equal(r.marksShare, 0.5);
  assert.deepEqual(r.crewBonus, { per: 3, max: 15, topLevel: 99, topMax: 20 });
  assert.deepEqual(r.firingSeverance, [[1, 0.1], [45, 0.05], [90, 0]]);
  assert.equal(r.qualificationLowering, 50);
  assert.ok(Object.isFrozen(r.hireBase) && Object.isFrozen(r.firingSeverance[0]), 'copies, frozen');
  assert.equal('hireBase' in createApi({ getHiring: () => hiring, model }).rules(), false, 'absent when not given');
});

test('api v7: canHire says why a hire would be refused, and at what price', async () => {
  const pricing = await import('../src/pricing.mjs');
  const { hiring } = makeHiring();
  const licences = new Set();
  hiring.hasLicence = (tier) => licences.has(tier);
  hiring.folkCap = 1;
  hiring.game = { gp: { amount: 100, remove() {} } };
  const api = createApi({ getHiring: () => hiring, model, pricing });
  assert.equal(api.version, 7);
  assert.deepEqual(api.canHire('Captain'), { ok: false, refused: 'tier' });
  assert.deepEqual(api.canHire('Newbie', { share: 0.5 }), { ok: false, refused: 'licence', price: 500000 });
  licences.add('Newbie');
  assert.deepEqual(api.canHire('Newbie', { share: 0.5 }), { ok: false, refused: 'gp', price: 500000 });
  hiring.game.gp.amount = 1e9;
  assert.deepEqual(api.canHire('Newbie', { share: 0.5 }), { ok: true, price: 500000 });
  hiring.crew.hire('Junior');
  assert.deepEqual(api.canHire('Newbie'), { ok: false, refused: 'full', price: 1000000 });
});
