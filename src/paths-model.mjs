// Paths (joint order round 6): at promotion to Master a Folk takes one of three paths, each a trade, the same set for
// every skill; a Foreman keeps its path at a stronger step. Pure: no game globals.

/** Path ids in display order. The save keeps the id (src/folk.mjs PATH_IDS holds the same list). */
export const PATH_IDS = ['Hustler', 'Steady', 'Scholar'];

/** Tiers that hold a path, and the step each one gets. */
export const PATH_STEP = { Senior: 1, Expert: 2 };

/**
 * Each path's effects by step. `rate` adds to Produce Rate (so to the bonus batch chance), `interval` and `xp` are the
 * skill's percent modifiers, `masteryXP` the Folk's mastery XP percent, `wage` the wage factor's percent (a factor
 * like a trait's, outside the relief cap).
 */
export const PATHS = {
  Hustler: { icon: 'path_hustler', steps: [{ rate: 10, wage: 25 }, { rate: 15, wage: 35 }] },
  Steady: { icon: 'path_steady', steps: [{ wage: -20, interval: 5 }, { wage: -30, interval: 5 }] },
  Scholar: { icon: 'path_scholar', steps: [{ xp: 10, masteryXP: 50, rate: -10 }, { xp: 15, masteryXP: 50, rate: -10 }] },
};

/** Produce Rate never falls below this through a path, so a Master or Foreman's own roll never misses. */
export const RATE_FLOOR = 100;

/** Change path costs the tier's diploma and this share of the tier's next hire price (Forget's rate). */
export const CHANGE_PRICE_RATE = 0.25;

const NONE = Object.freeze({ rate: 0, interval: 0, xp: 0, masteryXP: 0, wageFactor: 1 });

export function isPath(id) {
  return typeof id === 'string' && Object.hasOwn(PATHS, id);
}

/** The step a tier holds (1 Master, 2 Foreman), or 0 below Master. */
export function stepOf(tier) {
  return PATH_STEP[tier] ?? 0;
}

/** True when a Folk of this tier can hold a path. */
export function holdsPath(tier) {
  return stepOf(tier) > 0;
}

/** The path a Folk of `tier` keeps from a saved value: a known id at Master or Foreman, else null. */
export function normalizePath(raw, tier) {
  return holdsPath(tier) && isPath(raw) ? raw : null;
}

/** A Master or Foreman without a path: its first pick is free. */
export function needsPick(folk) {
  return holdsPath(folk?.tier) && !isPath(folk?.path);
}

/**
 * What a path adds for a Folk of `tier`: { rate, interval, xp, masteryXP, wageFactor }. `onJob` is true while the Folk
 * holds a job (the Quartermaster, a courier): a path is about a skill's work, so it then adds nothing, neither its gain
 * nor its cost.
 */
export function pathEffects(pathId, tier, { onJob = false } = {}) {
  const step = stepOf(tier);
  if (onJob || step === 0 || !isPath(pathId)) return { ...NONE };
  const e = PATHS[pathId].steps[step - 1];
  return {
    rate: e.rate ?? 0,
    interval: e.interval ?? 0,
    xp: e.xp ?? 0,
    masteryXP: e.masteryXP ?? 0,
    wageFactor: 1 + (e.wage ?? 0) / 100,
  };
}

/** A Produce Rate with a path's step on it, held at RATE_FLOOR (a path never takes a Master below it). */
export function rateWithPath(baseRate, pathRate) {
  const r = baseRate + pathRate;
  return pathRate < 0 ? Math.max(Math.min(baseRate, RATE_FLOOR), r) : r;
}

/** Change path's GP: CHANGE_PRICE_RATE of the tier's next hire price, rounded up. */
export function changeCost(hirePrice) {
  return Math.ceil(Math.max(0, Number(hirePrice) || 0) * CHANGE_PRICE_RATE);
}

/**
 * Whether a Folk may take `pathId` now, and what it costs: { ok, free, why } with why one of 'tier' (below Master),
 * 'unknown', 'same' (it holds it already), 'strike'. A Folk with no path picks for free (`free` true); otherwise the
 * caller charges the diploma and changeCost.
 */
export function pickPlan(folk, pathId) {
  if (!holdsPath(folk?.tier)) return { ok: false, free: false, why: 'tier' };
  if (!isPath(pathId)) return { ok: false, free: false, why: 'unknown' };
  if (folk.path === pathId) return { ok: false, free: false, why: 'same' };
  const free = !isPath(folk.path);
  if (!free && folk.onStrike) return { ok: false, free, why: 'strike' };
  return { ok: true, free, why: null };
}
