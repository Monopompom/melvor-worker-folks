// Hire pricing and shared-cap rules. Pure: no game globals.

export const HIRE_GROWTH = 1.2;

export const HIRE_BASE_PRICE = {
  Newbie: 500000,
  Junior: 2500000,
  Middle: 10000000,
  Senior: 40000000,
  Expert: 120000000,
};

/**
 * Price of the next hire of `tier` when `owned` Folks of that tier already
 * exist (promoted Folks count: the price follows what you own, not what you
 * bought). price(n) = base × growth^(n−1) with n = owned + 1, rounded to GP.
 */
export function hirePrice(tier, owned, { base = HIRE_BASE_PRICE, growth = HIRE_GROWTH } = {}) {
  const start = base[tier];
  if (start === undefined) throw new Error(`No base price for tier ${tier}`);
  const n = Math.max(0, Math.floor(owned));
  return Math.round(start * growth ** n);
}

/** Sum of prices for buying `quantity` hires in a row starting at `owned`. */
export function hirePriceForQuantity(tier, owned, quantity, options) {
  let total = 0;
  for (let i = 0; i < quantity; i += 1) total += hirePrice(tier, owned + i, options);
  return total;
}

export const SHIFT_SLOT_BASE = 3000000;
export const SHIFT_SLOT_GROWTH = 1.4;

/** Slot 1 comes with the Trainee licence. Buying slot n (n ≥ 2) costs 3M × 1.4^(n−1). */
export function shiftSlotPrice(purchased, { base = SHIFT_SLOT_BASE, growth = SHIFT_SLOT_GROWTH } = {}) {
  const n = Math.max(0, Math.floor(purchased)) + 2;
  return Math.round(base * growth ** (n - 1));
}

export const SHIFT_SLOT_CAP = { Newbie: 2, Junior: 4, Middle: 7, Senior: 10, Expert: Infinity };

/** Max Shift Slots for the highest licence owned, never above the delegable-skill count. */
export function shiftSlotCap(highestLicence, delegableCount) {
  if (highestLicence === null || highestLicence === undefined) return 0;
  return Math.min(SHIFT_SLOT_CAP[highestLicence] ?? 0, delegableCount);
}

/** Whether another Folk may be hired under the shared cap. */
export function canHireUnderCap(crewSize, cap) {
  return crewSize < cap;
}
