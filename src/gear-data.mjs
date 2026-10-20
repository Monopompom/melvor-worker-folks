// Gear that the player wears for Hiring: the Overseers Outfit (Township shop, like the game's
// skilling outfits), the Hiring Skillcape and
// (Throne of the Herald only) the Superior Hiring Skillcape. The outfit, the base cape, the
// pet and the Ancient Relics are static and live in data/extras.json; this module holds the
// ids the rest of the mod and the tests refer to, and builds the expansion-dependent part.
// Pure: returns plain data-package objects.

export const HIRING_ID = 'worker_folks:Hiring';
/** Outfit pieces in shop order (the game's skilling-outfit format): local item id → equipment slot. */
export const OUTFIT = {
  Overseers_Hat: 'Helmet',
  Overseers_Body: 'Platebody',
  Overseers_Leggings: 'Platelegs',
  Overseers_Boots: 'Boots',
};
/** Township shop gating per piece, as for the game's outfits: [Township level, tasks completed]. */
export const OUTFIT_GATES = [[10, 20], [20, 40], [40, 60], [60, 80]];
export const OUTFIT_PRICE = 100000;
export const OUTFIT_XP_PER_PIECE = 2;
export const SKILLCAPE_ID = 'Hiring_Skillcape';
export const SUPERIOR_SKILLCAPE_ID = 'Superior_Hiring_Skillcape';
export const SKILLCAPE_LEVEL = 99;
export const SUPERIOR_SKILLCAPE_LEVEL = 120;
export const PET_ID = 'Bruno';
/** Relic local ids in set order; the sixth is the master relic. */
export const RELICS = ['HiringRelic1', 'HiringRelic2', 'HiringRelic3', 'HiringRelic4', 'HiringRelic5', 'HiringMasterRelic'];
/** Ancient Relics game mode consumable, a rare drop of Folk actions (the game's Lesser Relics). */
export const LESSER_RELIC_ID = 'Hiring_Lesser_Relic';
export const LESSER_RELIC_QUANTITY = 300;
export const LESSER_RELIC_CHANCE = 0.1;
export const ANCIENT_RELICS_GAMEMODE = 'melvorAoD:AncientRelics';

const GP = (cost) => [{ currency: 'melvorD:GP', type: 'Fixed', cost }];
const defence = (value) => ['meleeDefenceBonus', 'rangedDefenceBonus', 'magicDefenceBonus'].map((key) => ({ key, value }));

export const SKILLING_OUTFIT_UPGRADE = 'melvorF:Skilling_Outfit_Upgrade';
export const CAPE_OF_COMPLETION = 'melvorF:Cape_of_Completion';
export const SUPERIOR_CAPE_OF_COMPLETION = 'melvorTotH:Superior_Cape_Of_Completion';

/** A display-order entry placing `ids` right before `beforeID` when that purchase exists, else at the end. */
export function placeBefore(ids, beforeID, exists) {
  const list = Array.isArray(ids) ? ids : [ids];
  return exists ? { insertAt: 'Before', beforeID, ids: list } : { insertAt: 'End', ids: list };
}

/** Shop display order for the outfit: the Township tab, right before the Skilling Outfit Upgrade. */
export function outfitDisplayOrder({ hasSkillingOutfitUpgrade = true } = {}) {
  return [placeBefore(Object.keys(OUTFIT).map((id) => `worker_folks:${id}`), SKILLING_OUTFIT_UPGRADE, hasSkillingOutfitUpgrade)];
}

/** Shop display order for the Hiring Skillcape: just before the Cape of Completion. Registered as its own package after data/extras.json. */
export function skillcapeDisplayOrder({ hasCapeOfCompletion = true } = {}) {
  return [placeBefore(`worker_folks:${SKILLCAPE_ID}`, CAPE_OF_COMPLETION, hasCapeOfCompletion)];
}

