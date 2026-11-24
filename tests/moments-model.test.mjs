import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMomentDef, momentDef, checkAwayItem, queueAway, DEFAULT_LIFE_MS } from '../src/moments-model.mjs';

const answer = (id) => ({ id, label: id, apply: () => {} });
const good = () => ({ id: 'voyage:Ford', fits: () => true, text: 'A ford ahead', answers: [answer('wade'), answer('wait')], defaultAnswer: 'wait' });

test('a well-formed moment passes; weight and life get their defaults', () => {
  assert.equal(checkMomentDef(good()), undefined);
  const d = momentDef(good());
  assert.equal(d.weight, 1);
  assert.equal(d.lifeMs, DEFAULT_LIFE_MS);
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.answers[0]));
  assert.equal(momentDef({ ...good(), weight: 0.5, expiresMs: 3600000 }).lifeMs, 3600000);
});

test('a bad moment says what is wrong', () => {
  const cases = [
    [null, 'moment must be an object'],
    [{ ...good(), id: 'Ford' }, 'moment id must be namespace:Name'],
    [{ ...good(), weight: 0 }, 'moment weight must be a number above 0'],
    [{ ...good(), fits: true }, 'moment fits must be a function'],
    [{ ...good(), text: 3 }, 'moment text must be a string or function'],
    [{ ...good(), answers: [] }, 'moment answers must be 1 to 3'],
    [{ ...good(), answers: [answer('a'), answer('b'), answer('c'), answer('d')] }, 'moment answers must be 1 to 3'],
    [{ ...good(), answers: [answer('a'), answer('a')], defaultAnswer: 'a' }, 'moment answer id a is repeated'],
    [{ ...good(), answers: [{ id: 'a', label: 'a' }], defaultAnswer: 'a' }, 'moment answer apply must be a function'],
    [{ ...good(), answers: [{ ...answer('a'), why: 'no' }], defaultAnswer: 'a' }, 'moment answer why must be a function'],
    [{ ...good(), defaultAnswer: 'swim' }, 'moment defaultAnswer must be one of its answer ids'],
    [{ ...good(), expiresMs: -1 }, 'moment expiresMs must be a number above 0'],
  ];
  cases.forEach(([def, why]) => assert.equal(checkMomentDef(def), why));
});

test('away items: checked, Worker Folks\' own first, then in the order pushed; the same id replaces in its place', () => {
  const item = (id) => ({ id, title: id, open: async () => {} });
  assert.equal(checkAwayItem(item('fold')), undefined);
  assert.equal(checkAwayItem({ id: 'x', title: 'x' }), 'away item open must be a function');
  assert.equal(checkAwayItem({ id: '', title: 'x', open: () => {} }), 'away item id must be a string');
  let list = [];
  list = queueAway(list, item('voyage:fold'));
  list = queueAway(list, item('other:thing'));
  list = queueAway(list, item('worker_folks:moments'), 0);
  assert.deepEqual(list.map((e) => e.item.id), ['worker_folks:moments', 'voyage:fold', 'other:thing']);
  const again = { ...item('voyage:fold'), title: 'new' };
  list = queueAway(list, again);
  assert.deepEqual(list.map((e) => e.item.id), ['worker_folks:moments', 'voyage:fold', 'other:thing']);
  assert.equal(list[1].item.title, 'new');
});

test('hint, tone and partner are checked; the tone defaults to go for the first answer, no for the rest', async () => {
  const m = await import('../src/moments-model.mjs');
  assert.equal(m.checkMomentDef({ ...good(), answers: [{ ...answer('wait'), tone: 'loud' }] }), 'moment answer tone must be go, risk or no');
  assert.equal(m.checkMomentDef({ ...good(), answers: [{ ...answer('wait'), hint: 4 }] }), 'moment answer hint must be a string or function');
  assert.equal(m.checkMomentDef({ ...good(), partner: 'x' }), 'moment partner must be a function');
  assert.equal(m.checkMomentDef({ ...good(), answers: [{ ...answer('wade'), tone: 'risk', hint: 'wet feet' }, answer('wait')] }), undefined);
  assert.equal(m.toneOf({}, 0), 'go');
  assert.equal(m.toneOf({}, 1), 'no');
  assert.equal(m.toneOf({ tone: 'risk' }, 0), 'risk');
});

test('the crew clock: a gap of 48 to 96 h, rolled when missing, due once used up, never below 0', async () => {
  const m = await import('../src/moments-model.mjs');
  assert.equal(m.rollGap(() => 0), m.GAP_MIN_MS);
  assert.equal(m.rollGap(() => 0.5), 72 * 3600 * 1000);
  assert.equal(m.rollGap(() => 1), m.GAP_MAX_MS);
  assert.deepEqual(m.runClock(null, m.CHECK_MS, () => 0), { gapMs: m.GAP_MIN_MS - m.CHECK_MS, due: false });
  assert.deepEqual(m.runClock(m.CHECK_MS, m.CHECK_MS), { gapMs: 0, due: true });
  assert.deepEqual(m.runClock(0, m.CHECK_MS), { gapMs: 0, due: true });
  assert.deepEqual(m.runClock(5, 1), { gapMs: 4, due: false });
});

test('a moment ages and runs out; the weighted pick follows the weights', async () => {
  const m = await import('../src/moments-model.mjs');
  assert.deepEqual(m.ageMoment({ id: 'a:B', leftMs: 100, with: 'f2' }, 40), { moment: { id: 'a:B', leftMs: 60, with: 'f2' }, expired: false });
  assert.deepEqual(m.ageMoment({ id: 'a:B', leftMs: 100 }, 100), { moment: null, expired: true });
  const c = [{ k: 'a', weight: 1 }, { k: 'b', weight: 0 }, { k: 'c', weight: 3 }];
  assert.equal(m.pickWeighted(c, () => 0).k, 'a');
  assert.equal(m.pickWeighted(c, () => 0.24).k, 'a');
  assert.equal(m.pickWeighted(c, () => 0.26).k, 'c');
  assert.equal(m.pickWeighted(c, () => 0.9999).k, 'c');
  assert.equal(m.pickWeighted([], () => 0), undefined);
  assert.equal(m.pickWeighted([{ weight: 0 }], () => 0), undefined);
});
