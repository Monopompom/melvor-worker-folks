// Worker Folks backup codes (the user, 5 Nov 2026: the same backup as Voyage's, export code only, nothing automatic).
// The game keeps a skill's save only while its mod is loaded: one save made with Worker Folks off, uninstalled or
// failing to load throws away the Hiring block (the crew, their gear, rooms and places, wages owed, Work Orders,
// Township Commissions), and with it every Worker Folks item, shop purchase, Township building and the pet (the game
// keeps placeholders for its own `melvor` content only). A backup is the player's own copy of all of it.
//
// Pure: the backup's shape, its checksum, the text code (deflated and base64), its checks on the way back in, and what
// a restore adds, returns and replaces. The game side (reading the game, the popups, saving and reloading) is
// src/backup.mjs; covered by tests/backup-model.test.mjs.

/** The code's first word, so a pasted text is known for what it is. `z` deflated, `j` plain JSON (no CompressionStream). */
export const PREFIX = 'FOLKS-BACKUP';
export const FORMAT = 1;
export const NS = 'worker_folks';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const amount = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
const isId = (id) => typeof id === 'string' && id !== '' && id.length <= 120;
const ours = (id) => isId(id) && id.startsWith(`${NS}:`);

/** FNV-1a, 32 bits, as 8 hex digits: a typo or a cut code, not tampering (the player owns the save anyway). */
export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Only whole positive counts under this mod's ids: its bank items or its shop purchases. */
export function counts(map) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [id, n] of Object.entries(map)) if (ours(id) && count(n) > 0) out[id] = count(n);
  return out;
}

/** Whole positive counts under any ids: the bank snapshot of what the crew holds. */
export function anyCounts(map) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [id, n] of Object.entries(map)) if (isId(id) && count(n) > 0) out[id] = count(n);
  return out;
}

/** { id: xp } with positive finite amounts, any namespace (mastery by Folk slot, the pool by realm). */
export function xpMap(map) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [id, xp] of Object.entries(map)) if (isId(id) && amount(xp) > 0) out[id] = amount(xp);
  return out;
}

/** Ancient relics found, { realmId: { relicId: count } }; realms without one are left out. */
export function relicMap(map) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [realm, found] of Object.entries(map)) {
    if (!isId(realm) || !isObj(found)) continue;
    const inner = {};
    for (const [id, n] of Object.entries(found)) if (isId(id) && count(n) > 0) inner[id] = count(n);
    if (Object.keys(inner).length > 0) out[realm] = inner;
  }
  return out;
}

const efficiency = (e) => (Number.isFinite(e) ? Math.min(100, Math.max(0, Math.round(e))) : 100);

/**
 * This mod's Township buildings (the Guild Hall, the Guild Square, the story decorations) by biome:
 * { biomeId: { buildingId: { n, eff } } }. The biome may be the game's; the building must be ours.
 */
export function buildingMap(map) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [biome, built] of Object.entries(map)) {
    if (!isId(biome) || !isObj(built)) continue;
    const inner = {};
    for (const [id, b] of Object.entries(built)) if (ours(id) && isObj(b) && count(b.n) > 0) inner[id] = { n: count(b.n), eff: efficiency(b.eff) };
    if (Object.keys(inner).length > 0) out[biome] = inner;
  }
  return out;
}

const idList = (list) => [...new Set((Array.isArray(list) ? list : []).filter(ours))];
const cap = (n) => (Number.isInteger(n) && n > 0 ? n : null);

/**
 * The backup: `record` the Hiring save as its JSON text (so the save's own migrations read an older one back), `xp`,
 * `abyssalXP`, `unlocked`, `caps` { level, abyssal } (Ancient Relics raises them), `mastery` { slotActionId: xp },
 * `pool` { realmId: xp }, `relics` (relicMap), `items` this mod's items in the bank and worn, `buys` its shop
 * purchases, `buildings` (buildingMap), `pets` its pets found, `settings` by name, `bank` how many of each item the
 * crew holds sat in the bank then (see takes); `name` and `mode` the character, `mod` and `build` who wrote it, `save`
 * the record's version, `at` when (ms).
 */