/** Superior Hiring Skillcape item + shop purchase (Superior Skillcapes category, before the Superior Cape of Completion). */
export function superiorSkillcapePackage({ hasSuperiorCapeOfCompletion = true } = {}) {
  const item = {
    itemType: 'Equipment',
    id: SUPERIOR_SKILLCAPE_ID,
    name: 'Superior Hiring Skillcape',
    category: 'Combat',
    type: 'Armour',
    media: 'assets/skillcape_superior.webp',
    ignoreCompletion: false,
    obtainFromItemLog: false,
    golbinRaidExclusive: false,
    sellsFor: 1000000,
    tier: 'Skillcape',
    validSlots: ['Cape'],
    occupiesSlots: [],
    equipRequirements: [{ type: 'SkillLevel', skillID: HIRING_ID, level: SUPERIOR_SKILLCAPE_LEVEL }],
    equipmentStats: defence(9),
    modifiers: { 'worker_folks:folkWageDiscount': 10, 'worker_folks:folkCooldown': -20, 'worker_folks:folkStrikeGrace': 15 },
  };
  const purchase = {
    id: SUPERIOR_SKILLCAPE_ID,
    media: 'assets/skillcape_superior.webp',
    category: 'melvorTotH:SuperiorSkillcapes',
    contains: { items: [{ id: `worker_folks:${SUPERIOR_SKILLCAPE_ID}`, quantity: 1 }] },
    cost: { items: [], currencies: GP(10000000) },
    allowQuantityPurchase: false,
    unlockRequirements: [],
    purchaseRequirements: [{ type: 'SkillLevel', skillID: HIRING_ID, level: SUPERIOR_SKILLCAPE_LEVEL }],
    defaultBuyLimit: 1,
    buyLimitOverrides: [],
    showBuyLimit: false,
  };
  return {
    items: [item],
    shopPurchases: [purchase],
    shopDisplayOrder: [placeBefore(`worker_folks:${SUPERIOR_SKILLCAPE_ID}`, SUPERIOR_CAPE_OF_COMPLETION, hasSuperiorCapeOfCompletion)],
    // quick-equip slot on the Hiring minibar, next to the base cape and the outfit from data/extras.json
    skillData: [{ skillID: HIRING_ID, data: { minibar: { defaultItems: [`worker_folks:${SUPERIOR_SKILLCAPE_ID}`], pets: [], upgrades: [] } } }],
  };
}

/**
 * Hiring Lesser Relic: the Ancient Relics game mode's per-skill consumable (300 charges, a
 * 0.1% rare drop of each Folk action in that mode only, like the game's own Lesser Relics).
 * Worn in the Consumable slot; a charge goes on every player attack (engine) and every Folk
 * action (src/discoveries.mjs). Needs the AoD namespace for the gamemode id.
 */
export function lesserRelicPackage() {
  return {
    items: [{
      itemType: 'Equipment',
      id: LESSER_RELIC_ID,
      name: 'Hiring Lesser Relic',
      category: 'Combat',
      type: 'Consumable',
      media: 'assets/lesser_relic.webp',
      tier: 'none',
      ignoreCompletion: true,
      obtainFromItemLog: false,
      golbinRaidExclusive: false,
      sellsFor: 1,
      validSlots: ['Consumable'],
      occupiesSlots: [],
      equipRequirements: [],
      equipmentStats: [],
      modifiers: { 'worker_folks:folkWageDiscount': 5, skillXP: [{ skillID: HIRING_ID, value: 5 }], damageTaken: -5 },
      consumesOn: [{ type: 'PlayerAttack' }],
    }],
    skillData: [{
      skillID: HIRING_ID,
      data: {
        rareDrops: [{
          itemID: `worker_folks:${LESSER_RELIC_ID}`,
          quantity: LESSER_RELIC_QUANTITY,
          requirements: [],
          chance: { type: 'Fixed', chance: LESSER_RELIC_CHANCE },
          gamemodes: [ANCIENT_RELICS_GAMEMODE],
        }],
      },
    }],
  };
}

/**
 * Data packages to add after data/extras.json, by installed expansions. `hasPurchase(id)` says
 * whether a shop purchase is registered, so the capes can be placed before the completion capes.
 */
export function expansionGearPackages({ hasTotH = false, hasAoD = false } = {}, hasPurchase = () => true) {
  const packages = [{ shopDisplayOrder: [...outfitDisplayOrder({ hasSkillingOutfitUpgrade: hasPurchase(SKILLING_OUTFIT_UPGRADE) }), ...skillcapeDisplayOrder({ hasCapeOfCompletion: hasPurchase(CAPE_OF_COMPLETION) })] }];
  if (hasTotH) packages.push(superiorSkillcapePackage({ hasSuperiorCapeOfCompletion: hasPurchase(SUPERIOR_CAPE_OF_COMPLETION) }));
  if (hasAoD) packages.push(lesserRelicPackage());
  return packages;
}

/**
 * Lang keys for the names and descriptions set at load (modded objects read `_name`
 * directly). items: local id → { name, description? }; pet/relics: local id → name key.
 */
export const LANG = {
  items: {
    ...Object.fromEntries(Object.keys(OUTFIT).map((id) => [id, { name: `MOD_WF_ITEM_${id}`, description: 'MOD_WF_ITEM_OUTFIT_DESC' }])),
    [SKILLCAPE_ID]: { name: 'MOD_WF_ITEM_Hiring_Skillcape' },
    [SUPERIOR_SKILLCAPE_ID]: { name: 'MOD_WF_ITEM_Superior_Hiring_Skillcape' },
    [LESSER_RELIC_ID]: { name: 'MOD_WF_ITEM_Hiring_Lesser_Relic' },
  },
  pet: { [PET_ID]: { name: 'MOD_WF_PET_NAME', hint: 'MOD_WF_PET_HINT' } },
  relics: Object.fromEntries(RELICS.map((id) => [id, `MOD_WF_RELIC_${id}`])),
};
