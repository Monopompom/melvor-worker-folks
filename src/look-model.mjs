// A Folk's look: which Heirlooms show on its portrait, the marks it earned by what happened to it, and the counts behind
// them. The face itself is drawn in look-art-model.mjs and kept on the Folk only once the player edits it. Pure.

/** Worn Heirlooms by item id, as the portrait draws them. */
export const HEIRLOOM_GEAR = Object.freeze({
  Golden_Hardhat: 'hardhat',
  Lucky_Apron: 'apron',
  Guild_Ledger: 'ledger',
  Union_Charter: 'charter',
  Foremans_Whistle: 'whistle',
  Timekeepers_Bell: 'bell',
});

export const MARK_IDS = Object.freeze(['mastery', 'anchor', 'service', 'armband', 'scar', 'patch']);
/** What each mark asks: a Mastery level, trips, hours for its first bar, strikes, and close calls for the last two. */
export const MARK_NEEDS = Object.freeze({ mastery: 99, anchor: 10, service: 100, armband: 3, scar: 1, patch: 3 });
export const HOUR_MS = 3_600_000;
export const MAX_STRIPES = 3;
/** Under this share of its max HP a hit it survives is a close call. */
export const CLOSE_CALL_SHARE = 0.1;

const count = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Service bars for this much work: one per 100 h, at most three. */
export function stripesFor(ms) {
  return Math.min(MAX_STRIPES, Math.floor(count(ms) / (MARK_NEEDS.service * HOUR_MS)));
}

/** What the Folk's loadout shows on its portrait, in the art's ids. Only our own Heirlooms count. */
export function wornGear(loadout, namespace = 'worker_folks') {
  const prefix = `${namespace}:`;
  const out = [];
  for (const entry of Object.values(loadout ?? {})) {
    const id = entry?.id;
    if (typeof id !== 'string' || !id.startsWith(prefix)) continue;
    const gear = HEIRLOOM_GEAR[id.slice(prefix.length)];
    if (gear !== undefined && !out.includes(gear)) out.push(gear);
  }
  return out.sort();
}

/**
 * Every mark's state for the Edit window: { id, earned, have, need }. Service counts whole hours toward its next bar
 * and adds `bars`; the others count what they ask for. Without Voyage there is no Anchor pin: its trips stay counted
 * for when Voyage is back, but it is neither listed nor drawn.
 */
export function markStates({ mastery = 1, strikes = 0, counts, voyage = true } = {}) {
  const close = count(counts?.close);
  const hours = Math.floor(count(counts?.ms) / HOUR_MS);
  const bars = stripesFor(counts?.ms);
  const row = (id, have) => ({ id, have, need: MARK_NEEDS[id], earned: have >= MARK_NEEDS[id] });
  return [
    row('mastery', count(mastery)),
    row('anchor', count(counts?.trips)),
    { id: 'service', have: hours, need: MARK_NEEDS.service * Math.min(MAX_STRIPES, bars + 1), earned: bars > 0, bars },
    row('armband', count(strikes)),
    row('scar', close),
    row('patch', close),
  ].filter((m) => voyage || m.id !== 'anchor');
}

/** The worn Heirlooms the player has not hidden. Hiding one changes the picture only: it stays equipped. */
export function shownGear(gear, hide = []) {
  return gear.filter((id) => !hide.includes(id));
}

/** The earned marks the player has not hidden. */
export function shownMarks(states, hide = []) {
  return states.filter((m) => m.earned && !hide.includes(m.id)).map((m) => m.id);
}

/** A hit that takes the Folk from at least 10% HP to under it, and leaves it alive. */
export function isCloseCall(before, after, max) {
  if (!(max > 0) || !(after > 0)) return false;
  const line = max * CLOSE_CALL_SHARE;
  return before >= line && after < line;
}

const samePlace = (a, b) => (a ?? null) !== null && (b ?? null) !== null && a.q === b.q && a.r === b.r;

/**
 * The counts after a change of travel. Going with the player keeps where the trip began; coming home somewhere else
 * makes it a trip. Stepping aboard and off on one hex counts for nothing. Returns the same object when nothing changed.
 */
export function noteTravel(counts, fromTravel, travel, place) {
  if (fromTravel === travel) return counts;
  if (travel === 'with') {
    const { from: _old, ...rest } = counts ?? {};
    return place === null || place === undefined ? rest : { ...rest, from: { q: place.q, r: place.r } };
  }
  if (fromTravel !== 'with') return counts;
  const { from, ...rest } = counts ?? {};
  if (travel !== 'idle') return rest;
  if (place === null || place === undefined || samePlace(from, place)) return rest;
  return { ...rest, trips: count(rest.trips) + 1 };
}

const LOOK_KEYS = ['skin', 'hair', 'hairColor', 'beard', 'extra', 'color'];

/** The two faces are the same choices, hidden marks included. */
export function sameLook(a, b) {
  if (LOOK_KEYS.some((k) => (a?.[k] ?? -1) !== (b?.[k] ?? -1))) return false;
  if ((a?.color ?? -1) >= 0 && (a?.colorAt ?? 'scarf') !== (b?.colorAt ?? 'scarf')) return false;
  const hidden = (x) => [...(x?.hide ?? [])].sort().join();
  return hidden(a) === hidden(b);
}

/** One string for everything the picture shows, so one drawing serves every Folk that looks the same. */
export function lookKey({ tier, look, gear = [], marks = [], stripes = 0 }) {
  const face = LOOK_KEYS.map((k) => look?.[k] ?? -1).join('.');
  return `${tier}|${face}|${(look?.color ?? -1) >= 0 ? look?.colorAt ?? 'scarf' : ''}|${gear.join()}|${marks.join()}|${marks.includes('service') ? stripes : 0}`;
}

/** What the drawing takes: the face, the rank's uniform, what is worn and what is shown. */
export function drawing({ tier, look, gear = [], marks = [], stripes = 0 }) {
  return { color: -1, colorAt: 'scarf', ...look, rank: String(tier).toLowerCase(), gear, marks, stripes };
}
