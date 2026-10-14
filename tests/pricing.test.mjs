import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hirePrice, hirePriceForQuantity, canHireUnderCap, HIRE_BASE_PRICE } from '../src/pricing.mjs';

test('Newbie hire price ladder matches the design table for 1..18 owned', () => {
  const expected = [500000, 600000, 720000, 864000, 1036800];
  expected.forEach((price, owned) => assert.equal(hirePrice('Newbie', owned), price));
  // design reference points: 5th ≈ 1.04M, 10th ≈ 2.58M, 15th ≈ 6.4M
  assert.ok(Math.abs(hirePrice('Newbie', 4) - 1036800) < 1);
  assert.equal(hirePrice('Newbie', 9), 2579890);
  assert.equal(hirePrice('Newbie', 14), 6419592);
  for (let owned = 0; owned < 18; owned += 1) {
    assert.equal(hirePrice('Newbie', owned), Math.round(500000 * 1.2 ** owned));
    assert.ok(Number.isInteger(hirePrice('Newbie', owned)));
  }
});

test('every tier starts at its base price and grows by 20% per owned Folk', () => {
  for (const [tier, base] of Object.entries(HIRE_BASE_PRICE)) {
    assert.equal(hirePrice(tier, 0), base);
    assert.equal(hirePrice(tier, 1), Math.round(base * 1.2));
  }
  assert.throws(() => hirePrice('Boss', 0));
  assert.equal(hirePrice('Newbie', -3), 500000);
});

test('quantity purchase sums consecutive prices', () => {
  assert.equal(hirePriceForQuantity('Newbie', 0, 3), 500000 + 600000 + 720000);
  assert.equal(hirePriceForQuantity('Newbie', 2, 0), 0);
});

test('shared cap', () => {
  assert.equal(canHireUnderCap(0, 15), true);
  assert.equal(canHireUnderCap(15, 15), false);
});
