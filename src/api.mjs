// The API other mods read as `mod.api.worker_folks` (Voyage, phase 6): the Folks, each Folk's place and travel,
// events and guards. Everything handed out is a frozen copy, so another mod never writes a Folk record directly.
// Pure: the Hiring skill and the Folk model are injected (mod modules cannot import their siblings).

/** Bumped when something here changes in a way a caller must know about. Voyage refuses an older one. */
export const API_VERSION = 4;

const placeCopy = (place) => (place === null || place === undefined ? null : Object.freeze({ q: place.q, r: place.r }));

/**
 * A read-only view of a Folk. `hp` null means full health; `maxHp` (v3) is undefined where health isn't known;
 * `portrait` (build .124) is the URL of its rank's picture, as on its card.
 */
export function folkView(folk, status, maxHp, portrait) {
  return Object.freeze({
    id: folk.id,
    name: folk.name,
    tier: folk.tier,
    slot: folk.slot,
    skillId: folk.skillId,
    status,
    place: placeCopy(folk.place),
    travel: folk.travel,
    hp: folk.hp,
    maxHp,
    portrait,
  });
}

/** Event payloads with every Folk record swapped for its view. */
function viewPayload(payload, view) {
  if (payload === null || typeof payload !== 'object') return payload;
  const out = { ...payload };
  if (payload.folk !== null && typeof payload.folk === 'object' && typeof payload.folk.id === 'string') out.folk = view(payload.folk);
  if (Array.isArray(payload.folks)) out.folks = payload.folks.map(view);
  return Object.freeze(out);
}

export function createApi({ getHiring, model, version = API_VERSION }) {
  const { normalizePlace, TRAVEL } = model;
  const hiring = () => getHiring();
  const view = (folk) => folkView(folk, hiring().statusOf(folk), hiring().health?.maxHpOf(folk), hiring().portrait?.(folk.tier));
  const skillById = (skillId) => hiring().delegableSkills.find((s) => s.id === skillId);
  const record = (id) => hiring().crew.byId(id);
  const moved = (folk, from) => {
    hiring().events.emit('folkMoved', { folk, from: placeCopy(from.place), fromTravel: from.travel });
    hiring().crew.touch();
  };
  return Object.freeze({
    version,
    folks: () => hiring().crew.all.map(view),
    folkById: (id) => {
      const folk = record(id);
      return folk === undefined ? undefined : view(folk);
    },
    placeOf: (id) => placeCopy(record(id)?.place),
    /** Puts a Folk on a hex { q, r } (null: no place). False for an unknown Folk or a hex that is not plain integers. */
    setPlace: (id, hex) => {
      const folk = record(id);
      if (folk === undefined) return false;
      const place = hex === null ? null : normalizePlace(hex);
      if (hex !== null && place === null) return false;
      const same = place === null ? folk.place === null : folk.place !== null && folk.place.q === place.q && folk.place.r === place.r;
      if (same) return true;
      const from = { place: folk.place, travel: folk.travel };
      folk.place = place;
      moved(folk, from);
      return true;
    },
    travelOf: (id) => record(id)?.travel,
    /**
     * 'idle' (stays on its place), 'with' (goes along with the player) or 'walking' (on its way alone, v4). A Folk that
     * leaves its place stops its work (v3): it is unassigned, and a move waiting for it in a Worker box is dropped.
     */
    setTravel: (id, travel) => {
      const folk = record(id);
      if (folk === undefined || !TRAVEL.includes(travel)) return false;
      if (folk.travel === travel) return true;
      const from = { place: folk.place, travel: folk.travel };
      if (travel !== 'idle') {
        hiring().pending.forEach((pendingId, skill) => { if (pendingId === id) hiring().clearPending(skill); });
        if (folk.skillId !== null) hiring().crew.assign(id, null);
      }
      folk.travel = travel;
      moved(folk, from);
      return true;
    },
    /** The skills a Folk can be given: [{ id, name, holder }] (`holder`: the Folk on it, or null) (v3). */
    skills: () => Object.freeze(hiring().delegableSkills.map((s) => Object.freeze({ id: s.id, name: s.name, holder: hiring().crew.bySkill(s.id)?.id ?? null }))),
    /**
     * Gives a Folk a skill as the Worker box does, guards included (null: takes its skill away). False when refused, or
     * for an unknown Folk or skill (v3).
     */
    assign: (id, skillId) => {
      const folk = record(id);
      if (folk === undefined) return false;
      if (skillId === null) return folk.skillId === null ? true : hiring().crew.assign(id, null) !== false;
      const skill = skillById(skillId);
      if (skill === undefined) return false;
      return hiring().setWorker(skill, id) !== false;
    },
    /**
     * Hurts a Folk by `amount` HP; it can't eat against it, and it dies at zero as from any other harm. `cause` names
     * the death ('hunger'). Returns { hp, dead }, or undefined for an unknown Folk (v3).
     */
    hurt: (id, amount, { cause } = {}) => {
      const folk = record(id);
      const health = hiring().health;
      if (folk === undefined || health === undefined) return undefined;
      const dead = health.damage(folk, amount, { eat: false, cause });
      return Object.freeze({ hp: dead ? 0 : health.hpOf(folk), dead });
    },
    /** Subscribes to a Worker Folks event; payloads carry Folk views. Returns the function that unsubscribes. */
    on: (name, fn) => {
      if (typeof fn !== 'function') throw new Error('listener must be a function');
      return hiring().events.on(name, (payload) => fn(viewPayload(payload, view)));
    },
    /** kind 'staff' | 'work' | 'gear'; fn(request) returns undefined or { reason }. Requests carry Folk views. */
    registerGuard: (kind, fn) => {
      if (typeof fn !== 'function') throw new Error('guard must be a function');
      const off = hiring().guards.register(kind, fn);
      hiring().refreshGuarded();
      return () => { off(); hiring().refreshGuarded(); };
    },
    /** The Folk a start of this skill goes to now (it runs it, or would be given it), or undefined: the player (v2). */
    workerOf: (skillId) => {
      const skill = hiring().game?.skills?.getObjectByID(skillId);
      const folk = skill === undefined ? undefined : hiring().actorFor(skill);
      return folk === undefined ? undefined : view(folk);
    },
    /** fn(folkView) returns the card's and the Worker box's line for where the Folk is ('' for none) (v2). */
    registerLocationText: (fn) => {
      if (typeof fn !== 'function') throw new Error('location text must be a function');
      hiring().locationText = fn;
      hiring().refreshGuarded();
      return () => { if (hiring().locationText === fn) hiring().locationText = undefined; hiring().refreshGuarded(); };
    },
    /** Asks for the guarded buttons and the Shop's lines to be drawn again (call after the player moves). */
    refresh: () => hiring().refreshGuarded(),
  });
}
