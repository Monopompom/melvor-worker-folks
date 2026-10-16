// Loadout rules: which slots a tier opens, item filters, save validation. Pure.

const S = (local) => `melvorD:${local}`;
export const SLOT_ORDER = [
  S('Cape'), S('Gloves'), S('Helmet'), S('Platebody'), S('Platelegs'), S('Boots'),
  S('Amulet'), S('Ring'), S('Consumable'), S('Summon1'), S('Summon2'),
  S('Gem'), S('Enhancement1'), S('Enhancement2'), S('Enhancement3'),
];
export const SLOTS_BY_TIER = {
  Newbie: [S('Cape'), S('Gloves')],
  Junior: [S('Helmet'), S('Platebody'), S('Platelegs'), S('Boots')],
  Middle: [S('Amulet'), S('Ring'), S('Consumable')],
  Senior: [S('Summon1'), S('Summon2')],
  Expert: [S('Gem'), S('Enhancement1'), S('Enhancement2'), S('Enhancement3')],
};
const TIERS = ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'];
const EXPANSION_SLOTS = { [S('Gem')]: 'hasAoD', [S('Enhancement1')]: 'hasItA', [S('Enhancement2')]: 'hasItA', [S('Enhancement3')]: 'hasItA' };

/** Slots open to a tier (cumulative), in display order; expansion slots only when present. */
export function slotsForTier(tier, { hasAoD = false, hasItA = false } = {}) {
  const index = TIERS.indexOf(tier);
  if (index < 0) throw new Error(`Unknown tier: ${tier}`);
  const open = new Set();
  for (let i = 0; i <= index; i += 1) SLOTS_BY_TIER[TIERS[i]].forEach((s) => open.add(s));
  const flags = { hasAoD, hasItA };
  return SLOT_ORDER.filter((s) => open.has(s) && (EXPANSION_SLOTS[s] === undefined || flags[EXPANSION_SLOTS[s]]));
}

/**
 * Hiring gear (the mod's own items: outfit, capes, Lesser Relic) is worn by the player; its
 * modifiers are read from the player's table and its charges spent there, so a Folk can never
 * hold it. Everything else may go into a loadout.
 */
export const OWN_NAMESPACE = 'worker_folks';
export function isFolkGear(itemId, ownNamespace = OWN_NAMESPACE) {
  return typeof itemId === 'string' && !itemId.startsWith(`${ownNamespace}:`);
}

/** Picker default: hide items whose only effects are combat effects. */
export function isSkillingItem({ hasNonCombatModifier = false, providesRunes = false, hasSynergy = false, isSummon = false, isConsumable = false }) {
  return hasNonCombatModifier || providesRunes || hasSynergy || isSummon || isConsumable;
}

/**
 * Narrowed picker for a Folk that already has a skill: does the item help that skill?
 * `scopes` holds one entry per non-combat modifier the item brings (its own, conditional,
 * item-synergy and familiar-synergy ones): the skill id it is scoped to, or null when it
 * applies to every skill. Familiars count through the skills their recipe lists; rune
 * providers only for Magic.
 */
export function helpsSkill({ scopes = [], familiarSkillIds = [], providesRunes = false, skillId, magicSkillId = 'melvorD:Magic' }) {
  if (typeof skillId !== 'string') return false;
  if (scopes.some((s) => s === null || s === skillId)) return true;
  if (familiarSkillIds.includes(skillId)) return true;
  return providesRunes && skillId === magicSkillId;
}

/** Validates a saved loadout object: { slotId: { id, qty } } with whole positive quantities. */
export function normalizeLoadout(raw) {
  const out = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [slot, entry] of Object.entries(raw)) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id === '') continue;
    const qty = Number.isInteger(entry.qty) && entry.qty > 0 ? entry.qty : 1;
    out[slot] = { id: entry.id, qty };
  }
  return out;
}

/**
 * On load: entries in slots the tier does not open, items a Folk may not hold (isFolkGear),
 * or whose item no longer exists, leave the loadout. Returns what to give back to the bank
 * and what is simply lost.
 */
export function reconcileLoadout(loadout, { allowedSlots, itemExists, allowedItem = isFolkGear }) {
  const kept = {};
  const returned = [];
  const dropped = [];
  const allowed = new Set(allowedSlots);
  for (const [slot, entry] of Object.entries(loadout)) {
    if (!itemExists(entry.id)) dropped.push({ slot, ...entry });
    else if (!allowed.has(slot) || !allowedItem(entry.id)) returned.push({ slot, ...entry });
    else kept[slot] = entry;
  }
  return { kept, returned, dropped };
}

/** Quantity actually equipped: 1 unless the slot allows a stack. */
export function equipQuantity(requested, { allowQuantity, available }) {
  if (!allowQuantity) return available > 0 ? 1 : 0;
  const q = Math.floor(Number(requested));
  if (!(q > 0)) return 0;
  return Math.min(q, available);
}

/**
 * What a Folk wears, for the card's Gear button and the Worker popup (build .54): `tiles` are the gear modal's slot
 * tiles ({ name, media, qty, charges, empty }). Filled of open slots, the worn ones, and the worn ones that ran out
 * (charge items at 0 charges; a used-up stack leaves its slot empty instead).
 */
export function gearSummary(tiles) {
  const worn = (tiles ?? []).filter((t) => !t.empty);
  return { filled: worn.length, open: (tiles ?? []).length, worn, out: worn.filter((t) => t.charges === 0) };
}
