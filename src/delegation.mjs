// Delegation core: a skill held by a Folk keeps running beside game.activeAction.
//
// The engine has exactly one active action. Every start path (GatheringSkill,
// Archaeology, Cartography's mode starters, Agility via super) ends with
// `game.activeAction = this`, and every stop path ends with
// `game.clearActiveAction()` i.e. `game.activeAction = undefined`. Instead of
// patching each path, `activeAction` is turned into an accessor on the game
// instance: a start that should be delegated lands in `hiring.delegated`, a stop
// of a delegated skill removes it, and the main slot is left untouched.

export function install(ctx, { getHiring, rules, resume, isDisabled = () => false, log }) {
  let hiring;
  // The pick each Folk-held skill started on (tree, rock, dig site…), for the hand-over below. Taken at the start:
  // Woodcutting drops the clicked tree before it stops, so a snapshot at the stop would be empty.
  const picks = new Map();
  // True while delegated skills tick: a stop from inside an action (out of materials…) is not the player's click.
  let ticking = false;
  const skillFor = (action) => (hiring === undefined ? undefined : hiring.delegableSkills.find((s) => s === action));
  const folkFor = (skill) => (skill === undefined ? undefined : hiring.crew.bySkill(skill.id));
  const decide = (action) => {
    if (isDisabled()) return 'main';
    const skill = skillFor(action);
    if (skill === undefined) return 'main';
    const folk = folkFor(skill);
    return rules.decideStart({
      hasFolk: folk !== undefined,
      // Another mod may refuse the Folk this skill where it stands (Voyage's work guard): unavailable, with its reason.
      folkAvailable: folk === undefined || (hiring.folkAvailable(folk) && hiring.workRefusal(folk, skill) === ''),
      isDelegated: hiring.delegated.has(skill),
      delegatedCount: hiring.delegated.size,
      shiftSlots: hiring.shiftSlots,
    });
  };

  const installAccessor = () => {
    let main = game.activeAction;
    Object.defineProperty(game, 'activeAction', {
      configurable: true,
      enumerable: true,
      get() {
        return main;
      },
      set(value) {
        if (hiring !== undefined) {
          if (value !== undefined && decide(value) === 'delegate') {
            hiring.delegated.add(value);
            picks.set(value, resume.selectionOf(value));
            hiring.renderQueue.folks = true;
            log(`delegated: ${value.id}`);
            hiring.events.emit('folkStarted', { skill: value, folk: folkFor(value) });
            return; // main slot untouched
          }
          if (value === undefined && hiring.stopping !== undefined) {
            if (hiring.delegated.has(hiring.stopping)) {
              hiring.release(hiring.stopping);
              return;
            }
          }
        }
        main = value;
      },
    });
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.decideStart = decide;
    installAccessor();
  });

  // 1. Starting a Folk-held skill never stops the main action; without a free
  //    Shift Slot the start is refused (idleChecker returning true aborts start()).
  ctx.patch(Game, 'idleChecker').replace(function (original, action) {
    if (hiring === undefined || this.isGolbinRaid) return original(action);
    // You picked: the Folk leaves the skill only when your start is accepted. Another mod may refuse it where you
    // stand (Voyage: no trees on your hex), and then the Folk keeps its job.
    if (skillFor(action) !== undefined && hiring.pendingFor(action) === null) {
      const refused = original(action);
      if (refused !== true) hiring.applyPending(action);
      return refused;
    }
    // A Folk picked while busy on another skill moves at this start: only if it still may (another mod may refuse it
    // now: you walked off since the pick). Refused, the start waits and the Folk on the skill keeps it.
    const moving = skillFor(action) === undefined ? undefined : hiring.pendingFor(action);
    if (moving !== undefined && moving !== null) {
      const why = hiring.refusal('staff', { action: 'assign', folk: moving, skillId: action.id, skill: action });
      if (why !== '') {
        this.notifications.createErrorNotification('worker_folks:unavailable', why);
        return true;
      }
    }
    if (skillFor(action) !== undefined) hiring.applyPending(action);
    switch (decide(action)) {
      case 'delegate':
        return false;
      case 'unavailable': {
        const folk = folkFor(skillFor(action));
        const why = folk === undefined ? '' : hiring.workRefusal(folk, skillFor(action));
        if (why !== '') {
          this.notifications.createErrorNotification('worker_folks:unavailable', why);
          return true;
        }
        // The refusal says how to fix it, per status (scan B-14, build .112).
        const status = folk === undefined ? 'strike' : hiring.statusOf(folk);
        this.notifications.createErrorNotification(
          'worker_folks:unavailable',
          templateLangString(`MOD_WF_FOLK_UNAVAILABLE_${status === 'cooldown' ? 'cooldown' : 'strike'}`, { name: folk?.name ?? '?', time: folk === undefined ? '' : hiring.cooldownLeft(folk) }),
        );
        return true;
      }
      case 'refuse':
        this.notifications.createErrorNotification(
          'worker_folks:noslot',
          templateLangString('MOD_WF_NO_SHIFT_SLOT', { used: `${hiring.delegated.size}`, slots: `${hiring.shiftSlots}` }),
        );
        return true;
      default:
        return original(action);
    }
  });

  // 2. A stopping delegated skill must not clear the main slot. Wrapped per
  //    instance so skills from other mods (any class with stop()) are covered too.
  //    The player picked You while the Folk works (pending null) and clicks the Folk's tree, area button or
  //    recipe: the game toggles it off and stops, which hands the skill to the player but started nothing, so it
  //    took a second click. The same click now starts the player on the Folk's pick (build .83, the user's call).
  const WRAPPED = Symbol('worker_folks.stopWrapped');
  const takeOver = (skill, pick) => {
    if (skill.isActive || hiring.delegated.has(skill)) return;
    if (hiring.crew.bySkill(skill.id) !== undefined && hiring.pending.get(skill) !== null) return;
    try {
      resume.startAgain(skill, pick);
      log(`hand-over: you took ${skill.id}`);
    } catch (err) {
      log('hand-over start failed', err);
    }
  };
  const wrapStop = (skill) => {
    if (skill[WRAPPED]) return;
    const proto = Object.getPrototypeOf(skill);
    skill.stop = function (...args) {
      if (hiring === undefined || !hiring.delegated.has(this)) return proto.stop.apply(this, args);
      const handOver = !hiring.forcing && !ticking && game._isInOnlineLoop && hiring.pending.get(this) === null;
      const pick = handOver ? (picks.get(this) ?? resume.selectionOf(this)) : null;
      const previous = hiring.stopping;
      const handing = hiring.handingOver;
      hiring.stopping = this;
      if (handOver) hiring.handingOver = this;
      let stopped;
      try {
        stopped = proto.stop.apply(this, args);
      } finally {
        hiring.stopping = previous;
        hiring.handingOver = handing;
      }
      // After the click handler: a click that also starts something (another area's Start) has run by then.
      if (handOver && stopped !== false) queueMicrotask(() => takeOver(this, pick));
      return stopped;
    };
    skill[WRAPPED] = true;
  };

  //    Woodcutting at its cut limit refuses another tree ("Tree cutting limit reached") while the Folk still holds
  //    its trees: with You picked, a click on another tree hands the skill over first, so the game then starts the
  //    player on that tree (build .83).
  if (typeof Woodcutting !== 'undefined') {
    ctx.patch(Woodcutting, 'selectTree').before(function (tree) {
      if (hiring === undefined || !hiring.delegated.has(this) || hiring.pending.get(this) !== null) return;
      if (tree === undefined || this.activeTrees.has(tree) || this.activeTrees.size < this.treeCutLimit) return;
      hiring.applyPending(this);
    });
    //  A refused start (no free Shift Slot, the Folk unavailable, another mod's guard) kept the clicked tree selected
    //  with nothing running: Mining and Harvesting drop their pick when start() says no, Woodcutting doesn't. The
    //  next click on that tree only deselected it, and a click on another one met "Tree cutting limit reached".
    //  A tree is selected only while Woodcutting runs, so a stopped skill keeps none.
    ctx.patch(Woodcutting, 'selectTree').after(function () {
      if (hiring === undefined || this.game.isGolbinRaid || this.isActive || hiring.delegated.has(this)) return;
      if (this.activeTrees.size === 0) return;
      this.activeTrees.clear();
      this.renderQueue.selectedTrees = true;
    });
  }

  // 3. Tick every delegated skill after the main action (online and offline
  //    loops both come through Game.tick). Golbin Raid and pauses skip them.
  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid || this._isPaused || hiring.delegated.size === 0) return;
    ticking = true;
    hiring.folkTurn = true; // quiet-popups.mjs: what these ticks queue comes from the Folks
    hiring.perksMemo = new Map(); // each Folk's perks worked out once this tick (hiring-skill.mjs perksOf)
    try {
      for (const skill of Array.from(hiring.delegated)) {
        try {
          if (!skill.isActive) {
            hiring.release(skill);
            continue;
          }
          // The timer fires its action on the tick that brings ticksLeft to 0.
          const fires = skill.actionTimer.isActive && skill.actionTimer.ticksLeft === 1;
          const intervalMs = skill.actionTimer.maxTicks * TICK_INTERVAL;
          skill.activeTick();
          if (fires) hiring.delegatedActionDone(skill, intervalMs);
        } catch (err) {
          // A Folk's error never stops the game loop (it escaped Game.tick and repeated on every reload, build .136):
          // the skill is stopped and released, the error logged.
          log(`${skill.id}: a delegated tick failed, the Folk stops`, err);
          try { hiring.forceStop(skill); } catch (e) { log('stop after the failed tick failed', e); }
          hiring.release(skill);
        }
      }
    } finally {
      ticking = false;
      hiring.folkTurn = false;
      hiring.perksMemo = undefined;
    }
  });

  // 4. Sidebar: delegated skills light up like the main one.
  ctx.patch(Game, 'renderActiveSkills').replace(function (original) {
    const queued = this.renderQueue.activeSkills;
    original();
    if (queued && hiring !== undefined) hiring.delegated.forEach((skill) => skillNav.setActive(skill));
  });

  // 5. On load, rebuild the delegated set before the engine's "active action
  //    that isn't active" cleanup and before any skill renders.
  ctx.patch(Game, 'onLoad').before(function () {
    if (hiring === undefined) return;
    hiring.computeDelegableSkills();
    hiring.delegableSkills.forEach(wrapStop);
    const { delegated, zombies } = rules.rebuildDelegated({
      skills: hiring.delegableSkills,
      mainAction: this.activeAction,
      hasFolk: (skill) => folkFor(skill) !== undefined,
    });
    delegated.forEach((skill) => hiring.delegated.add(skill));
    zombies.forEach((skill) => {
      log(`resetting orphaned active skill ${skill.id}`);
      skill.resetActionState();
    });
    if (delegated.length > 0) log(`resumed delegated: ${delegated.map((s) => s.id).join(', ')}`);
    // A tree a refused start left selected was saved with the game (before build .146): it would block the next click.
    const wc = this.woodcutting;
    if (wc?.activeTrees instanceof Set && wc.activeTrees.size > 0 && !wc.isActive && !hiring.delegated.has(wc)) wc.activeTrees.clear();
    // The game resets an active Thieving that isn't the main action (its fix for a stun that never ended): a Folk's
    // Thieving is always that, so every load stopped it. Its stun ticks with the Folk, so that one reset is skipped.
    const th = this.thieving;
    if (th !== undefined && hiring.delegated.has(th)) {
      th.resetActionState = function () {
        delete this.resetActionState;
        log('load: kept the Folk on Thieving');
      };
    }
  });
  ctx.patch(Game, 'onLoad').after(function () {
    const th = this.thieving;
    if (th !== undefined && Object.prototype.hasOwnProperty.call(th, 'resetActionState')) delete th.resetActionState;
  });

  ctx.onCharacterLoaded(() => {
    // 6. Losing its Folk releases a skill.
    const release = (skillId) => {
      const skill = hiring.delegableSkills.find((s) => s.id === skillId);
      if (skill === undefined || !hiring.delegated.has(skill)) return;
      hiring.forceStop(skill); // even while Thieving is stunned; in a raid: dropped silently
    };
    hiring.events.on('folkAssigned', ({ previous, skillId }) => {
      if (previous !== null) release(previous);
      // A Folk put on the skill the player is working right now: the player's run
      // stops; the next start on that page goes to the Folk.
      if (skillId !== null) {
        const skill = hiring.delegableSkills.find((s) => s.id === skillId);
        if (skill !== undefined && game.activeAction === skill && !hiring.delegated.has(skill)) skill.stop();
      }
    });
    hiring.events.on('folkFired', ({ folk }) => {
      if (folk.skillId !== null) release(folk.skillId);
    });
  });
}
