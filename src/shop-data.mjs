// Shop purchases for every tier and the Shift Slot, built per installed
// expansions. Pure: returns plain data-package objects (DESIGN §4).

const CAT = 'worker_folks:WorkerFolks';
const GP = (cost) => [{ currency: 'melvorD:GP', type: 'Fixed', cost }];
const item = (id, quantity) => ({ id, quantity });
const base = {
  category: CAT,
  contains: { items: [], modifiers: {} }, // empty modifiers: makes the engine record the purchase
  allowQuantityPurchase: false,
  buyLimitOverrides: [],
  showBuyLimit: false,
};

export const TIER_ORDER = ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'];
export const ROLE = { Newbie: 'Trainee', Junior: 'Apprentice', Middle: 'Journeyman', Senior: 'Master', Expert: 'Foreman' };
export const RATE = { Newbie: 60, Junior: 80, Middle: 100, Senior: 120, Expert: 140 };
export const HIRE_BASE = { Newbie: 500000, Junior: 2500000, Middle: 10000000, Senior: 40000000, Expert: 120000000 };
export const LICENCE_LEVEL = { Newbie: 1, Junior: 20, Middle: 40, Senior: 60, Expert: 80 };

export const LICENCE_GP = { Newbie: 2500000, Junior: 25000000, Middle: 100000000, Senior: 400000000, Expert: 1000000000 };

/**
 * Dungeon clear per licence. Each signature item already proves its own dungeon (Amulet of
 * Looting: Spider Forest, Torture: Deep Sea Ship, Fury: Volcanic Cave, Infernal Core:
 * Infernal Stronghold), so the clear asked for here is a different dungeon of the same or
 * higher difficulty tier (game difficulty 3, 4, 5, 5, 6). Foreman items come from elsewhere,
 * so Into the Mist stays.
 */
export const LICENCE_DUNGEON = {
  Newbie: 'melvorD:Frozen_Cove',
  Junior: 'melvorD:Volcanic_Cave',
  Middle: 'melvorF:Air_God_Dungeon',
  Senior: 'melvorF:Fire_God_Dungeon',
  Expert: 'melvorF:Into_the_Mist',
};

/**
 * Items per licence. Within one licence no two items are of the same kind (one amulet, one bar, one weapon of each
 * sort...) in any expansion mix (decided 15 Oct 2026); the Expert expansion extras come from less played skills:
 * AoD Runecrafting 90 (Mystic Pure Crystal Staff) and Crafting 99 (Imbued Elder Dragonhide), ItA abyssal Crafting 51
 * (Obzurian Unnatural Vitality Ring) and abyssal Harvesting 55 (Voidfire Quartz, the Voidfire vein's 80% product).
 */
export function licenceItems(tier, { hasTotH = false, hasAoD = false, hasItA = false } = {}) {
  switch (tier) {
    case 'Newbie':
      return [item('melvorD:Amulet_of_Looting', 1), item('melvorD:Mithril_Platebody', 25), item('melvorD:Adamant_Arrows', 2000)];
    case 'Junior':
      return [item('melvorD:Amulet_of_Torture', 3), item('melvorD:Rune_Platebody', 25), item('melvorD:Magic_Logs', 5000)];
    case 'Middle':
      return [item('melvorD:Amulet_of_Fury', 1), item('melvorD:Dragon_Platebody', 10), item('melvorD:Redwood_Longbow', 25), item('melvorD:Whale', 500)];
    case 'Senior':
      return [item('melvorD:Fury_of_the_Elemental_Zodiac', 1), item('melvorF:Infernal_Core', 2), item('melvorF:Fire_Imbued_Wand', 5), item('melvorF:Summoning_Familiar_Dragon', 1000)];
    case 'Expert': {
      const items = hasTotH
        ? [item('melvorTotH:FrostSpark_Amulet', 1), item('melvorTotH:Divine_Platebody', 5), item('melvorTotH:Ethereal_Arrows', 5000)]
        : [item('melvorF:Ultima_Godsword', 1), item('melvorF:Elder_Crown', 1)];
      if (hasAoD) items.push(item('melvorAoD:Mystic_Pure_Crystal_Staff', 1), item('melvorAoD:Imbued_Elder_Dragonhide', 100));
      if (hasItA) items.push(item('melvorItA:Obzurian_Unnatural_Vitality_Ring', 1), item('melvorItA:Voidfire_Quartz', 100));
      return items;
    }
    default:
      throw new Error(`Unknown tier ${tier}`);
  }
}

