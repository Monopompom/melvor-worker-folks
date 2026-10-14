// Consumption rules for Folk loadouts: preservation clamps, stack depletion,
// once-per-action bookkeeping, which item conditions a Folk evaluates. Pure.

/** The engine clamps every preservation roll to 0–80 %. */
export const MAX_PRESERVATION = 80;
export const SUMMON_SLOTS = ['melvorD:Summon1', 'melvorD:Summon2'];
export const CONSUMABLE_SLOT = 'melvorD:Consumable';
/** Item conditions a Folk can satisfy on its own (bank and charge pools are shared with the player). */
export const FOLK_CONDITION_TYPES = ['ItemCharge', 'ItemInBank'];

export function clampPreservation(chance) {
  const n = Number(chance);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_PRESERVATION, Math.max(0, n));
}

/** Tablet preservation like Player.getSummoningTabletPreservationChance: chance + bypass, clamped. */
export function tabletPreservation({ chance = 0, bypass = 0, alwaysPreserve = false } = {}) {
  if (alwaysPreserve) return 100;
  return clampPreservation((Number(chance) || 0) + (Number(bypass) || 0));
}

/** What kind of consumption a slot gets. */
export function slotKind(slotId) {
  if (SUMMON_SLOTS.includes(slotId)) return 'summon';
  if (slotId === CONSUMABLE_SLOT) return 'consumable';
  return 'quantity';
}

/** Removes one from a stack: { qty, emptied }. */
export function consumeOne(qty) {
  const n = Number.isInteger(qty) ? qty : 0;
  const left = Math.max(0, n - 1);
  return { qty: left, emptied: left === 0 };
}

/**
 * Guards one consumption per slot per action: the Folk's own tablet handler and a
 * synergy handler may both fire on the same event, and a 'bonus' outcome runs the
 * reward body twice. Returns true the first time a key is seen in this action.
 */
export function firstThisAction(seen, key) {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function folkEvaluatesCondition(type) {
  return FOLK_CONDITION_TYPES.includes(type);
}

/** A charge change matters to a Folk table only when it crosses zero for an item the Folk wears. */
export function chargeChangeInvalidates({ oldCharges, newCharges, worn }) {
  if (!worn) return false;
  return (oldCharges <= 0) !== (newCharges <= 0);
}
