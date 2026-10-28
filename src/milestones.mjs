// Hiring level milestones (v1 subset): what each level unlocks and the pure
// lookups the game-facing slices read. No game globals.

/** Display order by level. `key` doubles as the language suffix MOD_WF_MILESTONE_<key>. */
export const MILESTONES = [
  { level: 5, key: 'RESERVE_24', icon: 'reserve' },
  { level: 8, key: 'ORDERS_BOARD', icon: 'hiring' },
  { level: 10, key: 'PROMOTIONS', icon: 'hiring' },
  { level: 15, key: 'FORGET', icon: 'hiring' },
  { level: 20, key: 'LICENCE_JUNIOR', icon: 'Junior' },
  { level: 25, key: 'APOLOGY', icon: 'hiring' },
  { level: 30, key: 'ORDERS_MEDIUM', icon: 'hiring' },
  { level: 35, key: 'RESERVE_72', icon: 'reserve' },
  { level: 40, key: 'LICENCE_MIDDLE', icon: 'Middle' },
  { level: 45, key: 'SEVERANCE_HALF', icon: 'hiring' },
  { level: 50, key: 'MARKS', icon: 'hiring' },
  { level: 50, key: 'ORDERS_REROLL', icon: 'hiring' },
  { level: 55, key: 'AUTO_RESTART', icon: 'hiring' },
  { level: 60, key: 'LICENCE_SENIOR', icon: 'Senior' },
  { level: 65, key: 'RESERVE_7D', icon: 'reserve' },
  { level: 70, key: 'ORDERS_LARGE', icon: 'hiring' },
  { level: 80, key: 'LICENCE_EXPERT', icon: 'Expert' },
  { level: 85, key: 'OVERTIME', icon: 'hiring' },
  { level: 90, key: 'SEVERANCE_NONE', icon: 'hiring' },
  { level: 95, key: 'RESERVE_30D', icon: 'reserve' },
  { level: 99, key: 'FREE_SLOT_1', icon: 'hiring' },
  { level: 99, key: 'CREW_CAP', icon: 'Expert' },
  { level: 100, key: 'WAGES_10', icon: 'hiring' },
  { level: 110, key: 'FREE_SLOT_2', icon: 'hiring' },
  { level: 120, key: 'PROMO_COST', icon: 'hiring' },
];

export const PROMOTION_LEVEL = 10;
export const FORGET_LEVEL = 15;
export const APOLOGY_LEVEL = 25;
export const AUTO_RESTART_LEVEL = 55;
export const OVERTIME_LEVEL = 85;
export const WAGE_DISCOUNT_LEVEL = 100;
export const PROMO_COST_LEVEL = 120;
export const SEVERANCE_HALF_LEVEL = 45;
export const SEVERANCE_NONE_LEVEL = 90;
export const MARKS_LEVEL = 50;
export const CREW_CAP_LEVEL = 99;
export const DEFAULT_XP_SHARE = 5;

/** Reserve capacity steps, [Hiring level, hours]; the Tips popup draws them as a table (build .112). */
export const RESERVE_STEPS = [[95, 720], [65, 168], [35, 72], [5, 24]];

/** Milestones the current cap can ever show (99 without Throne of the Herald). */
export function visibleMilestones(maxLevelCap) {
  return MILESTONES.filter((m) => m.level <= maxLevelCap);
}

/** 'reached' | 'next' (reachable, not yet) | 'capped' (above the current level cap). */
export function milestoneState(milestoneLevel, { level, levelCap }) {
  if (level >= milestoneLevel) return 'reached';
  if (milestoneLevel > levelCap) return 'capped';
  return 'next';
}

/** Payroll Reserve capacity in hours of the whole crew's wages; 0 while locked. */
export function reserveCapacityHours(level) {
  for (const [min, hours] of RESERVE_STEPS) if (level >= min) return hours;
  return 0;
}

/** A reserve capacity reads in days from a week on ("7 days", "30 days"), in hours under it ("24 h", "72 h"). */
export const CAPACITY_DAYS_FROM = 168;

/**
 * One way to write a reserve capacity wherever it is printed (the help popup, the Tips table), so they all agree
 * with the milestone names (build .136). `t(key, vars)` is the language template; the hours and days keys carry
 * the unit.
 */