/** English fallback templates (the game build passes templateLangString). */
const FALLBACK = {
  MOD_WF_ROLE_Newbie: 'Trainee', MOD_WF_ROLE_Junior: 'Apprentice', MOD_WF_ROLE_Middle: 'Journeyman', MOD_WF_ROLE_Senior: 'Master', MOD_WF_ROLE_Expert: 'Foreman',
  MOD_WF_ROLES_Newbie: 'Trainees', MOD_WF_ROLES_Junior: 'Apprentices', MOD_WF_ROLES_Middle: 'Journeymen', MOD_WF_ROLES_Senior: 'Masters', MOD_WF_ROLES_Expert: 'Foremen',
  MOD_WF_A_ROLE_Newbie: 'a Trainee', MOD_WF_A_ROLE_Junior: 'an Apprentice', MOD_WF_A_ROLE_Middle: 'a Journeyman', MOD_WF_A_ROLE_Senior: 'a Master', MOD_WF_A_ROLE_Expert: 'a Foreman',
  MOD_WF_SHOP_LICENCE_NAME: '${role} Licence',
  MOD_WF_SHOP_LICENCE_DESC: 'Allows hiring and promoting ${roles} (Produce Rate ${rate}).',
  MOD_WF_SHOP_LICENCE_SLOT: 'Grants 1 Shift Slot (Folks working at the same time).',
  MOD_WF_SHOP_HIRE_NAME: 'Hire ${aRole}',
  MOD_WF_SHOP_HIRE_DESC: 'Adds one unassigned ${role} (Produce Rate ${rate}) to your crew. The price rises by 20% for every ${role} you own. Your crew can never exceed the number of skills Folks can hold.',
  MOD_WF_SHOP_SLOT_NAME: 'Shift Slot',
  MOD_WF_SHOP_SLOT_DESC: 'One more Folk may work at the same time. The price rises by 40% per slot. Your highest licence caps the slots: Trainee 2, Apprentice 4, Journeyman 7, Master 10, Foreman unlimited.',
};
export const fallbackText = (key, vars = {}) => (FALLBACK[key] ?? key).replace(/\$\{(\w+)\}/g, (_, k) => `${vars[k] ?? ''}`);

export function licencePurchase(tier, expansions, t = fallbackText) {
  const index = TIER_ORDER.indexOf(tier);
  const previous = index > 0 ? TIER_ORDER[index - 1] : null;
  const purchaseRequirements = [{ type: 'DungeonCompletion', dungeonID: LICENCE_DUNGEON[tier], count: 1 }];
  if (LICENCE_LEVEL[tier] > 1) purchaseRequirements.push({ type: 'SkillLevel', skillID: 'worker_folks:Hiring', level: LICENCE_LEVEL[tier] });
  if (previous !== null) purchaseRequirements.push({ type: 'ShopPurchase', purchaseID: `worker_folks:Licence_${previous}`, count: 1 });
  const role = t(`MOD_WF_ROLE_${tier}`);
  const extra = tier === 'Newbie' ? ` ${t('MOD_WF_SHOP_LICENCE_SLOT')}` : '';
  return {
    ...base,
    id: `Licence_${tier}`,
    media: `img/licence_${tier.toLowerCase()}.png`,
    cost: { currencies: GP(LICENCE_GP[tier]), items: licenceItems(tier, expansions) },
    unlockRequirements: [],
    purchaseRequirements,
    defaultBuyLimit: 1,
    customName: t('MOD_WF_SHOP_LICENCE_NAME', { role }),
    customDescription: `${t('MOD_WF_SHOP_LICENCE_DESC', { role, roles: t(`MOD_WF_ROLES_${tier}`), rate: `${RATE[tier]}` })}${extra}`,
  };
}

export function hirePurchase(tier, t = fallbackText) {
  const role = t(`MOD_WF_ROLE_${tier}`);
  return {
    ...base,
    id: `Hire_${tier}`,
    media: `img/worker_folk_${tier.toLowerCase()}.png`,
    cost: { currencies: GP(HIRE_BASE[tier]), items: [] },
    unlockRequirements: [],
    purchaseRequirements: [{ type: 'ShopPurchase', purchaseID: `worker_folks:Licence_${tier}`, count: 1 }],
    defaultBuyLimit: 0,
    customName: t('MOD_WF_SHOP_HIRE_NAME', { role, aRole: t(`MOD_WF_A_ROLE_${tier}`) }),
    customDescription: t('MOD_WF_SHOP_HIRE_DESC', { role, rate: `${RATE[tier]}` }),
  };
}

export function shiftSlotPurchase(t = fallbackText) {
  return {
    ...base,
    id: 'Shift_Slot',
    media: 'img/shift_slot.png',
    cost: { currencies: GP(3000000), items: [] },
    unlockRequirements: [],
    purchaseRequirements: [{ type: 'ShopPurchase', purchaseID: 'worker_folks:Licence_Newbie', count: 1 }],
    defaultBuyLimit: 0,
    customName: t('MOD_WF_SHOP_SLOT_NAME'),
    customDescription: t('MOD_WF_SHOP_SLOT_DESC'),
  };
}

/** The whole shop section as data-package fields (merge into a package with `namespace`). */
export function buildShopData(expansions = {}, t = fallbackText) {
  const shopPurchases = [];
  TIER_ORDER.forEach((tier) => shopPurchases.push(licencePurchase(tier, expansions, t)));
  TIER_ORDER.forEach((tier) => shopPurchases.push(hirePurchase(tier, t)));
  shopPurchases.push(shiftSlotPurchase(t));
  return {
    shopPurchases,
    shopDisplayOrder: [{ insertAt: 'End', ids: shopPurchases.map((p) => `worker_folks:${p.id}`) }],
  };
}
