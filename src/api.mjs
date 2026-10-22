// The API other mods read as `mod.api.worker_folks` (Voyage, phase 6): the Folks, each Folk's place and travel,
// events and guards. Everything handed out is a frozen copy, so another mod never writes a Folk record directly.
// Pure: the Hiring skill and the Folk model are injected (mod modules cannot import their siblings).

/** Bumped when something here changes in a way a caller must know about. Voyage refuses an older one. */
export const API_VERSION = 7;
/** The least of the hire price an outside hire pays (v7): a bargain, never a free Folk. */
export const HIRE_SHARE_MIN = 0.25;

const placeCopy = (place) => (place === null || place === undefined ? null : Object.freeze({ q: place.q, r: place.r }));

/**
 * A read-only view of a Folk. `hp` null means full health; `maxHp` (v3) is undefined where health isn't known;
 * `portrait` (build .124) is the URL of its rank's picture, as on its card; `traits` (v5) the ids of the traits it
 * holds (a trait waiting for a slot does nothing, so it isn't listed).
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
    traits: Object.freeze((folk.traitState?.traits ?? []).map((t) => t.id)),
  });
}

const TRAIT_KINDS = ['good', 'mixed', 'bad'];
/** A trait another mod registers: its id carries the mod's namespace ('voyage:Seafarer'), so it never meets ours. */
export function checkTraitDef(def) {
  if (def === null || typeof def !== 'object') return 'trait must be an object';
  if (typeof def.id !== 'string' || !/^[A-Za-z0-9_]+:[A-Za-z0-9_]+$/.test(def.id)) return 'trait id must be namespace:Name';
  if (!TRAIT_KINDS.includes(def.kind)) return 'trait kind must be good, mixed or bad';
  if (typeof def.media !== 'string' || def.media === '') return 'trait media must be a URL';
  for (const key of ['name', 'effect', 'lasts']) {
    if (typeof def[key] !== 'string' && typeof def[key] !== 'function') return `trait ${key} must be a string or function`;
  }
  if (def.effectAfter !== undefined && typeof def.effectAfter !== 'string' && typeof def.effectAfter !== 'function') return 'trait effectAfter must be a string or function';
  if (def.effects !== undefined && (def.effects === null || (typeof def.effects !== 'object' && typeof def.effects !== 'function'))) return 'trait effects must be an object or function';
  return undefined;
}

/** Event payloads with every Folk record swapped for its view. */
function viewPayload(payload, view) {
  if (payload === null || typeof payload !== 'object') return payload;
  const out = { ...payload };
  if (payload.folk !== null && typeof payload.folk === 'object' && typeof payload.folk.id === 'string') out.folk = view(payload.folk);
  if (Array.isArray(payload.folks)) out.folks = payload.folks.map(view);
  return Object.freeze(out);
}

/**
 * The numbers other mods write about (v7, build .136; Voyage's journal typed them): promotion's Hiring level, the
 * mastery each rank asks, the share of the next hire price a promotion costs, the Shift Slot caps by licence.
 * `rules` is { promotion: { level, mastery: { Junior... }, costRate }, slotCaps: { Newbie... } } from the rule modules.
 */
