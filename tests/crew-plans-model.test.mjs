import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/crew-plans-model.mjs';
import * as folk from '../src/folk.mjs';

test('the limits match the save shape', () => {
  assert.equal(m.PLANS_MAX, folk.PLANS_MAX);
  assert.equal(m.QUEUE_MAX, folk.QUEUE_MAX);
  assert.equal(String(m.NS_ID), String(folk.NS_ID));
});

const smith = { folkId: 'a', skillId: 'melvorD:Smithing', recipeId: 'melvorD:Bronze_Bar', queue: [{ recipeId: 'melvorD:Bronze_Bar', count: 5, made: 3 }] };
const miner = { folkId: 'b', skillId: 'melvorD:Mining', pick: { rock: 'melvorD:Copper' } };
const courier = { folkId: 'c', jobId: 'voyage:Courier' };

test('plan names: tidied, never empty or over the limit', () => {
  assert.equal(m.cleanPlanName('  Combat   day '), 'Combat day');
  assert.equal(m.cleanPlanName('<b>Orders</b>'), 'bOrders/b');
  assert.equal(m.planNameProblem('   '), 'empty');
  assert.equal(m.planNameProblem('x'.repeat(m.PLAN_NAME_MAX)), null);
  assert.equal(m.planNameProblem('x'.repeat(m.PLAN_NAME_MAX + 1)), 'long');
  assert.equal(m.planNameProblem('🙂'.repeat(m.PLAN_NAME_MAX)), null, 'counted in characters');
});

test('entries: a skill or a job, never both; queue steps start from nothing made', () => {
  assert.deepEqual(m.normalizeEntry(smith).queue, [{ recipeId: 'melvorD:Bronze_Bar', count: 5, made: 0 }]);
  assert.deepEqual(m.normalizeEntry(miner), { folkId: 'b', skillId: 'melvorD:Mining', jobId: null, recipeId: null, pick: { rock: 'melvorD:Copper' }, queue: [], working: true });
  assert.equal(m.normalizeEntry({ ...miner, working: false }).working, false, 'saved idle');
  assert.equal(m.normalizeEntry(courier).working, true);
  assert.equal(m.normalizeEntry(courier).jobId, 'voyage:Courier');
  assert.equal(m.normalizeEntry({ folkId: 'a', skillId: 'melvorD:Mining', jobId: 'voyage:Courier' }), null);
  assert.equal(m.normalizeEntry({ folkId: 'a' }), null);
  assert.equal(m.normalizeEntry({ folkId: 'a', jobId: 'no namespace' }), null);
  const q = m.normalizeEntry({ ...smith, queue: [{ recipeId: 'x', count: 0 }, { recipeId: 'y', count: null }, 1, { recipeId: 'z', count: 2 }, { recipeId: 'w', count: 1 }, { recipeId: 'v', count: 1 }] }).queue;
  assert.deepEqual(q.map((s) => s.recipeId), ['y', 'z', 'w'], 'bad steps dropped, at most three');
});

test('a plan keeps one line per Folk and one Folk per skill', () => {
  const p = m.normalizePlan({ id: 'p1', name: ' Day ', entries: [smith, { ...smith, folkId: 'z' }, miner, { ...miner, skillId: 'melvorD:Fishing' }, courier] });
  assert.equal(p.name, 'Day');
  assert.deepEqual(p.entries.map((e) => e.folkId), ['a', 'b', 'c']);
  assert.equal(m.normalizePlan({ id: 'p1', name: 'Day', entries: [] }), null, 'empty: no plan');
  assert.equal(m.normalizePlan({ id: 'p1', name: '', entries: [smith] }), null);
});

test('the saved list: readable plans, no name twice, five at most', () => {
  const plan = (id, name) => ({ id, name, entries: [smith] });
  const list = m.normalizePlans([plan('1', 'A'), null, plan('2', 'a'), plan('3', 'B'), plan('4', 'C'), plan('5', 'D'), plan('6', 'E'), plan('7', 'F')]);
  assert.deepEqual(list.map((p) => p.id), ['1', '3', '4', '5', '6']);
  assert.deepEqual(m.normalizePlans('junk'), []);
});

