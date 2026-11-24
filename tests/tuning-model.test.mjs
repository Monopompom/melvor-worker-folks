import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pricing from '../src/pricing.mjs';
import * as wages from '../src/wages.mjs';
import { KNOBS, ALT_MAGIC, knobOf, validKnob, knobValue, knobFactor, atDefaults, tunedPricing, tunedWages, growthPercent } from '../src/tuning-model.mjs';

const defaults = () => Object.fromEntries([...KNOBS.map((k) => [k.name, k.default]), [ALT_MAGIC.name, ALT_MAGIC.default]]);
const reader = (values) => (name) => values[name];

test('every default sits inside its own limits, so a fresh character plays as before', () => {
  KNOBS.forEach((k) => {
    assert.ok(k.min <= k.default && k.default <= k.max, k.name);
    assert.ok(k.min < k.default || k.default < k.max, `${k.name} can move`);
    assert.ok(validKnob(k, k.default), k.name);
  });
  assert.ok(atDefaults(reader(defaults())));
});

test('every knob goes both ways from today\'s value, easier and harder', () => {
  KNOBS.forEach((k) => assert.ok(k.min < k.default && k.default < k.max, k.name));
});

test('validKnob refuses blanks, words, out-of-range and fractional GP', () => {
  const growth = knobOf('hirePriceGrowth');
  ['', null, undefined, true, 'abc', NaN, Infinity, 1.04, 2.01].forEach((v) => assert.equal(validKnob(growth, v), false, String(v)));
  [1.05, '1.5', 2].forEach((v) => assert.equal(validKnob(growth, v), true, String(v)));
  const base = knobOf('slotBasePrice');
  assert.equal(validKnob(base, 1234567.5), false);
  assert.equal(validKnob(base, 1234567), true);
});

test('knobValue keeps a valid value, clamps a number outside the limits, and falls back on rubbish', () => {
  const cooldown = knobOf('strikeCooldown');
  assert.equal(knobValue(cooldown, 2), 2);
  assert.equal(knobValue(cooldown, '0.5'), 0.5);
  assert.equal(knobValue(cooldown, 99), 4);
  assert.equal(knobValue(cooldown, -1), 0.25);
  assert.equal(knobValue(cooldown, 'abc'), 1);
  assert.equal(knobValue(cooldown, ''), 1);
  assert.equal(knobValue(cooldown, undefined), 1);
  assert.equal(knobValue(knobOf('slotBasePrice'), 99999999.4), 30000000);
  assert.equal(knobValue(knobOf('slotBasePrice'), 1000000.6), 1000001);
});

test('a percentage knob is used as a share', () => {
  assert.equal(knobFactor(knobOf('severanceRate'), 5), 0.05);
  assert.equal(knobFactor(knobOf('strikeCooldown'), 2), 2);
});

test('tuned pricing at the defaults gives exactly the prices of today', () => {
  const tuned = tunedPricing(pricing, reader(defaults()));
  for (const tier of Object.keys(pricing.HIRE_BASE_PRICE)) {
    for (let owned = 0; owned < 12; owned += 1) assert.equal(tuned.hirePrice(tier, owned), pricing.hirePrice(tier, owned));
    assert.equal(tuned.hirePriceForQuantity(tier, 3, 4), pricing.hirePriceForQuantity(tier, 3, 4));
  }
  for (let n = 0; n < 10; n += 1) assert.equal(tuned.shiftSlotPrice(n), pricing.shiftSlotPrice(n));
  assert.equal(tuned.priceMultiplier(), 1);
});

test('tuned pricing follows growth, base and the multiplier both ways', () => {
  const values = { ...defaults(), hirePriceGrowth: 1.5, slotPriceGrowth: 2, slotBasePrice: 1000000, priceMultiplier: 0.5 };
  const tuned = tunedPricing(pricing, reader(values));
  assert.equal(tuned.hirePrice('Newbie', 0), 500000);
  assert.equal(tuned.hirePrice('Newbie', 2), Math.round(500000 * 1.5 ** 2));
  assert.equal(tuned.hirePriceForQuantity('Junior', 0, 2), 2500000 + 3750000);
  // Slot n = base × growth^(n−1), the first bought one being slot 2.
  assert.equal(tuned.shiftSlotPrice(0), Math.round(1000000 * 0.5 * 2));
  assert.equal(tuned.shiftSlotPrice(3), Math.round(1000000 * 0.5 * 2 ** 4));
  assert.deepEqual(tuned.hireBasePrice(), Object.fromEntries(Object.entries(pricing.HIRE_BASE_PRICE).map(([k, v]) => [k, v / 2])));
  values.priceMultiplier = 5;
  assert.equal(tuned.hirePrice('Expert', 0), 600000000);
  assert.equal(tuned.hireBasePrice().Expert, 600000000);
  // Pure constants stay as they are for whoever reads them.
  assert.equal(tuned.SHIFT_SLOT_CAP, pricing.SHIFT_SLOT_CAP);
  assert.equal(tuned.canHireUnderCap(1, 2), true);
});

test('tuned wages at the defaults settle and cool down as today', () => {
  const tuned = tunedWages(wages, reader(defaults()));
  assert.deepEqual(tuned.settlement(1000, 2000000), wages.settlement(1000, 2000000));
  assert.deepEqual(tuned.settlement(1000, 2000000, { apology: true }), wages.settlement(1000, 2000000, { apology: true }));
  for (const tier of Object.keys(wages.COOLDOWN_TICKS)) {
    assert.equal(tuned.cooldownAfterSettlement(tier), wages.cooldownAfterSettlement(tier));
    assert.equal(tuned.cooldownAfterSettlement(tier, { apology: true }), 0);
  }
  assert.equal(tuned.severance(1000000), 50000);
});

test('tuned wages follow severance, apology and cooldown both ways', () => {
  const values = { ...defaults(), severanceRate: 0, apologyMultiplier: 10, strikeCooldown: 0.25 };
  const tuned = tunedWages(wages, reader(values));
  assert.deepEqual(tuned.settlement(700, 1000000), { debt: 700, severance: 0, total: 700 });
  values.severanceRate = 25;
  assert.deepEqual(tuned.settlement(700, 1000000, { apology: true }), { debt: 700, severance: 250000, total: 700 + 2500000 });
  assert.equal(tuned.cooldownAfterSettlement('Newbie'), wages.COOLDOWN_TICKS.Newbie / 4);
  values.strikeCooldown = 4;
  assert.equal(tuned.cooldownAfterSettlement('Expert'), wages.COOLDOWN_TICKS.Expert * 4);
  assert.equal(tuned.cooldownAfterSettlement('Expert', { apology: true }), 0);
});

test('atDefaults notices any change, Alt. Magic off included', () => {
  assert.equal(atDefaults(reader({ ...defaults(), priceMultiplier: 2 })), false);
  assert.equal(atDefaults(reader({ ...defaults(), altMagicForFolks: false })), false);
});

test('growthPercent reads a growth factor as the rise per step', () => {
  assert.equal(growthPercent(1.2), 20);
  assert.equal(growthPercent(1.4), 40);
  assert.equal(growthPercent(1.05), 5);
  assert.equal(growthPercent(2.5), 150);
  assert.equal(growthPercent(1.125), 12.5);
});
