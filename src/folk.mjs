// Folk record model, validation and save-root migrations. Pure: no game globals.

export const TIERS = ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'];
export const SAVE_VERSION = 6;
/**
 * A Folk's travel state: 'idle' stays on its place, 'with' goes along with the player, 'walking' is on its way somewhere
 * alone (Voyage, phase 6). Only 'idle' works.
 */
export const TRAVEL = ['idle', 'with', 'walking'];

const TIER_SET = new Set(TIERS);

export function isTier(tier) {
  return TIER_SET.has(tier);
}

export function tierIndex(tier) {
  return TIERS.indexOf(tier);
}

/** Builds a fresh Folk record. Only id, slot, tier and name are required. */
export function createFolk({ id, slot, tier, name, hiredAt = 0, paid = null }) {
  if (typeof id !== 'string' || id.length === 0) throw new Error('Folk id required');
  if (!Number.isInteger(slot) || slot < 0) throw new Error('Folk slot must be a non-negative integer');
  if (!isTier(tier)) throw new Error(`Unknown tier: ${tier}`);
  if (typeof name !== 'string' || name.length === 0) throw new Error('Folk name required');
  return {
    id,
    slot,
    tier,
    name,
    skillId: null,
    loadout: {},
    debt: 0,
    debtCurrency: null,
    /** Unpaid work time in ms; the Folk strikes once it passes its grace. */
    debtMs: 0,
    onStrike: false,
    cooldownTicks: 0,
    wageCarry: 0,
    overtime: false,
    strikes: 0,
    restartWhenReady: false,
    /** null = full health (max HP depends on the tier). */
    hp: null,
    /** Map hex { q, r } the Folk stands on; null = no place (no Voyage, or hired before 6b). */
    place: null,
    travel: 'idle',
    hiredAt,
    /** Earned traits: held, waiting for a free slot, and the counts toward each (src/traits-model.mjs). */
    traitState: { traits: [], waiting: [], counts: {} },
    /** GP the Folk cost you, its hire and its promotions; the firing severance is a share of it. null = not known. */
    paid: typeof paid === 'number' && Number.isFinite(paid) && paid >= 0 ? paid : null,
  };
}

/** { slotId: { id, qty } } with whole positive quantities; anything else is dropped. */
function normalizeLoadoutShape(raw) {
  const out = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [slot, entry] of Object.entries(raw)) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id === '') continue;
    out[slot] = { id: entry.id, qty: Number.isInteger(entry.qty) && entry.qty > 0 ? entry.qty : 1 };
  }
  return out;
}

/** A plain hex { q, r } with integer coordinates, or null. Never a game object. */
export function normalizePlace(raw) {
  if (raw === null || typeof raw !== 'object' || !Number.isInteger(raw.q) || !Number.isInteger(raw.r)) return null;
  return { q: raw.q, r: raw.r };
}

/** A clean trait state from whatever the save holds: unknown ids stay (a mod that adds them may load later). */
export function normalizeTraitState(raw) {
  const entry = (t) => (t !== null && typeof t === 'object' && typeof t.id === 'string'
    ? (typeof t.skillId === 'string' ? { id: t.id, skillId: t.skillId } : { id: t.id })
    : null);
  const list = (a) => (Array.isArray(a) ? a.map(entry).filter((t) => t !== null) : []);
  const counts = {};
  if (raw?.counts !== null && typeof raw?.counts === 'object') {
    for (const [k, v] of Object.entries(raw.counts)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) counts[k] = v;
  }
  return { traits: list(raw?.traits), waiting: list(raw?.waiting), counts };
}

const nonNegNumber = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * Returns a valid Folk built from an untrusted object, or null when the object
 * cannot be a Folk (missing id/slot/tier/name). Optional fields get defaults.
 */
export function normalizeFolk(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null;
  if (!Number.isInteger(raw.slot) || raw.slot < 0) return null;
  if (!isTier(raw.tier)) return null;
  if (typeof raw.name !== 'string' || raw.name.length === 0) return null;
  const folk = createFolk({ id: raw.id, slot: raw.slot, tier: raw.tier, name: raw.name, hiredAt: nonNegNumber(raw.hiredAt) });
  folk.skillId = typeof raw.skillId === 'string' ? raw.skillId : null;
  folk.loadout = normalizeLoadoutShape(raw.loadout);
  folk.debt = nonNegNumber(raw.debt);
  folk.debtCurrency = folk.debt > 0 && typeof raw.debtCurrency === 'string' ? raw.debtCurrency : null;
  folk.debtMs = folk.debt > 0 ? nonNegNumber(raw.debtMs) : 0;
  folk.onStrike = raw.onStrike === true && folk.debt > 0;
  folk.cooldownTicks = Math.floor(nonNegNumber(raw.cooldownTicks));
  folk.wageCarry = typeof raw.wageCarry === 'number' && raw.wageCarry >= 0 && raw.wageCarry < 1 ? raw.wageCarry : 0;
  folk.overtime = raw.overtime === true;
  folk.strikes = Number.isInteger(raw.strikes) && raw.strikes >= 0 ? raw.strikes : 0;
  folk.restartWhenReady = raw.restartWhenReady === true;
  folk.hp = typeof raw.hp === 'number' && Number.isFinite(raw.hp) && raw.hp >= 0 ? Math.floor(raw.hp) : null;
  folk.place = normalizePlace(raw.place);
  folk.travel = TRAVEL.includes(raw.travel) ? raw.travel : 'idle';
  folk.traitState = normalizeTraitState(raw.traitState);
  folk.paid = typeof raw.paid === 'number' && Number.isFinite(raw.paid) && raw.paid >= 0 ? raw.paid : null;
  return folk;
}