test('saving: a new name goes last, the same name (any case) is replaced in place, a sixth is refused', () => {
  let r = m.savePlan([], 'Day', [smith], 'p1');
  assert.equal(r.replaced, false);
  r = m.savePlan(r.plans, 'Night', [miner], 'p2');
  r = m.savePlan(r.plans, 'DAY', [courier], 'p3');
  assert.equal(r.replaced, true);
  assert.deepEqual(r.plans.map((p) => [p.id, p.name, p.entries[0].folkId]), [['p1', 'DAY', 'c'], ['p2', 'Night', 'b']]);
  let plans = r.plans;
  for (const n of ['C', 'D', 'E']) plans = m.savePlan(plans, n, [smith], n).plans;
  assert.equal(plans.length, m.PLANS_MAX);
  assert.deepEqual(m.savePlan(plans, 'F', [smith], 'F'), { error: 'full' });
  assert.equal(m.savePlan(plans, 'night', [smith], 'x').replaced, true, 'a full list still takes a replacement');
  assert.deepEqual(m.savePlan([], ' ', [smith], 'x'), { error: 'empty' });
  assert.deepEqual(m.savePlan([], 'Idle', [], 'x'), { error: 'nothing' });
  assert.deepEqual(m.deletePlan(plans, 'p2').map((p) => p.id), ['p1', 'C', 'D', 'E']);
});

test('what applying does: same, start, recipe, move, job, and each reason to skip', () => {
  const plan = m.normalizePlan({
    id: 'p', name: 'P', entries: [
      { folkId: 'same', skillId: 'S1', recipeId: 'r1' },
      { folkId: 'idle', skillId: 'S2' },
      { folkId: 'recipe', skillId: 'S3', recipeId: 'r2' },
      { folkId: 'move', skillId: 'S4' },
      { folkId: 'job', jobId: 'v:Courier' },
      { folkId: 'gone', skillId: 'S5' },
      { folkId: 'walker', skillId: 'S6' },
      { folkId: 'striker', skillId: 'S7' },
      { folkId: 'blocked', skillId: 'S8' },
      { folkId: 'refused', skillId: 'S9' },
      { folkId: 'swap', skillId: 'S10' },
    ],
  });
  const f = (id, more = {}) => ({ id, name: id.toUpperCase(), skillId: null, jobId: null, recipeId: null, queue: [], working: false, walking: false, available: true, ...more });
  const crew = [
    f('same', { skillId: 'S1', recipeId: 'r1', working: true }),
    f('idle', { skillId: 'S2', recipeId: 'whatever' }),
    f('recipe', { skillId: 'S3', recipeId: 'r1', working: true }),
    f('move', { skillId: 'S10', working: true }),
    f('job', { skillId: 'S11' }),
    f('walker', { walking: true }),
    f('striker', { available: false }),
    f('blocked'),
    f('holder', { skillId: 'S8', working: true }),
    f('refused'),
    f('swap', { skillId: 'S4' }),
  ];
  const rows = m.planChanges(plan, crew, { refusal: (folk) => (folk.id === 'refused' ? 'Too far away' : '') });
  assert.deepEqual(rows.map((r) => [r.folkId, r.kind, r.why ?? '', r.holder ?? r.reason ?? '']), [
    ['same', 'same', '', ''],
    ['idle', 'start', '', ''],
    ['recipe', 'recipe', '', ''],
    ['move', 'move', '', ''],
    ['job', 'job', '', ''],
    ['gone', 'skip', 'gone', ''],
    ['walker', 'skip', 'walking', ''],
    ['striker', 'skip', 'unavailable', ''],
    ['blocked', 'skip', 'held', 'HOLDER'],
    ['refused', 'skip', 'refused', 'Too far away'],
    ['swap', 'move', '', ''],
  ], 'a skill held by a Folk the plan also moves is free; one held by a Folk it leaves alone is not');
  assert.equal(m.planDoesSomething(rows), true);
  assert.equal(m.planDoesSomething(rows.filter((r) => r.kind === 'same' || r.kind === 'skip')), false);
});