export function capacityText(hours, t) {
  return hours >= CAPACITY_DAYS_FROM
    ? t('MOD_WF_CAPACITY_DAYS', { days: `${Math.floor(hours / 24)}` })
    : t('MOD_WF_CAPACITY_HOURS', { hours: `${hours}` });
}

export function promotionsUnlocked(level) {
  return level >= PROMOTION_LEVEL;
}

export function apologyUnlocked(level) {
  return level >= APOLOGY_LEVEL;
}

export function autoRestartUnlocked(level) {
  return level >= AUTO_RESTART_LEVEL;
}

/** Overtime wage multiplier: 2× until level 85, 1.5× after. */
export function overtimeWageFactor(level) {
  return level >= OVERTIME_LEVEL ? 1.5 : 2;
}

/** Free Shift Slots granted by level (still counted against the licence cap). */
export function freeShiftSlots(level) {
  if (level >= 110) return 2;
  if (level >= 99) return 1;
  return 0;
}

/** Extra wage discount in percent from levels. */
export function levelWageDiscount(level) {
  return level >= WAGE_DISCOUNT_LEVEL ? 10 : 0;
}

export function promotionCostRate(level) {
  return level >= PROMO_COST_LEVEL ? 0.5 : 0.6;
}

/**
 * Firing costs a severance, a share of what the Folk cost you (its hire and its promotions): 10% until Hiring 45,
 * 5% from 45, nothing from 90. Firing is never free early on, so a crew is planned, not churned.
 */
export function firingSeveranceRate(level) {
  if (level >= SEVERANCE_NONE_LEVEL) return 0;
  return level >= SEVERANCE_HALF_LEVEL ? 0.05 : 0.1;
}

/** The severance in GP for a Folk that cost `cost`, rounded up like the promotion fee. */
export function firingSeverance(cost, level) {
  return Math.ceil(Math.max(0, Number(cost) || 0) * firingSeveranceRate(level));
}

/** Share of the player's Summoning mark chance a Folk action rolls with: none until Hiring 50, half from it. */
export function folkMarkShare(level) {
  return level >= MARKS_LEVEL ? 0.5 : 0;
}

/** Cap on the Foreman crew bonus (skill XP, percent): 15 until Hiring 99, 20 from it. */
export function crewBonusMax(level) {
  return level >= CREW_CAP_LEVEL ? 20 : 15;
}

/** Hiring XP earned from a Folk's skill XP at the configured share (percent). */
export function hiringXPFor(folkXP, sharePercent = DEFAULT_XP_SHARE) {
  const share = Number(sharePercent);
  if (!(folkXP > 0) || !Number.isFinite(share) || share <= 0) return 0;
  return folkXP * Math.min(100, share) / 100;
}

/**
 * XP toast bookkeeping. The engine shows "+N Hiring XP" only for whole XP and silently
 * drops anything under 1, and a 5% share of a tree is 0.5 XP. Each grant's whole part is
 * toasted by the engine; its fraction goes into `carry`, and every time the carry reaches
 * 1 the mod toasts that whole amount itself. Returns { extra, carry }.
 */
export function xpToastSplit(xp, carry = 0) {
  if (!(xp > 0)) return { extra: 0, carry };
  const fraction = xp - Math.floor(xp);
  const total = carry + fraction;
  const extra = Math.floor(total);
  return { extra, carry: total - extra };
}

/** Reserve capacity in currency and the room left for a deposit. */
export function reserveRoom({ hours, perHour, reserve }) {
  if (!(hours > 0) || !(perHour > 0)) return { capacity: 0, room: 0 };
  const capacity = Math.floor(hours * perHour);
  return { capacity, room: Math.max(0, capacity - Math.floor(reserve)) };
}

/**
 * Data modifications that offer Hiring in the random level-cap increase picks of the
 * expansions' Ancient Relics cap tables (standard levels only; Hiring has no abyssal levels).
 */
export function capIncreaseModifications({ hasAoD = false, hasTotH = false } = {}, skillID = 'worker_folks:Hiring') {
  const list = [];
  if (hasAoD) list.push({ id: 'melvorAoD:Pre99Dungeons', randomIncreases: { add: [{ skillID, increase: 15, maximum: 99 }] } });
  if (hasTotH) list.push({ id: 'melvorTotH:Post99Dungeons', randomIncreases: { add: [{ skillID, increase: 8, maximum: 120 }] } });
  return list.length === 0 ? undefined : { skillLevelCapIncreases: list };
}
