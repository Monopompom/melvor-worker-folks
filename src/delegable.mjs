// Pure helper: decides which registered active actions a Folk may hold.
// No game globals here so it can be unit-tested in Node.

/**
 * Skills no Folk is ever given (the user, 23 Oct 2026): their page has no Worker box. Cartography surveys around the
 * player and paints the map as you go; a Folk surveying it would reveal the world without you.
 */
export const NEVER_DELEGATED = ['melvorAoD:Cartography'];

/**
 * @param {Array<object>} actions   every entry of game.activeActions
 * @param {object} [opts]
 * @param {Array<string>} [opts.excludeIds]   ids excluded by the user setting
 * @param {Array<string>} [opts.combatLikeIds] ids that are never delegable (combat, raid)
 * @returns {Array<object>} delegable actions, in registry order
 */
export function selectDelegable(actions, opts = {}) {
  const exclude = new Set(opts.excludeIds ?? []);
  const combatLike = new Set(opts.combatLikeIds ?? []);
  return actions.filter((action) => {
    if (action == null || typeof action.id !== 'string') return false;
    if (combatLike.has(action.id) || exclude.has(action.id) || NEVER_DELEGATED.includes(action.id)) return false;
    return implementsActionContract(action);
  });
}

/**
 * The minimal contract a skill must expose for the delegation patches to be safe.
 * `start` is deliberately not required: Cartography (AoD) starts through several
 * mode-specific methods, but it still ticks, stops and reports isActive like the rest.
 */
export function implementsActionContract(action) {
  return (
    typeof action.stop === 'function' &&
    typeof action.activeTick === 'function' &&
    'isActive' in action &&
    action.actionTimer !== undefined
  );
}