export function make({ record, xp, abyssalXP, unlocked, caps, mastery, pool, relics, items, buys, buildings, pets, settings, bank, name, mode, mod, build, save, at }) {
  return {
    f: FORMAT,
    mod: String(mod ?? ''),
    build: String(build ?? ''),
    save: count(save),
    at: count(at),
    name: String(name ?? ''),
    mode: String(mode ?? ''),
    xp: amount(xp),
    abyssalXP: amount(abyssalXP),
    unlocked: unlocked === true,
    caps: { level: cap(caps?.level), abyssal: cap(caps?.abyssal) },
    record: String(record ?? ''),
    mastery: xpMap(mastery),
    pool: xpMap(pool),
    relics: relicMap(relics),
    items: counts(items),
    buys: counts(buys),
    buildings: buildingMap(buildings),
    pets: idList(pets),
    settings: isObj(settings) ? { ...settings } : {},
    bank: anyCounts(bank),
  };
}

/** The text the code carries: the backup and its checksum. */
export const seal = (backup) => {
  const body = JSON.stringify(backup);
  return JSON.stringify({ body, sum: checksum(body) });
};

/**
 * A sealed text back to a backup: { backup } or { why } ('broken', 'checksum', 'format', 'newer', 'record').
 * `saveVersion` the record version this build reads: a newer one is refused, an older one migrates on restore.
 */
export function open(sealed, saveVersion) {
  let outer;
  try { outer = JSON.parse(sealed); } catch { return { why: 'broken' }; }
  if (!isObj(outer) || typeof outer.body !== 'string' || typeof outer.sum !== 'string') return { why: 'broken' };
  if (checksum(outer.body) !== outer.sum) return { why: 'checksum' };
  let b;
  try { b = JSON.parse(outer.body); } catch { return { why: 'broken' }; }
  if (!isObj(b) || b.f !== FORMAT) return { why: 'format' };
  let rec;
  try { rec = JSON.parse(b.record); } catch { return { why: 'record' }; }
  if (!isObj(rec) || !Number.isInteger(rec.v) || rec.v < 1) return { why: 'record' };
  if (rec.v > saveVersion) return { why: 'newer' };
  return { backup: make(b) };
}

// ---- the crew inside a record -----------------------------------------------------------------------------------

/** The record's Folks as { id, name, tier }, in slot order; [] when it can't be read. */
export function folksIn(record) {
  let root;
  try { root = typeof record === 'string' ? JSON.parse(record) : record; } catch { return []; }
  const list = Array.isArray(root?.folks) ? root.folks : [];
  return list.filter((f) => isObj(f) && isId(f.id))
    .sort((a, b) => (Number(a.slot) || 0) - (Number(b.slot) || 0))
    .map((f) => ({ id: f.id, name: typeof f.name === 'string' && f.name !== '' ? f.name : f.id, tier: typeof f.tier === 'string' ? f.tier : '' }));
}

const bump = (map, id, n) => { if (isId(id) && count(n) > 0) map[id] = (map[id] ?? 0) + count(n); };

/**
 * What a crew holds for you: { items: { id: qty }, currencies: { id: amount } } from every Folk's gear and room (made,
 * stock, town side) and the Payroll Reserve.
 */
export function heldBy(record) {
  let root;
  try { root = typeof record === 'string' ? JSON.parse(record) : record; } catch { root = null; }
  const items = {};
  const currencies = {};
  for (const f of Array.isArray(root?.folks) ? root.folks : []) {
    if (!isObj(f)) continue;
    if (isObj(f.loadout)) for (const e of Object.values(f.loadout)) if (isObj(e)) bump(items, e.id, Number.isInteger(e.qty) ? e.qty : 1);
    if (isObj(f.room)) {
      for (const side of ['haul', 'stock', 'town']) {
        if (isObj(f.room[side])) for (const [id, e] of Object.entries(f.room[side])) if (isObj(e)) bump(items, id, e.qty);
      }
      // The haul's purse (save v9): currencies a Folk earned away from a bank, not yet collected.
      if (isObj(f.room.purse)) for (const [id, n] of Object.entries(f.room.purse)) bump(currencies, id, n);
    }
  }
  if (isObj(root?.reserve)) for (const [id, n] of Object.entries(root.reserve)) bump(currencies, id, n);
  // Tent depots (round 3): their stacks are the crew's too, so a restore neither doubles nor loses them.
  if (isObj(root?.depots)) {
    for (const d of Object.values(root.depots)) {
      if (!isObj(d?.room)) continue;
      for (const side of ['haul', 'stock']) if (isObj(d.room[side])) for (const [id, e] of Object.entries(d.room[side])) if (isObj(e)) bump(items, id, e.qty);
    }
  }
  return { items, currencies };
}

