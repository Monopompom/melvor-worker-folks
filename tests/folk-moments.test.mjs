import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../src/folk-moments.mjs';
import { checkMomentDef } from '../src/moments-model.mjs';

const H = 3600 * 1000;

/** Worker Folks' own moments against a fake Hiring that records what each answer asked for. */
function world() {
  globalThis.getLangString = (key) => key;
  globalThis.templateLangString = (key, vars) => `${key}${vars === undefined ? '' : `:${Object.values(vars).join('|')}`}`;
  globalThis.numberWithCommas = (n) => `${n}`;
  let gpHeld = 1000;
  globalThis.Game = class {};
  globalThis.game = { currencies: { getObjectByID: () => ({ canAfford: (n) => gpHeld >= n, remove: (n) => { gpHeld -= n; } }) } };
  const calls = [];
  const held = new Map();
  const folks = [];
  const defs = new Map();
  const opened = [];
  const dismissed = [];
  let general = { on: false, warn: false };
  let clock = { gapMs: null, warned: false };
  const settles = [];
  const hiring = {
    crew: { get all() { return folks; }, byId: (id) => folks.find((f) => f.id === id), get moments() { return clock; }, set moments(v) { clock = v; } },
    moments: {
      register: (def) => { assert.equal(checkMomentDef(def), undefined, def.id); defs.set(def.id, def); },
      force: (f, id) => { if (f.moment !== null) return false; f.moment = { id, leftMs: 1 }; opened.push([f.id, id]); return true; },
      dismiss: (f, id) => { if (f.moment?.id !== id) return false; f.moment = null; dismissed.push(f.id); return true; },
    },
    isWorking: (f) => f.working === true,
    skillOf: (f) => (f.working ? { id: 'melvorD:Mining' } : undefined),
    payroll: {
      hourlyWageOf: () => 10,
      breakFor: (f, ms) => calls.push(['break', f.id, ms]),
      get generalOn() { return general.on; },
      generalView: () => ({ due: false, warn: general.warn }),
    },
    traits: {
      has: (f, id) => (held.get(f.id) ?? []).includes(id),
      grudge: (f, id, ms) => calls.push(['grudge', f.id, id, ms]),
      grudgeOf: (f) => f.grudge ?? 0,
      clearGrudge: (f, id) => calls.push(['clear', f.id, id]),
      clearLearning: (f, id) => calls.push(['unlearn', f.id, id]),
      teach: (f, id) => calls.push(['teach', f.id, id]),
      onHurt: (f) => calls.push(['hurt', f.id]),
      neverStrikes: (f) => (held.get(f.id) ?? []).includes('Loyal'),
    },
    health: { maxHpOf: () => 500, hpOf: (f) => f.hp ?? 500, heal: (f, hp) => calls.push(['heal', f.id, hp]), damage: (f, hp) => calls.push(['damage', f.id, hp]) },
    levels: { autoRestart: () => true },
    addFolkMastery: (f, ms) => calls.push(['mastery', f.id, ms]),
  };
  let roll = 0;
  const own = install({ onModsLoaded: (fn) => fn(), patch: () => ({ after: () => {} }) }, { getHiring: () => hiring, bulk: { run: (kind) => settles.push(kind) }, rand: () => roll, log: () => {} });
  const folk = (id, more = {}) => {
    const f = { id, name: id, tier: 'Junior', job: null, travel: 'idle', moment: null, working: true, ...more };
    folks.push(f);
    return f;
  };
  const answer = (id, f, answerId, how = {}) => defs.get(`worker_folks:${id}`).answers.find((a) => a.id === answerId).apply(f, how);
  const pick = (id, f, answerId) => defs.get(`worker_folks:${id}`).answers.find((a) => a.id === answerId);
  return { defs, calls, held, folk, answer, pick, own, opened, dismissed, settles, clock: () => clock, setGeneral: (g) => { general = g; }, setRoll: (r) => { roll = r; }, setGp: (n) => { gpHeld = n; }, gp: () => gpHeld };
}

let w;
beforeEach(() => { w = world(); });

