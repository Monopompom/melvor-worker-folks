// What a skill is working on (its "pick"), and how to start it on that again.
// Stopping a skill clears its pick in some skills (Woodcutting forgets its trees, Mining its rock, Archaeology its
// dig site, Harvesting its vein, Cartography its survey target or queue), so a bare start() afterwards finds nothing
// to do and leaves the skill `isActive` with no timer. Replaying the player's click on the same thing avoids that.
// Used by the auto-restart after a settlement (payroll.mjs, build .81-.82) and by the hand-over from a Folk to the
// player (delegation.mjs, build .83). Duck-typed on the game's methods so it can be unit-tested in Node.
// A pick holds the game's objects; toSaved turns it into plain ids for the save and fromSaved finds the objects
// again, so a restart that waits across a reload (a strike's settlement, a Township commission run) still knows what
// to start on (build .164).

/** The skill's current pick, or null when the skill keeps its own pick through a stop (start() is enough). */
export function selectionOf(skill) {
  if (skill === undefined || skill === null) return null;
  // Cooking keeps its recipes but forgets the category it was cooking once stopped and reloaded.
  if (skill.selectedRecipes instanceof Map && typeof skill.onActiveCookButtonClick === 'function') {
    return skill.activeCookingCategory === undefined ? null : { cook: skill.activeCookingCategory };
  }
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
  if (pick?.cook !== undefined && skill.activeCookingCategory === undefined) skill.onActiveCookButtonClick(pick.cook);
  else if (pick?.trees?.length > 0 && skill.activeTrees.size === 0) pick.trees.forEach((tree) => skill.selectTree(tree));
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

const idOf = (x) => (typeof x === 'string' ? x : typeof x?.id === 'string' ? x.id : undefined);
const coordsOf = (hex) => (Number.isInteger(hex?.q) && Number.isInteger(hex?.r) ? { q: hex.q, r: hex.r } : undefined);
const defined = (x) => x !== undefined;

/** A pick (from selectionOf) as plain ids and hex coordinates for the save, or null when there is nothing to keep. */
export function toSaved(pick) {
  if (pick === null || typeof pick !== 'object') return null;
  if (pick.mode !== undefined) {
    switch (pick.mode) {
      case 1: { const hexes = (Array.isArray(pick.hexes) ? pick.hexes : []).map(coordsOf).filter(defined); return hexes.length > 0 ? { mode: 1, hexes } : null; }
      case 2: { const hex = coordsOf(pick.hex); return hex === undefined ? null : { mode: 2, hex }; }
      case 3: { const recipe = idOf(pick.recipe); return recipe === undefined ? null : { mode: 3, recipe }; }
      case 4: { const digSite = idOf(pick.digSite); return digSite === undefined ? null : { mode: 4, digSite }; }
      default: return null;
    }
  }
  if (Array.isArray(pick.trees)) { const trees = pick.trees.map(idOf).filter(defined); return trees.length > 0 ? { trees } : null; }
  for (const key of ['cook', 'rock', 'vein', 'digSite']) {
    if (pick[key] === undefined) continue;
    const id = idOf(pick[key]);
    return id === undefined ? null : { [key]: id };
  }
  return null;
}

/**
 * The saved pick (from toSaved) back as the game's objects for `skill`, or null. Only what this skill can start on
 * comes back: an id this skill doesn't know (another skill's, or gone from the game) gives null, a plain start().
 * `game` is for the dig sites Cartography upgrades maps for (Archaeology's).
 */
export function fromSaved(skill, saved, game) {
  if (skill === undefined || skill === null || saved === null || typeof saved !== 'object') return null;
  const find = (registry, id) => (typeof id === 'string' ? registry?.getObjectByID?.(id) : undefined);
  const action = (id) => find(skill.actions, id);
  if (saved.mode !== undefined) {
    if (typeof skill.startAutoSurvey !== 'function') return null;
    const hexAt = (c) => (coordsOf(c) === undefined ? undefined : skill.activeMap?.getHex?.(coordsOf(c)));
    switch (saved.mode) {
      case 1: { const hexes = (Array.isArray(saved.hexes) ? saved.hexes : []).map(hexAt).filter(defined); return hexes.length > 0 ? { mode: 1, hexes } : null; }
      case 2: { const hex = hexAt(saved.hex); return hex === undefined ? null : { mode: 2, hex }; }
      case 3: { const recipe = find(skill.paperRecipes, saved.recipe); return recipe === undefined ? null : { mode: 3, recipe }; }
      case 4: { const digSite = find(game?.archaeology?.actions, saved.digSite); return digSite === undefined ? null : { mode: 4, digSite }; }
      default: return null;
    }
  }
  const one = (key, starter, x) => (typeof skill[starter] === 'function' && x !== undefined ? { [key]: x } : null);
  if (Array.isArray(saved.trees)) {
    if (typeof skill.selectTree !== 'function') return null;
    const trees = saved.trees.map(action).filter(defined);
    return trees.length > 0 ? { trees } : null;
  }
  if (saved.cook !== undefined) return one('cook', 'onActiveCookButtonClick', find(skill.categories, saved.cook));
  if (saved.rock !== undefined) return one('rock', 'onRockClick', action(saved.rock));
  if (saved.vein !== undefined) return one('vein', 'onVeinClick', action(saved.vein));
  if (saved.digSite !== undefined) return one('digSite', 'startDigging', action(saved.digSite));
  return null;
}
