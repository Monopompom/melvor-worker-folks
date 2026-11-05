// Guild Heirlooms: six rare pieces of Folk gear, found by Folk actions once the town has a Guild Hall. One of each at
// a time: a find picks among the heirlooms no one holds, so one lost (with a Folk, on a full bank) or sold can turn up
// again. Worn by Folks only (no game modifiers on the items): the mod reads
// the slot and adds the heirloom's effect to the wearer's trait effects, as the bags size a Folk's room. Pure.

/** The six, in the item log's order. `effects` use the traits' keys (percent; wage and cooldown become factors). */
export const HEIRLOOMS = Object.freeze([
  { id: 'Golden_Hardhat', slot: 'Helmet', media: 'assets/heirloom_golden_hardhat.webp', effects: { masteryXP: 15 } },
  { id: 'Lucky_Apron', slot: 'Platebody', media: 'assets/heirloom_lucky_apron.webp', effects: { doubling: 4 } },
  { id: 'Guild_Ledger', slot: 'Platelegs', media: 'assets/heirloom_guild_ledger.webp', effects: { wage: -15 } },
  { id: 'Union_Charter', slot: 'Boots', media: 'assets/heirloom_union_charter.webp', effects: { tiersOff: 1 } },
  { id: 'Foremans_Whistle', slot: 'Amulet', media: 'assets/heirloom_foremans_whistle.webp', effects: { interval: -5 } },
  { id: 'Timekeepers_Bell', slot: 'Ring', media: 'assets/heirloom_timekeepers_bell.webp', effects: { cooldown: -30 } },
]);
export const HEIRLOOM_IDS = Object.freeze(HEIRLOOMS.map((h) => h.id));
const BY_ID = new Map(HEIRLOOMS.map((h) => [h.id, h]));

/** One find in 500,000 Folk actions with one Guild Hall; the town's buildings raise it (`heirloomFind`, percent). */
export const BASE_CHANCE = 1 / 500_000;
/** The tiers that roll: an Apprentice and up (a Trainee's actions find nothing). */
export const ROLLING_TIERS = Object.freeze(['Junior', 'Middle', 'Senior', 'Expert']);

/** The local id of a full item id in our namespace, or undefined when it is no heirloom. */
export function heirloomOf(itemId, namespace = 'worker_folks') {
  const prefix = `${namespace}:`;
  if (typeof itemId !== 'string' || !itemId.startsWith(prefix)) return undefined;
  return BY_ID.get(itemId.slice(prefix.length));
}

/** Chance per Folk action: the base times 1 + the town's find percent; 0 without a Guild Hall or with nothing left. */
export function findChance({ tier, hallBuilt, findPercent = 0, missing = 0 }) {
  if (!hallBuilt || missing <= 0 || !ROLLING_TIERS.includes(tier)) return 0;
  return BASE_CHANCE * findMultiplier(findPercent);
}

/** "×1.6": what the town's buildings make of the base chance. */
export function findMultiplier(findPercent = 0) {
  return 1 + Math.max(0, Number(findPercent) || 0) / 100;
}

/** The heirlooms a find can give: those not held now (`held(id)`: in the bank, worn by a Folk or by you). */
export function missingHeirlooms(held = () => false) {
  return HEIRLOOM_IDS.filter((id) => !held(id));
}

/** Which missing heirloom a find gives (`rng` in [0, 1)); undefined when none is. */
export function pickHeirloom(missing, rng = Math.random) {
  const list = (missing ?? []).filter((id) => BY_ID.has(id));
  if (list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/**
 * What the worn heirlooms (full item ids) add up to, in the traits' effects shape (src/traits-model.mjs effectsOf),
 * plus `tiersOff` for qualification. Unknown ids add nothing.
 */
export function effectsOf(wornIds, namespace = 'worker_folks') {
  const out = {
    interval: 0, xp: 0, preservation: 0, doubling: 0, masteryXP: 0,
    wageFactor: 1, overtimeWageFactor: 1, graceFactor: 1, cooldownFactor: 1, neverStrikes: false, tiersOff: 0,
  };
  const seen = new Set();
  for (const id of wornIds ?? []) {
    const h = heirloomOf(id, namespace);
    if (h === undefined || seen.has(h.id)) continue;
    seen.add(h.id);
    const e = h.effects;
    out.interval += e.interval ?? 0;
    out.doubling += e.doubling ?? 0;
    out.masteryXP += e.masteryXP ?? 0;
    out.tiersOff += e.tiersOff ?? 0;
    if (e.wage !== undefined) out.wageFactor *= 1 + e.wage / 100;
    if (e.cooldown !== undefined) out.cooldownFactor *= 1 + e.cooldown / 100;
  }
  return out;
}

/** Two effect objects of that shape added up: sums for the percents, products for the factors. */
export function addEffects(a, b) {
  if (b === undefined || b === null) return a;
  const out = { ...a };
  for (const key of ['interval', 'xp', 'preservation', 'doubling', 'masteryXP', 'tiersOff']) {
    if (a?.[key] !== undefined || b[key] !== undefined) out[key] = (a?.[key] ?? 0) + (b[key] ?? 0);
  }
  for (const key of ['wageFactor', 'overtimeWageFactor', 'graceFactor', 'cooldownFactor']) {
    out[key] = (a?.[key] ?? 1) * (b[key] ?? 1);
  }
  out.neverStrikes = a?.neverStrikes === true || b.neverStrikes === true;
  return out;
}

/**
 * The items' data package: Equipment for one slot each, no modifiers (the mod reads the slot), counted in the
 * completion log. `text(id)` gives { name, description }.
 */
export function heirloomPackage(text = (id) => ({ name: id, description: '' })) {
  return {
    items: HEIRLOOMS.map((h) => ({
      itemType: 'Equipment',
      id: h.id,
      name: text(h.id).name,
      customDescription: text(h.id).description,
      category: 'Hiring',
      type: 'Heirloom',
      media: h.media,
      ignoreCompletion: false,
      obtainFromItemLog: false,
      golbinRaidExclusive: false,
      sellsFor: 1_000_000,
      validSlots: [h.slot],
      occupiesSlots: [],
      equipRequirements: [],
      equipmentStats: [],
    })),
  };
}
