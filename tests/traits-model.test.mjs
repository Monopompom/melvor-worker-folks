import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAITS, traitDef, openSlots, nextSlotLevel, forgetCost, emptyTraitState, addProgress, resetProgress, settle,
  forget, effectsOf, followsCombat, completeLearning, earn, drop, cleanOutsideEffects,
} from '../src/traits-model.mjs';
import { normalizeTraitState } from '../src/folk.mjs';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const fresh = () => emptyTraitState();
const ids = (list) => list.map((t) => t.id);

test('the table: 7 good, 5 mixed, 5 bad, ids unique, every trait learned by something', () => {
  const kinds = TRAITS.reduce((m, t) => ({ ...m, [t.kind]: (m[t.kind] ?? 0) + 1 }), {});
  assert.deepEqual(kinds, { good: 7, mixed: 5, bad: 5 });
  assert.equal(new Set(TRAITS.map((t) => t.id)).size, TRAITS.length);
  TRAITS.forEach((t) => {
    assert.ok(t.learn.target > 0, t.id);
    assert.match(t.icon, /^trait_[a-z_]+$/);
  });
  // Rate is the tier's alone: no trait touches it.
  TRAITS.forEach((t) => assert.equal(t.effects.rate, undefined));
  assert.equal(traitDef('Loyal').effects.neverStrikes, true);
  assert.equal(traitDef('Nope'), undefined);
});

test('slots open with Folk mastery at 1, 25, 50 and 99', () => {
  assert.equal(openSlots(0), 0);
  assert.equal(openSlots(1), 1);
  assert.equal(openSlots(24), 1);
  assert.equal(openSlots(25), 2);
  assert.equal(openSlots(98), 3);
  assert.equal(openSlots(99), 4);
  assert.equal(nextSlotLevel(0), 1);
  assert.equal(nextSlotLevel(30), 50);
  assert.equal(nextSlotLevel(99), null);
  assert.equal(forgetCost(1000), 250);
  assert.equal(forgetCost(1001), 251);
});

test('a save without traits normalizes to empty; junk is dropped, unknown ids kept', () => {
  assert.deepEqual(normalizeTraitState(undefined), { traits: [], waiting: [], counts: {} });
  const s = normalizeTraitState({
    traits: [{ id: 'Loyal' }, { id: 'Seafarer' }, null, { id: 3 }, { id: 'Specialist', skillId: 'melvorD:Mining' }],
    waiting: 'x',
    counts: { Lucky: 5, Bad: -1, Worse: 'x', NaNs: NaN },
  });
  assert.deepEqual(s, {
    traits: [{ id: 'Loyal' }, { id: 'Seafarer' }, { id: 'Specialist', skillId: 'melvorD:Mining' }],
    waiting: [],
    counts: { Lucky: 5 },
  });
});

test('a trait is learned once its count reaches the target, then its count is gone', () => {
  const s = fresh();
  addProgress(s, 'bonus', 1999);
  assert.deepEqual(settle(s, { level: 1, tier: 'Senior' }), []);
  addProgress(s, 'bonus', 1);
  assert.deepEqual(settle(s, { level: 1, tier: 'Senior' }), [{ type: 'learned', trait: { id: 'Lucky' } }]);
  assert.deepEqual(ids(s.traits), ['Lucky']);
  assert.equal(s.counts.Lucky, undefined);
  // held: no more counting
  addProgress(s, 'bonus', 5000);
  assert.equal(s.counts.Lucky, undefined);
});

test('Specialist counts per skill and remembers the skill', () => {
  const s = fresh();
  addProgress(s, 'work', 20 * HOUR, { skillId: 'melvorD:Mining' });
  addProgress(s, 'work', 10 * HOUR, { skillId: 'melvorD:Fishing' });
  addProgress(s, 'work', 5 * HOUR);
  assert.deepEqual(settle(s, { level: 1, tier: 'Newbie' }), []);
  addProgress(s, 'work', 4 * HOUR, { skillId: 'melvorD:Mining' });
  assert.deepEqual(settle(s, { level: 1, tier: 'Newbie' }), [{ type: 'learned', trait: { id: 'Specialist', skillId: 'melvorD:Mining' } }]);
  // every skill's count restarts with it
  assert.deepEqual(s.counts, {});
});

