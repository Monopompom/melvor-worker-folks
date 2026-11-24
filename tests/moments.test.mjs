import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../src/moments.mjs';
import * as model from '../src/moments-model.mjs';
import { createCrew } from '../src/crew.mjs';
import { createEventBus } from '../src/events.mjs';
import * as folkModel from '../src/folk.mjs';

const H = 3600 * 1000;

/** The moments module around a real crew, its game globals faked; the offline loop's hooks kept to call by hand. */
function world() {
  const notices = [];
  globalThis.getLangString = (key) => key;
  globalThis.templateLangString = (key, vars) => `${key}${vars === undefined ? '' : `:${Object.values(vars).join('|')}`}`;
  globalThis.Game = class {};
  globalThis.game = {
    _isInOnlineLoop: true,
    notifications: {
      createInfoNotification: (id, text) => notices.push(['info', text]),
      createErrorNotification: (id, text) => notices.push(['error', text]),
    },
  };
  const bus = createEventBus();
  let n = 0;
  const crew = createCrew({ bus, model: folkModel, pickName: () => `Folk${n}`, maxSlots: 4, makeId: () => `id${(n += 1)}`, now: () => Date.now() });
  const hiring = { crew, events: bus, marked: [], markCard(folk) { this.marked.push(folk.id); }, portraitOf: () => '' };
  const hooks = {};
  const ctx = {
    onModsLoaded: (fn) => fn(),
    patch: (cls, name) => ({ after: (fn) => { hooks[name] = fn; } }),
  };
  let roll = 0;
  const api = install(ctx, { getHiring: () => hiring, model, time: { shortTime: (ms) => `${ms / H}h` }, rand: () => roll, log: () => {} });
  return { api, crew, hiring, bus, notices, hooks, setRoll: (r) => { roll = r; } };
}

const def = (id, more = {}) => ({
  id,
  fits: () => true,
  text: (folk) => `${folk.name} asks`,
  answers: [
    { id: 'yes', label: 'Yes', hint: 'good', apply: (folk) => { folk.said = 'yes'; } },
    { id: 'no', label: 'No', hint: 'costs', apply: (folk, how) => { folk.said = 'no'; folk.how = how; } },
  ],
  defaultAnswer: 'no',
  ...more,
});

let w;
beforeEach(() => { w = world(); });

test('the clock opens one moment once the gap is used up, then rolls the next gap', () => {
  const folk = w.crew.hire('Junior');
  w.api.register(def('worker_folks:Ask'));
  w.crew.moments = { gapMs: model.CHECK_MS, warned: false };
  w.api.check();
  assert.deepEqual(folk.moment, { id: 'worker_folks:Ask', leftMs: model.DEFAULT_LIFE_MS });
  assert.equal(w.crew.moments.gapMs, model.GAP_MIN_MS, 'roll 0: the shortest gap');
  assert.deepEqual(w.notices, [['info', 'MOD_WF_MOMENT_NOTICE:Folk1']]);
  assert.equal(w.api.openCount(), 1);
  // One moment per Folk: the next due gap finds nobody free and waits at 0.
  w.crew.moments = { gapMs: 0, warned: false };
  w.api.check();
  assert.equal(w.crew.moments.gapMs, 0);
  assert.equal(folk.moment.leftMs, model.DEFAULT_LIFE_MS - model.CHECK_MS, 'aged from the look after it opened');
});

test('a new save rolls its gap first; nothing fits means no moment', () => {
  w.crew.hire('Junior');
  w.api.register(def('worker_folks:Ask', { fits: () => false }));
  w.api.check();
  assert.equal(w.crew.moments.gapMs, model.GAP_MIN_MS - model.CHECK_MS);
  w.crew.moments = { gapMs: 0, warned: false };
  w.api.check();
  assert.equal(w.api.openCount(), 0);
});

