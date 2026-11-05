// Strike demands, game side: what the world offers when a strike starts (items that exist, monsters you've killed in
// a combat or slayer area at or below your combat level, dungeons you've cleared, chests you've found), how far each
// demand is now, and the card's lines. The rules are in src/demands-model.mjs; payroll.mjs rolls and settles.
// Game-facing.

export function install(ctx, { getHiring, model }) {
  let hiring;

  const item = (id) => game.items.getObjectByID(id);
  const monster = (id) => game.monsters.getObjectByID(id);
  const dungeon = (id) => game.dungeons.getObjectByID(id);

  /** The monsters a kill demand can name: killed before, in an area open to you, not above your combat level. */
  const monsters = () => {
    const level = game.playerCombatLevel ?? Infinity;
    const seen = new Map();
    // Plain combat and slayer areas only: a dungeon's, a stronghold's or an Abyss depth's monsters come with the whole
    // run (the game's Dungeon, Stronghold and AbyssDepth are CombatAreas too, so the class itself is compared).
    const open = (area) => (typeof SlayerArea !== 'undefined' && area instanceof SlayerArea)
      || (typeof CombatArea !== 'undefined' && Object.getPrototypeOf(area) === CombatArea.prototype);
    for (const registry of [game.combatAreas, game.slayerAreas]) {
      (registry?.allObjects ?? []).filter(open).forEach((area) => {
        (area.monsters ?? []).forEach((m) => {
          if (seen.has(m.id) || (m.combatLevel ?? 0) > level) return;
          const count = game.stats.monsterKillCount(m);
          if (count > 0) seen.set(m.id, { id: m.id, count });
        });
      });
    }
    return [...seen.values()];
  };
  const dungeons = () => (game.dungeons?.allObjects ?? [])
    .map((d) => ({ id: d.id, count: game.combat.getDungeonCompleteCount(d) }))
    .filter((d) => d.count > 0);
  const chests = () => model.CHESTS.filter((id) => item(id) !== undefined && game.stats.itemFindCount(item(id)) > 0);

  /** The counts a demand is measured by, now; null when the game no longer has the thing (the line counts as met). */
  const read = {
    bankQty: (id) => (item(id) === undefined ? null : game.bank.getQty(item(id))),
    kills: (id) => (monster(id) === undefined ? null : game.stats.monsterKillCount(monster(id))),
    clears: (id) => (dungeon(id) === undefined ? null : game.combat.getDungeonCompleteCount(dungeon(id))),
    /** Locked in your bank: never handed over (the user, 5 Nov 2026). */
    locked: (id) => item(id) !== undefined && game.bank.lockedItems?.has(item(id)) === true,
  };

  const nameOf = (d) => (d.kind === 'kill' ? monster(d.id)?.name : d.kind === 'dungeon' ? dungeon(d.id)?.name : item(d.id)?.name) ?? d.id;
  const mediaOf = (d) => (d.kind === 'kill' ? monster(d.id)?.media : d.kind === 'dungeon' ? dungeon(d.id)?.media : item(d.id)?.media);

  const api = {
    /** The demands of a strike starting now for this Folk: one per trait it holds. */
    roll(folk, rng = Math.random) {
      // A Townsfolk's Local trait sits apart from the earned ones (it is never learned or forgotten): it asks too.
      const traits = [...(hiring.traits?.idsOf(folk).held ?? []), ...(folk.townsfolk ? ['Local'] : [])];
      return model.rollDemands({
        traits,
        tier: folk.tier,
        strikes: folk.strikes,
        rng,
        world: { hasItem: (id) => item(id) !== undefined, monsters: monsters(), dungeons: dungeons(), chests: chests() },
      });
    },
    progress: (demand) => model.progressOf(demand, read),
    /** Every demand of this Folk met (none is). */
    met: (folk) => model.allMet(folk.demand, read),
    /** "10 Old Boot, 200 Ash": the items a settlement would take now (for the self-settle notice). */
    itemsText(folk) {
      return model.itemsToTake(folk.demand).filter(({ id }) => item(id) !== undefined)
        .map(({ id, qty }) => `${numberWithCommas(qty)} ${item(id).name}`).join(', ');
    },
    /** Takes the items the demands want from the bank; false (nothing taken) when one is short. */
    take(folk) {
      // An item the game no longer has is not asked for (its line counts as met).
      const list = model.itemsToTake(folk.demand).filter(({ id }) => item(id) !== undefined);
      if (!list.every(({ id, qty }) => read.bankQty(id) >= qty && !read.locked(id))) return false;
      list.forEach(({ id, qty }) => game.bank.removeItemQuantity(item(id), qty, true));
      return true;
    },
    /** The card's lines: { text, media, met }. */
    lines(folk) {
      return (folk.demand ?? []).map((d) => {
        const p = api.progress(d);
        const key = { item: 'MOD_WF_DEMAND_ITEM', kill: 'MOD_WF_DEMAND_KILL', dungeon: 'MOD_WF_DEMAND_DUNGEON' }[d.kind];
        const name = nameOf(d);
        // Something the game no longer has: said so, and met (never a count that looks like stock in the bank).
        if (p.gone) return { text: templateLangString('MOD_WF_DEMAND_GONE', { name }), media: undefined, met: true };
        if (p.locked) return { text: templateLangString('MOD_WF_DEMAND_LOCKED', { item: name, have: numberWithCommas(p.have), need: numberWithCommas(p.need) }), media: mediaOf(d), met: false };
        const text = templateLangString(key, { item: name, monster: name, dungeon: name, have: numberWithCommas(p.have), need: numberWithCommas(p.need) });
        return { text, media: mediaOf(d), met: p.met };
      });
    },
    /** "40 Old Boot, 80 Plant kills": what is still missing, for Settle's tooltip. */
    missingText(folk) {
      return (folk.demand ?? []).filter((d) => !api.progress(d).met).map((d) => {
        const p = api.progress(d);
        // Enough of it, but locked: "Topaz (unlock it)".
        if (p.locked && p.have >= p.need) return templateLangString('MOD_WF_DEMAND_UNLOCK', { item: nameOf(d) });
        return `${numberWithCommas(p.need - p.have)} ${nameOf(d)}`;
      }).join(', ');
    },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.demands = api;
  });

  return api;
}
