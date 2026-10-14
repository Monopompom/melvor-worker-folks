// The Hiring pet, the Hiring Ancient Relics and the Hiring Lesser Relic are found through Folk actions. Game-facing:
// subscribes to the mod event bus; the engine does the rolls, the modals and the unlocks.

export function install(ctx, { getHiring, rules, petId = 'worker_folks:Bruno', lesserRelicId = 'worker_folks:Hiring_Lesser_Relic', log }) {
  let hiring;
  let pet;

  const workingCount = () => Math.max(1, hiring.delegated.size);

  const rollPet = (intervalMs) => {
    if (pet === undefined || game.petManager.unlocked.has(pet)) return;
    const rollMs = rules.petRollIntervalMs(intervalMs, workingCount());
    if (rollMs > 0) game.petManager.rollForSkillPet(pet, rollMs, hiring);
  };

  const rollRelics = () => {
    if (typeof hiring.rollForAncientRelics !== 'function' || !game.currentGamemode.allowAncientRelicDrops) return;
    hiring.rollForAncientRelics(rules.relicRollLevel(hiring.level), game.defaultRealm);
  };

  // Hiring's rare drops (the Hiring Lesser Relic, Ancient Relics mode only): the engine rolls
  // each drop's own gamemode and chance; rewards land in the bank the usual way.
  const rollRareDrops = () => {
    if (!Array.isArray(hiring.rareDrops) || hiring.rareDrops.length === 0 || typeof Rewards !== 'function') return;
    const rewards = new Rewards(game);
    rewards.setSource(`Skill.${hiring.id}.FolkAction`);
    hiring.rollForRareDrops(hiring.level, rewards, undefined);
    rewards.giveRewards();
  };

  // A worn Hiring Lesser Relic spends one charge per Folk action, the way the game's Lesser
  // Relics do on their own skill's actions (player attacks are handled by the engine).
  const consumeLesserRelic = () => {
    const player = game.combat?.player;
    const equipped = player?.equipment?.equippedItems?.['melvorD:Consumable'];
    if (equipped === undefined || equipped.item?.id !== lesserRelicId) return;
    player.consumeItemQuantities({}, equipped);
  };

  ctx.onCharacterLoaded(() => {
    hiring = getHiring();
    pet = game.pets.getObjectByID(petId);
    if (pet === undefined) log('Hiring pet is not registered');
    hiring.events.on('folkActionDone', ({ intervalMs }) => {
      rollPet(intervalMs);
      rollRelics();
      rollRareDrops();
      consumeLesserRelic();
    });
    hiring.discoveries = {
      pet: () => pet,
      hasPet: () => pet !== undefined && game.petManager.unlocked.has(pet),
      relicSet: () => hiring.ancientRelicSets?.get(game.defaultRealm),
    };
    log(`discoveries: pet ${pet?.id ?? '-'}, relic set ${hiring.ancientRelicSets?.size ?? 0}`);
  });
}
