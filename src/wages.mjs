// Wage, strike, settlement and cooldown math. Pure: no game globals.

// Tuned 2026-10-13 so a crew is a real drain at every stage:
// each tier's wage is roughly a quarter of what that tier's Folk earns on the best money skill
// of the stage its licence unlocks at, and more than it earns on an ordinary skill.
export const WAGE_PER_HOUR = { Newbie: 75000, Junior: 300000, Middle: 1000000, Senior: 3000000, Expert: 8000000 };
/** Wage difficulty presets (Mod Settings): key → multiplier on WAGE_PER_HOUR. 0 disables wages and strikes. */
export const WAGE_PRESETS = [
  { key: 'nosweat', multiplier: 0 },
  { key: 'easy', multiplier: 0.25 },
  { key: 'relaxed', multiplier: 0.5 },
  { key: 'standard', multiplier: 1 },
  { key: 'tense', multiplier: 1.5 },
  { key: 'hard', multiplier: 2 },
  { key: 'brutal', multiplier: 3 },
  { key: 'evil', multiplier: 5 },
];
export const DEFAULT_WAGE_PRESET = 'standard';

/** Multiplier for a preset key; unknown keys fall back to the default preset. */
export function presetMultiplier(key) {
  const preset = WAGE_PRESETS.find((p) => p.key === key) ?? WAGE_PRESETS.find((p) => p.key === DEFAULT_WAGE_PRESET);
  return preset.multiplier;
}

/** Unpaid *work time* a Folk tolerates before striking: 15 min (30 from mastery 25, +15 from the 25% pool). */
export const STRIKE_GRACE_MS = 15 * 60 * 1000;
/** The reserve-low warning fires when the reserve covers less than this many hours of the working crew. */
export const RESERVE_WARN_HOURS = 1;
export const SEVERANCE_RATE = 0.05;
export const APOLOGY_MULTIPLIER = 3;
const TICK_MS = 50;
/** Cooldown after a settled strike, in game ticks (offline ticks count). */
export const COOLDOWN_TICKS = {
  Newbie: (30 * 60 * 1000) / TICK_MS,
  Junior: (60 * 60 * 1000) / TICK_MS,
  Middle: (2 * 60 * 60 * 1000) / TICK_MS,
  Senior: (4 * 60 * 60 * 1000) / TICK_MS,
  Expert: (8 * 60 * 60 * 1000) / TICK_MS,
};

/** Hourly wage of a tier after the global multiplier and a mastery discount (0–1). */
export function hourlyWage(tier, { multiplier = 1, discount = 0 } = {}) {
  const base = WAGE_PER_HOUR[tier];
  if (base === undefined) throw new Error(`Unknown tier: ${tier}`);
  return base * Math.max(0, multiplier) * (1 - Math.min(Math.max(discount, 0), 1));
}

/** Exact (fractional) wage for one action of `intervalMs`. */
export function wageForAction(tier, intervalMs, options) {
  return (hourlyWage(tier, options) * Math.max(0, intervalMs)) / 3600000;
}

/**
 * Turns a fractional wage into a whole charge, carrying the remainder so a 10 s
 * action and a 3 s action cost exactly the same per hour over time.
 */
export function wholeCharge(exact, carry = 0) {
  const total = exact + carry;
  const amount = Math.floor(total);
  return { amount, carry: total - amount };
}

/** Splits a charge across the reserve, then the bank; what is left is unpaid. */
export function splitPayment(amount, reserve, bank) {
  const fromReserve = Math.min(amount, Math.max(0, reserve));
  const fromBank = Math.min(amount - fromReserve, Math.max(0, bank));
  return { fromReserve, fromBank, unpaid: amount - fromReserve - fromBank };
}

/** Hours the reserve covers for a crew costing `perHour`; Infinity when nothing is owed. */
export function hoursCovered(reserve, perHour) {
  if (perHour <= 0) return Infinity;
  return reserve / perHour;
}

/**
 * Collects outstanding debt once money is back (reserve first, then bank) before a strike
 * happened. Returns what to take and the new counters: a fully repaid debt ends the
 * "In debt" episode, so the next shortfall gets a fresh grace.
 */
export function repayDebt({ debt, debtMs }, reserve, bank) {
  if (!(debt > 0)) return { fromReserve: 0, fromBank: 0, debt: Math.max(0, debt || 0), debtMs, cleared: false };
  const split = splitPayment(debt, reserve, bank);
  const cleared = split.unpaid === 0;
  return { fromReserve: split.fromReserve, fromBank: split.fromBank, debt: split.unpaid, debtMs: cleared ? 0 : debtMs, cleared };
}