export function createApi({ getHiring, model, pricing, rules, version = API_VERSION }) {
  const { normalizePlace, TRAVEL } = model;
  const hiring = () => getHiring();
  const view = (folk) => folkView(folk, hiring().statusOf(folk), hiring().health?.maxHpOf(folk), hiring().portrait?.(folk.tier));
  const skillById = (skillId) => hiring().delegableSkills.find((s) => s.id === skillId);
  const record = (id) => hiring().crew.byId(id);
  /** `hire`'s checks, in its order; the price a share of the Shop's, never under HIRE_SHARE_MIN of it. */
  const canHire = (tier, share) => {
    const h = hiring();
    const part = Number.isFinite(share) ? Math.min(1, Math.max(HIRE_SHARE_MIN, share)) : 1;
    const full = model.TIERS.includes(tier) && pricing !== undefined ? pricing.hirePrice(tier, h.crew.countByTier(tier)) : undefined;
    const price = full === undefined ? undefined : Math.ceil(full * part);
    if (price === undefined) return Object.freeze({ ok: false, refused: 'tier' });
    if (h.hasLicence?.(tier) !== true) return Object.freeze({ ok: false, refused: 'licence', price });
    if (h.crew.freeSlot({ limit: h.folkCap }) < 0) return Object.freeze({ ok: false, refused: 'full', price });
    const gp = h.game?.gp;
    if (gp === undefined || !(gp.amount >= price)) return Object.freeze({ ok: false, refused: 'gp', price });
    return Object.freeze({ ok: true, price });
  };
  const moved = (folk, from) => {
    // A trait's effects may follow the Folk's hex (v5): its table is built again.
    hiring().invalidateFolkTables?.();
    hiring().events.emit('folkMoved', { folk, from: placeCopy(from.place), fromTravel: from.travel });
    hiring().crew.touch();
  };
  return Object.freeze({
    version,
    /** The hiring rules as numbers (v7): { promotionLevel, masteryGates: [20, 40, 60, 80], promotionCostRate, slotCaps: [2, 4, 7, 10] } (finite caps only). */
    rules: () => Object.freeze({
      promotionLevel: rules?.promotion?.level,
      masteryGates: Object.freeze(Object.values(rules?.promotion?.mastery ?? {})),
      promotionCostRate: rules?.promotion?.costRate,
      slotCaps: Object.freeze(Object.values(rules?.slotCaps ?? {}).filter((n) => Number.isFinite(n))),
    }),
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
    /**
     * Registers another mod's trait (v5): { id: 'namespace:Name', kind: 'good' | 'mixed' | 'bad', media (URL), name,
     * effect, lasts, effectAfter?, effects? }, texts as strings or functions read when shown. It shares the four slots
     * and Forget; the mod counts it, teaches it with `earnTrait`, fades it with `dropTrait` and applies its own
     * effects. `effects` are the ones Worker Folks applies (interval, xp, preservation, doubling, masteryXP, wage, in
     * percent, at most ±50): an object, or a function of { id, skillId, place } read when the Folk's table is built.
     * Returns the function that unregisters it.
     */
    registerTrait: (def) => {
      const problem = checkTraitDef(def);
      if (problem !== undefined) throw new Error(problem);
      const h = hiring();
      if (h.outsideTraits === undefined) h.outsideTraits = new Map();
      const entry = Object.freeze({ kind: def.kind, media: def.media, name: def.name, effect: def.effect, effectAfter: def.effectAfter, lasts: def.lasts, effects: def.effects });
      h.outsideTraits.set(def.id, entry);
      h.invalidateFolkTables?.();
      if (h.renderQueue !== undefined) h.renderQueue.folks = true;
      return () => { if (h.outsideTraits?.get(def.id) === entry) h.outsideTraits.delete(def.id); };
    },
    /**
     * A Folk learns a registered trait (v5): an open slot, or the queue when they are full, with the usual notice and
     * a `folkTrait` event. False for an unknown Folk, a trait not registered, or one it already has.
     */
    earnTrait: (id, traitId) => {
      const folk = record(id);
      return folk !== undefined && hiring().traits?.earn(folk, traitId) === true;
    },
    /** A Folk's registered trait fades (v5), held or waiting; the queue moves up. False when it doesn't have it. */
    dropTrait: (id, traitId) => {
      const folk = record(id);
      return folk !== undefined && hiring().traits?.drop(folk, traitId) === true;
    },
    /** The trait ids a Folk holds and waits on: { held, waiting } (v5), or undefined for an unknown Folk. */
    traitsOf: (id) => {
      const folk = record(id);
      const ids = folk === undefined ? undefined : hiring().traits?.idsOf(folk);
      return ids === undefined ? undefined : Object.freeze({ held: Object.freeze(ids.held), waiting: Object.freeze(ids.waiting) });
    },
    /** What one more Folk of `tier` costs now (v6), as the Shop prices it; undefined for an unknown tier. */
    hirePrice: (tier) => (model.TIERS.includes(tier) && pricing !== undefined ? pricing.hirePrice(tier, hiring().crew.countByTier(tier)) : undefined),
    /**
     * Whether a Folk of `tier` could be hired outside the Shop now (v7), on `hire`'s terms: { ok: true, price } or
     * { ok: false, refused: 'tier' | 'licence' | 'full' | 'gp', price }, checked in that order. `share` as in `hire`.
     */
    canHire: (tier, { share = 1 } = {}) => canHire(tier, share),
    /**
     * Hires a Folk of `tier` outside the Shop (v6: Voyage's stowaway) on the Shop's terms: its licence, a free crew slot
     * and the hire price in GP, paid here; `share` of it when the caller offers a bargain (at least HIRE_SHARE_MIN, v7:
     * never a free Folk), rounded up. It counts as a hire all the same: the next one costs more. `name` is kept;
     * `travel` 'with' puts it with the player at once. Returns { folk, price } or { refused: 'tier' | 'licence' |
     * 'full' | 'gp' }. Staff guards are not asked: the caller is the guard.
     */
    hire: (tier, { name, travel = 'idle', source = 'api', share = 1 } = {}) => {
      const h = hiring();
      const can = canHire(tier, share);
      if (!can.ok || !TRAVEL.includes(travel)) return Object.freeze({ refused: !can.ok ? can.refused : 'tier' });
      const price = can.price;
      const gp = h.game?.gp;
      const folk = h.crew.hire(tier, { name: typeof name === 'string' && name !== '' ? name : undefined, source, limit: h.folkCap });
      if (folk === null) return Object.freeze({ refused: 'full' });
      gp.remove(price);
      if (travel !== 'idle') {
        const from = { place: folk.place, travel: folk.travel };
        folk.travel = travel;
        moved(folk, from);
      }
      return Object.freeze({ folk: view(folk), price });
    },
    /** Asks for the guarded buttons and the Shop's lines to be drawn again (call after the player moves). */
    refresh: () => hiring().refreshGuarded(),
  });
}
