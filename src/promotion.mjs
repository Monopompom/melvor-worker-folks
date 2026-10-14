// Promotion rules. Pure: no game globals.

export const NEXT_TIER = { Newbie: 'Junior', Junior: 'Middle', Middle: 'Senior', Senior: 'Expert', Expert: null };
export const MASTERY_GATE = { Junior: 20, Middle: 40, Senior: 60, Expert: 80 };
export const PROMOTION_COST_RATE = 0.6;
/** Diploma item by target tier; Expert differs with Throne of the Herald. */
export function diplomaFor(targetTier, { hasTotH = false } = {}) {
  switch (targetTier) {
    case 'Junior': return 'melvorD:Amulet_of_Torture';
    case 'Middle': return 'melvorD:Amulet_of_Fury';
    case 'Senior': return 'melvorF:Infernal_Core';
    case 'Expert': return hasTotH ? 'melvorTotH:FrostSpark_Amulet' : 'melvorF:Elder_Crown';
    default: return null;
  }
}

export function promotionCost(nextHirePrice, rate = PROMOTION_COST_RATE) {
  return Math.ceil(nextHirePrice * rate);
}

/**
 * Everything the promotion modal needs. `blockers` lists unmet requirements in
 * display order: 'top', 'level', 'licence', 'mastery', 'diploma', 'gp'. `hiringLevel` /
 * `promotionLevel` gate every promotion on the Hiring skill level; `costRate` defaults to 60%.
 */
export function promotionPlan({ tier, masteryLevel, hasLicence, nextHirePrice, hasDiploma, gp, hiringLevel = Infinity, promotionLevel = 0, costRate = PROMOTION_COST_RATE }) {
  const nextTier = NEXT_TIER[tier] ?? null;
  if (nextTier === null) return { nextTier: null, cost: 0, gate: null, blockers: ['top'], ok: false };
  const cost = promotionCost(nextHirePrice, costRate);
  const gate = MASTERY_GATE[nextTier];
  const blockers = [];
  if (hiringLevel < promotionLevel) blockers.push('level');
  if (!hasLicence) blockers.push('licence');
  if (masteryLevel < gate) blockers.push('mastery');
  if (!hasDiploma) blockers.push('diploma');
  if (gp < cost) blockers.push('gp');
  return { nextTier, cost, gate, blockers, ok: blockers.length === 0 };
}
