// The acting Folk: per-Folk modifier table swapped into game.modifiers while a
// delegated skill starts a timer or resolves an action, plus the Produce Rate
// roll (fail / ok / bonus) and tier flavour (no pets, interval, preservation,
// crew bonus). Game-facing.

export function install(ctx, { getHiring, rate, createTablePool, log }) {
  let hiring;
  /** folk.id → { table, dirty, key, skillId, memo } */
  const tables = new Map();
  /**
   * One PlayerModifierTable per Folk, made once and refilled on every rebuild. The game's ModifierQuery caches its
   * results in a Map keyed by table and never drops a table it was asked about: a new table per rebuild stayed in
   * memory for good, and a long offline count ran the browser out of memory (1.5.0). A fired Folk's table goes to the
   * next hire.
   */
  const newTable = () => {
    const table = new PlayerModifierTable();
    table.init(game);
    return table;
  };
  const pool = createTablePool(newTable);
  /** The dev check's fresh build, refilled each time for the same reason. */
  let scratch;
  /**
   * What the Folk tables hold of the player's stat providers: provider → { table, sources, lists }, the provider's
   * entries as they were last copied. null until a table is built.
   */
  let copied = null;

  const invalidateAll = () => tables.forEach((t) => { t.dirty = true; });

  const providers = () => {
    const out = [];
    game.combat.statProviders.forEach((provider) => { if (provider.modifiers !== undefined) out.push(provider); });
    return out;
  };
  const snapshot = (provider) => {
    const table = provider.modifiers;
    return { table, sources: [...table.entries.keys()], lists: [...table.entries.values()].map((list) => [...list]) };
  };
  const unchanged = (snap, table) => {
    if (snap.table !== table || snap.sources.length !== table.entries.size) return false;
    let i = 0;
    for (const [source, list] of table.entries) {
      const was = snap.lists[i];
      if (snap.sources[i] !== source || was.length !== list.length) return false;
      for (let j = 0; j < list.length; j += 1) if (was[j] !== list[j]) return false;
      i += 1;
    }
    return true;
  };
  /**
   * The player's modifiers were worked out again. Every mastery level-up does it, and with a dozen Folks on fresh
   * actions that is every few seconds: rebuilding each Folk's table from nothing was most of the offline loop's time.
   * Only the providers that changed are swapped in the built tables, with the game's own removeTable and addTable.
   */
  const syncProviders = () => {
    if (copied === null) return;
    const now = providers();
    if (now.length !== copied.size || now.some((p) => !copied.has(p))) {
      invalidateAll();
      copied = new Map(now.map((p) => [p, snapshot(p)]));
      return;
    }
    now.forEach((provider) => {
      const snap = copied.get(provider);
      if (unchanged(snap, provider.modifiers)) return;
      const old = { entries: new Map(snap.sources.map((source, i) => [source, snap.lists[i]])) };
      tables.forEach((t) => {
        if (t.dirty) return;
        t.table.removeTable(old);
        t.table.addTable(provider.modifiers);
      });
      copied.set(provider, snapshot(provider));
    });
  };

  const workingExperts = (exceptFolk) => {
    let n = 0;
    hiring.delegated.forEach((skill) => {
      const f = hiring.crew.bySkill(skill.id);
      if (f !== undefined && f !== exceptFolk && f.tier === 'Expert') n += 1;
    });
    return n;
  };

  const sourceFor = (folk) => hiring.sortedMasteryActions[folk.slot] ?? hiring;

  /** The Folk's own part of its table, as modifier data: tier, perks, traits, crew bonus, the Steward. */
  const ownData = (folk, skill) => {
    const tier = rate.tierModifiers(folk.tier, { preservationDisabled: !!game.currentGamemode.disablePreservation });
    const perk = hiring.perksOf?.(folk) ?? { skillXP: 0, intervalPercent: 0 };
    // Earned traits: Specialist only in its own skill, Night Owl only while the player fights.
    const trait = hiring.traits?.effectsOf(folk, skill.id) ?? { interval: 0, xp: 0, preservation: 0, doubling: 0 };
    // The Steward (worn by the player, src/steward.mjs) gives every Folk a share more skill XP.
    const stewardXP = hiring.playerModifier?.('folkSkillXP') ?? 0;
    const bonusXP = tier.skillXP + rate.crewBonus(workingExperts(folk), hiring.levels?.crewBonusMax()) + perk.skillXP + trait.xp + stewardXP;
    const interval = tier.skillInterval + perk.intervalPercent + trait.interval;
    const preservation = tier.skillPreservationChance + trait.preservation;
    const data = {};
    if (interval !== 0) data.skillInterval = [{ skillID: skill.id, value: interval }];
    if (preservation !== 0) data.skillPreservationChance = [{ skillID: skill.id, value: preservation }];
    if (bonusXP !== 0) data.skillXP = [{ skillID: skill.id, value: bonusXP }];
    if (trait.doubling !== 0) data.skillItemDoublingChance = [{ skillID: skill.id, value: trait.doubling }];
    return data;
  };

  /** Fills `table` from nothing: the player's providers, the game mode, the Folk's gear and own part. */
  const buildTable = (table, folk, skill, data = ownData(folk, skill)) => {
    // The built tables and the copy record catch up first, so this table and they hold the same provider entries.
    if (copied === null) copied = new Map(providers().map((p) => [p, snapshot(p)]));
    else syncProviders();
    // empty() also drops the table's own query caches; the game's queries see that and work their results out again.
    table.empty();
    // Everything the player has earned that is not worn: pets, shop, potions,
    // Agility, Astrology, Township, mastery tokens, skill trees...
    providers().forEach((provider) => table.addTable(provider.modifiers));
    if (game.currentGamemode.playerModifiers !== undefined) {
      table.addModifiers(game.currentGamemode, game.currentGamemode.playerModifiers);
    }
    // The Folk's own gear (never the player's): items, item synergies, inherited capes, summon synergy.
    hiring.loadout?.modifierSources(folk, skill).forEach(({ source, modifiers }) => table.addModifiers(source, modifiers));
    if (Object.keys(data).length > 0) table.addModifiers(sourceFor(folk), game.getModifierValuesFromData(data));
    return table;
  };

  const tableFor = (folk, skill) => {
    let entry = tables.get(folk.id);
    // Within one tick of the delegated skills (one perks memo) the Folk's own part is worked out once.
    const memo = hiring.perksMemo;
    if (entry !== undefined && !entry.dirty && memo !== undefined && entry.memo === memo && entry.skillId === skill.id) return entry.table;
    // The Folk's own part is compared each time: perks, traits (Night Owl only while the player fights), the Steward,
    // the crew bonus and Hiring's level all count as soon as they change.
    const data = ownData(folk, skill);
    const key = `${skill.id}|${JSON.stringify(data)}`;
    if (entry === undefined || entry.dirty || entry.key !== key) {
      // Marked dirty while it refills, so the provider sync inside buildTable leaves it alone.
      if (entry !== undefined) entry.dirty = true;
      entry = { table: buildTable(pool.get(folk.id), folk, skill, data), dirty: false, key, skillId: skill.id };
      tables.set(folk.id, entry);
    }
    entry.memo = memo;
    return entry.table;
  };

  /** Runs fn with `folk` acting for `skill`; nested calls keep the outer context. */
  const runAsFolk = (skill, fn) => {
    if (hiring.acting !== undefined) return fn();
    const folk = hiring.crew.bySkill(skill.id);
    if (folk === undefined) return fn();
    hiring.acting = { folk, skill, table: tableFor(folk, skill), outcome: 'ok', consumed: new Set() };
    try {
      return fn();
    } finally {
      hiring.acting = undefined;
      // The skill was stopped inside its own action (a Folk died): GatheringSkill.action
      // restarts the timer regardless, and nothing would tick it again.
      if (!skill.isActive && skill.actionTimer?.isActive) {
        skill.actionTimer.stop();
        skill.renderQueue.progressBar = true;
      }
    }
  };

  const isFolkRun = (skill) => hiring !== undefined && (hiring.delegated.has(skill) || hiring.decideStart?.(skill) === 'delegate');
  /**
   * Restarts a skill's action timer after a failed action. Cartography has no startActionTimer (only GatheringSkill
   * does; in 1.3.1 the call threw and the error escaped the delegated tick, so a Trainee's first failed survey broke the
   * game loop, build .136): its mode starters are left alone and the timer runs again for the interval it just ran.
   */
  const restartTimer = (skill) => {
    if (typeof skill.startActionTimer === 'function') { skill.startActionTimer(); return; }
    const timer = skill.actionTimer;
    if (timer === undefined || typeof timer.start !== 'function') return;
    timer.start(Math.max(1, timer.maxTicks) * TICK_INTERVAL);
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.acting = undefined;
    hiring.invalidateFolkTables = invalidateAll;
    /** One Folk's table built again on its next action: what changed is its own (its hex). */
    hiring.invalidateFolkTable = (folk) => {
      const entry = tables.get(folk.id);
      if (entry !== undefined) entry.dirty = true;
    };
    /** Dev diagnostics: a fresh table for the Folk on a skill (not cached). */
    hiring.debugTable = (folk, skill) => buildTable(scratch ??= newTable(), folk, skill);
    hiring.events.on('folkFired', ({ folk }) => {
      tables.delete(folk.id);
      pool.release(folk.id);
    });
    /** Runs fn with the Folk's modifiers in game.modifiers, no action and no roll: what the Folk would get. */
    hiring.asFolk = (folk, skill, fn) => {
      if (hiring.acting !== undefined) return fn();
      hiring.acting = { folk, skill, table: tableFor(folk, skill), outcome: 'ok', consumed: new Set() };
      try {
        return fn();
      } finally {
        hiring.acting = undefined;
      }
    };
  });

  // 1. The swap: skills read this.game.modifiers everywhere.
  ctx.patch(Game, 'modifiers').get(function (next) {
    const acting = hiring?.acting;
    return acting !== undefined ? acting.table : next();
  });

  // 2. The player's own modifiers recomputed: the providers that changed are swapped in the built tables.
  ctx.patch(Player, 'computeModifiers').after(() => syncProviders());

  // 3. Timers started for a delegated skill use the Folk's interval.
  ctx.patch(GatheringSkill, 'startActionTimer').replace(function (original) {
    if (!isFolkRun(this)) return original();
    return runAsFolk(this, () => original());
  });

  // 4. Actions: roll Produce Rate, then run the skill's own action as the Folk.
  const wrapAction = (Class, { rewardsInsideBody = false } = {}) => {
    ctx.patch(Class, 'action').replace(function (original) {
      if (hiring === undefined || !hiring.delegated.has(this)) return original();
      return runAsFolk(this, () => {
        // No Folk on a delegated skill (it left between ticks): the action runs as the player's rather than throwing.
        if (hiring.acting === undefined) return original();
        hiring.acting.outcome = rate.rollOutcome(rate.produceRate(hiring.acting.folk.tier));
        hiring.lastOutcome = hiring.acting.outcome;
        if (rewardsInsideBody && hiring.acting.outcome === 'fail') {
          // Cartography resolves rewards inside mode-specific bodies: a failed
          // action simply gives nothing and the timer restarts.
          restartTimer(this);
          return undefined;
        }
        return original();
      });
    });
  };
  wrapAction(GatheringSkill);
  wrapAction(CraftingSkill);
  if (typeof AltMagic !== 'undefined') wrapAction(AltMagic);
  if (typeof Archaeology !== 'undefined') wrapAction(Archaeology);
  if (typeof Cartography !== 'undefined') wrapAction(Cartography, { rewardsInsideBody: true });

  // 5. Rewards: fail → nothing (inputs already consumed by the skill), bonus → a
  //    second full batch, rolled by the mod independently of the game's doubling.
  ctx.patch(GatheringSkill, 'addActionRewards').replace(function (original) {
    const acting = hiring?.acting;
    if (acting === undefined || acting.skill !== this) return original();
    if (acting.outcome === 'fail') return true;
    const first = original();
    if (acting.outcome !== 'bonus') return first;
    const second = original();
    return first && second;
  });

  // 6. Thieving: the NPC's success rate still applies, but a Folk is never
  //    stunned and the player never takes damage.
  if (typeof Thieving !== 'undefined') {
    ctx.patch(Thieving, 'preAction').replace(function (original) {
      const acting = hiring?.acting;
      if (acting === undefined || acting.skill !== this) return original();
      if (this.currentNPC === undefined) return original();
      if (!this.currentNPC.canUseWithDamageType(this.game.combat.player.damageType) && this.isActive) {
        this.notifyIncorrectDamageType(this.currentNPC);
        this.stop();
        return undefined;
      }
      if (acting.outcome !== 'fail' && !rollPercentage(this.getNPCSuccessRate(this.currentNPC))) {
        acting.outcome = 'fail';
        hiring.lastOutcome = 'fail';
      }
      if (acting.outcome === 'fail') {
        // A caught Folk is stunned like the player (the engine starts the stun timer in
        // postAction) and takes the NPC's hit itself: rewards, and with them the player's
        // damage branch, are skipped on 'fail'.
        this.stunState = rollPercentage(this.stunAvoidanceChance) ? 2 : 1;
        this.addStat(ThievingStats.FailedPickpockets);
        if (this.stunState === 1) hiring.health?.onPickpocketFail(acting.folk, this.currentNPC, this);
      } else {
        this.addStat(ThievingStats.SuccessfulPickpockets);
      }
      return undefined;
    });
  }

  // 7. Trainees and Apprentices never find pets.
  const noPets = (Class) => {
    ctx.patch(Class, 'rollForPets').replace(function (original, ...args) {
      const acting = hiring?.acting;
      if (acting !== undefined && acting.skill === this && !rate.rollsPets(acting.folk.tier)) return undefined;
      return original(...args);
    });
  };
  noPets(Skill);
  noPets(SkillWithMastery);

  ctx.onCharacterLoaded(() => {
    // Crew bonus depends on who is working; tier effects on promotions.
    ['folkStarted', 'folkReleased', 'folkPromoted', 'crewChanged'].forEach((name) => hiring.events.on(name, invalidateAll));
    log('acting-Folk modifier tables ready');
  });
}
