// Qualification (v2): a Folk works a skill only once your level in it reaches its tier's (qualification-model.mjs).
// Game-facing. A built-in guard on the Hiring skill, asked before another mod's guards: picking a Folk in a Worker box
// ('staff' assign) and a Folk starting its skill ('work'), so the tile, the Worker box, the card and the auto-restart
// show the reason the way they show Voyage's. A Folk already working a skill it doesn't qualify for (an older save, a
// promotion, the setting switched on) stops and keeps its job: it starts again once you have the level.

export function install(ctx, { getHiring, model, log }) {
  let hiring;
  /** Folks stopped while the save loaded: their notices wait for the interface (offline progress runs between). */
  let stoppedOnLoad = [];
  const section = ctx.settings.section('Hiring');
  const enabled = () => section.get('qualification') !== false;

  /** `{ level, lowered, now, ok }` for this Folk on this skill (as `tier` when given: a promotion's preview). */
  const checkOf = (folk, skill, tier = folk.tier) => model.check({ tier, masteryLevel: hiring.masteryLevelOf(folk), playerLevel: skill.level });

  /** Why this Folk may not work this skill ('' = it may). */
  const reasonFor = (folk, skill, tier = folk.tier) => {
    if (!enabled() || folk === undefined || skill === undefined) return '';
    const c = checkOf(folk, skill, tier);
    return c.ok ? '' : templateLangString('MOD_WF_QUALIFY_NEEDS', { skill: hiring.skillName(skill), level: `${c.level}`, now: `${c.now}` });
  };

  /** Stops every working Folk that `pick`s and doesn't qualify for its skill; returns { folk, skill, reason } each. */
  const stopUnqualified = (pick = () => true) => {
    const stopped = [];
    if (hiring === undefined || !enabled()) return stopped;
    for (const skill of Array.from(hiring.delegated)) {
      const folk = hiring.crew.bySkill(skill.id);
      if (folk === undefined || !pick(folk)) continue;
      const reason = reasonFor(folk, skill);
      if (reason === '') continue;
      hiring.forceStop(skill);
      stopped.push({ folk, skill, reason });
      log(`${folk.name} stopped on ${skill.id}: ${reason}`);
    }
    if (stopped.length > 0) hiring.renderQueue.folks = true;
    return stopped;
  };

  const notify = ({ folk, skill, reason }) => {
    game.notifications.createInfoNotification(
      'worker_folks:qualify',
      templateLangString('MOD_WF_QUALIFY_STOPPED', { name: folk.name, skill: hiring.skillName(skill), reason }),
      hiring.portrait(folk.tier),
    );
  };

  section.add([
    {
      type: 'switch',
      name: 'qualification',
      label: getLangString('MOD_WF_SETTING_QUALIFICATION'),
      hint: getLangString('MOD_WF_SETTING_QUALIFICATION_HINT'),
      default: true,
      // Called before the value is stored: the sweep and the redraw run once it is.
      onChange: () => {
        queueMicrotask(() => {
          if (hiring === undefined) return;
          stopUnqualified().forEach(notify);
          hiring.crew.touch();
        });
      },
    },
  ]);

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.qualification = {
      enabled,
      reasonFor,
      /** What this Folk would need on its skill after a promotion to `tier` ('' when nothing changes for the worse). */
      afterPromotion: (folk, tier) => {
        const skill = hiring.skillOf(folk);
        return skill === undefined || reasonFor(folk, skill) !== '' ? '' : reasonFor(folk, skill, tier);
      },
    };
    const refuse = (folk, skill) => {
      const reason = reasonFor(folk, skill);
      return reason === '' ? undefined : { reason };
    };
    hiring.ownGuards.register('work', ({ folk, skill }) => refuse(folk, skill));
    hiring.ownGuards.register('staff', ({ action, folk, skill }) => (action === 'assign' ? refuse(folk, skill) : undefined));
  });

  // After Game.onLoad rebuilt the Folks' runs and before offline progress: an unqualified Folk does no offline work.
  ctx.onCharacterLoaded(() => {
    if (hiring === undefined) return;
    stoppedOnLoad = stopUnqualified();
    // A promotion can lift a working Folk's requirement past your level (the Promote popup said so first).
    hiring.events.on('folkPromoted', ({ folk }) => stopUnqualified((f) => f === folk).forEach(notify));
  });
  ctx.onInterfaceReady(() => {
    stoppedOnLoad.forEach(notify);
    stoppedOnLoad = [];
  });

  // Reaching a Folk's level frees it: its card, tile and Worker box drop the reason at once.
  try {
    ctx.patch(Skill, 'onLevelUp').after(function (_result, oldLevel, newLevel) {
      if (hiring === undefined || !enabled()) return;
      const folk = hiring.crew.bySkill(this.id);
      if (folk !== undefined && model.reached(checkOf(folk, this).level, oldLevel, newLevel)) hiring.crew.touch();
    });
  } catch (err) { log('qualification level-up hook not installed', err); }
}