test('one promotion teaches Quick Learner, a second one Ambitious', () => {
  const s = fresh();
  addProgress(s, 'promotion', 1);
  settle(s, { level: 30, tier: 'Junior' });
  addProgress(s, 'promotion', 1);
  settle(s, { level: 30, tier: 'Middle' });
  assert.deepEqual(ids(s.traits), ['QuickLearner', 'Ambitious']);
});

test('continuous conditions restart: Frugal on a debt, Loyal on a strike, Resentful on settling', () => {
  const s = fresh();
  addProgress(s, 'workPaid', 6 * DAY);
  addProgress(s, 'hired', 29 * DAY);
  addProgress(s, 'strikeOpen', 23 * HOUR);
  resetProgress(s, 'debt');
  resetProgress(s, 'settled');
  assert.equal(s.counts.Frugal, undefined);
  assert.equal(s.counts.Resentful, undefined);
  assert.equal(s.counts.Loyal, 29 * DAY);
  resetProgress(s, 'strike');
  assert.equal(s.counts.Loyal, undefined);
});

test('learned while every open slot is full: waits, then takes the next slot that opens', () => {
  const s = fresh();
  addProgress(s, 'bonus', 2000);
  addProgress(s, 'promotion', 1);
  const changes = settle(s, { level: 10, tier: 'Senior' });
  assert.deepEqual(changes.map((c) => c.type), ['learned', 'waiting']);
  assert.deepEqual(ids(s.traits), ['QuickLearner']);
  assert.deepEqual(ids(s.waiting), ['Lucky']);
  // a waiting trait does nothing
  assert.equal(effectsOf(s.traits).doubling, 0);
  assert.deepEqual(settle(s, { level: 25, tier: 'Senior' }), [{ type: 'slotted', trait: { id: 'Lucky' } }]);
  assert.deepEqual(ids(s.traits), ['QuickLearner', 'Lucky']);
  assert.deepEqual(s.waiting, []);
});

test('no slot is open before mastery 1', () => {
  const s = fresh();
  addProgress(s, 'promotion', 1);
  assert.deepEqual(settle(s, { level: 0, tier: 'Junior' }).map((c) => c.type), ['waiting']);
});

test('Clumsy fades at Journeyman and is never learned by one', () => {
  const s = fresh();
  addProgress(s, 'fail', 500);
  settle(s, { level: 5, tier: 'Junior' });
  assert.deepEqual(ids(s.traits), ['Clumsy']);
  assert.deepEqual(settle(s, { level: 5, tier: 'Middle' }), [{ type: 'faded', trait: { id: 'Clumsy' } }]);
  assert.deepEqual(s.traits, []);
  addProgress(s, 'fail', 500);
  assert.deepEqual(settle(s, { level: 5, tier: 'Senior' }), []);
  assert.deepEqual(s.counts, {});
});

test('Lazy: 24 h idle in a row, fades after 24 h of work', () => {
  const s = fresh();
  addProgress(s, 'idle', 23 * HOUR);
  resetProgress(s, 'work');
  addProgress(s, 'idle', 24 * HOUR);
  settle(s, { level: 1, tier: 'Newbie' });
  assert.deepEqual(ids(s.traits), ['Lazy']);
  addProgress(s, 'work', 23 * HOUR);
  assert.deepEqual(settle(s, { level: 1, tier: 'Newbie' }), []);
  addProgress(s, 'work', HOUR);
  assert.deepEqual(settle(s, { level: 1, tier: 'Newbie' }).map((c) => c.type), ['faded']);
  assert.deepEqual(s.traits, []);
  assert.deepEqual(s.counts, {});
});