test('a Folk of the plan that can\'t move keeps its skill, down the chain', () => {
  const plan = m.normalizePlan({ id: 'p', name: 'P', entries: [
    { folkId: 'walker', skillId: 'S9' },
    { folkId: 'a', skillId: 'S1' },
    { folkId: 'b', skillId: 'S2' },
  ] });
  const base = { jobId: null, recipeId: null, queue: [], working: true, walking: false, available: true };
  const crew = [
    { ...base, id: 'walker', name: 'W', skillId: 'S1', walking: true },
    { ...base, id: 'a', name: 'A', skillId: 'S2' },
    { ...base, id: 'b', name: 'B', skillId: 'S3' },
  ];
  assert.deepEqual(m.planChanges(plan, crew).map((r) => [r.folkId, r.kind, r.holder ?? '', r.holderInPlan ?? false]), [
    ['walker', 'skip', '', false], ['a', 'skip', 'W', true], ['b', 'skip', 'A', true],
  ], 'held by a Folk of the plan, told apart from one the plan leaves out');
  crew[0].walking = false;
  assert.deepEqual(m.planChanges(plan, crew).map((r) => r.kind), ['move', 'move', 'move'], 'all free: a ring of moves');
});

test('a changed queue counts as a recipe change; a shared job is never held', () => {
  const plan = m.normalizePlan({ id: 'p', name: 'P', entries: [{ ...smith }, { folkId: 'c2', jobId: 'v:Courier' }] });
  const base = { name: 'A', jobId: null, working: true, walking: false, available: true };
  const crew = [
    { ...base, id: 'a', skillId: 'melvorD:Smithing', recipeId: 'melvorD:Bronze_Bar', queue: [] },
    { ...base, id: 'c1', name: 'C1', skillId: null, jobId: 'v:Courier', queue: [] },
    { ...base, id: 'c2', name: 'C2', skillId: null, queue: [] },
  ];
  assert.deepEqual(m.planChanges(plan, crew).map((r) => [r.kind, r.why ?? '']), [['recipe', ''], ['skip', 'held']]);
  assert.deepEqual(m.planChanges(plan, crew, { sharedJob: () => true }).map((r) => r.kind), ['recipe', 'job']);
  crew[0].queue = [{ recipeId: 'melvorD:Bronze_Bar', count: 5, made: 4 }];
  assert.equal(m.planChanges(plan, crew)[0].kind, 'same', 'made so far does not count');
});

test('only the recipe or only the queue: the row says which', () => {
  const plan = m.normalizePlan({ id: 'p', name: 'P', entries: [{ ...smith }] });
  const crew = [{ id: 'a', name: 'A', jobId: null, working: true, walking: false, available: true, skillId: 'melvorD:Smithing', recipeId: 'melvorD:Bronze_Bar', queue: [] }];
  assert.equal(m.planChanges(plan, crew)[0].queueOnly, true, 'same recipe, another queue');
  crew[0].recipeId = 'melvorD:Iron_Bar';
  assert.equal(m.planChanges(plan, crew)[0].queueOnly, undefined, 'another recipe');
});

test('a Folk saved idle is moved but never started, and stopped on its skill', () => {
  const plan = m.normalizePlan({ id: 'p', name: 'P', entries: [
    { folkId: 'a', skillId: 'S1', recipeId: 'r1', working: false },
    { folkId: 'b', skillId: 'S2', working: false },
    { folkId: 'c', skillId: 'S3', working: true },
  ] });
  const base = { jobId: null, recipeId: null, queue: [], working: false, walking: false, available: true };
  const crew = [
    { ...base, id: 'a', name: 'A', skillId: 'S1', recipeId: 'r9', working: true },
    { ...base, id: 'b', name: 'B', skillId: 'S9' },
    { ...base, id: 'c', name: 'C', skillId: 'S3' },
  ];
  assert.deepEqual(m.planChanges(plan, crew).map((r) => [r.folkId, r.kind, r.idle ?? false]), [
    ['a', 'stop', false], ['b', 'move', true], ['c', 'start', false],
  ], 'at work now on the skill it was saved idle on: stopped, its Shift Slot freed');
  crew[0].working = false;
  assert.equal(m.planChanges(plan, crew)[0].kind, 'same', 'idle on its skill: nothing to do');
  assert.equal(m.planDoesSomething(m.planChanges(plan, crew).slice(0, 1)), false);
});
