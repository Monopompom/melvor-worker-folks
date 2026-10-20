// Earned traits: what a Folk learns from what it does, the four slots that Folk mastery opens, the queue of traits
// learned while every open slot is full, fading, Forget and the effects a Folk's traits add up to. Pure: no game
// globals. A Folk's trait state lives on the Folk: { traits, waiting, counts }.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Folk mastery levels that open slots 1 to 4. */
export const SLOT_LEVELS = [1, 25, 50, 99];
export const MAX_SLOTS = SLOT_LEVELS.length;
/** Forget costs this share of the tier's next hire price. */
export const FORGET_PRICE_RATE = 0.25;
export const TIER_ORDER = ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'];

/**
 * Every trait in display order. `learn.on` names the progress source the game side reports and `learn.target` how much
 * of it teaches the trait; `learn.resetOn` a source that sends the count back to zero (continuous conditions).
 * `learn.perSkill` keeps one count per skill and remembers the skill on the trait. `fade` is how a bad trait goes:
 * a count of its own (`on`, `target`, `resetOn`) or a tier reached by promotion. Effects are percentages unless said:
 * interval, xp, preservation and doubling apply to the skill the Folk works; specialistXP and specialistInterval only
 * to the trait's own skill; fightingXP only while the player fights; masteryXP to the Folk's mastery XP; wage to its
 * wage; overtimeWage to the Overtime wage factor; grace to the strike grace; cooldown to the strike cooldown.
 */
export const TRAITS = [
  { id: 'Specialist', kind: 'good', icon: 'trait_specialist', learn: { on: 'work', target: 24 * HOUR, perSkill: true }, effects: { specialistXP: 10, specialistInterval: -5 } },
  { id: 'EarlyBird', kind: 'good', icon: 'trait_early_bird', learn: { on: 'workAway', target: 24 * HOUR }, effects: { interval: -5 } },
  { id: 'NightOwl', kind: 'good', icon: 'trait_night_owl', learn: { on: 'workFighting', target: 24 * HOUR }, effects: { fightingXP: 10 } },
  { id: 'QuickLearner', kind: 'good', icon: 'trait_quick_learner', learn: { on: 'promotion', target: 1 }, effects: { masteryXP: 25 } },
  { id: 'Frugal', kind: 'good', icon: 'trait_frugal', learn: { on: 'workPaid', target: 7 * DAY, resetOn: 'debt' }, effects: { wage: -20 } },
  { id: 'Loyal', kind: 'good', icon: 'trait_loyal', learn: { on: 'hired', target: 30 * DAY, resetOn: 'strike' }, effects: { neverStrikes: true } },
  { id: 'Veteran', kind: 'good', icon: 'trait_veteran', learn: { on: 'workMastered', target: 100 * HOUR }, effects: { interval: -5, xp: 5 } },
  { id: 'Meticulous', kind: 'mixed', icon: 'trait_meticulous', learn: { on: 'materialAction', target: 20000 }, effects: { preservation: 5, interval: 5 } },
  { id: 'Greedy', kind: 'mixed', icon: 'trait_greedy', learn: { on: 'strike', target: 3 }, effects: { wage: 30, interval: -5 } },
  { id: 'Workaholic', kind: 'mixed', icon: 'trait_workaholic', learn: { on: 'workOvertime', target: 48 * HOUR }, effects: { overtimeWage: -25, grace: -50 } },
  { id: 'Lucky', kind: 'mixed', icon: 'trait_lucky', learn: { on: 'bonus', target: 2000 }, effects: { doubling: 5, wage: 10 } },
  { id: 'Ambitious', kind: 'mixed', icon: 'trait_ambitious', learn: { on: 'promotion', target: 2 }, effects: { xp: 10, wage: 15 } },
  { id: 'Clumsy', kind: 'bad', icon: 'trait_clumsy', learn: { on: 'fail', target: 500 }, effects: { interval: 5 }, fade: { tier: 'Middle' } },
  { id: 'Lazy', kind: 'bad', icon: 'trait_lazy', learn: { on: 'idle', target: 24 * HOUR, resetOn: 'work' }, effects: { interval: 10 }, fade: { on: 'work', target: 24 * HOUR } },
  { id: 'Sickly', kind: 'bad', icon: 'trait_sickly', learn: { on: 'lowHp', target: 1 }, effects: { interval: 10 }, fade: { on: 'fullHp', target: 7 * DAY, resetOn: 'hurt' } },
  { id: 'Wasteful', kind: 'bad', icon: 'trait_wasteful', learn: { on: 'materialFail', target: 1000 }, effects: { preservation: -10 } },
  { id: 'Resentful', kind: 'bad', icon: 'trait_resentful', learn: { on: 'strikeOpen', target: 24 * HOUR, resetOn: 'settled' }, effects: { cooldown: 50 } },
];

const BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

export function traitDef(id) {
  return BY_ID.get(id);
}

/** Slots open at a Folk mastery level (0 to 4). */
export function openSlots(level) {
  const l = Math.floor(Number(level) || 0);
  return SLOT_LEVELS.filter((min) => l >= min).length;
}

/** Mastery level that opens the next closed slot, or null when all four are open. */
export function nextSlotLevel(level) {
  return SLOT_LEVELS[openSlots(level)] ?? null;
}

export function forgetCost(hirePrice) {
  return Math.ceil(Math.max(0, Number(hirePrice) || 0) * FORGET_PRICE_RATE);
}

const tierRank = (tier) => TIER_ORDER.indexOf(tier);

/** A Folk with nothing learned yet. The save's own normalizing is in src/folk.mjs. */
export function emptyTraitState() {
  return { traits: [], waiting: [], counts: {} };
}

const has = (state, id) => state.traits.some((t) => t.id === id) || state.waiting.some((t) => t.id === id);
const fadeKey = (id) => `${id}.fade`;
const specialistPrefix = 'Specialist:';

/** Sends a trait's learning count back to zero (Forget, fading). */
function restartLearning(state, id) {
  if (id === 'Specialist') {
    Object.keys(state.counts).filter((k) => k.startsWith(specialistPrefix)).forEach((k) => delete state.counts[k]);
  } else {
    delete state.counts[id];
  }
  delete state.counts[fadeKey(id)];
}

/**
 * Adds `amount` of a progress source: learning counts of traits the Folk lacks, and fade counts of traits it holds or
 * waits on. `skillId` is the skill the progress belongs to (Specialist).
 */
export function addProgress(state, source, amount, { skillId = null } = {}) {
  const n = Number(amount);
  if (!(n > 0)) return;
  for (const t of TRAITS) {
    if (t.learn.on === source && !has(state, t.id)) {
      if (t.learn.perSkill) {
        if (skillId === null) continue;
        const key = `${specialistPrefix}${skillId}`;
        state.counts[key] = (state.counts[key] ?? 0) + n;
      } else {
        state.counts[t.id] = (state.counts[t.id] ?? 0) + n;
      }
    }
    if (t.fade?.on === source && has(state, t.id)) state.counts[fadeKey(t.id)] = (state.counts[fadeKey(t.id)] ?? 0) + n;
  }
}

/** Fills a trait's learning count to its target, so the next settle learns it (the dev console). */
export function completeLearning(state, id, { skillId = null } = {}) {
  const def = BY_ID.get(id);
  if (def === undefined || (def.learn.perSkill && skillId === null)) return false;
  state.counts[def.learn.perSkill ? `${specialistPrefix}${skillId}` : id] = def.learn.target;
  return true;
}

/** A source that breaks a continuous condition: those counts go back to zero. */
export function resetProgress(state, source) {
  for (const t of TRAITS) {
    if (t.learn.resetOn === source) delete state.counts[t.id];
    if (t.fade?.resetOn === source) delete state.counts[fadeKey(t.id)];
  }
}

/**
 * Learns what has been earned, fades what has gone and fills open slots from the queue. `level` is the Folk's mastery
 * level, `tier` its tier. Returns the changes in order: { type: 'learned' | 'waiting' | 'slotted' | 'faded', trait }.
 */
