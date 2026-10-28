// What a skill is working on (its "pick"), and how to start it on that again.
// Stopping a skill clears its pick in some skills (Woodcutting forgets its trees, Mining its rock, Archaeology its
// dig site, Harvesting its vein, Cartography its survey target or queue), so a bare start() afterwards finds nothing
// to do and leaves the skill `isActive` with no timer. Replaying the player's click on the same thing avoids that.
// Used by the auto-restart after a settlement (payroll.mjs, build .81-.82) and by the hand-over from a Folk to the
// player (delegation.mjs, build .83). Duck-typed on the game's methods so it can be unit-tested in Node.

/** The skill's current pick, or null when the skill keeps its own pick through a stop (start() is enough). */
export function selectionOf(skill) {
  if (skill === undefined || skill === null) return null;
  if (skill.activeTrees instanceof Set && typeof skill.selectTree === 'function') return { trees: [...skill.activeTrees] };
  if ('selectedRock' in skill && typeof skill.onRockClick === 'function' && skill.selectedRock !== undefined) return { rock: skill.selectedRock };
  if (typeof skill.startDigging === 'function' && skill.currentDigSite !== undefined) return { digSite: skill.currentDigSite };
  if (typeof skill.onVeinClick === 'function' && skill.selectedVein !== undefined) return { vein: skill.selectedVein };
  // Cartography has no start(): it starts through the starter of its mode.
  if (typeof skill.startAutoSurvey === 'function') {
    switch (skill._actionMode) {
      case 1: { const hexes = []; skill.surveyQueue?.forEachForward?.((hex) => { hexes.push(hex); }); return { mode: 1, hexes }; }
      case 2: return { mode: 2, hex: skill.autoSurveyHex };
      case 3: return { mode: 3, recipe: skill.selectedPaperRecipe };
      case 4: return { mode: 4, digSite: skill.selectedMapUpgradeDigsite };
      default: return null;
    }
  }
  return null;
}

/** Starts the skill on `pick` (from selectionOf) through the game's own starter, or plain start() without one. */
export function startAgain(skill, pick) {
  if (pick?.trees?.length > 0 && skill.activeTrees.size === 0) pick.trees.forEach((tree) => skill.selectTree(tree));
  else if (pick?.rock !== undefined && skill.selectedRock === undefined) skill.onRockClick(pick.rock);
  else if (pick?.vein !== undefined && skill.selectedVein === undefined) skill.onVeinClick(pick.vein);
  else if (pick?.mode !== undefined) {
    if (pick.mode === 1 && pick.hexes.length > 0) { pick.hexes.forEach((hex) => skill.surveyQueue.queue(hex)); skill.startSurveyQueue(); }
    else if (pick.mode === 2 && pick.hex !== undefined) skill.startAutoSurvey(pick.hex);
    else if (pick.mode === 3 && pick.recipe !== undefined) skill.startMakingPaper(pick.recipe);
    else if (pick.mode === 4 && pick.digSite !== undefined) skill.startUpgradingMap(pick.digSite);
  } else if (pick?.digSite !== undefined && skill.currentDigSite === undefined) skill.startDigging(pick.digSite);
  // Woodcutting with no tree has no interval (the largest of none is -Infinity) and its start() throws half-way,
  // leaving the skill `isActive` with no timer: nothing to start on, so nothing is started.
  else if (skill.activeTrees instanceof Set && skill.activeTrees.size === 0) return;
  else if (typeof skill.start === 'function') skill.start();
}
