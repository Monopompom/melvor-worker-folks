// The Steward, Hiring's Summoning familiar (src/steward-model.mjs has the rules). Game-facing: worn by the player, it
// spends a charge per 30 s of crew work and rolls Hiring's mark at the same beat, on the mod event bus. The engine
// adds the Summoning XP, rolls tablet preservation and tells when a stack runs out.

export function install(ctx, { getHiring, rules, log }) {
  let hiring;
  let budget = 0;
  const SUMMON_SLOTS = ['melvorD:Summon1', 'melvorD:Summon2'];
  const itemId = `worker_folks:${rules.STEWARD_ITEM_ID}`;

  const workingCount = () => Math.max(1, hiring.delegated?.size ?? 1);
  /** The Summon slot wearing the Steward, and its synergy partner's slot when a synergy is unlocked. */
  const slotsWorn = () => {
    const p = game.combat?.player;
    const slots = p?.equipment?.equippedItems;
    if (slots === undefined) return undefined;
    const mine = SUMMON_SLOTS.find((id) => slots[id]?.item?.id === itemId && slots[id].quantity > 0);
    if (mine === undefined) return undefined;
    const other = SUMMON_SLOTS.find((id) => id !== mine);
    let partner;
    try {
      const o = slots[other];
      if (o?.quantity > 0 && o.item !== undefined && game.summoning.getUnlockedSynergy(slots[mine].item, o.item) !== undefined) partner = other;
    } catch { partner = undefined; }
    return { player: p, slots, mine, partner };
  };
  const spend = (charges) => {
    const w = slotsWorn();
    if (w === undefined) return;
    for (let i = 0; i < charges; i++) {
      if (!(w.slots[w.mine]?.quantity > 0)) break;
      w.player.removeSummonCharge(w.mine, rules.TABLET_MS);
      if (w.partner !== undefined && w.slots[w.partner]?.quantity > 0) w.player.removeSummonCharge(w.partner, rules.TABLET_MS);
    }
  };
  const rollMarks = (times) => {
    if (game.summoning?.isUnlocked !== true) return;
    for (let i = 0; i < times; i++) game.summoning.rollMarksForSkill(hiring, rules.MARK_MS, game.defaultRealm);
  };

  ctx.onCharacterLoaded(() => {
    hiring = getHiring();
    hiring.events.on('folkActionDone', ({ intervalMs }) => {
      const booked = rules.bookWork(budget, intervalMs, workingCount());
      budget = booked.budget;
      if (booked.charges <= 0) return;
      try { spend(booked.charges); } catch (e) { log('Steward charge failed', e); }
      try { rollMarks(booked.charges); } catch (e) { log('Steward mark roll failed', e); }
    });
    hiring.steward = {
      worn: () => slotsWorn() !== undefined,
      budgetMs: () => budget,
      marks: () => { try { const r = game.summoning.actions.getObjectByID(`worker_folks:${rules.STEWARD_ID}`); return r === undefined ? undefined : { count: game.summoning.getMarkCount(r), level: game.summoning.getMarkLevel(r) }; } catch { return undefined; } },
    };
    log('Steward: a charge per', rules.STEWARD_CHARGE_MS / 1000, 's of crew work');
  });
}