test('Sickly: a fall to a quarter of HP; 7 days at full HP in a row make it fade', () => {
  const s = fresh();
  addProgress(s, 'lowHp', 1);
  settle(s, { level: 1, tier: 'Newbie' });
  assert.deepEqual(ids(s.traits), ['Sickly']);
  addProgress(s, 'fullHp', 6 * DAY);
  resetProgress(s, 'hurt');
  addProgress(s, 'fullHp', 6 * DAY);
  assert.deepEqual(settle(s, { level: 1, tier: 'Newbie' }), []);
  addProgress(s, 'fullHp', DAY);
  assert.deepEqual(settle(s, { level: 1, tier: 'Newbie' }).map((c) => c.type), ['faded']);
});

test('a fade frees a slot for the queue in the same pass', () => {
  const s = fresh();
  addProgress(s, 'fail', 500);
  settle(s, { level: 1, tier: 'Junior' });
  addProgress(s, 'bonus', 2000);
  settle(s, { level: 1, tier: 'Junior' });
  assert.deepEqual(ids(s.waiting), ['Lucky']);
  assert.deepEqual(settle(s, { level: 1, tier: 'Middle' }).map((c) => c.type), ['faded', 'slotted']);
  assert.deepEqual(ids(s.traits), ['Lucky']);
});

test('Forget frees the slot, restarts the count and moves the queue up', () => {
  const s = fresh();
  addProgress(s, 'strike', 3);
  settle(s, { level: 1, tier: 'Junior' });
  addProgress(s, 'promotion', 1);
  settle(s, { level: 1, tier: 'Junior' });
  assert.deepEqual(ids(s.traits), ['Greedy']);
  assert.deepEqual(ids(s.waiting), ['QuickLearner']);
  const out = forget(s, 0, { level: 1, tier: 'Junior' });
  assert.deepEqual(out.trait, { id: 'Greedy' });
  assert.deepEqual(out.changes, [{ type: 'slotted', trait: { id: 'QuickLearner' } }]);
  // the count starts again from zero: two more strikes don't bring Greedy back
  addProgress(s, 'strike', 2);
  settle(s, { level: 25, tier: 'Junior' });
  assert.deepEqual(ids(s.traits), ['QuickLearner']);
  addProgress(s, 'strike', 1);
  settle(s, { level: 25, tier: 'Junior' });
  assert.deepEqual(ids(s.traits), ['QuickLearner', 'Greedy']);
  assert.deepEqual(forget(s, 7, { level: 25, tier: 'Junior' }), { trait: null, changes: [] });
});

test('effects add up; Specialist only in its skill, Night Owl only while the player fights', () => {
  const traits = [{ id: 'Specialist', skillId: 'melvorD:Mining' }, { id: 'NightOwl' }, { id: 'Greedy' }, { id: 'Frugal' }, { id: 'Seafarer' }];
  const mining = effectsOf(traits, { skillId: 'melvorD:Mining' });
  assert.equal(mining.interval, -10);
  assert.equal(mining.xp, 10);
  assert.ok(Math.abs(mining.wageFactor - 1.3 * 0.8) < 1e-9);
  const fishingFighting = effectsOf(traits, { skillId: 'melvorD:Fishing', fighting: true });
  assert.equal(fishingFighting.interval, -5);
  assert.equal(fishingFighting.xp, 10);
  const e = effectsOf([{ id: 'Workaholic' }, { id: 'Resentful' }, { id: 'Loyal' }, { id: 'Wasteful' }, { id: 'Lucky' }, { id: 'QuickLearner' }]);
  assert.equal(e.overtimeWageFactor, 0.75);
  assert.equal(e.graceFactor, 0.5);
  assert.equal(e.cooldownFactor, 1.5);
  assert.equal(e.neverStrikes, true);
  assert.equal(e.preservation, -10);
  assert.equal(e.doubling, 5);
  assert.equal(e.masteryXP, 25);
  assert.deepEqual(effectsOf([]), effectsOf(undefined));
  assert.equal(followsCombat(traits), true);
  assert.equal(followsCombat([{ id: 'Loyal' }]), false);
});

