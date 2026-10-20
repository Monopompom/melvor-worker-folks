import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maxHpFor, currentHp, damageRoll, applyDamage, shouldEat, foodHeal, eatPlan, regenAmount,
  freezeUntil, freezeRemaining, activeFreezes, FREEZE_MS, foodLineState, FOOD_LOW,
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
