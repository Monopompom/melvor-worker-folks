import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPreservation, tabletPreservation, slotKind, consumeOne, firstThisAction,
  folkEvaluatesCondition, chargeChangeInvalidates,
} from '../src/consumption-model.mjs';

test('preservation is clamped to the engine range', () => {
  assert.equal(clampPreservation(-5), 0);
  assert.equal(clampPreservation(42), 42);
  assert.equal(clampPreservation(95), 80);
  assert.equal(clampPreservation(undefined), 0);
});

test('tablet preservation adds bypass and honours the always-preserve case', () => {
  assert.equal(tabletPreservation({ chance: 50, bypass: 40 }), 80);
  assert.equal(tabletPreservation({ chance: 10 }), 10);
  assert.equal(tabletPreservation({ chance: 0, alwaysPreserve: true }), 100);
});

test('slot kinds', () => {
  assert.equal(slotKind('melvorD:Summon1'), 'summon');
  assert.equal(slotKind('melvorD:Summon2'), 'summon');
  assert.equal(slotKind('melvorD:Consumable'), 'consumable');
  assert.equal(slotKind('melvorD:Gloves'), 'quantity');
});

test('consumeOne empties at the last item', () => {
  assert.deepEqual(consumeOne(5), { qty: 4, emptied: false });
  assert.deepEqual(consumeOne(1), { qty: 0, emptied: true });
  assert.deepEqual(consumeOne(undefined), { qty: 0, emptied: true });
});

test('firstThisAction allows one consumption per key per action', () => {
  const seen = new Set();
  assert.equal(firstThisAction(seen, 'melvorD:Summon1'), true);
  assert.equal(firstThisAction(seen, 'melvorD:Summon1'), false);
  assert.equal(firstThisAction(seen, 'melvorD:Summon2'), true);
});

test('only bank and charge conditions are evaluated for a Folk', () => {
  assert.equal(folkEvaluatesCondition('ItemCharge'), true);
  assert.equal(folkEvaluatesCondition('ItemInBank'), true);
  assert.equal(folkEvaluatesCondition('Hitpoints'), false);
});

test('charge changes invalidate tables only when crossing zero on a worn item', () => {
  assert.equal(chargeChangeInvalidates({ oldCharges: 3, newCharges: 2, worn: true }), false);
  assert.equal(chargeChangeInvalidates({ oldCharges: 1, newCharges: 0, worn: true }), true);
  assert.equal(chargeChangeInvalidates({ oldCharges: 0, newCharges: 500, worn: true }), true);
  assert.equal(chargeChangeInvalidates({ oldCharges: 1, newCharges: 0, worn: false }), false);
});
