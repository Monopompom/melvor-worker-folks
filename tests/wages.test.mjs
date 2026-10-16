import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  depositPlan, hourlyWage, wageForAction, wholeCharge, splitPayment, hoursCovered, onUnpaid,
  severance, settlement, cooldownAfterSettlement, tickCooldown, COOLDOWN_TICKS,
  WAGE_PRESETS, DEFAULT_WAGE_PRESET, presetMultiplier, repayDebt, graceLeftMs, reserveLow, STRIKE_GRACE_MS,
} from '../src/wages.mjs';

test('debt from the grace period is repaid once money is back, reserve first, and clears the counter', () => {
  const owed = { debt: 100, debtMs: 6000 };
  assert.deepEqual(repayDebt(owed, 0, 0), { fromReserve: 0, fromBank: 0, debt: 100, debtMs: 6000, cleared: false });
  assert.deepEqual(repayDebt(owed, 30, 50), { fromReserve: 30, fromBank: 50, debt: 20, debtMs: 6000, cleared: false });
  assert.deepEqual(repayDebt(owed, 30, 1000), { fromReserve: 30, fromBank: 70, debt: 0, debtMs: 0, cleared: true });
  assert.deepEqual(repayDebt({ debt: 0, debtMs: 0 }, 500, 500), { fromReserve: 0, fromBank: 0, debt: 0, debtMs: 0, cleared: false });
});

test('wage difficulty presets run from free labour to evil hardcore; unknown keys mean Standard', () => {
  assert.deepEqual(WAGE_PRESETS.map((p) => p.key), ['nosweat', 'easy', 'relaxed', 'standard', 'tense', 'hard', 'brutal', 'evil']);
  assert.equal(presetMultiplier('nosweat'), 0);
  assert.equal(presetMultiplier('standard'), 1);
  assert.equal(presetMultiplier('evil'), 5);
  assert.equal(presetMultiplier(undefined), presetMultiplier(DEFAULT_WAGE_PRESET));
  assert.equal(presetMultiplier('bogus'), 1);
  assert.equal(hourlyWage('Expert', { multiplier: presetMultiplier('evil') }), 40000000);
  for (let i = 1; i < WAGE_PRESETS.length; i += 1) assert.ok(WAGE_PRESETS[i].multiplier > WAGE_PRESETS[i - 1].multiplier);
});

test('wages are prorated by interval: 10 s and 3 s actions cost the same per hour', () => {
  const perHour = (intervalMs) => (wageForAction('Newbie', intervalMs) * 3600000) / intervalMs;
  assert.ok(Math.abs(perHour(10000) - 75000) < 1e-6);
  assert.ok(Math.abs(perHour(3000) - 75000) < 1e-6);
  assert.equal(wageForAction('Expert', 3600), 8000);
  assert.equal(hourlyWage('Junior', { multiplier: 2 }), 600000);
  assert.equal(hourlyWage('Junior', { multiplier: 0 }), 0);
  assert.equal(hourlyWage('Junior', { discount: 0.5 }), 150000);
});

test('wholeCharge carries fractions so totals stay exact', () => {
  let carry = 0;
  let paid = 0;
  for (let i = 0; i < 360; i += 1) {
    const r = wholeCharge(wageForAction('Newbie', 10000), carry);
    paid += r.amount;
    carry = r.carry;
  }
  assert.equal(paid, 75000); // 360 × 10 s = 1 h
});

test('splitPayment drains the reserve first, then the bank', () => {
  assert.deepEqual(splitPayment(100, 30, 1000), { fromReserve: 30, fromBank: 70, unpaid: 0 });
  assert.deepEqual(splitPayment(100, 0, 40), { fromReserve: 0, fromBank: 40, unpaid: 60 });
  assert.deepEqual(splitPayment(100, 500, 0), { fromReserve: 100, fromBank: 0, unpaid: 0 });
  assert.equal(hoursCovered(150000, 75000), 2);
  assert.equal(hoursCovered(150000, 0), Infinity);
});

test('the grace is 15 minutes of unpaid work whatever the action length; the action that passes it strikes', () => {
  assert.equal(STRIKE_GRACE_MS, 15 * 60000);
  // 3 s actions: 300 fit in the grace, the 301st strikes.
  let s = { debt: 0, debtMs: 0 };
  let strikeAt = null;
  for (let i = 1; i <= 400 && strikeAt === null; i += 1) {
    s = onUnpaid(s, 10, 3000);
    if (s.strike) strikeAt = i;
  }
  assert.equal(strikeAt, 301);
  assert.equal(s.debt, 3010);
  // 40 s actions: 22 fit (880 s), the 23rd (920 s) strikes.
  s = { debt: 0, debtMs: 0 };
  strikeAt = null;
  for (let i = 1; i <= 50 && strikeAt === null; i += 1) {
    s = onUnpaid(s, 100, 40000);
    if (s.strike) strikeAt = i;
  }
  assert.equal(strikeAt, 23);
  // Longer grace from perks, and what is left.
  assert.equal(onUnpaid({ debt: 0, debtMs: 29 * 60000 }, 1, 30000, 30 * 60000).strike, false);
  assert.equal(onUnpaid({ debt: 0, debtMs: 30 * 60000 }, 1, 1, 30 * 60000).strike, true);
  assert.equal(graceLeftMs(5 * 60000), 10 * 60000);
  assert.equal(graceLeftMs(50 * 60000), 0);
  assert.equal(graceLeftMs(0, 45 * 60000), 45 * 60000);
  // Reserve warning: non-empty reserve under an hour.
  assert.equal(reserveLow(0.9, 1000), true);
  assert.equal(reserveLow(1, 1000), false);
  assert.equal(reserveLow(0, 0), false);
  assert.equal(reserveLow(Infinity, 1000), false);
});

test('settlement is debt plus 5% severance; apology triples the severance and skips the cooldown', () => {
  assert.equal(severance(500000), 25000);
  assert.deepEqual(settlement(40, 500000), { debt: 40, severance: 25000, total: 25040 });
  assert.equal(settlement(40, 500000, { apology: true }).total, 40 + 75000);
  assert.equal(cooldownAfterSettlement('Newbie'), COOLDOWN_TICKS.Newbie);
  assert.equal(COOLDOWN_TICKS.Newbie, 36000);
  assert.equal(COOLDOWN_TICKS.Expert, 576000);
  assert.equal(cooldownAfterSettlement('Expert', { apology: true }), 0);
  assert.equal(tickCooldown(100, 30), 70);
  assert.equal(tickCooldown(100, 500), 0);
});

test('depositPlan says what goes in and why', () => {
  assert.deepEqual(depositPlan({ amount: '', bank: 100 }), { deposit: 0, outcome: 'empty' });
  assert.deepEqual(depositPlan({ amount: 0, bank: 100 }), { deposit: 0, outcome: 'empty' });
  assert.deepEqual(depositPlan({ amount: 50, bank: 100, room: 0 }), { deposit: 0, outcome: 'full' });
  assert.deepEqual(depositPlan({ amount: 500, bank: 100 }), { deposit: 0, outcome: 'short' });
  assert.deepEqual(depositPlan({ amount: 80, bank: 100, room: 30.7 }), { deposit: 30, outcome: 'cut' });
  assert.deepEqual(depositPlan({ amount: '80.9', bank: 100, room: Infinity }), { deposit: 80, outcome: 'ok' });
});
