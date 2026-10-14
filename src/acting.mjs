// The acting Folk: per-Folk modifier table swapped into game.modifiers while a
// delegated skill starts a timer or resolves an action, plus the Produce Rate
// roll (fail / ok / bonus) and tier flavour (no pets, interval, preservation,
// crew bonus). Game-facing.

export function install(ctx, { getHiring, rate, log }) {
  let hiring;
  /** folk.id → { table, dirty } */
  const tables = new Map();

  const invalidateAll = () => tables.forEach((t) => { t.dirty = true; });

  const workingExperts = (exceptFolk) => {
    let n = 0;
    hiring.delegated.forEach((skill) => {
      const f = hiring.crew.bySkill(skill.id);
      if (f !== undefined && f !== exceptFolk && f.tier === 'Expert') n += 1;
    });
    return n;
  };

  const sourceFor = (folk) => hiring.sortedMasteryActions[folk.slot] ?? hiring;

  const buildTable = (folk, skill) => {
    const table = new PlayerModifierTable();
    table.init(game);
    // Everything the player has earned that is not worn: pets, shop, potions,
    // Agility, Astrology, Township, mastery tokens, skill trees...
    game.combat.statProviders.forEach((provider) => {
      if (provider.modifiers !== undefined) table.addTable(provider.modifiers);
    });
    if (game.currentGamemode.playerModifiers !== undefined) {
      table.addModifiers(game.currentGamemode, game.currentGamemode.playerModifiers);
    }
    // The Folk's own gear (never the player's): items, item synergies, inherited capes, summon synergy.
    hiring.loadout?.modifierSources(folk, skill).forEach(({ source, modifiers }) => table.addModifiers(source, modifiers));
    const tier = rate.tierModifiers(folk.tier, { preservationDisabled: !!game.currentGamemode.disablePreservation });
    const perk = hiring.perksOf?.(folk) ?? { skillXP: 0, intervalPercent: 0 };
    const bonusXP = tier.skillXP + rate.crewBonus(workingExperts(folk)) + perk.skillXP;
    const interval = tier.skillInterval + perk.intervalPercent;
    const data = {};
    if (interval !== 0) data.skillInterval = [{ skillID: skill.id, value: interval }];
    if (tier.skillPreservationChance !== 0) data.skillPreservationChance = [{ skillID: skill.id, value: tier.skillPreservationChance }];
    if (bonusXP !== 0) data.skillXP = [{ skillID: skill.id, value: bonusXP }];
    if (Object.keys(data).length > 0) table.addModifiers(sourceFor(folk), game.getModifierValuesFromData(data));
    return table;
  };

  const tableFor = (folk, skill) => {
    let entry = tables.get(folk.id);
    if (entry === undefined || entry.dirty || entry.skillId !== skill.id) {
      entry = { table: buildTable(folk, skill), dirty: false, skillId: skill.id };
      tables.set(folk.id, entry);
    }
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

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.acting = undefined;
    hiring.invalidateFolkTables = invalidateAll;
    /** Dev diagnostics: a fresh table for the Folk on a skill (not cached). */
    hiring.debugTable = (folk, skill) => buildTable(folk, skill);
  });

  // 1. The swap: skills read this.game.modifiers everywhere.
  ctx.patch(Game, 'modifiers').get(function (next) {
    const acting = hiring?.acting;
    return acting !== undefined ? acting.table : next();
  });

  // 2. Rebuild lazily whenever the player's own modifiers recompute.
  ctx.patch(Player, 'computeModifiers').after(() => invalidateAll());

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
        hiring.acting.outcome = rate.rollOutcome(rate.produceRate(hiring.acting.folk.tier));
        hiring.lastOutcome = hiring.acting.outcome;
        if (rewardsInsideBody && hiring.acting.outcome === 'fail') {
          // Cartography resolves rewards inside mode-specific bodies: a failed
          // action simply gives nothing and the timer restarts.
          this.startActionTimer();
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
