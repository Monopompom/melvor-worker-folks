// Which of the game's gain popups a Folk's turn may hide (build .96, the user, 18 Oct 2026: a setting to suppress the
// popups that come from Folks only). Pure: tests/popup-model.test.mjs.
//
// The game queues its popups on game.combat.notifications (NotificationQueue.add) with a type; these are the per-action
// gains. Level-ups, Mastery 99, a full bank, item charges, stuns and messages to the player keep showing.

export const FOLK_GAIN_TYPES = new Set(['Item', 'SkillXP', 'AbyssalXP', 'Currency', 'Mastery', 'Preserve']);

/** True when a queued popup should be dropped: the setting is on, a Folk's turn is running and it is a gain popup. */
export function dropPopup({ enabled, folkTurn, type }) {
  return enabled === true && folkTurn === true && FOLK_GAIN_TYPES.has(type);
}