test('answering closes the moment, then applies; a greyed answer is refused', () => {
  const folk = w.crew.hire('Junior');
  let why = 'Needs 5 GP';
  w.api.register(def('worker_folks:Ask', { answers: [
    { id: 'yes', label: 'Yes', why: () => why, apply: (f) => { f.said = 'yes'; } },
    { id: 'no', label: 'No', apply: (f) => { f.said = 'no'; } },
  ] }));
  w.api.force(folk, 'worker_folks:Ask');
  const answered = [];
  w.bus.on('momentAnswered', (p) => answered.push(p.answer));
  assert.equal(w.api.answer(folk, 'yes'), false);
  why = '';
  assert.equal(w.api.answer(folk, 'yes'), true);
  assert.equal(folk.said, 'yes');
  assert.equal(folk.moment, null);
  assert.deepEqual(answered, ['yes']);
  assert.equal(w.api.answer(folk, 'no'), false, 'nothing open');
});

test('a moment that runs out takes its default: a notice online, the away list offline', () => {
  const a = w.crew.hire('Junior');
  const b = w.crew.hire('Junior');
  w.api.register(def('worker_folks:Ask', { expiresMs: model.CHECK_MS }));
  w.api.force(a, 'worker_folks:Ask');
  w.notices.length = 0;
  w.crew.moments = { gapMs: H, warned: false };
  w.api.check();
  assert.equal(a.said, 'no');
  assert.deepEqual(a.how, { offline: false, expired: true, with: undefined });
  assert.deepEqual(w.notices, [['info', 'MOD_WF_MOMENT_RAN_OUT:Folk1|No']]);
  // Away: it opens and runs out unseen; the popup is queued as the offline loop ends.
  w.hooks.enterOfflineLoop();
  game._isInOnlineLoop = false;
  w.api.force(b, 'worker_folks:Ask');
  w.api.check();
  game._isInOnlineLoop = true;
  assert.equal(b.said, 'no');
  assert.equal(w.notices.length, 1, 'no notices while away');
  w.hooks.exitOfflineLoop();
  assert.deepEqual(w.api.awayIds, ['worker_folks:moments']);
});

test('a moment whose mod is gone waits unseen, then closes silently when it runs out', () => {
  const folk = w.crew.hire('Junior');
  folk.moment = { id: 'voyage:Ford', leftMs: model.CHECK_MS };
  assert.equal(w.api.isOpen(folk), false);
  assert.equal(w.api.cardView(folk), null);
  w.crew.moments = { gapMs: H, warned: false };
  w.api.check();
  assert.equal(folk.moment, null);
  assert.deepEqual(w.notices, []);
});

test('the card view: question, time left with the default, one entry per answer with its tone', () => {
  const folk = w.crew.hire('Junior');
  w.api.register(def('worker_folks:Ask', { answers: [
    { id: 'yes', label: 'Yes', hint: 'good', apply: () => {} },
    { id: 'no', label: 'No', tone: 'risk', apply: () => {} },
  ] }));
  w.api.force(folk, 'worker_folks:Ask');
  const v = w.api.cardView(folk);
  assert.equal(v.text, 'Folk1 asks');
  assert.equal(v.left, 'MOD_WF_MOMENT_LEFT:48h|No');
  assert.deepEqual(JSON.parse(v.key)[2], [
    { id: 'yes', label: 'Yes', hint: 'good', why: '', tone: 'go' },
    { id: 'no', label: 'No', hint: '', why: '', tone: 'risk' },
  ]);
});

test('a moment about two Folks keeps the other one\'s id and hands it to the answer', () => {
  const a = w.crew.hire('Junior');
  const b = w.crew.hire('Junior');
  w.api.register(def('worker_folks:Quarrel', { fits: (f) => f.id === a.id, partner: () => b.id }));
  w.crew.moments = { gapMs: 0, warned: false };
  w.api.check();
  assert.equal(a.moment.with, b.id);
  w.api.answer(a, 'no');
  assert.equal(a.how.with, b.id);
});

test('weights pick among the Folks and moments that fit', () => {
  const folk = w.crew.hire('Junior');
  w.api.register(def('worker_folks:Rare', { weight: 1 }));
  w.api.register(def('worker_folks:Common', { weight: 3 }));
  w.setRoll(0.5);
  w.crew.moments = { gapMs: 0, warned: false };
  w.api.check();
  assert.equal(folk.moment.id, 'worker_folks:Common');
});