test('all eight register, each defaulting to its cautious answer', () => {
  assert.deepEqual([...w.defs.keys()].map((id) => id.split(':')[1]), ['StrikeTalk', 'DayOff', 'BetterTools', 'Quarrel', 'TryOther', 'Bonus', 'Poorly', 'DoubleShift']);
  for (const def of w.defs.values()) assert.notEqual(def.defaultAnswer, def.answers[0].id, `${def.id}: the first answer is never the default`);
});

test('a day off: a 6 h break, or 6 h of grudge toward Resentful; only for a Folk at work on a skill', () => {
  const a = w.folk('a');
  const fits = w.defs.get('worker_folks:DayOff').fits;
  assert.equal(fits(a), true);
  assert.equal(fits(w.folk('job', { job: 'worker_folks:Carrier' })), false);
  assert.equal(fits(w.folk('road', { travel: 'walking' })), false);
  assert.equal(fits(w.folk('idle', { working: false })), false);
  w.answer('DayOff', a, 'give');
  w.answer('DayOff', a, 'refuse');
  assert.deepEqual(w.calls, [['break', 'a', 6 * H], ['grudge', 'a', 'Resentful', 6 * H]]);
});

test('better tools cost a day\'s wage in GP for 2 h of mastery XP; greyed with its reason when short', () => {
  const a = w.folk('a');
  assert.equal(w.defs.get('worker_folks:BetterTools').fits(w.folk('trainee', { tier: 'Newbie' })), false);
  const buy = w.pick('BetterTools', a, 'buy');
  assert.equal(buy.why(a), '');
  assert.equal(buy.hint(a), 'MOD_WF_MOMENT_HINT_MASTERY:240|2');
  buy.apply(a);
  assert.equal(w.gp(), 760);
  assert.deepEqual(w.calls, [['mastery', 'a', 2 * H]]);
  w.setGp(100);
  assert.equal(buy.why(a), 'MOD_WF_MOMENT_NEEDS_GP:240');
});

test('a quarrel names another Folk at work; letting it be leaves a grudge on both', () => {
  const a = w.folk('a');
  const fits = w.defs.get('worker_folks:Quarrel').fits;
  assert.equal(fits(a), false, 'nobody to quarrel with');
  w.folk('b');
  assert.equal(fits(a), true);
  assert.equal(w.defs.get('worker_folks:Quarrel').partner(a), 'b');
  a.moment = { id: 'worker_folks:Quarrel', leftMs: 1, with: 'b' };
  assert.equal(w.defs.get('worker_folks:Quarrel').text(a), 'MOD_WF_MOMENT_Quarrel:a|b');
  w.answer('Quarrel', a, 'leave', { with: 'b' });
  assert.deepEqual(w.calls, [['grudge', 'a', 'Resentful', 3 * H], ['grudge', 'b', 'Resentful', 3 * H]]);
  a.moment = { id: 'worker_folks:Quarrel', leftMs: 1, with: 'gone' };
  assert.equal(w.defs.get('worker_folks:Quarrel').text(a), 'MOD_WF_MOMENT_Quarrel_ALONE:a');
});

test('another skill: needs 6 h of Specialist progress; Yes clears it with a Quick Learner chance', () => {
  const a = w.folk('a', { traitState: { counts: { 'Specialist:melvorD:Mining': 5 * H } } });
  const fits = w.defs.get('worker_folks:TryOther').fits;
  assert.equal(fits(a), false);
  a.traitState.counts['Specialist:melvorD:Mining'] = 6 * H;
  assert.equal(fits(a), true);
  w.setRoll(0.2);
  w.answer('TryOther', a, 'let');
  w.setRoll(0.3);
  w.answer('TryOther', a, 'let');
  assert.deepEqual(w.calls, [['unlearn', 'a', 'Specialist'], ['teach', 'a', 'QuickLearner'], ['unlearn', 'a', 'Specialist']]);
});

