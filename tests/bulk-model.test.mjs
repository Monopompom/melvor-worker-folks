import test from 'node:test';
import assert from 'node:assert/strict';
import { counts, mergeItems, runningBank, payable, byReason } from '../src/bulk-model.mjs';

const row = (o) => ({ working: false, hasSkill: true, available: true, onStrike: false, ownStock: false, onHaul: false, ...o });

test('counts: working Folks stop, idle ones with a skill that may work restart', () => {
  const c = counts([row({ working: true }), row({}), row({ hasSkill: false }), row({ available: false, onStrike: true })]);
  assert.deepEqual(c, { stop: 1, restart: 1, restock: 0, settle: 1 });
});

test('counts: restock leaves out the haul', () => {
  const c = counts([row({ ownStock: true }), row({ ownStock: true, onHaul: true, working: true })]);
  assert.equal(c.restock, 1);
});

test('mergeItems sums by id in first-seen order and drops empty entries', () => {
  assert.deepEqual(mergeItems([[{ id: 'a', qty: 2 }, { id: 'b', qty: 1 }], [{ id: 'b', qty: 3 }, { id: 'c', qty: 0 }]]), [{ id: 'a', qty: 2 }, { id: 'b', qty: 4 }]);
});

test('runningBank: later Folks see what earlier ones took', () => {
  const bank = runningBank((id) => ({ ore: 10 })[id] ?? 0);
  bank.take('ore', 7);
  assert.equal(bank.qty('ore'), 3);
  bank.take('ore', 7);
  assert.equal(bank.qty('ore'), 0);
  assert.equal(bank.qty('log'), 0);
});

test('payable pays in order while the wallet lasts, then skips', () => {
  const have = (id) => ({ gp: 100, sc: 5 })[id] ?? 0;
  const r = payable([
    { key: 'a', parts: { gp: 60 } },
    { key: 'b', parts: { gp: 50 } },
    { key: 'c', parts: { gp: 40, sc: 5 } },
    { key: 'd', parts: { sc: 1 } },
  ], have);
  assert.deepEqual(r.pay, ['a', 'c']);
  assert.deepEqual(r.skip, ['b', 'd']);
  assert.deepEqual(r.total, { gp: 100, sc: 5 });
});

test('payable: a settlement of nothing is paid', () => {
  assert.deepEqual(payable([{ key: 'a', parts: {} }], () => 0).pay, ['a']);
});

test('byReason groups names per reason', () => {
  assert.deepEqual(byReason([{ why: 'noSlot', name: 'A' }, { why: 'busy', name: 'B' }, { why: 'noSlot', name: 'C' }]), [['noSlot', ['A', 'C']], ['busy', ['B']]]);
});

test('counts: an empty crew has nothing to do', () => {
  assert.deepEqual(counts([]), { stop: 0, restart: 0, restock: 0, settle: 0 });
});

test('counts: a striking Folk without a skill is only settled, a refused one is not restarted', () => {
  assert.deepEqual(counts([row({ hasSkill: false, available: false, onStrike: true }), row({ available: false })]), { stop: 0, restart: 0, restock: 0, settle: 1 });
});

test('payable: nothing to pay, and amounts that add up to exactly the wallet', () => {
  assert.deepEqual(payable([], () => 0), { pay: [], skip: [], total: {} });
  const r = payable([{ key: 'a', parts: { gp: 0.1 } }, { key: 'b', parts: { gp: 0.2 } }], () => 0.30000000000000004);
  assert.deepEqual(r.pay, ['a', 'b']);
});

test('payable: a wallet that cannot be read pays nothing', () => {
  assert.deepEqual(payable([{ key: 'a', parts: { gp: 5 } }], () => NaN).skip, ['a']);
});

test('runningBank never goes below zero, and mergeItems skips bad counts', () => {
  const bank = runningBank(() => 3);
  bank.take('x', 10);
  assert.equal(bank.qty('x'), 0);
  assert.deepEqual(mergeItems([[{ id: 'a', qty: NaN }, { id: 'b', qty: -2 }, { id: 'a', qty: 1 }]]), [{ id: 'a', qty: 1 }]);
  assert.deepEqual(mergeItems([]), []);
});
