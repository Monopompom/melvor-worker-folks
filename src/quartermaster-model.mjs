// The Quartermaster job (joint order round 3): a Folk keeps your combat slots filled from your bank. Which slots it
// watches and how often it looks go by its tier; each slot type fills to a line you set. Pure: no game globals.

export const JOB_ID = 'worker_folks:Quartermaster';
/** Hiring level the job opens at. */
export const UNLOCK_LEVEL = 45;

/** The slot types, in the order they open by tier. Runes and potions are left out: the game takes those from the bank. */
export const KINDS = ['food', 'ammo', 'summon', 'consumable'];
const KINDS_BY_TIER = {
  Newbie: ['food'],
  Junior: ['food', 'ammo'],
  Middle: ['food', 'ammo', 'summon'],
  Senior: KINDS,
  Expert: KINDS,
};
/** How often the Folk looks over your slots, in ms. */
export const CHECK_MS_BY_TIER = { Newbie: 30000, Junior: 20000, Middle: 15000, Senior: 10000, Expert: 5000 };

/** The lines a slot type may fill to (settings), and the default for each. */
export const LINE_CHOICES = {
  food: [50, 100, 200, 500, 1000, 2500, 5000],
  ammo: [250, 500, 1000, 2000, 5000, 10000],
  summon: [100, 250, 500, 1000, 2500, 5000],
  consumable: [10, 25, 50, 100, 250, 500, 1000],
};
export const DEFAULT_LINES = { food: 200, ammo: 1000, summon: 500, consumable: 100 };

export function watches(tier) {
  return KINDS_BY_TIER[tier] ?? [];
}

export function checkMs(tier) {
  return CHECK_MS_BY_TIER[tier] ?? CHECK_MS_BY_TIER.Newbie;
}

/** A setting's value as a line: one of the choices, else the default. */
export function lineOf(kind, raw) {
  const n = Number(raw);
  return LINE_CHOICES[kind]?.includes(n) ? n : DEFAULT_LINES[kind];
}

/**
 * The game refuses any equip inside a dungeon or a stronghold unless swapping is allowed there, and in the Golbin
 * Raid; the Quartermaster keeps the same rule.
 */
export function equipBlocked({ areaType = null, dungeonSwap = 0, strongholdSwap = 0, raid = false } = {}) {
  if (raid) return true;
  if (areaType === 'Dungeon') return !(dungeonSwap > 0);
  if (areaType === 'Stronghold') return !(strongholdSwap > 0);
  return false;
}

/**
 * The item each watched slot holds, kept when the slot runs empty, so the Folk refills it with the same item (never
 * "the next best food"). `slots`: [{ key, itemId }] with itemId null for an empty slot.
 */
export function remember(memory, slots) {
  const out = { ...memory };
  for (const s of slots) if (typeof s.itemId === 'string' && s.itemId !== '') out[s.key] = s.itemId;
  return out;
}

/**
 * One look over your slots. `slots`: [{ key, kind, itemId (null when empty), qty, bank }] where `bank` is how many of
 * the item the slot holds (or last held, from `memory`) are in your bank. Only the kinds the tier watches count.
 * Returns { refills: [{ key, kind, itemId, add, empty }], out: [{ key, kind, itemId }] }: what to move from the bank,
 * and the slots under their line with none of their item left.
 */
export function plan(slots, { tier, lines = DEFAULT_LINES, memory = {} }) {
  const watched = new Set(watches(tier));
  const refills = [];
  const out = [];
  for (const s of slots) {
    if (!watched.has(s.kind)) continue;
    const empty = !(typeof s.itemId === 'string' && s.itemId !== '');
    const itemId = empty ? memory[s.key] : s.itemId;
    if (itemId === undefined) continue;
    const qty = empty ? 0 : Math.max(0, Math.floor(s.qty ?? 0));
    const line = lineOf(s.kind, lines[s.kind]);
    if (qty >= line) continue;
    const add = Math.min(line - qty, Math.max(0, Math.floor(s.bank ?? 0)));
    if (add > 0) refills.push({ key: s.key, kind: s.kind, itemId, add, empty });
    else out.push({ key: s.key, kind: s.kind, itemId });
  }
  return { refills, out };
}