test('completeLearning fills a count so the next settle learns it', () => {
  const s = fresh();
  assert.equal(completeLearning(s, 'Nope'), false);
  assert.equal(completeLearning(s, 'Specialist'), false);
  assert.equal(completeLearning(s, 'Specialist', { skillId: 'melvorD:Mining' }), true);
  assert.equal(completeLearning(s, 'Loyal'), true);
  settle(s, { level: 25, tier: 'Newbie' });
  assert.deepEqual(s.traits, [{ id: 'Specialist', skillId: 'melvorD:Mining' }, { id: 'Loyal' }]);
});

test('earn: a trait from another mod takes an open slot or waits, once; settle never fades it', () => {
  const s = fresh();
  const where = { level: 1, tier: 'Newbie' };
  assert.deepEqual(earn(s, 'voyage:Seafarer', where), [{ type: 'learned', trait: { id: 'voyage:Seafarer' } }]);
  assert.deepEqual(earn(s, 'voyage:Seafarer', where), []);
  assert.deepEqual(earn(s, '', where), []);
  assert.deepEqual(earn(s, 'voyage:Hardy', where), [{ type: 'waiting', trait: { id: 'voyage:Hardy' } }]);
  assert.deepEqual(earn(s, 'voyage:Hardy', where), []);
  // The table's rules leave it alone: no fade of its own, no effect.
  assert.deepEqual(settle(s, { level: 1, tier: 'Expert' }), []);
  assert.deepEqual(ids(s.traits), ['voyage:Seafarer']);
  assert.deepEqual(effectsOf(s.traits).interval, 0);
  // It survives the save's normalizing.
  assert.deepEqual(normalizeTraitState(JSON.parse(JSON.stringify(s))).waiting, [{ id: 'voyage:Hardy' }]);
});

test('drop: a held or waiting trait fades, its count restarts and the queue moves up', () => {
  const s = fresh();
  const where = { level: 1, tier: 'Newbie' };
  earn(s, 'voyage:Seasick', where);
  earn(s, 'voyage:Footsore', where);
  s.counts['voyage:Seasick'] = 5;
  assert.deepEqual(drop(s, 'voyage:Seasick', where), [
    { type: 'faded', trait: { id: 'voyage:Seasick' } },
    { type: 'slotted', trait: { id: 'voyage:Footsore' } },
  ]);
  assert.equal(s.counts['voyage:Seasick'], undefined);
  assert.deepEqual(ids(s.traits), ['voyage:Footsore']);
  assert.deepEqual(drop(s, 'voyage:Seasick', where), []);
  earn(s, 'voyage:Hardy', where);
  assert.deepEqual(drop(s, 'voyage:Hardy', where), [{ type: 'faded', trait: { id: 'voyage:Hardy' } }]);
  assert.deepEqual(s.waiting, []);
});

test('effectsOf: another mod\u2019s trait adds its cleaned plain effects, nothing else', () => {
  const outside = (t) => ({ 'voyage:Haggler': { wage: 20 }, 'voyage:Homebody': { xp: 10, rate: 99 }, 'voyage:Wild': { interval: -500 } })[t.id];
  const e = effectsOf([{ id: 'voyage:Haggler' }, { id: 'voyage:Homebody' }, { id: 'voyage:Wild' }, { id: 'voyage:Gone' }, { id: 'Frugal' }], { outside });
  assert.ok(Math.abs(e.wageFactor - 1.2 * 0.8) < 1e-9);
  assert.equal(e.xp, 10);
  assert.equal(e.interval, -50, 'clamped to the limit');
  assert.deepEqual(cleanOutsideEffects({ xp: 'lots', wage: NaN, doubling: 0, neverStrikes: true }), {});
  assert.deepEqual(cleanOutsideEffects(null), {});
  // Without a resolver another mod's ids add nothing, as before.
  assert.equal(effectsOf([{ id: 'voyage:Haggler' }]).wageFactor, 1);
});
