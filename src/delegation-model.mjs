// Decisions for delegation. Pure: no game globals.

/**
 * What happens when a skill is started (from its own page, by any start path).
 *  'delegate' – a Folk is assigned to the skill (chosen in the skill page's Worker
 *               control) and the skill is already delegated or a Shift Slot is free
 *  'refuse'   – a Folk is assigned but every Shift Slot is busy
 *  'unavailable' – the assigned Folk is on strike or cooling down
 *  'main'     – no Folk on this skill: the player's ordinary main-slot start
 */
export function decideStart({ hasFolk, folkAvailable = true, isDelegated, delegatedCount, shiftSlots }) {
  if (!hasFolk) return 'main';
  if (isDelegated) return 'delegate';
  if (!folkAvailable) return 'unavailable';
  return delegatedCount < shiftSlots ? 'delegate' : 'refuse';
}

/**
 * On load: skills flagged active that are not the main action were delegated
 * when the game was saved. Those still holding a Folk resume; the rest are
 * zombies the engine would never tick again and must be reset.
 */
export function rebuildDelegated({ skills, mainAction, hasFolk }) {
  const delegated = [];
  const zombies = [];
  for (const skill of skills) {
    if (!skill.isActive || skill === mainAction) continue;
    (hasFolk(skill) ? delegated : zombies).push(skill);
  }
  return { delegated, zombies };
}

/**
 * Picking a Folk in a skill page's Worker box: move now, or only when that page's
 * next start happens? A Folk busy on another skill keeps working until then.
 */
export function moveMode({ currentSkillId, targetSkillId, working }) {
  if (currentSkillId === targetSkillId) return 'none';
  return working ? 'deferred' : 'now';
}

/**
 * Switching a skill page's Worker box back to "You": unassign the Folk now, or
 * only when the player actually starts the skill? A working Folk keeps its job
 * until then, so merely looking at the page does not interrupt it.
 */
export function releaseMode({ working }) {
  return working ? 'deferred' : 'now';
}

/**
 * Entries for a skill page's Worker dropdown. `folks` are every crew member with
 * their current skill id and availability; the skill's own holder is marked current.
 */
export function workerOptions({ folks, skillId, skillNameOf }) {
  return folks.map((f) => ({
    id: f.id,
    name: f.name,
    tier: f.tier,
    current: f.skillId === skillId,
    elsewhere: f.skillId !== null && f.skillId !== skillId ? skillNameOf(f.skillId) : null,
    available: f.available,
    lines: Array.isArray(f.lines) ? f.lines : [],
  }));
}
