// Qualification: a Folk works a skill only once you have that skill's level for its tier, "you did it by hand
// first". The standard skill level counts for every action, Abyssal ones included. Pure: no game globals.

const TIERS = ['Newbie', 'Junior', 'Middle', 'Senior', 'Expert'];
/** Your level in the skill a Folk of each tier needs. */
export const QUALIFICATION_LEVELS = { Newbie: 10, Junior: 30, Middle: 50, Senior: 70, Expert: 90 };
/** From this Folk mastery level on, the Folk needs the level of the tier below its own (never below Newbie's). */
export const LOWERING_MASTERY = 50;

/** The level a Folk needs from you: `{ level, lowered }`, lowered when its mastery took a tier off. */
export function requirement({ tier, masteryLevel = 1 }) {
  const index = TIERS.indexOf(tier);
  if (index < 0) throw new Error(`Unknown tier: ${tier}`);
  const lowered = index > 0 && masteryLevel >= LOWERING_MASTERY;
  return { level: QUALIFICATION_LEVELS[TIERS[lowered ? index - 1 : index]], lowered };
}

/** `{ level, lowered, now, ok }` for a Folk of `tier` on a skill where you are at `playerLevel`. */
export function check({ tier, masteryLevel = 1, playerLevel }) {
  const { level, lowered } = requirement({ tier, masteryLevel });
  const now = Math.max(0, Math.floor(playerLevel));
  return { level, lowered, now, ok: now >= level };
}

/** True when a level-up from `oldLevel` to `newLevel` reaches `level` (the moment a Folk qualifies). */
export function reached(level, oldLevel, newLevel) {
  return oldLevel < level && newLevel >= level;
}