/** After an unpaid action of `intervalMs`: new debt, unpaid work time, and whether the Folk strikes now. */
export function onUnpaid({ debt, debtMs }, unpaid, intervalMs, graceMs = STRIKE_GRACE_MS) {
  const nextDebt = debt + unpaid;
  const nextMs = (debtMs || 0) + Math.max(0, intervalMs || 0);
  return { debt: nextDebt, debtMs: nextMs, strike: nextMs > graceMs };
}

/** Unpaid work time left before the strike. */
export function graceLeftMs(debtMs, graceMs = STRIKE_GRACE_MS) {
  return Math.max(0, graceMs - Math.max(0, debtMs || 0));
}

/** True when a non-empty reserve covers less than the warning threshold. */
export function reserveLow(hoursCovered, reserve, threshold = RESERVE_WARN_HOURS) {
  return reserve > 0 && hoursCovered < threshold;
}

/** Severance on settling a strike: a share (`rate`, 0–1) of the next hire's price. */
export function severance(nextHirePrice, rate = SEVERANCE_RATE) {
  return Math.ceil(nextHirePrice * Math.max(0, rate));
}

/**
 * Settlement = owed wages + severance; an apology pays the severance `apologyMultiplier` times in all (×3 by default)
 * and skips the cooldown.
 */
export function settlement(debt, nextHirePrice, { apology = false, rate = SEVERANCE_RATE, apologyMultiplier = APOLOGY_MULTIPLIER } = {}) {
  const sev = severance(nextHirePrice, rate);
  return { debt, severance: sev, total: debt + (apology ? sev * apologyMultiplier : sev) };
}

/** Cooldown ticks after a settled strike: the tier's, times `factor` (the cooldown setting); none after an apology. */
export function cooldownAfterSettlement(tier, { apology = false, factor = 1 } = {}) {
  return apology ? 0 : Math.round(COOLDOWN_TICKS[tier] * Math.max(0, factor));
}

export function tickCooldown(cooldownTicks, ticks) {
  return Math.max(0, cooldownTicks - Math.max(0, ticks));
}

/**
 * A Payroll Reserve deposit (build .55): what actually goes in and why, so the panel can say so instead of failing
 * silently. `room` is Infinity without a level cap. outcome: 'empty' (no amount), 'full' (no room), 'nothing' (the bank
 * is empty), 'cut' (more than the room: the room goes in), 'bank' (more than the bank: all of it goes in), 'ok'.
 */
export function depositPlan({ amount, bank, room = Infinity }) {
  const want = Math.floor(Number(amount));
  if (!(want > 0)) return { deposit: 0, outcome: 'empty' };
  if (!(room > 0)) return { deposit: 0, outcome: 'full' };
  // More than the bank holds: what the bank has goes in, as the room case does (scan A-25, build .112).
  const most = Math.floor(Math.min(bank, room));
  if (want > bank && !(most > 0)) return { deposit: 0, outcome: 'nothing' };
  if (want > room && room <= bank) return { deposit: Math.floor(room), outcome: 'cut' };
  if (want > bank) return { deposit: most, outcome: 'bank' };
  return { deposit: want, outcome: 'ok' };
}

export const ABYSSAL_REALM_ID = 'melvorItA:Abyssal';

/**
 * The currency a Folk's wage is charged in: Abyssal Pieces for work in the Abyssal realm (its tree, rock, recipe or
 * NPC is an Abyssal one) with the option on and the currency there, GP for everything else. It follows the work, not
 * the realm the player has open: switching realms used to move Melvor work onto AP, which ran up a debt and a strike.
 */
export function wageCurrencyId({ workRealmId, apWages, apExists, gpId, apId }) {
  return apWages && apExists && workRealmId === ABYSSAL_REALM_ID ? apId : gpId;
}

/** [BALANCE] A general strike (round 5, its own switch, off by default): at least this many Folks on strike... */
export const GENERAL_STRIKE_MIN = 2;
/** ...and at least this share of the Folks at work or on strike. */
export const GENERAL_STRIKE_SHARE = 0.5;

const generalDue = (striking, working) => striking >= GENERAL_STRIKE_MIN && striking >= (striking + working) * GENERAL_STRIKE_SHARE;

/**
 * Where the crew stands toward a general strike. `striking`: Folks on strike; `working`: Folks at work (Loyal ones
 * too: they count, though they never strike or walk out); `canStrike`: those at work that could strike (not Loyal).
 * due: the strike holds now. warn: one more strike would bring it (only while someone could still strike).
 */
export function generalStrike({ striking, working, canStrike = working }) {
  const due = generalDue(striking, working);
  const warn = !due && canStrike > 0 && working > 0 && generalDue(striking + 1, working - 1);
  return { due, warn };
}
