// Saved crew plans (round 5): up to five named snapshots of who works what, applied later in one go. Pure: no game
// globals. The game side (crew-plans.mjs) reads the crew into the plain views these functions take.

// The game loads each module on its own, so a module never imports another: these match folk.mjs (a test holds them
// to it).
/** The most plans saved. */
export const PLANS_MAX = 5;
/** The most steps in a Folk's recipe queue. */
export const QUEUE_MAX = 3;
/** A namespaced id ("voyage:Courier"). */
export const NS_ID = /^[A-Za-z0-9_]+:[A-Za-z0-9_]+$/;
/** The longest plan name, in characters. */
export const PLAN_NAME_MAX = 24;
/** The most Folks one plan lists (far above any crew: a bound for what a save may bring in). */
const ENTRIES_MAX = 200;

/** A typed plan name tidied: single spaces, trimmed, what could break popup markup taken out. */
export function cleanPlanName(text) {
  return String(text ?? '').normalize('NFC').replace(/[<>&"`]/g, '').replace(/\s+/g, ' ').trim();
}

/** What is wrong with a plan name: 'empty', 'long', or null when it is fine. */
export function planNameProblem(text) {
  const name = cleanPlanName(text);
  if (name === '') return 'empty';
  return [...name].length > PLAN_NAME_MAX ? 'long' : null;
}

const str = (x) => (typeof x === 'string' && x !== '' ? x : null);
const plainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function normalizeStep(raw) {
  if (!plainObject(raw) || str(raw.recipeId) === null) return null;
  const count = raw.count === null ? null : Number.isInteger(raw.count) && raw.count > 0 ? raw.count : undefined;
  return count === undefined ? null : { recipeId: raw.recipeId, count, made: 0 };
}

/**
 * One Folk's line of a plan, or null: a skill (with its recipe, its saved pick, its queue and whether it was at work)
 * or a job, never both. A queue's steps start again from nothing made when the plan is applied. A line saved before
 * plans kept `working` counts as at work.
 */
export function normalizeEntry(raw) {
  if (!plainObject(raw) || str(raw.folkId) === null) return null;
  const skillId = str(raw.skillId);
  const jobId = str(raw.jobId);
  if ((skillId === null) === (jobId === null)) return null;
  if (jobId !== null) return NS_ID.test(jobId) ? { folkId: raw.folkId, skillId: null, jobId, recipeId: null, pick: null, queue: [], working: true } : null;
  const queue = (Array.isArray(raw.queue) ? raw.queue : []).map(normalizeStep).filter((s) => s !== null).slice(0, QUEUE_MAX);
  return { folkId: raw.folkId, skillId, jobId: null, recipeId: str(raw.recipeId), pick: plainObject(raw.pick) ? raw.pick : null, queue, working: raw.working !== false };
}

/** A plan as saved, or null: an id, a fine name, and its entries (one per Folk, one Folk per skill). */
export function normalizePlan(raw) {
  if (!plainObject(raw) || str(raw.id) === null || planNameProblem(raw.name) !== null) return null;
  const folks = new Set();
  const skills = new Set();
  const entries = [];
  for (const e of (Array.isArray(raw.entries) ? raw.entries : []).slice(0, ENTRIES_MAX)) {
    const entry = normalizeEntry(e);
    if (entry === null || folks.has(entry.folkId) || (entry.skillId !== null && skills.has(entry.skillId))) continue;
    folks.add(entry.folkId);
    if (entry.skillId !== null) skills.add(entry.skillId);
    entries.push(entry);
  }
  return entries.length === 0 ? null : { id: raw.id, name: cleanPlanName(raw.name), entries };
}

/** The saved list: plans that read, names never twice (the first kept), at most PLANS_MAX. */
export function normalizePlans(raw) {
  const out = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    const plan = normalizePlan(p);
    if (plan === null || out.some((q) => q.id === plan.id || sameName(q.name, plan.name))) continue;
    out.push(plan);
    if (out.length === PLANS_MAX) break;
  }
  return out;
}

const sameName = (a, b) => cleanPlanName(a).toLocaleLowerCase() === cleanPlanName(b).toLocaleLowerCase();

/** The saved plan with this name, any case, or undefined. */
export const planNamed = (plans, name) => plans.find((p) => sameName(p.name, name));

/**
 * Saves `entries` as a plan named `name`: a plan of that name is replaced in its place, else a new one goes last.
 * { plans, replaced } or { error: 'empty' | 'long' | 'full' | 'nothing' }. `id` names a new plan.
 */
export function savePlan(plans, name, entries, id) {
  const problem = planNameProblem(name);
  if (problem !== null) return { error: problem };
  const old = planNamed(plans, name);
  if (old === undefined && plans.length >= PLANS_MAX) return { error: 'full' };
  const plan = normalizePlan({ id: old?.id ?? id, name, entries });
  if (plan === null) return { error: 'nothing' };
  return old === undefined ? { plans: [...plans, plan], replaced: false } : { plans: plans.map((p) => (p === old ? plan : p)), replaced: true };
}

export const deletePlan = (plans, id) => plans.filter((p) => p.id !== id);

const sameQueue = (a, b) => a.length === b.length && a.every((s, i) => s.recipeId === b[i].recipeId && s.count === b[i].count);

/**
 * What applying `plan` would do, Folk by Folk, in the plan's order. `crew` is the crew now:
 * [{ id, name, skillId, jobId, recipeId, queue, working, walking, available }] (`recipeId` the recipe its skill has
 * selected, `queue` its steps). Options: `refusal(folk, entry)` → '' or why another rule refuses it (qualification, the
 * Folk's hex, a job's own rule); `sharedJob(jobId)` → true when several Folks may hold that job.
 * Each row: { folkId, name, kind, why?, holder?, holderInPlan?, idle?, queueOnly? } with kind
 *   'same'   already so and working (or, for a Folk saved idle, idle on that skill): left alone
 *   'start'  already so, idle: started
 *   'stop'   saved idle, now at work on that skill: stopped, so its Shift Slot is free for the plan's workers
 *   'recipe' its skill kept, another recipe or queue (`queueOnly` true: the same recipe, only the queue differs)
 *   'move'   another skill (`idle` true: the Folk was saved idle, so it takes the skill and its queue, not started)
 *   'job'    another job, or a job instead of a skill
 *   'skip'   it can't: why 'gone' (no longer in the crew) | 'walking' | 'unavailable' (strike, cooldown) | 'held'
 *            (`holder` keeps the skill or job: a Folk the plan leaves alone, or with `holderInPlan` one of the plan
 *            that can't move itself) | 'refused' (`reason` the rule's text)
 */
export function planChanges(plan, crew, { refusal = () => '', sharedJob = () => false } = {}) {
  const byId = new Map(crew.map((f) => [f.id, f]));
  const inPlan = new Set(plan.entries.map((e) => e.folkId));
  const holderOf = (pred) => crew.find((f) => pred(f) && !inPlan.has(f.id));
  const rows = plan.entries.map((e) => {
    const f = byId.get(e.folkId);
    if (f === undefined) return { folkId: e.folkId, name: null, kind: 'skip', why: 'gone' };
    const row = (kind, more = {}) => ({ folkId: f.id, name: f.name, kind, ...more });
    if (e.jobId !== null) {
      if (f.jobId === e.jobId) return row(f.available ? 'same' : 'skip', f.available ? {} : { why: 'unavailable' });
    } else if (!e.working && f.skillId === e.skillId && f.jobId === null) {
      // Saved idle, and it already has that skill: a plan starts only the Folks that were at work, and stops one that
      // works now, so the Shift Slots go to the plan's workers.
      return row(f.working ? 'stop' : 'same');
    } else if (f.skillId === e.skillId && f.jobId === null && (e.recipeId === null || f.recipeId === e.recipeId) && sameQueue(f.queue ?? [], e.queue)) {
      if (f.working) return row('same');
      if (!f.available) return row('skip', { why: 'unavailable' });
      return row('start');
    }
    if (f.walking) return row('skip', { why: 'walking' });
    if (!f.available) return row('skip', { why: 'unavailable' });
    const holder = e.jobId !== null
      ? (sharedJob(e.jobId) ? undefined : holderOf((h) => h.id !== f.id && h.jobId === e.jobId))
      : holderOf((h) => h.id !== f.id && h.skillId === e.skillId);
    if (holder !== undefined) return row('skip', { why: 'held', holder: holder.name });
    const reason = refusal(f, e);
    if (reason !== '') return row('skip', { why: 'refused', reason });
    if (e.jobId !== null) return row('job');
    if (!e.working) return row('move', { idle: true });
    if (f.skillId === e.skillId && f.jobId === null) return row('recipe', e.recipeId === null || f.recipeId === e.recipeId ? { queueOnly: true } : {});
    return row('move');
  });
  // A Folk of the plan that can't move keeps what it holds, so a line that needs that skill or job can't move either,
  // and so on down the chain.
  const kept = new Map(rows.map((r) => [r.folkId, r]));
  const stays = (id) => { const k = kept.get(id)?.kind; return k === undefined || k === 'skip' || k === 'same' || k === 'stop'; };
  for (let changed = true; changed;) {
    changed = false;
    for (const [i, r] of rows.entries()) {
      if (r.kind !== 'move' && r.kind !== 'job') continue;
      const e = plan.entries[i];
      const holder = crew.find((h) => h.id !== r.folkId && inPlan.has(h.id) && stays(h.id)
        && (e.jobId !== null ? !sharedJob(e.jobId) && h.jobId === e.jobId : h.skillId === e.skillId));
      if (holder === undefined) continue;
      rows[i] = { folkId: r.folkId, name: r.name, kind: 'skip', why: 'held', holder: holder.name, holderInPlan: true };
      kept.set(r.folkId, rows[i]);
      changed = true;
    }
  }
  return rows;
}

/** Whether a preview has anything to do (a row that starts, moves or changes something). */
export const planDoesSomething = (rows) => rows.some((r) => r.kind !== 'same' && r.kind !== 'skip');
