// Folk hitpoints: tiered max HP, Thieving damage, eating, regeneration, death
// and the 24 h frozen slot. Pure: no game globals.

export const MAX_HP_BY_TIER = { Newbie: 300, Junior: 500, Middle: 700, Senior: 900, Expert: 1200 };
/** Abyssal NPCs hit in the Abyssal HP scale; Folk HP stays in the standard one. */
export const ABYSSAL_DAMAGE_DIVISOR = 10;
/** Thieving damage uses the game's numberMultiplier (maxHit × 10). */
export const NUMBER_MULTIPLIER = 10;
/** A hit that leaves the Folk below this share of max HP makes it eat (the default; a setting picks 30-90%). */
export const EAT_THRESHOLD = 0.6;
/** The eat line's choices in Mod Settings, in % of max HP (build .219, joint order round 2). */
export const EAT_AT_CHOICES = [30, 40, 50, 60, 70, 80, 90];
export const DEFAULT_EAT_AT = 60;
/** How far a Folk heals once under the line: back to full, or one food each time. */
export const HEAL_MODES = ['full', 'one'];

/** The setting's value as a share of max HP: one of the choices, else the default. */
export function eatShare(percent) {
  const n = Number(percent);
  return (EAT_AT_CHOICES.includes(n) ? n : DEFAULT_EAT_AT) / 100;
}

/** The setting's heal mode: 'one' or else 'full'. */
export function healMode(value) {
  return value === 'one' ? 'one' : 'full';
}
export const REGEN_INTERVAL_TICKS = 200; // 10 s
export const FREEZE_MS = 24 * 60 * 60 * 1000;

export function maxHpFor(tier) {
  const hp = MAX_HP_BY_TIER[tier];
  if (hp === undefined) throw new Error(`Unknown tier: ${tier}`);
  return hp;
}

/** Saved hp is null until the Folk is first hurt (= full). */
export function currentHp(folk, max) {
  if (folk.hp === null || folk.hp === undefined) return max;
  return Math.max(0, Math.min(max, Math.floor(folk.hp)));
}

/** Same roll as the player's failed pickpocket: 1 … floor(maxHit × 10), no resistances. */
export function damageRoll(maxHit, { abyssal = false, rng = Math.random } = {}) {
  const top = Math.floor((Number(maxHit) || 0) * NUMBER_MULTIPLIER);
  if (top < 1) return 0;
  let dmg = 1 + Math.floor(rng() * top);
  if (abyssal) dmg = Math.max(1, Math.floor(dmg / ABYSSAL_DAMAGE_DIVISOR));
  return dmg;
}

export function applyDamage(hp, amount) {
  const next = Math.max(0, Math.floor(hp) - Math.max(0, Math.floor(amount)));
  return { hp: next, dead: next === 0 };
}

export function shouldEat(hp, max, at = EAT_THRESHOLD) {
  return hp < max * at;
}

export function foodHeal(healsFor) {
  return Math.max(0, Math.floor((Number(healsFor) || 0) * NUMBER_MULTIPLIER));
}

/**
 * Below the line `at` (a share of max HP): eats one item at a time until the Folk is at full HP or the stack is gone;
 * with `mode` 'one', a single item.
 */
export function eatPlan({ hp, max, healsFor, qty, at = EAT_THRESHOLD, mode = 'full' }) {
  let left = Math.max(0, Math.floor(qty));
  let cur = hp;
  let eaten = 0;
  const heal = foodHeal(healsFor);
  if (!shouldEat(cur, max, at)) return { eaten, hp: cur, qtyLeft: left };
  const most = mode === 'one' ? 1 : Infinity;
  while (left > 0 && heal > 0 && cur < max && eaten < most) {
    cur = Math.min(max, cur + heal);
    left -= 1;
    eaten += 1;
  }
  return { eaten, hp: cur, qtyLeft: left };
}

/** 1% of max HP every 10 s like the player's base regen (at least 1). */
export function regenAmount(max) {
  return Math.max(1, Math.floor(max / 100));
}

export function freezeUntil(now) {
  return now + FREEZE_MS;
}

export function freezeRemaining(until, now) {
  return Math.max(0, until - now);
}

/** Drops expired freezes. `frozen` is { slot: untilMs }. */
export function activeFreezes(frozen, now) {
  const out = {};
  for (const [slot, until] of Object.entries(frozen ?? {})) {
    if (typeof until === 'number' && until > now) out[slot] = until;
  }
  return out;
}

/** Food left under this many items is shown amber on a Thieving Folk's card. */
export const FOOD_LOW = 20;
export const THIEVING_ID = 'melvorD:Thieving';

/**
 * The card's food line (build .55). Folks lose HP only on Thieving and eat the player's combat food slot, so the line
 * is 'off' for every other skill (or none), 'none' on Thieving without food (red, card border amber), 'low' under
 * FOOD_LOW items (amber), else 'ok'.
 */
export function foodLineState({ skillId = null, foodQty = 0 } = {}) {
  if (skillId !== THIEVING_ID) return 'off';
  if (!(foodQty > 0)) return 'none';
  return foodQty < FOOD_LOW ? 'low' : 'ok';
}
