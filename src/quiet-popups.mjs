// "Hide Folks' gain popups" (build .96): while the setting is on, the XP, item, currency, mastery and preservation
// popups that come from a Folk's turn are not queued; the player's own actions show theirs as before. Game-facing;
// the rule is in popup-model.mjs, passed in from setup.mjs.
//
// A Folk's turn: delegation.mjs sets `hiring.folkTurn` while it ticks the delegated skills (actions, wages, Hiring XP,
// mastery), and `hiring.acting` covers a Folk's action wherever it runs.

export function install(ctx, { getHiring, rules, log }) {
  let hiring;
  const section = ctx.settings.section('Hiring');
  section.add([
    {
      type: 'switch',
      name: 'quietFolkPopups',
      label: getLangString('MOD_WF_SETTING_QUIET_POPUPS'),
      hint: getLangString('MOD_WF_SETTING_QUIET_POPUPS_HINT'),
      default: false,
    },
  ]);

  ctx.onModsLoaded(() => { hiring = getHiring(); });

  try {
    ctx.patch(NotificationQueue, 'add').replace(function (original, notification) {
      const folkTurn = hiring !== undefined && (hiring.folkTurn === true || hiring.acting !== undefined);
      if (folkTurn && rules.dropPopup({ enabled: section.get('quietFolkPopups') === true, folkTurn, type: notification?.type })) return undefined;
      return original(notification);
    });
  } catch (err) { log('popup filter not installed', err); }
}