/**
 * What the crew now holds beyond what the backup's crew holds: [[id, n]] items and currencies to hand back, so gear,
 * room stacks and Reserve gathered since the backup aren't lost when its crew replaces this one. What the backup's
 * crew holds beyond now comes back with it, less what `takes` finds moved to the bank since.
 */
export function returns(nowRecord, backupRecord) {
  const now = heldBy(nowRecord);
  const then = heldBy(backupRecord);
  const diff = (a, b) => Object.entries(a).map(([id, n]) => [id, n - (b[id] ?? 0)]).filter(([, n]) => n > 0);
  return { items: diff(now.items, then.items), currencies: diff(now.currencies, then.currencies) };
}

/**
 * What comes out of the bank so a restore never makes an item twice: [[id, n]]. For each item the backup's crew holds
 * beyond the crew now, as many as the bank gained since the backup (`backup.bank` its count then, `bankNow` now):
 * gear taken off a Folk, or a room emptied into the bank, after the backup was made. An item lost with the mod never
 * reached the bank, so it comes back free, except as far as the bank gained that same item otherwise since: then the
 * restore can't tell the two apart and takes it, never more than the bank holds.
 */
export function takes(nowRecord, backup, bankNow = {}) {
  const now = heldBy(nowRecord).items;
  const then = heldBy(backup.record).items;
  const out = [];
  for (const [id, n] of Object.entries(then)) {
    const bring = n - (now[id] ?? 0);
    if (bring <= 0) continue;
    const have = count(bankNow[id]);
    const gain = have - (backup.bank[id] ?? 0);
    const take = Math.min(bring, gain, have);
    if (take > 0) out.push([id, take]);
  }
  return out;
}

/** The bank snapshot a backup keeps: how many of each item the crew holds sit in the bank (`bankOf(id)`) now. */
export function bankSnapshot(record, bankOf) {
  const out = {};
  for (const id of Object.keys(heldBy(record).items)) { const n = count(bankOf(id)); if (n > 0) out[id] = n; }
  return out;
}

/**
 * Did the crew live on since the backup? Hiring XP never drops in play, and the game starts it from 0 when it loses
 * the mod's save; so XP now at least the backup's means the crew, its Work Orders and its commissions are still here.
 */
export const livedOn = (nowXP, backupXP) => amount(nowXP) >= amount(backupXP);

/**
 * A restore over a crew that lived on keeps the Work Orders board and the commissions as they are now, so an order or
 * a commission finished since the backup can't be finished and paid again. The kept commissions meet the backup's
 * Folks: `commissions` the state now, `folks` the restored Folk records. Returns { commissions, home } with the runs of
 * Folks not in the crew dropped (a commission whose Folk is gone is let go when the game loads), and `home` the ids of
 * Folks whose room holds commission items for no commission and no run: those go over to what the room holds for you.
 */
export function keepCommissions(commissions, folks) {
  if (!isObj(commissions)) return { commissions: null, home: [] };
  const ids = new Set((Array.isArray(folks) ? folks : []).map((f) => f?.id));
  const runs = {};
  for (const [id, run] of Object.entries(isObj(commissions.runs) ? commissions.runs : {})) if (ids.has(id)) runs[id] = run;
  const kept = { ...commissions, runs };
  const busy = new Set([...Object.keys(runs), ...(Array.isArray(kept.commissions) ? kept.commissions : []).map((c) => c?.folkId).filter(Boolean)]);
  const home = (Array.isArray(folks) ? folks : [])
    .filter((f) => isObj(f?.room?.town) && Object.keys(f.room.town).length > 0 && !busy.has(f.id))
    .map((f) => f.id);
  return { commissions: kept, home };
}

