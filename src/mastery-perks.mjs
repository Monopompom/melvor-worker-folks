// Folk mastery perks and pool checkpoints. Pure: no game globals.

/** Mastery XP scale by tier (engine base XP × scale). */
export const TIER_XP_SCALE = { Newbie: 1.0, Junior: 1.1, Middle: 1.2, Senior: 1.3, Expert: 1.4 };
/**
 * Seniority raise: a Folk's wage as a share of its tier wage by mastery level, linear between
 * these anchors (40% fresh, 55% at 50, 74% at 90, the full wage at 99). Wages rise with
 * progression so a crew stays a real drain late.
 */
export const WAGE_RAISE_ANCHORS = [[1, 0.4], [50, 0.55], [90, 0.74], [99, 1]];
export const WAGE_RAISE_START = WAGE_RAISE_ANCHORS[0][1];
export function wageRaise(level) {
  const l = Math.min(99, Math.max(1, Math.floor(level)));
  for (let i = 1; i < WAGE_RAISE_ANCHORS.length; i += 1) {
    const [l0, r0] = WAGE_RAISE_ANCHORS[i - 1];
    const [l1, r1] = WAGE_RAISE_ANCHORS[i];
    if (l <= l1) return r0 + ((r1 - r0) * (l - l0)) / (l1 - l0);
  }
  return 1;
}
export const OVERTIME_LEVEL = 30;
export const OVERTIME_INTERVAL_PERCENT = -20;
export const OVERTIME_WAGE_FACTOR = 2;
/** Strike grace in unpaid work time: base, from Folk mastery 25, and the 25% pool bonus. */
export const GRACE_MS = 15 * 60 * 1000;
export const GRACE_MS_MASTERY = 30 * 60 * 1000;
export const GRACE_BONUS_MS_POOL = 15 * 60 * 1000;
export const POOL_CHECKPOINTS = [10, 25, 50, 95];
/**
 * Cap on every wage relief together (pool, pet, gear, relics, the Hiring 100 milestone), as a
 * share of the Folk's current raise: 30% of the wage at mastery 99, 12% for a fresh Folk at the
 * 40% raise. Reliefs grow with seniority and never pull a wage far under a fresh Folk's.
 */
export const RELIEF_CAP_OF_RAISE = 0.3;
export function reliefCap(raise) {
  return RELIEF_CAP_OF_RAISE * Math.min(1, Math.max(0, raise));
}

/**
 * Mastery XP per Folk action. Grows geometrically with the Folk's level so the
 * promotion gates land at playable times (see ticket 09 notes for the measured curve).
 */
export const XP_BASE_PER_3S = 0.289;
export const XP_GROWTH_PER_LEVEL = 1.07;
export function masteryXPForAction({ level, intervalMs, tier, modifierPercent = 0 }) {
  const scale = TIER_XP_SCALE[tier];
  if (scale === undefined) throw new Error(`Unknown tier: ${tier}`);
  const l = Math.max(1, Math.floor(level));
  return XP_BASE_PER_3S * Math.pow(XP_GROWTH_PER_LEVEL, l - 1) * (Math.max(0, intervalMs) / 3000) * scale * (1 + modifierPercent / 100);
}

/** Perks a single Folk has at its mastery level. */
export function levelPerks(level) {
  const l = Math.max(1, Math.floor(level));
  return {
    wageRaise: wageRaise(l),
    graceMs: l >= 25 ? GRACE_MS_MASTERY : GRACE_MS,
    overtime: l >= OVERTIME_LEVEL,
    cooldownMult: l >= 90 ? 0.5 : l >= 60 ? 0.75 : 1,
    skillXP: l >= 75 ? 5 : 0,
    trusted: l >= 99,
  };
}

/** Perks every Folk gets from the Hiring mastery pool (percent filled). */
export function poolPerks(poolPercent) {
  const p = Math.max(0, poolPercent);
  return {
    wageDiscount: p >= 10 ? 0.05 : 0,
    graceBonusMs: p >= 25 ? GRACE_BONUS_MS_POOL : 0,
    autoSettle: p >= 50,
    cooldownMult: p >= 95 ? 0.75 : 1,
  };
}

/**
 * The same perks read from the player's modifier table (`worker_folks:*` modifiers): the
 * mastery pool bonuses, the Hiring pet, worn Hiring gear and Ancient Relics all land there,
 * so this is the single source for them. `cooldownPercent` is the inverted modifier's raw
 * value (−25 means a quarter shorter). `freeOvertime` (the Hiring Master Relic) makes overtime
 * cost normal wages.
 */
export function bonusPerks({ wageDiscountPercent = 0, graceMinutes = 0, cooldownPercent = 0, autoSettle = false, freeOvertime = false } = {}) {
  return {
    wageDiscount: Math.max(0, wageDiscountPercent) / 100,
    graceBonusMs: Math.max(0, graceMinutes) * 60000,
    autoSettle: !!autoSettle,
    cooldownMult: Math.max(0, 1 + cooldownPercent / 100),
    freeOvertime: !!freeOvertime,
  };
}

/** Every relief added up and capped at reliefCap(raise). */
export function totalWageDiscount(raise, ...parts) {
  return Math.min(reliefCap(raise), parts.reduce((sum, p) => sum + Math.max(0, p || 0), 0));
}

/** Level and bonus perks merged for one Folk; `bonuses` is a bonusPerks() object or a pool percent. */
export function combinedPerks(level, bonuses, { overtimeOn = false, overtimeWageFactor = OVERTIME_WAGE_FACTOR } = {}) {
  const lp = levelPerks(level);
  const pp = typeof bonuses === 'number' ? poolPerks(bonuses) : bonuses;
  const overtimeActive = lp.overtime && overtimeOn;
  return {
    wageRaise: lp.wageRaise,
    wageDiscount: Math.min(reliefCap(lp.wageRaise), pp.wageDiscount),
    wageFactor: overtimeActive && !pp.freeOvertime ? overtimeWageFactor : 1,
    graceMs: lp.graceMs + pp.graceBonusMs,
    overtimeUnlocked: lp.overtime,
    overtimeActive,
    intervalPercent: overtimeActive ? OVERTIME_INTERVAL_PERCENT : 0,
    cooldownMult: lp.cooldownMult * pp.cooldownMult,
    skillXP: lp.skillXP,
    trusted: lp.trusted,
    autoSettle: pp.autoSettle,
  };
}

/** Level milestones in display order: [level, key]. */
export const LEVEL_MILESTONES = [
  [25, 'grace'],
  [30, 'overtime'],
  // Qualification: the tier below's level is enough (qualification-model.mjs LOWERING_MASTERY).
  [50, 'qualify'],
  [60, 'cooldown60'],
  [75, 'skillXP'],
  [90, 'cooldown90'],
  [99, 'trusted'],
];