test('a bonus is asked for from 6 h of grudge, 3 h when Greedy; paying lets the grudge go', () => {
  const a = w.folk('a', { grudge: 3 * H });
  const fits = w.defs.get('worker_folks:Bonus').fits;
  assert.equal(fits(a), false);
  w.held.set('a', ['Greedy']);
  assert.equal(fits(a), true);
  w.answer('Bonus', a, 'pay');
  assert.deepEqual(w.calls, [['clear', 'a', 'Resentful']]);
  w.held.set('a', ['Greedy', 'Resentful']);
  assert.equal(fits(a), false, 'already Resentful');
});

test('feeling poorly: rest heals to full (a break while at work); working on costs HP, never the last', () => {
  const a = w.folk('a', { hp: 200 });
  assert.equal(w.defs.get('worker_folks:Poorly').fits(a), true);
  assert.equal(w.defs.get('worker_folks:Poorly').fits(w.folk('fit')), false);
  w.answer('Poorly', a, 'rest');
  assert.deepEqual(w.calls.splice(0), [['break', 'a', 2 * H], ['heal', 'a', 500]]);
  w.answer('Poorly', a, 'work');
  assert.deepEqual(w.calls.splice(0), [['damage', 'a', 50]]);
  const low = w.folk('low', { hp: 1 });
  w.answer('Poorly', low, 'work');
  assert.deepEqual(w.calls.splice(0), [], 'at 1 HP: nothing taken');
  w.held.set('a', ['Sickly']);
  w.answer('Poorly', a, 'work');
  assert.deepEqual(w.calls.splice(0), [['hurt', 'a']], 'Sickly: its fading starts over');
});

test('a double shift is offered by Loyal or Workaholic Folks at work; declining costs nothing', () => {
  const a = w.folk('a');
  const fits = w.defs.get('worker_folks:DoubleShift').fits;
  assert.equal(fits(a), false);
  w.held.set('a', ['Workaholic']);
  assert.equal(fits(a), true);
  w.answer('DoubleShift', a, 'decline');
  w.answer('DoubleShift', a, 'accept');
  assert.deepEqual(w.calls, [['mastery', 'a', 2 * H]]);
});

test('strike talk: opened on a Folk at work once per build-up, closed when the warning no longer holds', () => {
  const a = w.folk('a');
  w.folk('striker', { working: false, onStrike: true });
  w.own.warnStrike();
  assert.deepEqual(w.opened, [], 'switch off: nothing');
  w.setGeneral({ on: true, warn: true });
  w.own.warnStrike();
  w.own.warnStrike();
  assert.deepEqual(w.opened, [['a', 'worker_folks:StrikeTalk']], 'once');
  assert.equal(w.clock().warned, true);
  assert.equal(w.defs.get('worker_folks:StrikeTalk').fits(a), false, 'never picked by the pace');
  w.setGeneral({ on: true, warn: false });
  w.own.warnStrike();
  assert.deepEqual(w.dismissed, ['a']);
  assert.equal(w.clock().warned, false, 're-armed');
});

test('strike talk: never on a Loyal Folk or one on the road, who never walk out', () => {
  w.folk('loyal');
  w.held.set('loyal', ['Loyal']);
  w.folk('walker', { travel: 'walking' });
  w.setGeneral({ on: true, warn: true });
  w.own.warnStrike();
  assert.deepEqual(w.opened, [], 'nobody who would walk out');
  assert.equal(w.clock().warned, false, 'still armed');
  w.folk('c');
  w.own.warnStrike();
  assert.deepEqual(w.opened, [['c', 'worker_folks:StrikeTalk']]);
});

test('strike talk: Settle now opens the Settle all bill, never while away or when it ran out; Hold firm does nothing', () => {
  const a = w.folk('a');
  w.answer('StrikeTalk', a, 'settle', { offline: false, expired: false });
  w.answer('StrikeTalk', a, 'settle', { offline: true, expired: false });
  w.answer('StrikeTalk', a, 'settle', { offline: false, expired: true });
  w.answer('StrikeTalk', a, 'hold', {});
  assert.deepEqual(w.settles, ['settle']);
  assert.equal(w.defs.get('worker_folks:StrikeTalk').defaultAnswer, 'hold');
});