/** Folks hired now and not in the backup: they leave with the restore. [{ id, name }] */
export function leaving(nowRecord, backupRecord) {
  const kept = new Set(folksIn(backupRecord).map((f) => f.id));
  return folksIn(nowRecord).filter((f) => !kept.has(f.id)).map(({ id, name }) => ({ id, name }));
}

/** A Folk's travel after a restore: walking alone needs Voyage's walk, so without Voyage it stands where it is. */
export const travelAfter = (travel, voyageLoaded) => (travel === 'walking' && !voyageLoaded ? 'idle' : travel);

/**
 * What a restore adds to the game around the skill, never taking anything away: each item topped up to the backup's
 * count (bank and worn together, so a second restore of the same code adds nothing), each purchase at least the
 * backup's count, each building at least the backup's count in its biome, each pet found again. `have` { items, buys,
 * buildings, pets } now. Returns { add: [[id, n]], buys: [[id, count]], buildings: [{ biome, id, n, eff }], pets: [id] }.
 */
export function restorePlan(backup, have = {}) {
  const items = isObj(have.items) ? have.items : {};
  const bought = isObj(have.buys) ? have.buys : {};
  const built = isObj(have.buildings) ? have.buildings : {};
  const found = new Set(Array.isArray(have.pets) ? have.pets : []);
  const add = [];
  for (const [id, n] of Object.entries(backup.items)) {
    const more = n - count(items[id]);
    if (more > 0) add.push([id, more]);
  }
  const buys = [];
  for (const [id, n] of Object.entries(backup.buys)) if (n > count(bought[id])) buys.push([id, n]);
  const buildings = [];
  for (const [biome, list] of Object.entries(backup.buildings)) {
    for (const [id, b] of Object.entries(list)) {
      if (b.n > count(built[biome]?.[id]?.n)) buildings.push({ biome, id, n: b.n, eff: b.eff });
    }
  }
  const pets = backup.pets.filter((id) => !found.has(id));
  return { add, buys, buildings, pets };
}

// ---- the text code ----------------------------------------------------------------------------------------------
const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
const pipe = async (bytes, stream) => {
  const w = stream.writable.getWriter();
  // A cut code rejects these too; the read below reports it, so they are only quieted here.
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
};
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** A backup as its code: "FOLKS-BACKUP:z:<base64>", plain JSON in base64 where the browser can't deflate. */
export async function encode(backup, { zip = canZip() } = {}) {
  const bytes = new TextEncoder().encode(seal(backup));
  if (zip) return `${PREFIX}:z:${toB64(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  return `${PREFIX}:j:${toB64(bytes)}`;
}

/**
 * A pasted or loaded code back to { backup } or { why }: 'empty', 'notCode' (not a Worker Folks backup), 'voyage' (a
 * Voyage backup, which goes in Voyage's Restore), 'cantUnzip' (a deflated code where the browser can't inflate), or
 * open()'s reasons. Spaces and line breaks in it are ignored.
 */
export async function decode(text, saveVersion) {
  const s = String(text ?? '').replace(/\s+/g, '');
  if (s === '') return { why: 'empty' };
  if (s.startsWith('VOYAGE-BACKUP:')) return { why: 'voyage' };
  const m = /^FOLKS-BACKUP:([zj]):([A-Za-z0-9+/=]+)$/.exec(s);
  if (m === null) return { why: 'notCode' };
  let bytes;
  try { bytes = fromB64(m[2]); } catch { return { why: 'broken' }; }
  if (m[1] === 'z') {
    if (!canZip()) return { why: 'cantUnzip' };
    try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); } catch { return { why: 'broken' }; }
  }
  let sealed;
  try { sealed = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return { why: 'broken' }; }
  return open(sealed, saveVersion);
}

/** The download's name: folks-backup-<character>-<yyyy-mm-dd>.txt, the name cut to safe letters. */
export function fileName(name, at) {
  const slug = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'character';
  const d = new Date(count(at));
  const pad = (n) => String(n).padStart(2, '0');
  return `folks-backup-${slug}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.txt`;
}
