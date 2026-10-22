// The Steward, Hiring's Summoning familiar: the numbers and the pure rules (data in src/gear-data.mjs stewardPackage,
// the game side in src/steward.mjs). No game globals.
//
// A tablet worn by the player serves the whole crew, so it is not spent per Folk action (a ten-Folk crew on 3 s
// actions would burn a stack in minutes): one charge goes per STEWARD_CHARGE_MS of crew work, whoever is working,
// and the mark rolls at the same beat. Crew work is wall-clock time with at least one Folk at work: each finished
// action adds its interval divided by the Folks at work, so a bigger crew spends no faster.

export const STEWARD_ID = 'Steward';
export const STEWARD_ITEM_ID = 'Summoning_Familiar_Steward';
export const STEWARD_LEVEL = 30;
export const STEWARD_TIER = 2;
export const STEWARD_XP = 17;
/** The modifier the tablet carries: a share more skill XP for every Folk (src/acting.mjs reads it off the player's table). */
export const FOLK_SKILL_XP = 'folkSkillXP';
export const STEWARD_SKILL_XP = 5;
/** Crew work per charge. */
export const STEWARD_CHARGE_MS = 30000;
/** The length a charge counts as for Summoning's XP (a plain action's), and the length a charge's mark roll counts as. */
export const TABLET_MS = 3000;
export const MARK_MS = STEWARD_CHARGE_MS;

/**
 * The synergies with the game's familiars (`with` is the partner's recipe id), as modifiers the player's table already
 * carries for the crew (wages, grace, cooldown, Hiring's own XP) or the Folks read (folkSkillXP). A mod's synergy has
 * no custom text, so each is one plain modifier. No wage source over 10% (the reliefs' rule).
 */
export const SYNERGIES = [
  { with: 'melvorF:Leprechaun', modifiers: { 'worker_folks:folkWageDiscount': 5 } },
  { with: 'melvorF:Monkey', modifiers: { 'worker_folks:folkStrikeGrace': 10 } },
  { with: 'melvorF:Devil', modifiers: { 'worker_folks:folkCooldown': -10 } },
  { with: 'melvorF:Ent', modifiers: { skillXP: [{ skillID: 'worker_folks:Hiring', value: 10 }] } },
  { with: 'melvorF:Octopus', modifiers: { masteryXP: [{ skillID: 'worker_folks:Hiring', value: 10 }] } },
  { with: 'melvorF:Pig', modifiers: { [`worker_folks:${FOLK_SKILL_XP}`]: 5 } },
];

/**
 * Crew work booked after one Folk action: `budget` ms carried, `intervalMs` the action's, `working` the Folks at work.
 * Returns { budget, charges }: the ms left under a charge and the charges due (whole, usually 0 or 1).
 */
export function bookWork(budget, intervalMs, working, chargeMs = STEWARD_CHARGE_MS) {
  const b = Number.isFinite(budget) && budget > 0 ? budget : 0;
  const ms = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0;
  const n = Number.isInteger(working) && working > 0 ? working : 1;
  const step = Number.isFinite(chargeMs) && chargeMs > 0 ? chargeMs : STEWARD_CHARGE_MS;
  const total = b + ms / n;
  const charges = Math.floor(total / step);
  return { budget: total - charges * step, charges };
}

/** The Steward's data package: the folkSkillXP modifier, the tablet, its Summoning recipe and the synergies. */
export function stewardPackage() {
  return {
    modifiers: [{
      id: FOLK_SKILL_XP,
      allowedScopes: [{ scopes: {}, descriptions: [{ text: '+${value}% skill XP for every Folk', includeSign: false, lang: `MOD_WF_MODIFIER_${FOLK_SKILL_XP}` }] }],
    }],
    items: [{
      itemType: 'Equipment',
      id: STEWARD_ITEM_ID,
      name: 'Steward',
      category: 'Summoning',
      type: 'Familiar',
      media: 'assets/steward.webp',
      ignoreCompletion: false,
      obtainFromItemLog: false,
      golbinRaidExclusive: false,
      sellsFor: 0,
      tier: `Tier ${STEWARD_TIER} Summon`,
      validSlots: ['Summon1', 'Summon2'],
      occupiesSlots: [],
      equipRequirements: [],
      equipmentStats: [],
      modifiers: { [`worker_folks:${FOLK_SKILL_XP}`]: STEWARD_SKILL_XP },
      consumesOn: [],
    }],
    skillData: [{
      skillID: 'melvorD:Summoning',
      data: {
        recipes: [{
          id: STEWARD_ID,
          level: STEWARD_LEVEL,
          productID: `worker_folks:${STEWARD_ITEM_ID}`,
          baseQuantity: 25,
          baseExperience: STEWARD_XP,
          categoryID: 'melvorD:TabletsFamiliars',
          itemCosts: [
            { id: 'melvorF:Summoning_Shard_Green', quantity: 8 },
            { id: 'melvorF:Summoning_Shard_Silver', quantity: 6 },
          ],
          // Wages in, like the Leprechaun's GP: the Steward is made of coin, not of goods.
          currencyCosts: [{ id: 'melvorD:GP', quantity: 1000 }],
          markMedia: 'assets/mark_steward.webp',
          nonShardItemCosts: [],
          tier: STEWARD_TIER,
          skillIDs: ['worker_folks:Hiring'],
        }],
        synergies: SYNERGIES.map((s) => ({ summonIDs: [`worker_folks:${STEWARD_ID}`, s.with], modifiers: s.modifiers, consumesOn: [] })),
      },
    }],
  };
}

/** The engine's mark chance for the Steward, in percent, for the docs and the tests (Hiring has mastery: ×2.5 worn). */
export const markChance = (ms, worn) => ((worn ? 2.5 : 1) * ms) / (2000 * (STEWARD_TIER + 1) ** 2);
/** The engine's Summoning XP for a tablet spent on an action of `ms`. */
export const tabletXP = (level, ms) => ((ms / 1000) * level) / ((level + 10) / 10);
