// A Folk's daydream in its card's spare space (build .155): one of a hundred lines, each with a game icon to match,
// shown in a thought bubble and changed every so often. Pure: no game globals.

/** [kind, game id] per daydream; its line is MOD_WF_DREAM_<nnn> (1-based). Kinds: item, skill, pet, monster. */
export const DREAMS = [
  ['item', 'melvorD:Normal_Logs'],
  ['item', 'melvorD:Oak_Logs'],
  ['item', 'melvorD:Willow_Logs'],
  ['item', 'melvorD:Redwood_Logs'],
  ['item', 'melvorD:Magic_Logs'],
  ['skill', 'melvorD:Woodcutting'],
  ['item', 'melvorD:Bird_Nest'],
  ['item', 'melvorD:Raw_Shrimp'],
  ['item', 'melvorD:Raw_Whale'],
  ['item', 'melvorD:Raw_Shark'],
  ['item', 'melvorD:Old_Boot'],
  ['item', 'melvorD:Rubber_Ducky'],
  ['item', 'melvorD:Message_In_A_Bottle'],
  ['item', 'melvorD:Raw_Blowfish'],
  ['skill', 'melvorD:Fishing'],
  ['item', 'melvorD:Raw_Crab'],
  ['item', 'melvorD:Burnt_Shrimp'],
  ['item', 'melvorD:Plain_Pizza_Slice'],
  ['item', 'melvorD:Carrot_Cake'],
  ['item', 'melvorD:Strawberry_Cupcake'],
  ['item', 'melvorD:Chicken_Soup'],
  ['item', 'melvorD:Lemonade'],
  ['item', 'melvorD:Bread'],
  ['item', 'melvorD:Cheese'],
  ['skill', 'melvorD:Cooking'],
  ['item', 'melvorD:Birthday_Cake'],
  ['item', 'melvorD:Copper_Ore'],
  ['item', 'melvorD:Coal_Ore'],
  ['item', 'melvorD:Gold_Ore'],
  ['item', 'melvorD:Dragonite_Ore'],
  ['item', 'melvorD:Diamond'],
  ['skill', 'melvorD:Mining'],
  ['item', 'melvorD:Runite_Bar'],
  ['item', 'melvorD:Bronze_Sword'],
  ['item', 'melvorD:Dragon_Platebody'],
  ['skill', 'melvorD:Smithing'],
  ['item', 'melvorD:Potatoes'],
  ['item', 'melvorD:Watermelon'],
  ['item', 'melvorD:Compost'],
  ['item', 'melvorD:Magic_Tree_Seed'],
  ['skill', 'melvorD:Farming'],
  ['item', 'melvorD:Cabbage'],
  ['skill', 'melvorD:Firemaking'],
  ['item', 'melvorF:Ash'],
  ['skill', 'melvorD:Thieving'],
  ['item', 'melvorF:Fine_Coinpurse'],
  ['item', 'melvorF:Golbin_Mask'],
  ['item', 'melvorD:Feathers'],
  ['item', 'melvorD:Normal_Shortbow'],
  ['skill', 'melvorD:Ranged'],
  ['item', 'melvorD:Leather_Boots'],
  ['item', 'melvorD:Gold_Topaz_Ring'],
  ['skill', 'melvorD:Crafting'],
  ['item', 'melvorD:Air_Rune'],
  ['item', 'melvorD:Fire_Rune'],
  ['skill', 'melvorD:Magic'],
  ['item', 'melvorD:Magic_Wand_Basic'],
  ['item', 'melvorD:Blue_Wizard_Hat'],
  ['skill', 'melvorD:Herblore'],
  ['item', 'melvorF:Perfect_Swing_Potion_I'],
  ['skill', 'melvorD:Agility'],
  ['skill', 'melvorD:Summoning'],
  ['skill', 'melvorD:Astrology'],
  ['item', 'melvorF:Stardust'],
  ['skill', 'melvorD:Township'],
  ['skill', 'melvorD:Prayer'],
  ['skill', 'melvorD:Slayer'],
  ['skill', 'melvorD:Attack'],
  ['skill', 'melvorD:Defence'],
  ['skill', 'melvorD:Hitpoints'],
  ['skill', 'melvorD:Strength'],
  ['monster', 'melvorD:Chicken'],
  ['monster', 'melvorD:Cow'],
  ['monster', 'melvorD:Golbin'],
  ['monster', 'melvorD:GreenDragon'],
  ['monster', 'melvorD:Spider'],
  ['monster', 'melvorD:Ghost'],
  ['monster', 'melvorD:TheKraken'],
  ['monster', 'melvorD:Seagull'],
  ['monster', 'melvorD:Pirate'],
  ['monster', 'melvorD:Wizard'],
  ['monster', 'melvorD:Plant'],
  ['monster', 'melvorD:JuniorFarmer'],
  ['monster', 'melvorD:Bandit'],
  ['pet', 'melvorD:PuddingDuckie'],
  ['pet', 'melvorD:CoolRock'],
  ['pet', 'melvorD:FinnTheCat'],
  ['pet', 'melvorD:PuffTheBabyDragon'],
  ['pet', 'melvorD:LarryTheLonelyLizard'],
  ['pet', 'melvorD:Chick'],
  ['pet', 'melvorD:JerryTheGiraffe'],
  ['pet', 'melvorD:GoldenGolbin'],
  ['item', 'melvorD:Treasure_Chest'],
  ['item', 'melvorD:Rusty_Key'],
  ['item', 'melvorD:Red_Party_Hat'],
  ['item', 'melvorD:Cool_Glasses'],
  ['item', 'melvorD:Santa_Hat'],
  ['item', 'melvorD:Easter_Egg'],
  ['item', 'melvorD:Glass_Bottle'],
  ['item', 'melvorD:Bobs_Rake'],
];

/** How long one daydream stays on a card. */
export const DREAM_MS = 90_000;

export function dreamKey(index) {
  return `MOD_WF_DREAM_${String(index + 1).padStart(3, '0')}`;
}

/** FNV-1a, 32 bit: the same seed always gives the same number. */
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 0 … count-1 in an order of the seed's own (Fisher-Yates over a small seeded generator). */
export function order(seed, count) {
  const out = Array.from({ length: count }, (_, i) => i);
  let s = hash(String(seed)) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x1_0000_0000; };
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Which of `count` daydreams a Folk has at `now`: each Folk walks its own order, one step every `periodMs`, so it
 * sees every one before any comes back, and Folks change at their own moments rather than all at once.
 */
export function pickDream({ seed, now, count, periodMs = DREAM_MS }) {
  if (!(count > 1)) return 0;
  const offset = hash(`${seed}:offset`) % periodMs;
  const step = Math.floor((now + offset) / periodMs);
  return order(seed, count)[((step % count) + count) % count];
}

/** A card shows its daydream only with this much spare height (px) and nothing in its alert band. */
export const DREAM_MIN_SPARE = 200;
