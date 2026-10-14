// Delegation core: a skill held by a Folk keeps running beside game.activeAction.
//
// The engine has exactly one active action. Every start path (GatheringSkill,
// Archaeology, Cartography's mode starters, Agility via super) ends with
// `game.activeAction = this`, and every stop path ends with
// `game.clearActiveAction()` i.e. `game.activeAction = undefined`. Instead of
// patching each path, `activeAction` is turned into an accessor on the game
// instance: a start that should be delegated lands in `hiring.delegated`, a stop
// of a delegated skill removes it, and the main slot is left untouched.

export function install(ctx, { getHiring, rules, isDisabled = () => false, log }) {
  let hiring;
  const skillFor = (action) => (hiring === undefined ? undefined : hiring.delegableSkills.find((s) => s === action));
  const folkFor = (skill) => (skill === undefined ? undefined : hiring.crew.bySkill(skill.id));
  const decide = (action) => {
    if (isDisabled()) return 'main';
    const skill = skillFor(action);
    if (skill === undefined) return 'main';
    const folk = folkFor(skill);
    return rules.decideStart({
      hasFolk: folk !== undefined,
      folkAvailable: folk === undefined || hiring.folkAvailable(folk),
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
    if (skillFor(action) !== undefined) hiring.applyPending(action);
    switch (decide(action)) {
      case 'delegate':
        return false;
      case 'unavailable': {
        const folk = folkFor(skillFor(action));
        this.notifications.createErrorNotification(
          'worker_folks:unavailable',
          templateLangString('MOD_WF_FOLK_UNAVAILABLE', { name: folk?.name ?? '?', status: getLangString(`MOD_WF_STATUS_${hiring.statusOf(folk)}`) }),
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
  const WRAPPED = Symbol('worker_folks.stopWrapped');
  const wrapStop = (skill) => {
    if (skill[WRAPPED]) return;
    const proto = Object.getPrototypeOf(skill);
    skill.stop = function (...args) {
      if (hiring === undefined || !hiring.delegated.has(this)) return proto.stop.apply(this, args);
      const previous = hiring.stopping;
      hiring.stopping = this;
      try {
        return proto.stop.apply(this, args);
      } finally {
        hiring.stopping = previous;
      }
    };
    skill[WRAPPED] = true;
  };

  // 3. Tick every delegated skill after the main action (online and offline
  //    loops both come through Game.tick). Golbin Raid and pauses skip them.
  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid || this._isPaused || hiring.delegated.size === 0) return;
    for (const skill of Array.from(hiring.delegated)) {
      if (!skill.isActive) {
        hiring.release(skill);
        continue;
      }
      // The timer fires its action on the tick that brings ticksLeft to 0.
      const fires = skill.actionTimer.isActive && skill.actionTimer.ticksLeft === 1;
      const intervalMs = skill.actionTimer.maxTicks * TICK_INTERVAL;
      skill.activeTick();
      if (fires) hiring.delegatedActionDone(skill, intervalMs);
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
