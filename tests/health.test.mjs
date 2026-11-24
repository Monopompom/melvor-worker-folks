import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../src/health.mjs';
import * as rules from '../src/health-model.mjs';
import { createCrew } from '../src/crew.mjs';
import { createEventBus } from '../src/events.mjs';
import * as model from '../src/folk.mjs';

/** The health module around a real crew, with the game's few globals it reads faked. */
function world() {
  const notices = [];
  globalThis.getLangString = (key) => key;
  globalThis.templateLangString = (key, vars) => `${key}${vars?.name ? `:${vars.name}` : ''}`;
  globalThis.numberWithCommas = (n) => `${n}`;
  globalThis.Game = class {};
  globalThis.game = { _isInOnlineLoop: true, notifications: { createErrorNotification: (id, text) => notices.push(text) } };
  const bus = createEventBus();
  let n = 0;
  const crew = createCrew({ bus, model, pickName: () => `Folk${n}`, maxSlots: 4, makeId: () => `id${(n += 1)}`, now: () => Date.now() });
  const banked = [];
  const hiring = {
    crew,
    events: bus,
    renderQueue: {},
    marked: [],
    markCard(folk) { this.marked.push(folk.id); },
    skillOf: () => undefined,
    forceStop: () => {},
    skillName: () => '',
    portraitOf: () => '',
    // Today's rule: the gear goes to the bank, nothing lost.
    returnLoadout: (folk) => { banked.push(...Object.values(folk.loadout)); folk.loadout = {}; return []; },
  };
  const ctx = {
    settings: { section: () => ({ add: () => {}, get: () => undefined }) },
    onModsLoaded: (fn) => fn(),
    onCharacterLoaded: () => {},
    patch: () => ({ after: () => {} }),
  };
  const api = install(ctx, { getHiring: () => hiring, rules, time: { shortTime: () => '24h' }, log: () => {} });
  return { api, crew, hiring, bus, banked, notices };
}

let w;
beforeEach(() => { w = world(); });

test('heal: back up to max HP, never past it; a full or unknown Folk gets nothing', () => {
  const folk = w.crew.hire('Junior');
  folk.hp = 100;
  assert.equal(w.api.heal(folk, 125, { cause: 'rest' }), 225);
  assert.deepEqual(w.hiring.marked, [folk.id]);
  assert.equal(w.api.heal(folk, 10_000, { cause: 'food' }), 500);
  assert.equal(folk.hp, null, 'full health is stored as null');
  assert.equal(w.api.heal(folk, 50), 500, 'already full');
  assert.equal(w.api.heal(folk, -5), 500);
  assert.equal(w.api.heal({ id: 'gone' }, 50), undefined);
});

test('a Folk dying on the road goes to the keeper: kept means no bank, no lost list, and its cairn text on the slot', () => {
  const folk = w.crew.hire('Junior');
  folk.travel = 'walking';
  folk.loadout = { Cape: { id: 'worker_folks:Folk_Pack', qty: 1 } };
  folk.room = { haul: { ore: { qty: 5, ms: 10 } }, stock: { coal: { qty: 2, ms: 4 } }, town: {}, purse: { 'melvorD:GP': 300 } };
  const got = [];
  let text = 'left a cairn at the ford';
  w.api.setKeeper({ keep: (f, things) => { got.push([f.id, things]); return true; }, textFor: (id) => (id === folk.id ? text : ''), heldIds: () => ['worker_folks:Folk_Pack'] });
  const died = [];
  w.bus.on('folkDied', (p) => died.push(p));
  w.api.damage(folk, 10_000, { eat: false, cause: 'band' });
  assert.deepEqual(got[0], [folk.id, {
    gear: [{ slot: 'Cape', itemId: 'worker_folks:Folk_Pack', qty: 1 }],
    room: { haul: [{ itemId: 'ore', qty: 5 }], stock: [{ itemId: 'coal', qty: 2 }], town: [] },
    purse: [{ currencyId: 'melvorD:GP', amount: 300 }],
    cause: 'band',
  }]);
  assert.deepEqual(w.banked, [], 'nothing to the bank');
  assert.equal(w.crew.byId(folk.id), undefined, 'it left the crew');
  assert.equal(died[0].cairn, true);
  assert.equal(w.crew.cairnAt(folk.slot), folk.id);
  assert.deepEqual(w.crew.lostAt(folk.slot), []);
  assert.match(w.notices[0], /left a cairn at the ford$/);
  assert.equal(w.api.frozenSlotsView()[0].lostHtml, '<div>left a cairn at the ford</div>');
  text = 'a laissé un cairn au gué';
  assert.equal(w.api.frozenSlotsView()[0].lostHtml, '<div>a laissé un cairn au gué</div>', 'drawn fresh: a language switch shows');
  assert.deepEqual(w.api.keptIds(), ['worker_folks:Folk_Pack']);
});

test('the keeper is asked only on the road; a refusal or a throw keeps today\'s rule', () => {
  const asked = [];
  w.api.setKeeper({ keep: (f) => { asked.push(f.id); return false; }, textFor: () => 'x' });
  const home = w.crew.hire('Junior');
  home.loadout = { Cape: { id: 'bag', qty: 1 } };
  w.api.damage(home, 10_000, { eat: false });
  assert.deepEqual(asked, [], 'not walking: not asked');
  assert.deepEqual(w.banked, [{ id: 'bag', qty: 1 }]);
  const road = w.crew.hire('Junior');
  road.travel = 'walking';
  road.loadout = { Cape: { id: 'bag2', qty: 1 } };
  w.api.damage(road, 10_000, { eat: false });
  assert.deepEqual(asked, [road.id]);
  assert.deepEqual(w.banked.map((e) => e.id), ['bag', 'bag2'], 'refused: to the bank');
  assert.equal(w.crew.cairnAt(road.slot), undefined);
  w.api.setKeeper({ keep: () => { throw new Error('boom'); } });
  const third = w.crew.hire('Junior');
  third.travel = 'walking';
  third.loadout = { Cape: { id: 'bag3', qty: 1 } };
  w.api.damage(third, 10_000, { eat: false });
  assert.deepEqual(w.banked.map((e) => e.id), ['bag', 'bag2', 'bag3'], 'a throwing keeper: to the bank');
});

test('removing the keeper restores today\'s rule; a newer keeper isn\'t removed by an older one\'s off', () => {
  const offA = w.api.setKeeper({ keep: () => true });
  const offB = w.api.setKeeper({ keep: () => true, heldIds: () => ['b'] });
  offA();
  assert.deepEqual(w.api.keptIds(), ['b']);
  offB();
  assert.deepEqual(w.api.keptIds(), []);
  const road = w.crew.hire('Junior');
  road.travel = 'walking';
  road.loadout = { Cape: { id: 'bag', qty: 1 } };
  w.api.damage(road, 10_000, { eat: false });
  assert.deepEqual(w.banked, [{ id: 'bag', qty: 1 }]);
});
