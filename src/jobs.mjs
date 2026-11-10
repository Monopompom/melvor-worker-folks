// Jobs (joint order round 3): a Folk's assignment that is not a skill, such as the Quartermaster. A job takes a Shift
// Slot and draws its tier's wage for the time it works, like a skill, but makes no skill actions: the job's own `work`
// runs every `everyMs` of game time on game ticks, so offline as well. Hiring XP and the Folk's mastery come with that
// time as with a skill's. Another mod registers its own job through the API (v11, registerJob). Game-facing.

export function install(ctx, { getHiring, log }) {
  let hiring;
  /** id → the registered job. */
  const kinds = new Map();
  /** Folk ids whose job runs now (it holds a Shift Slot). */
  const running = new Set();
  /** Folk id → game time (ms) worked since its job last looked. */
  const carry = new Map();
  /** Folk id → why its job waits right now ('' when it doesn't), from the job's last look. */
  const waiting = new Map();
  /** Folk id → why another mod holds the job off where the Folk is (its 'work' guard): the job doesn't run then. */
  const held = new Map();

  const text = (v) => (typeof v === 'function' ? v() : v);

  /**
   * A job as the mod shows work: `id`, `name`, `media` read like a skill's, so the cards, the Overview and the wage
   * lines name it as they name a skill. `isJob` tells the two apart.
   */
  const makeKind = (def) => ({
    id: def.id,
    isJob: true,
    get name() { return String(text(def.name) ?? def.id); },
    get media() { return text(def.media); },
    def,
  });

  const api = {
    /**
     * Registers a job. `def`: { id, name, media (strings or functions), everyMs(folk) → ms between looks,
     * work(folk, ms, { offline }) → '' or why it waits, unlocked() → boolean, lockText() → the lock's reason,
     * refusal(folk) → '' or why this Folk can't take it, describe(folk) → lines for the card's tooltip, travels: true
     * when the job works wherever the Folk is (along with the player too; another mod's 'work' guard says where it
     * waits), else the Folk stays put for it }. A second registration of an id replaces the first.
     */
    register(def) {
      if (def === null || typeof def !== 'object' || typeof def.id !== 'string' || def.id === '') throw new Error('registerJob: an id is required');
      if (typeof def.work !== 'function' || typeof def.everyMs !== 'function') throw new Error(`registerJob ${def.id}: work and everyMs are required`);
      kinds.set(def.id, makeKind(def));
      if (hiring !== undefined) hiring.renderQueue.folks = true;
      return kinds.get(def.id);
    },
    /** Removes a job; a Folk on it keeps the id (its mod may come back) and stops until then. */
    unregister(id) {
      if (!kinds.delete(id)) return false;
      if (hiring !== undefined) hiring.renderQueue.folks = true;
      return true;
    },
    kind(id) {
      return kinds.get(id);
    },
    /** Every registered job, in registration order. */
    get all() {
      return [...kinds.values()];
    },
    /** The Folk's job, or undefined (none, or a job whose mod is no longer loaded). */
    of(folk) {
      return folk.job === null ? undefined : kinds.get(folk.job);
    },
    isRunning(folk) {
      return running.has(folk.id);
    },
    get runningCount() {
      return running.size;
    },
    /** Why another mod holds the Folk's job off ('' when nothing does): it then takes no Shift Slot and no wage. */
    heldText(folk) {
      return held.get(folk.id) ?? '';
    },
    /** Why the Folk's job waits right now ('' when it works or has no job). */
    waitText(folk) {
      return running.has(folk.id) ? waiting.get(folk.id) ?? '' : '';
    },
    unlocked(kind) {
      try { return kind.def.unlocked?.() !== false; } catch { return false; }
    },
    /**
     * Why this Folk can't take this job now ('' = it can): the job locked, the Folk on strike or cooling down, the job's
     * own rule, or another mod's staff guard (action 'job').
     */
    refusal(folk, jobId) {
      const kind = kinds.get(jobId);
      if (kind === undefined) return '';
      if (!api.unlocked(kind)) return String(text(kind.def.lockText) ?? '');
      if (!hiring.folkAvailable(folk)) return getLangString(`MOD_WF_STATUS_${hiring.statusOf(folk)}`);
      let own = '';
      try { own = kind.def.refusal?.(folk) ?? ''; } catch (err) { console.error(`[Worker Folks] job ${jobId} refusal failed`, err); }
      if (own !== '') return own;
      return hiring.refusal('staff', { action: 'job', folk, jobId });
    },
    /** Puts the Folk on a job (null: none). A refusal shows as a toast. Returns true when the Folk's job is `jobId`. */
    set(folk, jobId) {
      if (folk.job === jobId) return true;
      if (jobId !== null) {
        const why = api.refusal(folk, jobId);
        if (why !== '') {
          hiring.game.notifications.createErrorNotification('worker_folks:job', why);
          return false;
        }
        // Its skill stops first, through the mod's own stop (a strike or a firing takes the same way).
        const skill = hiring.skillOf(folk);
        if (skill !== undefined) hiring.forceStop(skill);
      }
      hiring.crew.assignJob(folk.id, jobId, { travels: kinds.get(jobId)?.def.travels === true });
      log(`${folk.name} job → ${jobId}`);
      return true;
    },
  };

  /**
   * Whether the Folk's job may run this tick: registered, open, the Folk free to work, a Shift Slot, and the Folk at
   * home unless the job travels.
   */
  const mayRun = (folk, kind) => {
    if (kind === undefined || !api.unlocked(kind)) return false;
    if ((kind.def.travels !== true && folk.travel !== 'idle') || !hiring.folkAvailable(folk)) return false;
    if (running.has(folk.id)) return true;
    return hiring.delegated.size + running.size < hiring.shiftSlots;
  };

  const stopRunning = (folk) => {
    if (!running.delete(folk.id)) return;
    carry.delete(folk.id);
    waiting.delete(folk.id);
    hiring.renderQueue.folks = true;
  };

  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid || this._isPaused) return;
    if (running.size === 0 && !hiring.crew.all.some((f) => f.job !== null)) return;
    const offline = !this._isInOnlineLoop;
    for (const folk of hiring.crew.all) {
      const kind = api.of(folk);
      if (!mayRun(folk, kind)) { stopRunning(folk); if (held.delete(folk.id)) hiring.renderQueue.folks = true; continue; }
      // Another mod may refuse the work where the Folk stands (a 'work' guard asked with the job's id, no skill; Voyage:
      // the Quartermaster away from your crew). Like a skill refused there, the job then stops: no slot, no wage.
      const guard = hiring.refusal('work', { folk, jobId: kind.id });
      if (guard !== (held.get(folk.id) ?? '')) {
        if (guard === '') held.delete(folk.id); else held.set(folk.id, guard);
        hiring.renderQueue.folks = true;
      }
      if (guard !== '') { stopRunning(folk); continue; }
      if (!running.has(folk.id)) {
        running.add(folk.id);
        hiring.renderQueue.folks = true;
      }
      const ms = (carry.get(folk.id) ?? 0) + TICK_INTERVAL;
      let every = 0;
      try { every = kind.def.everyMs(folk); } catch { every = 0; }
      if (!(every > 0) || ms < every) { carry.set(folk.id, ms); continue; }
      carry.set(folk.id, 0);
      let wait = '';
      try { wait = String(kind.def.work(folk, ms, { offline }) ?? ''); } catch (err) { console.error(`[Worker Folks] job ${kind.id} failed`, err); }
      if (wait !== (waiting.get(folk.id) ?? '')) hiring.renderQueue.folks = true;
      waiting.set(folk.id, wait);
      // Time worked, waiting included (a wait keeps the wage running, as a skill's Folk standing by for its stock).
      hiring.addFolkMastery(folk, ms);
      hiring.events.emit('folkJobWorked', { folk, jobId: kind.id, ms, offline });
      hiring.payroll?.chargeJob?.(folk, kind, ms);
    }
  });

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.jobs = api;
    // A Folk that leaves its job or the crew gives its Shift Slot back at once.
    hiring.events.on('folkJobChanged', ({ folk }) => { stopRunning(folk); held.delete(folk.id); });
    hiring.events.on('folkFired', ({ folk }) => { stopRunning(folk); held.delete(folk.id); });
  });

  return api;
}
