// The API other mods read as `mod.api.worker_folks` (Voyage, phase 6): the Folks, each Folk's place and travel,
// events and guards. Everything handed out is a frozen copy, so another mod never writes a Folk record directly.
// Pure: the Hiring skill and the Folk model are injected (mod modules cannot import their siblings).

/** Bumped when something here changes in a way a caller must know about. Voyage refuses an older one. */
export const API_VERSION = 11;
/** The least of the hire price an outside hire pays (v7): a bargain, never a free Folk. */
export const HIRE_SHARE_MIN = 0.25;

const byTier = (o) => Object.freeze(Object.values(o ?? {}));
/** The per-tier numbers (build .147): first hire price, wage an hour at mastery 99 (Standard), produce rate, Hiring XP
 * an hour of work and the skill level each tier asks of you, as arrays Newbie first. */
const tierRules = (t) => (t === undefined ? {} : {
  hireBase: byTier(t.hireBase), wages: byTier(t.wages), produceRates: byTier(t.produceRates),
  hiringXPPerHour: byTier(t.hiringXPPerHour), qualification: byTier(t.qualification),
});
/** The Hiring level steps (build .147): the Work Orders board, Summoning marks (level, share of your chance), the
 * Foreman crew bonus, the firing severance. */
const levelRules = (l) => (l === undefined ? {} : {
  workOrdersLevel: l.workOrders,
  marksLevel: l.marks,
  marksShare: l.marksShare,
  crewBonus: Object.freeze({ ...l.crewBonus }),
  firingSeverance: Object.freeze((l.severance ?? []).map((step) => Object.freeze([...step]))),
  qualificationLowering: l.qualificationLowering,
});
const placeCopy = (place) => (place === null || place === undefined ? null : Object.freeze({ q: place.q, r: place.r }));

/**
 * A read-only view of a Folk. `hp` null means full health; `maxHp` (v3) is undefined where health isn't known;
 * `portrait` (build .124) is the URL of its rank's picture, as on its card; `traits` (v5) the ids of the traits it
 * holds (a trait waiting for a slot does nothing, so it isn't listed); `mastery` (v10) its Hiring mastery level, 1 to
 * 99, where known. A Folk has no skill levels of its own: it works every skill at your level. `job` (v11) the id of
 * its job (the Quartermaster, or one another mod registered), null for none; a Folk holds a skill or a job.
 */
