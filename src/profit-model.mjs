// Net GP per hour for a Folk on a recipe, as the Worker popup shows it before you pick. Pure: no game globals.
// What a recipe makes and costs is read from the game as the Folk (its modifiers); this file turns those reads into
// an hour's sums. An estimate: items are valued at their sale price, and Work Orders, commissions, rare finds and XP
// are left out.

export const MS_PER_HOUR = 3_600_000;

const pct = (v) => Math.min(100, Math.max(0, Number(v) || 0)) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * The expected quantity of a primary product for one action, worked out the way the game rolls it
 * (Skill.modifyPrimaryProductQuantity in 1.3.1): flat base, a +1 chance, a percent on the base (rounded down), the
 * doubling chance, whole doublings, a flat addition and the +1/+2/+3/+5/+8 chances. Never below 1, as in the game.
 */
export function expectedPrimaryQuantity({
  base, flatBase = 0, plusOneChance = 0, basePercent = 0, doublingChance = 0, doublePowers = 0,
  flatAdditional = 0, additionalChances = {},
}) {
  const plusOne = pct(plusOneChance);
  const doubling = pct(doublingChance);
  const powers = 2 ** Math.max(0, num(doublePowers));
  const add = Math.max(0, num(flatAdditional));
  const extra = Object.entries(additionalChances).reduce((sum, [k, chance]) => sum + num(k) * pct(chance), 0);
  let total = 0;
  for (const [x, px] of [[0, 1 - plusOne], [1, plusOne]]) {
    if (px === 0) continue;
    const q0 = Math.floor((num(base) + num(flatBase) + x) * (1 + num(basePercent) / 100));
    for (const [d, pd] of [[1, 1 - doubling], [2, doubling]]) {
      if (pd === 0) continue;
      total += px * pd * Math.max(1, q0 * d * powers + add + extra);
    }
  }
  return total;
}

/**
 * A Folk's Produce Rate as odds: below 100 an action succeeds with that chance, above 100 it always succeeds and
 * the excess is the chance of a second batch. `batches` is the expected number of batches on a success.
 */
export function folkYield(rate) {
  const r = Math.max(0, num(rate));
  return { chance: Math.min(r, 100) / 100, batches: r > 100 ? r / 100 : 1 };
}

const sum = (list) => (Array.isArray(list) ? list : []).reduce((s, e) => s + Math.max(0, num(e?.qty)) * Math.max(0, num(e?.value)), 0);

/**
 * An hour's sums for one Folk on one recipe, or null when the action has no time.
 *  intervalMs    one action's time, as the Folk
 *  outputs       [{ qty, value }] made by one successful batch; value is GP per unit (a GP reward is qty GP at 1)
 *  inputs        [{ qty, value }] taken by one action, at sale price (GP costs at 1)
 *  preservation  the Folk's chance, in %, to keep an action's inputs
 *  chance        the chance an action gives anything (Produce Rate, a Thieving NPC, a Cooking burn)
 *  batches       expected batches on a success (Produce Rate over 100)
 *  failExtraMs   time a failed action adds (a Thieving stun)
 *  wagePerHour   the Folk's GP wage for an hour of work
 * Returns { actionsPerHour, makes, spends, wage, net }, all per hour.
 */
export function netPerHour({ intervalMs, outputs = [], inputs = [], preservation = 0, chance = 1, batches = 1, failExtraMs = 0, wagePerHour = 0 }) {
  const interval = num(intervalMs);
  if (!(interval > 0)) return null;
  const c = Math.min(1, Math.max(0, num(chance)));
  const msPerAction = interval + (1 - c) * Math.max(0, num(failExtraMs));
  const actionsPerHour = MS_PER_HOUR / msPerAction;
  const makes = actionsPerHour * c * Math.max(0, num(batches)) * sum(outputs);
  const spends = actionsPerHour * (1 - pct(preservation)) * sum(inputs);
  const wage = Math.max(0, num(wagePerHour));
  return { actionsPerHour, makes, spends, wage, net: makes - spends - wage };
}