export function settle(state, { level, tier }) {
  const changes = [];
  const open = openSlots(level);
  const place = (trait) => {
    if (state.traits.length < open) {
      state.traits.push(trait);
      changes.push({ type: 'learned', trait });
    } else {
      state.waiting.push(trait);
      changes.push({ type: 'waiting', trait });
    }
  };
  // Fading first, so a slot it frees can take a trait learned in the same pass.
  const faded = (t) => {
    const def = BY_ID.get(t.id);
    if (def?.fade === undefined) return false;
    if (def.fade.tier !== undefined) return tierRank(tier) >= tierRank(def.fade.tier);
    return (state.counts[fadeKey(t.id)] ?? 0) >= def.fade.target;
  };
  for (const listName of ['traits', 'waiting']) {
    state[listName] = state[listName].filter((t) => {
      if (!faded(t)) return true;
      restartLearning(state, t.id);
      changes.push({ type: 'faded', trait: t });
      return false;
    });
  }
  // The queue goes first: a trait learned earlier takes a free slot before one learned now.
  while (state.traits.length < open && state.waiting.length > 0) {
    const trait = state.waiting.shift();
    state.traits.push(trait);
    changes.push({ type: 'slotted', trait });
  }
  for (const t of TRAITS) {
    if (has(state, t.id)) continue;
    if (t.learn.perSkill) {
      const done = Object.entries(state.counts).find(([k, v]) => k.startsWith(specialistPrefix) && v >= t.learn.target);
      if (done === undefined) continue;
      restartLearning(state, t.id);
      place({ id: t.id, skillId: done[0].slice(specialistPrefix.length) });
    } else if ((state.counts[t.id] ?? 0) >= t.learn.target) {
      delete state.counts[t.id];
      // A bad trait that would fade at once (Clumsy learned by a Journeyman) is never learned.
      if (t.fade?.tier !== undefined && tierRank(tier) >= tierRank(t.fade.tier)) continue;
      place({ id: t.id });
    }
  }
  return changes;
}

/** Forgets the held trait at `index`: its slot frees, its count restarts, the queue moves up. */
export function forget(state, index, { level, tier }) {
  const trait = state.traits[index];
  if (trait === undefined) return { trait: null, changes: [] };
  state.traits.splice(index, 1);
  restartLearning(state, trait.id);
  return { trait, changes: settle(state, { level, tier }) };
}

/**
 * What a Folk's held traits add up to while it works `skillId` (null when it works nothing). `fighting` is true while
 * the player is in combat. Unknown ids add nothing. Wage, grace and cooldown come back as factors.
 */
export function effectsOf(traits, { skillId = null, fighting = false } = {}) {
  const out = {
    interval: 0, xp: 0, preservation: 0, doubling: 0, masteryXP: 0,
    wageFactor: 1, overtimeWageFactor: 1, graceFactor: 1, cooldownFactor: 1, neverStrikes: false,
  };
  for (const t of traits ?? []) {
    const e = BY_ID.get(t.id)?.effects;
    if (e === undefined) continue;
    out.interval += e.interval ?? 0;
    out.xp += e.xp ?? 0;
    out.preservation += e.preservation ?? 0;
    out.doubling += e.doubling ?? 0;
    out.masteryXP += e.masteryXP ?? 0;
    if (skillId !== null && t.skillId === skillId) {
      out.interval += e.specialistInterval ?? 0;
      out.xp += e.specialistXP ?? 0;
    }
    if (fighting) out.xp += e.fightingXP ?? 0;
    if (e.wage !== undefined) out.wageFactor *= 1 + e.wage / 100;
    if (e.overtimeWage !== undefined) out.overtimeWageFactor *= 1 + e.overtimeWage / 100;
    if (e.grace !== undefined) out.graceFactor *= 1 + e.grace / 100;
    if (e.cooldown !== undefined) out.cooldownFactor *= 1 + e.cooldown / 100;
    if (e.neverStrikes) out.neverStrikes = true;
  }
  return out;
}

/** True when the Folk holds a trait that only counts while the player fights (its table must follow combat). */
export function followsCombat(traits) {
  return (traits ?? []).some((t) => BY_ID.get(t.id)?.effects.fightingXP !== undefined);
}
