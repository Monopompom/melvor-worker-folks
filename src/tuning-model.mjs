// Tuning settings: the knobs a player may turn in Mod Settings, their limits, and pricing and wage rules that read
// them. Each knob goes either way from today's value, which stays the default (the user, 24 Nov 2026). Pure: no game
// globals, so the limits and the tuned prices are tested in Node.

/**
 * section: the Mod Settings section it is listed in (its name is the saved key).
 * percent: shown and typed as a percentage, used as a share (5 → 0.05).
 * whole: a whole number (GP).
 */
export const KNOBS = [
  { name: 'hirePriceGrowth', section: 'Hiring', default: 1.2, min: 1.05, max: 2 },
  { name: 'slotPriceGrowth', section: 'Hiring', default: 1.4, min: 1.1, max: 2.5 },
  { name: 'slotBasePrice', section: 'Hiring', default: 3000000, min: 300000, max: 30000000, whole: true },
  { name: 'priceMultiplier', section: 'Hiring', default: 1, min: 0.1, max: 5 },
  { name: 'severanceRate', section: 'Wages', default: 5, min: 0, max: 25, percent: true },
  { name: 'apologyMultiplier', section: 'Wages', default: 3, min: 1, max: 10 },
  { name: 'strikeCooldown', section: 'Wages', default: 1, min: 0.25, max: 4 },
];

/** Alt. Magic held by Folks: a switch, on by default (as before the setting). */
export const ALT_MAGIC = { name: 'altMagicForFolks', section: 'Hiring', default: true };
export const ALT_MAGIC_ID = 'melvorD:Magic';

export const knobOf = (name) => KNOBS.find((k) => k.name === name);

/** True when `value` is a number the knob takes: inside its limits, whole where it must be. */
export function validKnob(knob, value) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return false;
  const v = Number(value);
  if (!Number.isFinite(v) || v < knob.min || v > knob.max) return false;
  return knob.whole !== true || Number.isInteger(v);
}

/** The value in use for a stored one: the stored value when valid, else the nearest limit, else the default. */
export function knobValue(knob, stored) {
  if (validKnob(knob, stored)) return Number(stored);
  const v = Number(stored);
  if (stored === '' || stored === null || stored === undefined || typeof stored === 'boolean' || !Number.isFinite(v)) return knob.default;
  const clamped = Math.min(knob.max, Math.max(knob.min, v));
  return knob.whole === true ? Math.round(clamped) : clamped;
}

/** What the rules use: a percentage knob as a share. */
export function knobFactor(knob, value) {
  return knob.percent === true ? value / 100 : value;
}

/** True when every knob is at its default and Alt. Magic is on: the mod plays as it did before the settings. */
export function atDefaults(read) {
  return KNOBS.every((k) => read(k.name) === k.default) && read(ALT_MAGIC.name) !== false;
}

/**
 * The pricing module with the knobs applied: hire growth, Shift Slot growth and base, and the price multiplier on
 * hires and slots (licences take it in the Shop's cost patch). `read(name)` returns the value in use (knobValue).
 * Severance, promotion and Forget costs follow, as they are shares of the next hire's price.
 */
export function tunedPricing(pricing, read) {
  const multiplier = () => read('priceMultiplier');
  const hireBase = () => {
    const m = multiplier();
    return Object.fromEntries(Object.entries(pricing.HIRE_BASE_PRICE).map(([tier, gp]) => [tier, gp * m]));
  };
  const hireOptions = (options = {}) => ({ base: hireBase(), growth: read('hirePriceGrowth'), ...options });
  return {
    ...pricing,
    priceMultiplier: multiplier,
    /** Each tier's first-hire price with the multiplier, as HIRE_BASE_PRICE is laid out (the API's rules read it). */
    hireBasePrice: hireBase,
    hireGrowth: () => read('hirePriceGrowth'),
    slotGrowth: () => read('slotPriceGrowth'),
    hirePrice: (tier, owned, options) => pricing.hirePrice(tier, owned, hireOptions(options)),
    hirePriceForQuantity: (tier, owned, quantity, options) => pricing.hirePriceForQuantity(tier, owned, quantity, hireOptions(options)),
    shiftSlotPrice: (purchased, options = {}) => pricing.shiftSlotPrice(purchased, { base: read('slotBasePrice') * multiplier(), growth: read('slotPriceGrowth'), ...options }),
  };
}

/** The wages module with the severance, apology and cooldown knobs applied. */
export function tunedWages(wages, read) {
  const rate = () => knobFactor(knobOf('severanceRate'), read('severanceRate'));
  return {
    ...wages,
    severanceRate: rate,
    apologyMultiplier: () => read('apologyMultiplier'),
    cooldownFactor: () => read('strikeCooldown'),
    severance: (nextHirePrice) => wages.severance(nextHirePrice, rate()),
    settlement: (debt, nextHirePrice, options = {}) => wages.settlement(debt, nextHirePrice, { rate: rate(), apologyMultiplier: read('apologyMultiplier'), ...options }),
    cooldownAfterSettlement: (tier, options = {}) => wages.cooldownAfterSettlement(tier, { factor: read('strikeCooldown'), ...options }),
  };
}

/** A growth factor as the percentage the Shop's text says it rises by: 1.2 → 20 (to a tenth). */
export function growthPercent(growth) {
  return Math.round((growth - 1) * 1000) / 10;
}
