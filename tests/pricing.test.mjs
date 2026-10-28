import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hirePrice, hirePriceForQuantity, canHireUnderCap, HIRE_BASE_PRICE } from '../src/pricing.mjs';

test('Newbie hire price ladder matches the design table for 1..18 owned', () => {
  const expected = [1000000, 1200000, 1440000, 1728000, 2073600];
  expected.forEach((price, owned) => assert.equal(hirePrice('Newbie', owned), price));
  // design reference points: 5th ≈ 2.07M, 10th ≈ 5.16M, 15th ≈ 12.8M
  assert.ok(Math.abs(hirePrice('Newbie', 4) - 2073600) < 1);
  assert.equal(hirePrice('Newbie', 9), 5159780);
  assert.equal(hirePrice('Newbie', 14), 12839185);
  for (let owned = 0; owned < 18; owned += 1) {
    assert.equal(hirePrice('Newbie', owned), Math.round(1000000 * 1.2 ** owned));
    assert.ok(Number.isInteger(hirePrice('Newbie', owned)));
  }
});

test('every tier starts at its base price and grows by 20% per owned Folk', () => {
  for (const [tier, base] of Object.entries(HIRE_BASE_PRICE)) {
    assert.equal(hirePrice(tier, 0), base);
    assert.equal(hirePrice(tier, 1), Math.round(base * 1.2));
  }
  assert.throws(() => hirePrice('Boss', 0));
  assert.equal(hirePrice('Newbie', -3), 1000000);
});

test('quantity purchase sums consecutive prices', () => {
  assert.equal(hirePriceForQuantity('Newbie', 0, 3), 1000000 + 1200000 + 1440000);
  assert.equal(hirePriceForQuantity('Newbie', 2, 0), 0);
});

test('shared cap', () => {
  assert.equal(canHireUnderCap(0, 15), true);
  assert.equal(canHireUnderCap(15, 15), false);
});