export function folkView(folk, status, maxHp, portrait, mastery) {
  return Object.freeze({
    id: folk.id,
    name: folk.name,
    tier: folk.tier,
    slot: folk.slot,
    skillId: folk.skillId,
    job: folk.job ?? null,
    supplies: folk.supplies ?? null,
    status,
    place: placeCopy(folk.place),
    travel: folk.travel,
    hp: folk.hp,
    maxHp,
    portrait,
    traits: Object.freeze((folk.traitState?.traits ?? []).map((t) => t.id)),
    mastery,
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
 * Build .147 adds `tiers` ({ hireBase, wages, produceRates, hiringXPPerHour, qualification }, each by tier, Newbie
 * first) and `levels` ({ workOrders, marks, marksShare, crewBonus: { per, max, topLevel, topMax }, severance: [[level, rate], ...],
 * qualificationLowering }); rules() hands them on only when given, so a caller tells an older Worker Folks by their
 * absence.
 */
export function createApi({ getHiring, model, pricing, rules, getBackup, version = API_VERSION }) {
  const { normalizePlace, TRAVEL } = model;
  const hiring = () => getHiring();
  const view = (folk) => folkView(folk, hiring().statusOf(folk), hiring().health?.maxHpOf(folk), hiring().portrait?.(folk.tier), hiring().masteryLevelOf?.(folk));
  /** The room's calls (v10) go to room.mjs; an unknown Folk, or no room module, answers undefined. */
  const roomCall = (id, fn) => {
    const folk = record(id);
    const room = hiring().room;
    return folk === undefined || room === undefined ? undefined : fn(room, folk);
  };
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
    // A trait's effects may follow the Folk's hex (v5): its own table is built again, not every Folk's. A walk moves its
    // Folk a hex every few game minutes, and each move used to rebuild every working Folk's table and, through
    // crewChanged, redraw every skill's Worker box. What shows a Folk's place or its refusals listens to folkMoved.
    hiring().invalidateFolkTable?.(folk);
    hiring().events.emit('folkMoved', { folk, from: placeCopy(from.place), fromTravel: from.travel });
  };
  /** The backup's calls (v8) go to its module, loaded after this API is made; without it: 'unavailable'. */
  const UNAVAILABLE = Object.freeze({ ok: false, why: 'unavailable' });
  const backupCall = async (name, arg) => {
    const b = getBackup?.();
    if (typeof b?.[name] !== 'function' || hiring() === undefined) return UNAVAILABLE;
    return b[name](arg);
  };
  return Object.freeze({
    version,
    /** The hiring rules as numbers (v7): { promotionLevel, masteryGates: [20, 40, 60, 80], promotionCostRate, slotCaps: [2, 4, 7, 10] } (finite caps only). */
    rules: () => Object.freeze({
      promotionLevel: rules?.promotion?.level,
      masteryGates: Object.freeze(Object.values(rules?.promotion?.mastery ?? {})),
      promotionCostRate: rules?.promotion?.costRate,
      slotCaps: Object.freeze(Object.values(rules?.slotCaps ?? {}).filter((n) => Number.isFinite(n))),
      ...tierRules(rules?.tiers),
      ...levelRules(rules?.levels),
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
    /**
     * Registers a job (v11): a Folk assignment that is not a skill. `def`: { id ('namespace:Name'), name, media (strings
     * or functions), everyMs(folkView) → ms between looks, work(folkView, ms, { offline }) → '' when it worked or the
     * reason it waits (shown on the card; the wage runs either way), unlocked() → boolean, lockText() → why not yet,
     * refusal(folkView) → '' or why this Folk can't take it, describe(folkView) → lines for the card's tooltip,
     * travels: true when it works wherever the Folk is, along with the player too (else the Folk stays put for it),
     * badge(folkView) → the card's blue pill (how often it looks, say), effects(folkView) → the line under it (strings,
     * or { before, value, after }) }. A 'work' guard refusing { folk, jobId } holds the job off: no slot, no wage. The
     * job takes a Shift Slot and its Folk's tier wage for its time; the Folk earns Hiring XP and mastery as on a skill.
     * Its card lists it in the Job picker. Returns the function that removes it.
     */
    registerJob: (def) => {
      if (def === null || typeof def !== 'object' || typeof def.id !== 'string' || !/^[A-Za-z0-9_]+:[A-Za-z0-9_]+$/.test(def.id)) throw new Error('job id must be namespace:Name');
      const jobs = hiring().jobs;
      if (jobs === undefined) throw new Error('jobs are not loaded');
      const wrap = (fn) => (typeof fn === 'function' ? (folk, ...rest) => fn(view(folk), ...rest) : undefined);
      jobs.register({ ...def, everyMs: wrap(def.everyMs), work: wrap(def.work), refusal: wrap(def.refusal), describe: wrap(def.describe), badge: wrap(def.badge), effects: wrap(def.effects) });
      return () => jobs.unregister(def.id);
    },
    /** Every job, with the Folk on it: [{ id, name, holder }] (`holder` a Folk id or null) (v11). */
    jobs: () => Object.freeze((hiring().jobs?.all ?? []).map((k) => Object.freeze({ id: k.id, name: k.name, holder: hiring().crew.byJob(k.id)?.id ?? null }))),
    /** Supply lines (v11): [{ supplierId, receiverId }] for every Folk that supplies another. */
    supplyLinks: () => Object.freeze(hiring().crew.links.map((l) => Object.freeze({ ...l }))),
    /**
     * Sets who a Folk supplies as its card does, refusals included (null: none): from Hiring 60, a receiver whose recipe
     * uses what it makes and has no other supplier for it, and no staff guard refusing { action: 'link', folk,
     * receiverId }. False when refused or unknown (v11).
     */
    setSupply: (id, receiverId) => {
      const folk = record(id);
      const supply = hiring().supply;
      if (folk === undefined || supply === undefined) return false;
      if (receiverId !== null && record(receiverId) === undefined) return false;
      return supply.set(folk, receiverId) === true;
    },
    /** Gives a Folk a job as its card does, refusals included (null: none). False when refused or unknown (v11). */
    setJob: (id, jobId) => {
      const folk = record(id);
      const jobs = hiring().jobs;
      if (folk === undefined || jobs === undefined) return false;
      if (jobId !== null && jobs.kind(jobId) === undefined) return false;
      return jobs.set(folk, jobId) === true;
    },
    /** The Folk a start of this skill goes to now (it runs it, or would be given it), or undefined: the player (v2). */
    workerOf: (skillId) => {
      const skill = hiring().game?.skills?.getObjectByID(skillId);
      const folk = skill === undefined ? undefined : hiring().actorFor(skill);
      return folk === undefined ? undefined : view(folk);
    },
    /**
     * The Folk a start of this skill goes to now, only where it is (v9): { id, place, travel }, or undefined for the
     * player. For calls made on every action: workerOf builds a whole view (~6 µs), this reads three fields.
     */
    actorOf: (skillId) => {
      const skill = hiring().game?.skills?.getObjectByID(skillId);
      const folk = skill === undefined ? undefined : hiring().actorFor(skill);
      return folk === undefined ? undefined : Object.freeze({ id: folk.id, place: placeCopy(folk.place), travel: folk.travel });
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
      const folk = h.crew.hire(tier, { name: typeof name === 'string' && name !== '' ? name : undefined, source, limit: h.folkCap, paid: price });
      if (folk === null) return Object.freeze({ refused: 'full' });
      gp.remove(price);
      if (travel !== 'idle') {
        const from = { place: folk.place, travel: folk.travel };
        folk.travel = travel;
        moved(folk, from);
      }
      return Object.freeze({ folk: view(folk), price });
    },
    /**
     * Worker Folks' backup (v8), for one backup of Worker Folks and the caller's mod. `backup()` resolves to
     * { ok: true, code, summary }: the FOLKS-BACKUP code, versioned on its own, to carry unchanged; `summary` is
     * { name, at, mod, build, mode, level, folks, itemKinds, buys, buildings, pets }.
     */
    backup: () => backupCall('backup'),
    /**
     * What restoring `code` would do now (v8): { ok: true, summary, keepsBoards, replaces, sections }. `sections` are
     * Worker Folks' confirm bands, [{ head, warn, body }], each body line a text, { html } (escaped already) or
     * { rows: [[label, value, media?]] }; `warn` marks what is lost; `replaces` is true when any band warns;
     * `keepsBoards` when the crew lived on and keeps its Work Orders and commissions. Refused: { ok: false, why }, why
     * 'empty' | 'notCode' | 'voyage' | 'broken' | 'checksum' | 'format' | 'newer' | 'record' | 'cantUnzip' |
     * 'unavailable'.
     */
    restorePlan: (code) => backupCall('restorePlan', code),
    /**
     * Restores `code` (v8) with no save and no reload, the game loop stopped: restore Worker Folks first, then the
     * caller's own part, then save and reload once. { ok: true, summary } or { ok: false, why } as restorePlan's, or
     * 'failed': it broke part way and nothing was saved, so reload without saving.
     */
    restore: (code) => backupCall('restore', code),
    /**
     * Whether a Folk may work a skill now (v10): { ok, needs }, `needs` the level of yours its tier asks for (Alt.
     * Magic: Magic), standard levels only; with the Qualification setting off, ok is always true. undefined for an
     * unknown Folk or skill.
     */
    qualifies: (id, skillId) => {
      const folk = record(id);
      const skill = skillById(skillId);
      const q = folk === undefined || skill === undefined ? undefined : hiring().qualification?.check(folk, skill);
      return q === undefined ? undefined : Object.freeze({ ok: q.ok, needs: q.needs });
    },
    /**
     * The haul (v10). fn(folkView) answers where that Folk's goods go: 'bank' (as today) or 'room' (everything it makes
     * waits in its room and its purse, its inputs come only from its stock; it stops "Haul full" or "Out of inputs" and
     * its wages keep running while stopped). Anything else reads 'bank'. One hook at a time; none means 'bank' for
     * every Folk. The answer is kept per Folk and asked again on folkMoved, a load and refreshBankAccess(). Returns
     * the function that removes it. Since v11 it may answer { access: 'room', depot: id } for a Folk sharing a
     * registered tent depot (registerDepot): its goods fill its own room, then the depot; its inputs come from its
     * stock, then the depot's. A depot id not registered: its own room only.
     */
    registerBankAccess: (fn) => {
      if (typeof fn !== 'function') throw new Error('bank access must be a function');
      const h = hiring();
      // Kept on the skill, as the location text is, so it holds whichever mod loads first; room.mjs reads it.
      const hook = (folk) => fn(view(folk));
      h.accessHook = hook;
      h.room?.refreshAccess();
      return () => {
        if (h.accessHook !== hook) return;
        h.accessHook = undefined;
        h.room?.refreshAccess();
      };
    },
    /** Asks the haul's hook again for one Folk (by id) or every Folk: call when its answer may change without a move. */
    refreshBankAccess: (id) => {
      const room = hiring().room;
      if (room === undefined) return;
      if (id === undefined) room.refreshAccess();
      else if (record(id) !== undefined) room.refreshAccess(record(id));
    },
    /** 'bank' or 'room' for this Folk now (v10), undefined for an unknown Folk. */
    accessOf: (id) => roomCall(id, (room, folk) => room.accessOf(folk)),
    /**
     * A Folk's room (v10), frozen: { sizeMs, usedMs, haul, stock, town, purse, state, access }. haul / stock / town are
     * [{ itemId, qty, ms }] (town: a Township commission's goods, not yours to move), purse [{ currencyId, amount }],
     * state 'ok' | 'full' | 'dry', access 'bank' | 'room', depot the shared depot's id or null (v11).
     */
    room: (id) => roomCall(id, (room, folk) => room.roomOf(folk)),
    /**
     * Collects a Folk's room (v10): what it made and its purse go to your bank (found, as new items are) and your
     * currencies, and, while its own-stock switch is off, stock its current recipe can't use. A "Haul full" Folk with
     * space again starts again. { items: [{ itemId, qty }], left: [...] (no free bank slot: still held), purse:
     * [{ currencyId, amount }] }.
     */
    collect: (id) => roomCall(id, (room, folk) => room.collect(folk)),
    /** What a Restock would take from your bank now (v10): { items: [{ itemId, qty, have }], freeMs, actions }. */
    restockPlan: (id) => roomCall(id, (room, folk) => room.restockPlanOf(folk)),
    /**
     * Restocks a Folk's free room with its current recipe's inputs from your bank (v10), at most `maxActions`
     * actions' worth, and starts an "Out of inputs" Folk again. { ok: true, actions, items: [{ itemId, qty }] } or
     * { ok: false, why: 'noStock' | 'noSkill' | 'noInputs' | 'noRoom' | 'noBank' }. Not asked of the staff guards: the
     * caller is the guard.
     */
    restock: (id, { maxActions = Infinity } = {}) => roomCall(id, (room, folk) => Object.freeze(room.restockResult(folk, maxActions, { guard: false }))),
    /**
     * Empties a Folk's room to the bank (v10), or every Folk's with no id: its haul and purse, and its stock unless its
     * own-stock switch is on (`inputs: true` sends that stock too). A commission's goods stay. With an id:
     * { items, left, purse } as collect; without: [{ id, items, left, purse }].
     */
    emptyToBank: (id, { inputs = false } = {}) => {
      const room = hiring().room;
      if (room === undefined) return undefined;
      if (id === undefined || id === null) return Object.freeze(hiring().crew.all.map((folk) => Object.freeze({ id: folk.id, ...room.emptyToBank(folk, { inputs }) })));
      const folk = record(id);
      return folk === undefined ? undefined : room.emptyToBank(folk, { inputs });
    },
    /**
     * Tent depots (v11): a shared room kept by your id, sized in hours of work (48 by default). Register every standing
     * one on each character load (before offline progress); one not registered again is emptied to the bank once the
     * game is up. Its Folks are those your bank-access hook answers { access: 'room', depot: id } for.
     */
    registerDepot: (id, opts = {}) => hiring().depots?.register(id, opts) === true,
    /**
     * The depot is gone (the tent struck): everything in it to the bank; what the bank can't take yet waits and goes
     * as space comes. { items, left, purse } as emptyToBank.
     */
    dropDepot: (id) => hiring().depots?.drop(id),
    /**
     * A depot, frozen: { id, name, sizeMs, usedMs, haul, stock, members, state }; haul (what its Folks made) and stock
     * (inputs for them) are [{ itemId, qty, ms }], members Folk ids, state 'ok' | 'full' | 'unregistered' | 'dropped'.
     * undefined for an unknown id.
     */
    depot: (id) => hiring().depots?.view(id),
    /** What its Folks made, and stock none of their recipes uses now, to the bank. { items, left, purse }. */
    collectDepot: (id) => hiring().depots?.collect(id),
    /**
     * Restock all at the depot: each member with a recipe gets an equal share of the free hours in its inputs, from the
     * bank. { ok: true, members: [{ folkId, actions, items }], items } or { ok: false, why } ('unknown' | 'noMembers' |
     * 'noRoom' | 'noBank'). Members stopped for want of inputs start again. Your staff guard is not asked.
     */
    restockDepot: (id) => hiring().depots?.restock(id),
    /** Everything in the depot to the bank, the depot staying up. { items, left, purse }. */
    emptyDepot: (id) => hiring().depots?.empty(id),
    /** Asks for the guarded buttons and the Shop's lines to be drawn again (call after the player moves). */
    refresh: () => hiring().refreshGuarded(),
  });
}
