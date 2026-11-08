import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maxHpFor, currentHp, damageRoll, applyDamage, shouldEat, foodHeal, eatPlan, regenAmount,
  freezeUntil, freezeRemaining, activeFreezes, FREEZE_MS, foodLineState, FOOD_LOW, eatShare, healMode,
} from '../src/health-model.mjs';

test('max HP rises with tier; saved null hp means full', () => {
  assert.equal(maxHpFor('Newbie'), 300);
  assert.ok(maxHpFor('Expert') > maxHpFor('Senior'));
  assert.throws(() => maxHpFor('Boss'));
  assert.equal(currentHp({ hp: null }, 300), 300);
  assert.equal(currentHp({ hp: 120 }, 300), 120);
  assert.equal(currentHp({ hp: 999 }, 300), 300);
});

test('damage roll matches the player formula and scales abyssal hits down', () => {
  assert.equal(damageRoll(2.2, { rng: () => 0 }), 1);
  assert.equal(damageRoll(2.2, { rng: () => 0.999 }), 22);
  assert.equal(damageRoll(475, { abyssal: true, rng: () => 0.999 }), 474);
  assert.equal(damageRoll(0), 0);
});

test('damage, death and eating', () => {
  assert.deepEqual(applyDamage(100, 30), { hp: 70, dead: false });
  assert.deepEqual(applyDamage(20, 30), { hp: 0, dead: true });
  assert.equal(shouldEat(179, 300), true);
  assert.equal(shouldEat(180, 300), false);
  assert.equal(foodHeal(8), 80);
  // below 60%: eats until full (capped), one item at a time
  assert.deepEqual(eatPlan({ hp: 40, max: 300, healsFor: 5, qty: 10 }), { eaten: 6, hp: 300, qtyLeft: 4 });
  assert.deepEqual(eatPlan({ hp: 40, max: 300, healsFor: 5, qty: 1 }), { eaten: 1, hp: 90, qtyLeft: 0 });
  assert.deepEqual(eatPlan({ hp: 170, max: 300, healsFor: 20, qty: 5 }), { eaten: 1, hp: 300, qtyLeft: 4 });
  // at or above 60%: nothing, even though not full
  assert.deepEqual(eatPlan({ hp: 180, max: 300, healsFor: 5, qty: 1 }), { eaten: 0, hp: 180, qtyLeft: 1 });
  assert.deepEqual(eatPlan({ hp: 200, max: 300, healsFor: 5, qty: 1 }), { eaten: 0, hp: 200, qtyLeft: 1 });
});

test('regen and freezes', () => {
  assert.equal(regenAmount(300), 3);
  assert.equal(regenAmount(50), 1);
  assert.equal(freezeUntil(1000), 1000 + FREEZE_MS);
  assert.equal(freezeRemaining(5000, 2000), 3000);
  assert.equal(freezeRemaining(1000, 2000), 0);
  assert.deepEqual(activeFreezes({ 0: 10, 1: 5000, 2: 'x' }, 100), { 1: 5000 });
});

test('foodLineState: food matters on Thieving only', () => {
  assert.equal(foodLineState({ skillId: 'melvorD:Woodcutting', foodQty: 0 }), 'off');
  assert.equal(foodLineState({ skillId: null, foodQty: 500 }), 'off');
  assert.equal(foodLineState({}), 'off');
  assert.equal(foodLineState({ skillId: 'melvorD:Thieving', foodQty: 0 }), 'none');
  assert.equal(foodLineState({ skillId: 'melvorD:Thieving', foodQty: undefined }), 'none');
  assert.equal(foodLineState({ skillId: 'melvorD:Thieving', foodQty: FOOD_LOW - 1 }), 'low');
  assert.equal(foodLineState({ skillId: 'melvorD:Thieving', foodQty: FOOD_LOW }), 'ok');
});

test('the eat line follows the setting: 30-90%, anything else the default 60%', () => {
  assert.equal(eatShare(40), 0.4);
  assert.equal(eatShare('90'), 0.9);
  assert.equal(eatShare(45), 0.6);
  assert.equal(eatShare(undefined), 0.6);
  assert.equal(shouldEat(119, 300, 0.4), true);
  assert.equal(shouldEat(120, 300, 0.4), false);
  // at 40%: a Folk at 150/300 (50%) does not eat, at 110 it does
  assert.deepEqual(eatPlan({ hp: 150, max: 300, healsFor: 5, qty: 10, at: 0.4 }), { eaten: 0, hp: 150, qtyLeft: 10 });
  assert.deepEqual(eatPlan({ hp: 110, max: 300, healsFor: 5, qty: 10, at: 0.4 }), { eaten: 4, hp: 300, qtyLeft: 6 });
  // at 90%: eats at 260/300
  assert.equal(eatPlan({ hp: 260, max: 300, healsFor: 5, qty: 10, at: 0.9 }).eaten, 1);
});

test('one food at a time eats a single item under the line, even when still under it', () => {
  assert.equal(healMode('one'), 'one');
  assert.equal(healMode('x'), 'full');
  assert.deepEqual(eatPlan({ hp: 40, max: 300, healsFor: 5, qty: 10, mode: 'one' }), { eaten: 1, hp: 90, qtyLeft: 9 });
  assert.deepEqual(eatPlan({ hp: 170, max: 300, healsFor: 20, qty: 5, mode: 'one' }), { eaten: 1, hp: 300, qtyLeft: 4 });
  assert.deepEqual(eatPlan({ hp: 200, max: 300, healsFor: 5, qty: 5, mode: 'one' }), { eaten: 0, hp: 200, qtyLeft: 5 });
});
