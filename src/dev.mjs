// Developer console commands (window.workerFolksDev). Lets later slices be
// tested before the shop exists. Ticket 14 decides whether to gate this.

export function install({ hiring, log, tiers }) {
  const api = {
    /** workerFolksDev.spawn('Middle', 'Ada') — adds a Folk and emits folkHired. */
    spawn(tier = 'Newbie', name) {
      if (!tiers.includes(tier)) {
        console.error(`[Worker Folks] unknown tier "${tier}"; use one of ${tiers.join(', ')}`);
        return null;
      }
      const folk = hiring.crew.hire(tier, { name, source: 'dev', limit: hiring.folkCap });
      if (folk === null) console.error('[Worker Folks] no free Folk slot');
      return folk;
    },
    fire(id) {
      return hiring.crew.fire(id, { reason: 'dev' });
    },
    /** Sets a Folk's current HP (clamped to its tier max). */
    hp(id, hp) {
      const folk = hiring.crew.byId(id);
      if (folk === undefined || hiring.health === undefined) return false;
      hiring.health.setHp(folk, hp);
      hiring.crew.touch();
      return true;
    },
    /** Kills a Folk: slot frozen for 24 h. */
    kill(id) {
      const folk = hiring.crew.byId(id);
      if (folk === undefined || hiring.health === undefined) return false;
      hiring.health.kill(folk);
      return true;
    },
    /** Lifts every frozen slot (or one). */
    thaw(slot) {
      hiring.crew.thaw(slot);
      return true;
    },
    /** Forces a strike with the given debt (GP) for UI testing. */
    strike(id, debt = 1000) {
      const folk = hiring.crew.byId(id);
      if (folk === undefined) return false;
      folk.debt = debt;
      folk.debtCurrency = 'melvorD:GP';
      folk.onStrike = true;
      hiring.forceStop(hiring.skillOf(folk));
      hiring.crew.touch();
      return true;
    },
    /** Puts the Folk in debt (unpaid wages, still allowed to work) without a strike; `minutesUsed` of the grace already spent. */
    debt(id, debt = 500, minutesUsed = 0) {
      const folk = hiring.crew.byId(id);
      if (folk === undefined) return false;
      folk.debt = debt;
      folk.debtCurrency = 'melvorD:GP';
      folk.debtMs = Math.max(0, minutesUsed) * 60000;
      folk.onStrike = false;
      hiring.crew.touch();
      return true;
    },
    /** Clears strike, debt and cooldown: back to Idle (or Working if its skill still runs). */
    reset(id) {
      const folk = hiring.crew.byId(id);
      if (folk === undefined) return false;
      folk.onStrike = false;
      folk.debt = 0;
      folk.cooldownTicks = 0;
      hiring.crew.touch();
      return true;
    },
    cooldown(id, ticks) {
      const folk = hiring.crew.byId(id);
      if (folk === undefined) return false;
      folk.cooldownTicks = ticks;
      hiring.crew.touch();
      return true;
    },
    /**
     * Prints what a Folk's worn items contribute: each item's plain and conditional
     * modifiers (and whether the condition holds right now), its charges, the entries
     * those items put into the Folk's modifier table, and the Details summary lines.
     */
    loadout(id) {
      const folk = hiring.crew.byId(id);
      if (folk === undefined || hiring.loadout === undefined) return false;
      const skill = hiring.skillOf(folk);
      const items = hiring.loadout.items(folk);
      console.table(items.map(({ item, qty }) => ({
        item: item.id,
        qty,
        modifiers: (item.modifiers ?? []).length,
        conditional: (item.conditionalModifiers ?? []).map((cm) => `${cm.condition?.type ?? '?'}: ${hiring.loadout.conditionHolds(cm) ? 'holds' : 'NOT met'}`).join(', ') || '-',
        charges: hiring.consumption?.chargesOf(item) ?? '-',
      })));
      if (skill === undefined || hiring.debugTable === undefined) {
        console.log('[Worker Folks] Folk has no skill: table not built');
        return true;
      }
      const table = hiring.debugTable(folk, skill);
      const rows = [];
      items.forEach(({ item }) => (table.entries.get(item) ?? []).forEach((e) => rows.push({
        source: item.id,
        modifier: e.modValue.modifier.id,
        value: e.modValue.value,
        skill: e.modValue.skill?.id ?? '-',
        category: e.modValue.category?.id ?? '-',
        action: e.modValue.action?.id ?? '-',
      })));
      console.table(rows);
      console.log('summary:', hiring.loadout.summaryLines(folk, skill).map((l) => l.text));
      return true;
    },
    /** Sets a Folk's mastery level directly (XP of that level). */
    mastery(id, level) {
      const folk = hiring.crew.byId(id);
      const slot = folk === undefined ? undefined : hiring.slotOf(folk);
      if (slot === undefined) return false;
      hiring.actionMastery.delete(slot);
      hiring.addMasteryXP(slot, exp.levelToXP(level) + 1);
      hiring.updateTotalCurrentMasteryLevel();
      hiring.crew.touch();
      return true;
    },
    poolXP(xp) {
      hiring.addMasteryPoolXP(game.defaultRealm, xp);
      return hiring.poolPercent();
    },
    reserve(currencyId = 'melvorD:GP') {
      return hiring.crew.reserveOf(currencyId);
    },
    assign(id, skillId) {
      return hiring.crew.assign(id, skillId);
    },
    list() {
      const rows = hiring.crew.all.map((f) => ({ id: f.id, slot: f.slot + 1, tier: f.tier, name: f.name, skill: f.skillId ?? '-' }));
      console.table(rows);
      return rows;
    },
    clear() {
      hiring.crew.clear();
    },
    /** The exact JSON that goes into the save. */
    dump() {
      return hiring.crew.serialize();
    },
    /** Loads a root object/JSON (e.g. a pre-version root) through the migration runner. */
    load(root) {
      return hiring.crew.load(root);
    },
    /** Temporary Shift Slots for testing without licences (not saved). */
    shiftSlots(extra) {
      hiring.devExtraShiftSlots = Math.max(0, Math.floor(extra));
      return hiring.shiftSlots;
    },
    delegated() {
      return Array.from(hiring.delegated, (s) => s.id);
    },
    /** Unlocks the Hiring pet now. */
    pet() {
      const pet = hiring.discoveries?.pet();
      if (pet !== undefined) game.petManager.unlockPet(pet);
      return pet?.id;
    },
    /** Finds `count` random Hiring relics now (Ancient Relics gamemode only); returns found ids. */
    relics(count = 1) {
      const set = hiring.discoveries?.relicSet();
      if (set !== undefined && game.currentGamemode.allowAncientRelicDrops) hiring.unlockRelicDrops(set, count);
      return set === undefined ? [] : Array.from(set.foundRelics.keys(), (r) => r.id);
    },
    tiers: tiers.slice(),
  };
  globalThis.workerFolksDev = api;
  log('dev commands: workerFolksDev.spawn(tier, name?) | fire(id) | assign(id, skillId) | strike(id, debt?) | debt(id, gp?) | cooldown(id, ticks) | reset(id) | hp(id, hp) | kill(id) | thaw(slot?) | loadout(id) | reserve() | mastery(id, level) | poolXP(xp) | list() | clear() | dump() | load(root) | shiftSlots(n) | delegated() | pet() | relics(n)');
  return api;
}
