// Produce Rate and tier flavour effects. Pure: no game globals.

export const RATE_BY_TIER = { Newbie: 60, Junior: 80, Middle: 100, Senior: 120, Expert: 140 };

/** Tiers that never roll for skill pets. */
export const NO_PET_TIERS = new Set(['Newbie', 'Junior']);

export const CREW_BONUS_PER_EXPERT = 3;
export const CREW_BONUS_MAX = 15;

export function produceRate(tier) {
  const rate = RATE_BY_TIER[tier];
  if (rate === undefined) throw new Error(`No Produce Rate for tier ${tier}`);
  return rate;
}

/**
 * One roll per action. Rate < 100: success with Rate %, else 'fail'.
 * Rate > 100: always succeeds and (Rate − 100) % chance of 'bonus' (a second batch).
 */
export function rollOutcome(rate, rng = Math.random) {
  if (rate < 100) return rng() * 100 < rate ? 'ok' : 'fail';
  if (rate > 100) return rng() * 100 < rate - 100 ? 'bonus' : 'ok';
  return 'ok';
}

/**
 * Flavour modifiers per tier (DESIGN §5.2), as percentages for the held skill.
 * `preservationDisabled` (Ancient Relics) swaps preservation for a small XP bonus.
 */
export function tierModifiers(tier, { preservationDisabled = false } = {}) {
  const base = {
    Newbie: { skillInterval: 10, skillPreservationChance: 0 },
    Junior: { skillInterval: 0, skillPreservationChance: 0 },
    Middle: { skillInterval: 0, skillPreservationChance: 0 },
    Senior: { skillInterval: -5, skillPreservationChance: 10 },
    Expert: { skillInterval: -10, skillPreservationChance: 20 },
  }[tier];
  if (base === undefined) throw new Error(`No tier modifiers for ${tier}`);
  const out = { skillInterval: base.skillInterval, skillPreservationChance: base.skillPreservationChance, skillXP: 0 };
  if (preservationDisabled && base.skillPreservationChance > 0) {
    out.skillXP = base.skillPreservationChance === 20 ? 5 : 2;
    out.skillPreservationChance = 0;
  }
  return out;
}

/** +3% skill XP per OTHER working Expert, capped at +15% (`max`: +20% from Hiring 99). */
export function crewBonus(workingExpertsExcludingSelf, max = CREW_BONUS_MAX) {
  return Math.min(max, CREW_BONUS_PER_EXPERT * Math.max(0, workingExpertsExcludingSelf));
}

export function rollsPets(tier) {
  return !NO_PET_TIERS.has(tier);
}
