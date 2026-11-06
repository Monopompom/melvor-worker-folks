// Guild Heirlooms, game side: the roll on each Folk action once a Guild Hall stands in Grasslands, the find's popup
// and notice, and what a Folk's worn heirlooms add to its effects. The rules are in src/heirloom-model.mjs; the items
// are registered from setup.mjs. Game-facing.

const NS = 'worker_folks';
const SOURCE = 'Skill.worker_folks:Hiring.Heirloom';

export function install(ctx, { getHiring, model, hallId = `${NS}:Guild_Hall`, biomeId = 'melvorF:Grasslands', log }) {
  let hiring;
  /** local id → the registered item. */
  const items = new Map();

  const itemOf = (id) => items.get(id);
  const nameOf = (id) => itemOf(id)?.name ?? id;

  /** At least one Guild Hall built in Grasslands (Township needs the full game). */
  const hallBuilt = () => {
    const township = game.township;
    const biome = township?.biomes?.getObjectByID(biomeId);
    const hall = township?.buildings?.getObjectByID(hallId);
    return biome !== undefined && hall !== undefined && biome.getBuildingCount(hall) > 0;
  };
  /**
   * Heirlooms no one holds: not in the bank, not in any Folk's gear, not worn by you in any equipment set. Only these
   * can be found, so there is never more than one of each, and one lost or sold can come back.
   */
  const held = (id) => {
    const item = itemOf(id);
    if (item === undefined) return true;
    if (game.bank.getQty(item) > 0) return true;
    if (game.combat?.player?.checkEquipmentSetsForItem?.(item) === true) return true;
    const full = `${NS}:${id}`;
    return hiring.crew.all.some((folk) => wornIds(folk).includes(full));
  };
  const missing = () => model.missingHeirlooms(held);
  const findPercent = () => hiring.playerModifier('heirloomFind');

  /**
   * A find: into the bank even when it is full, its own popup off (the bank's goes through the game's notification
   * queue, which "Hide Folks' gain popups" filters in a Folk's turn), then the item popup and the notice straight to
   * the screen, so the setting never hides a find.
   */
  const give = (folk, skill, id) => {
    const item = itemOf(id);
    if (item === undefined) return;
    game.bank.addItem(item, 1, true, true, true, false, SOURCE);
    log(`${folk.name} found heirloom ${id} on ${skill.id}`);
    game.notifications.createItemNotification(item, 1);
    const text = templateLangString('MOD_WF_HEIRLOOM_FOUND', { name: folk.name, item: item.name, skill: hiring.skillName(skill) });
    game.notifications.createSuccessNotification(`${NS}:heirloom`, text, item.media);
  };

  /** One Folk action's roll; `rng` in [0, 1). Returns the local id found, or undefined. */
  const roll = (folk, skill, rng = Math.random) => {
    if (folk === undefined || skill === undefined) return undefined;
    // The cheap checks first: most actions are of crews with no Hall.
    if (!model.ROLLING_TIERS.includes(folk.tier) || !hallBuilt()) return undefined;
    // The roll before the holdings: those lookups only on the rare hit.
    if (rng() >= model.findChance({ tier: folk.tier, hallBuilt: true, findPercent: findPercent(), missing: 1 })) return undefined;
    const id = model.pickHeirloom(missing(), rng);
    if (id !== undefined) give(folk, skill, id);
    return id;
  };

  /** Full item ids in the Folk's loadout. */
  const wornIds = (folk) => Object.values(folk?.loadout ?? {}).map((e) => e?.id);

  const api = {
    /** What the Folk's worn heirlooms add, in the traits' effects shape (plus tiersOff). */
    effectsOf(folk) {
      return model.effectsOf(wornIds(folk), NS);
    },
    /** `base` (trait effects) with the Folk's worn heirlooms added. */
    addTo(folk, base) {
      return model.addEffects(base, api.effectsOf(folk));
    },
    /** Qualification tiers the Folk's heirlooms take off (the Union Charter). */
    tiersOff(folk) {
      return api.effectsOf(folk).tiersOff;
    },
    /** The gear window's lines for the worn heirlooms: "Lucky Apron: +4% chance to double items". */
    lines(folk) {
      return model.HEIRLOOMS.filter((h) => wornIds(folk).includes(`${NS}:${h.id}`))
        .map((h) => ({ text: templateLangString(`MOD_WF_HEIRLOOM_EFFECT_${h.id}`, { item: nameOf(h.id) }), isNegative: false }));
    },
    /** One action's roll for this Folk on this skill, with the dice given (checks). */
    roll,
    hallBuilt,
    missing,
    /** Every heirloom, in the guild's order: { id, item, held } (the Town history's tile). */
    list: () => model.HEIRLOOM_IDS.map((id) => ({ id, item: itemOf(id), held: held(id) })),
    total: () => items.size,
    /** "×1.6": the town's buildings on the base chance. */
    multiplier: () => model.findMultiplier(findPercent()),
    /** Chance per action of a rolling Folk now (0 without a Hall or with all six held). */
    chance: () => model.findChance({ tier: model.ROLLING_TIERS[0], hallBuilt: hallBuilt(), findPercent: findPercent(), missing: missing().length }),
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    model.HEIRLOOM_IDS.forEach((id) => {
      const item = game.items.getObjectByID(`${NS}:${id}`);
      if (item !== undefined) items.set(id, item);
    });
    hiring.heirlooms = api;
    log(`heirlooms: ${items.size} items`);
  });

  ctx.onCharacterLoaded(() => {
    hiring.events.on('folkActionDone', ({ folk, skill }) => { roll(folk, skill); });
  });

  return api;
}
