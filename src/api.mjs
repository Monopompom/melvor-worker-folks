// The API other mods read as `mod.api.worker_folks` (Voyage, phase 6): the Folks, each Folk's place and travel,
// events and guards. Everything handed out is a frozen copy, so another mod never writes a Folk record directly.
// Pure: the Hiring skill and the Folk model are injected (mod modules cannot import their siblings).

/** Bumped when something here changes in a way a caller must know about. Voyage refuses an older one. */
export const API_VERSION = 1;

const placeCopy = (place) => (place === null || place === undefined ? null : Object.freeze({ q: place.q, r: place.r }));

/** A read-only view of a Folk. */
export function folkView(folk, status) {
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
  const view = (folk) => folkView(folk, hiring().statusOf(folk));
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
    /** 'idle' (stays on its place) or 'with' (goes along with the player). */
    setTravel: (id, travel) => {
      const folk = record(id);
      if (folk === undefined || !TRAVEL.includes(travel)) return false;
      if (folk.travel === travel) return true;
      const from = { place: folk.place, travel: folk.travel };
      folk.travel = travel;
      moved(folk, from);
      return true;
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
    /** Asks for the guarded buttons and the Shop's lines to be drawn again (call after the player moves). */
    refresh: () => hiring().refreshGuarded(),
  });
}