export function createEmptyReserve() {
  return {};
}

/** Payroll Reserve: whole amounts keyed by currency id. */
export function normalizeReserve(raw) {
  const reserve = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return reserve;
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id === 'string' && typeof value === 'number' && Number.isFinite(value) && value > 0) reserve[id] = Math.floor(value);
  }
  return reserve;
}

/** Frozen crew slots after a death: { slotIndex: untilMs }. Expired entries are dropped. */
export function normalizeFrozen(raw, now = 0) {
  const frozen = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return frozen;
  for (const [slot, until] of Object.entries(raw)) {
    const index = Number(slot);
    if (Number.isInteger(index) && index >= 0 && typeof until === 'number' && Number.isFinite(until) && until > now) frozen[index] = Math.floor(until);
  }
  return frozen;
}

export function createEmptyRoot() {
  return { v: SAVE_VERSION, folks: [], reserve: createEmptyReserve(), frozen: {}, board: null };
}

/**
 * Migration steps keyed by the version they upgrade FROM. Each returns a new
 * root at version + 1. Version 0 is a root written before the `v` field existed
 * (`{ folks: [...] }` with no strike/cooldown fields).
 */
export const MIGRATIONS = {
  0: (root) => ({
    v: 1,
    folks: (Array.isArray(root.folks) ? root.folks : []).map((f) => ({
      strikes: 0,
      cooldownEnd: 0,
      debt: 0,
      ...f,
    })),
  }),
  // v2: cooldown measured in ticks instead of wall-clock time; strike counters; reserve.
  1: (root) => ({
    v: 2,
    folks: (Array.isArray(root.folks) ? root.folks : []).map(({ cooldownEnd, ...f }) => ({
      ...f,
      cooldownTicks: typeof cooldownEnd === 'number' && cooldownEnd > Date.now() ? Math.floor((cooldownEnd - Date.now()) / 50) : 0,
      debtMs: 0,
      onStrike: typeof f.debt === 'number' && f.debt > 0,
      wageCarry: 0,
    })),
    reserve: {},
  }),
  // v3: Folk hitpoints (null = full) and frozen slots after a death.
  2: (root) => ({
    ...root,
    v: 3,
    folks: (Array.isArray(root.folks) ? root.folks : []).map((f) => ({ ...f, hp: null, restartWhenReady: false })),
    frozen: {},
  }),
  // v4: a place on the map and a travel state (Voyage phase 6). No place = as before.
  3: (root) => ({
    ...root,
    v: 4,
    folks: (Array.isArray(root.folks) ? root.folks : []).map((f) => ({ ...f, place: null, travel: 'idle' })),
  }),
  // v5: earned traits, every Folk from zero.
  4: (root) => ({
    ...root,
    v: 5,
    folks: (Array.isArray(root.folks) ? root.folks : []).map((f) => ({ ...f, traitState: { traits: [], waiting: [], counts: {} } })),
  }),
  // v6: what each Folk cost (the firing severance). Unknown for a Folk hired before: the game fills in its tier's
  // first-hire price once at load.
  5: (root) => ({
    ...root,
    v: 6,
    folks: (Array.isArray(root.folks) ? root.folks : []).map((f) => ({ ...f, paid: null })),
  }),
};

/**
 * Upgrades a root step by step to SAVE_VERSION. Returns { root, applied } where
 * `applied` lists the versions migrated from. A root newer than SAVE_VERSION is
 * returned untouched (forward compatible: unknown fields are ignored on read).
 */
export function migrateRoot(input) {
  let root = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : createEmptyRoot();
  let version = Number.isInteger(root.v) ? root.v : 0;
  const applied = [];
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) throw new Error(`No migration from Worker Folks save version ${version}`);
    root = step(root);
    applied.push(version);
    version = Number.isInteger(root.v) ? root.v : version + 1;
  }
  return { root, applied };
}

/**
 * Parses a serialised root (JSON string or object), migrates it and validates
 * every Folk. Never throws: a corrupt input yields an empty crew. Duplicate ids
 * or slots keep the first occurrence.
 */
export function parseRoot(input) {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return { root: createEmptyRoot(), applied: [], dropped: 0, corrupt: true };
    }
  }
  let migrated;
  try {
    migrated = migrateRoot(raw);
  } catch {
    return { root: createEmptyRoot(), applied: [], dropped: 0, corrupt: true };
  }
  const folks = [];
  const ids = new Set();
  const slots = new Set();
  let dropped = 0;
  const list = Array.isArray(migrated.root.folks) ? migrated.root.folks : [];
  for (const entry of list) {
    const folk = normalizeFolk(entry);
    if (folk === null || ids.has(folk.id) || slots.has(folk.slot)) {
      dropped += 1;
      continue;
    }
    ids.add(folk.id);
    slots.add(folk.slot);
    folks.push(folk);
  }
  folks.sort((a, b) => a.slot - b.slot);
  const reserve = normalizeReserve(migrated.root.reserve);
  const frozen = normalizeFrozen(migrated.root.frozen);
  // The Work Orders board, kept as saved: its own model checks it when the game loads (no board yet: null).
  const saved = migrated.root.board;
  const board = saved !== null && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
  return { root: { v: SAVE_VERSION, folks, reserve, frozen, board }, applied: migrated.applied, dropped, corrupt: false };
}

export function serializeRoot(folks, reserve = {}, frozen = {}, board = null) {
  return JSON.stringify({ v: SAVE_VERSION, folks, reserve, frozen, board });
}
