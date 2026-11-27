import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { install } from '../src/payroll.mjs';
import * as wages from '../src/wages.mjs';
import * as resume from '../src/resume.mjs';

/** Payroll around a fake Hiring: Folks at work on skills that stop when told, a job, a Loyal Folk, the road. */
function world() {
  const notices = [];
  globalThis.getLangString = (key) => (key === 'MOD_WF_LIST_SEP' ? ', ' : key);
  globalThis.templateLangString = (key, vars) => `${key}${vars === undefined ? '' : `:${Object.values(vars).join('|')}`}`;
  globalThis.Game = class {};
  globalThis.game = { _isInOnlineLoop: true, notifications: { createErrorNotification: (id, text) => notices.push(text), createSuccessNotification: (id, text) => notices.push(text) } };
  const settings = { wageDifficulty: wages.DEFAULT_WAGE_PRESET, generalStrike: true };
  const ctx = {
    settings: { section: () => ({ add: () => {}, get: (name) => settings[name] }) },
    onModsLoaded: (fn) => fn(),
    onCharacterLoaded: () => {},
    patch: (_cls, name) => ({ after: (fn) => { if (name === 'tick') tick = fn; } }),
  };
  let tick = () => {};
  const folks = [];
  const running = new Set();
  const events = [];
  const left = [];
  let autoRestart = true;
  const skillOf = (f) => (f.skillId === null ? undefined : { id: f.skillId, stop: () => running.delete(f.id) });
  const hiring = {
    crew: { get all() { return folks; }, touch: () => {}, assignJob: (id, job) => { left.push(id); folks.find((f) => f.id === id).job = job; running.delete(id); } },
    isWorking: (f) => running.has(f.id),
    skillOf,
    jobs: { of: (f) => (f.job === null ? undefined : { id: f.job }) },
    forceStop: (skill) => skill.stop(),
    markCard: () => {},
    traits: { neverStrikes: (f) => f.loyal === true },
    levels: { autoRestart: () => autoRestart },
    cooldownFactor: () => 1,
    getMediaURL: (p) => p,
    events: { emit: (name, payload) => events.push([name, payload]) },
    portraitOf: () => '',
  };
  install(ctx, { getHiring: () => hiring, wages, pricing: {}, milestones: {}, resume, log: () => {} });
  const folk = (id, more = {}) => {
    const f = { id, name: id, tier: 'Junior', skillId: 'melvorD:Mining', job: null, travel: 'idle', onStrike: false, cooldownTicks: 0, restartWhenReady: false, restartPick: null, ...more };
    folks.push(f);
    if (more.working !== false) running.add(id);
    return f;
  };
  const strike = (f) => { f.onStrike = true; running.delete(f.id); };
  return { hiring, payroll: hiring.payroll, folk, strike, notices, events, left, running, settings, tick: () => tick(), setAutoRestart: (v) => { autoRestart = v; } };
}

let w;
beforeEach(() => { w = world(); });

test('a general strike stops the rest at work into their cooldown; Loyal Folks and Folks on the road work on', () => {
  const [a, b] = [w.folk('a'), w.folk('b')];
  const c = w.folk('c');
  const loyal = w.folk('loyal', { loyal: true });
  const road = w.folk('road', { travel: 'walking' });
  const job = w.folk('job', { skillId: null, job: 'worker_folks:Carrier' });
  w.strike(a);
  w.payroll.checkGeneral();
  assert.equal(c.cooldownTicks, 0, '1 of 6: not yet');
  w.strike(b);
  w.strike(c);
  w.payroll.checkGeneral();
  assert.deepEqual(w.payroll.generalView(), { striking: 3, working: 2, canStrike: 1, due: true, warn: false });
  assert.equal(job.cooldownTicks, wages.COOLDOWN_TICKS.Junior);
  assert.equal(job.job, null, 'the job is left');
  assert.deepEqual(job.restartPick, { job: 'worker_folks:Carrier' });
  assert.equal(job.restartWhenReady, true);
  assert.ok(w.running.has('loyal') && w.running.has('road'));
  assert.equal(loyal.cooldownTicks + road.cooldownTicks, 0);
  assert.equal(job.onStrike, false, 'swept up, not on strike: no strike counted');
  assert.deepEqual(w.notices, ['MOD_WF_GENERAL_STRIKE:job']);
  assert.deepEqual(w.events.map(([n, p]) => [n, p.folks.map((f) => f.id)]), [['generalStrike', ['job']]]);
});

test('no general strike with the switch off or wages off', () => {
  w.folk('a');
  const b = w.folk('b');
  w.strike(w.folk('s1'));
  w.strike(w.folk('s2'));
  w.settings.generalStrike = false;
  w.payroll.checkGeneral();
  assert.equal(b.cooldownTicks, 0);
  w.settings.generalStrike = true;
  assert.equal(w.payroll.generalOn, true);
  w.settings.wageDifficulty = 'nosweat';
  assert.equal(w.payroll.generalOn, false, 'No sweat: no wages, no strikes');
});

test('a break: stopped unpaid for its time, back to work after from Hiring 55; never for a job or a strike', () => {
  const a = w.folk('a');
  assert.equal(w.payroll.breakFor(a, 3600 * 1000), true);
  assert.equal(a.cooldownTicks, 72000);
  assert.equal(w.running.has('a'), false);
  assert.equal(a.restartWhenReady, true);
  w.setAutoRestart(false);
  const b = w.folk('b');
  w.payroll.breakFor(b, 1000);
  assert.equal(b.restartWhenReady, false);
  assert.equal(b.restartPick, null);
  assert.equal(w.payroll.breakFor(w.folk('job', { skillId: null, job: 'x' }), 1000), false);
  const s = w.folk('s');
  w.strike(s);
  assert.equal(w.payroll.breakFor(s, 1000), false);
});

test('a self-settle waits while another mod refuses the settle (the Folk is away), then goes through', () => {
  const a = w.folk('a');
  w.strike(a);
  let away = true;
  const asked = [];
  w.hiring.autoSettle = () => true;
  w.hiring.refusal = (kind, request) => { asked.push([kind, request.action, request.folk.id]); return away ? 'Away at sea.' : ''; };
  w.payroll.canSettle = () => true;
  w.payroll.settle = (f) => { f.onStrike = false; return true; };
  w.tick();
  assert.equal(a.onStrike, true, 'refused: still on strike');
  assert.deepEqual(asked, [['staff', 'settle', 'a']], 'asked as the Settle buttons ask');
  away = false;
  w.tick();
  assert.equal(a.onStrike, false, 'the refusal lifted: settled on the next tick');
  assert.deepEqual(w.notices, ['MOD_WF_AUTO_SETTLED:a']);
});
