// Worker Folks' own moments (joint order round 5): the first set a Folk may bring you. Each one fits a Folk by what it
// is doing or what it holds, offers two answers with what they do written on the buttons, and takes the cautious one,
// which costs a little, when you don't answer. Effects go through the existing wage, trait, health and mastery calls.
// Game-facing; the pace and the answering are in moments.mjs.

const H = 3600 * 1000;
const GP_ID = 'melvorD:GP';
/** [BALANCE] Each refusal's grudge toward Resentful (learned at 24 h of strike time and grudge together). */
const GRUDGE_SMALL_H = 3;
const GRUDGE_BIG_H = 6;
/** [BALANCE] A paid answer costs this many hours of the Folk's wage, in GP. */
const PAY_HOURS = 24;
/** [BALANCE] Breaks and gifts, in hours. */
const DAY_OFF_H = 6;
const QUARREL_BREAK_H = 1;
const REST_H = 2;
const MASTERY_H = 2;
/** [BALANCE] Asking to try another skill: Specialist progress at least this, and the chance a Yes teaches Quick Learner. */
const TRY_FROM_H = 6;
const QUICK_LEARNER_CHANCE = 0.25;
/** [BALANCE] Below this share of max HP a Folk may feel poorly; working on anyway costs this share of max HP. */
const POORLY_SHARE = 0.5;
const WORK_ON_SHARE = 0.1;
/** [BALANCE] A bonus is asked for once the grudge toward Resentful holds this much (half for a Greedy Folk). */
const BONUS_FROM_H = 6;

/** The general strike's warning: looked at once a second of game time. */
const WARN_TICKS = 20;
const STRIKE_TALK = 'worker_folks:StrikeTalk';

export function install(ctx, { getHiring, bulk, rand = Math.random, log }) {
  let hiring;
  let ticks = 0;

  const trait = (id) => templateLangString(`MOD_WF_TRAIT_${id}`, { skill: '' }).trim();
  const hours = (h) => (typeof numberWithCommas === 'function' ? numberWithCommas(h) : `${h}`);
  const gp = () => game.currencies.getObjectByID(GP_ID);
  const costOf = (folk) => Math.max(1, Math.round(PAY_HOURS * (hiring.payroll?.hourlyWageOf(folk) ?? 0)));
  const needsGp = (folk) => {
    const cost = costOf(folk);
    return gp()?.canAfford(cost) === true ? '' : templateLangString('MOD_WF_MOMENT_NEEDS_GP', { cost: numberWithCommas(cost) });
  };
  const pay = (folk) => {
    const cost = costOf(folk);
    const cur = gp();
    if (cur === undefined || !cur.canAfford(cost)) return false;
    cur.remove(cost);
    return true;
  };
  const traits = () => hiring.traits;
  const has = (folk, id) => traits()?.has(folk, id) === true;
  /** At work on a skill of its own, not a job, not on the road. */
  const atWork = (folk) => folk.job === null && folk.travel !== 'walking' && hiring.isWorking(folk) && hiring.skillOf(folk) !== undefined;
  const grudge = (folk, h) => traits()?.grudge(folk, 'Resentful', h * H);
  // No grudge line for a Folk that holds Resentful or waits on it: the answer adds nothing toward it then.
  const grudgeHint = (folk, h) => (has(folk, 'Resentful') ? '' : templateLangString('MOD_WF_MOMENT_HINT_GRUDGE', { hours: hours(h), trait: trait('Resentful') }));
  const breakHint = (h) => templateLangString(hiring.levels?.autoRestart() ? 'MOD_WF_MOMENT_HINT_BREAK_BACK' : 'MOD_WF_MOMENT_HINT_BREAK', { hours: hours(h) });
  const named = (key) => (folk) => templateLangString(key, { name: folk.name });
  const label = (key) => () => getLangString(key);
  const specialistMs = (folk) => Object.entries(folk.traitState?.counts ?? {})
    .filter(([k]) => k.startsWith('Specialist:'))
    .reduce((top, [, v]) => Math.max(top, v), 0);
  const health = () => hiring.health;
  const hpShare = (folk) => {
    const h = health();
    if (h === undefined) return 1;
    const max = h.maxHpOf(folk);
    return max > 0 ? h.hpOf(folk) / max : 1;
  };
  const workOnHp = (folk) => {
    const h = health();
    if (h === undefined) return 0;
    return Math.max(0, Math.min(Math.ceil(h.maxHpOf(folk) * WORK_ON_SHARE), h.hpOf(folk) - 1));
  };
  const others = (folk) => hiring.crew.all.filter((f) => f.id !== folk.id && atWork(f));

  const MOMENTS = [
    {
      // The general strike's warning (round 5): opened by warnStrike below, never by the crew's pace.
      id: STRIKE_TALK,
      fits: () => false,
      text: named('MOD_WF_MOMENT_StrikeTalk'),
      answers: [
        {
          id: 'settle',
          label: label('MOD_WF_MOMENT_StrikeTalk_YES'),
          hint: () => getLangString('MOD_WF_MOMENT_HINT_SETTLE'),
          tone: 'go',
          // The Settle all bill, to pay what can be paid; never while away or when it ran out.
          apply: (folk, { offline, expired } = {}) => { if (!offline && !expired) bulk?.run('settle'); },
        },
        { id: 'hold', label: label('MOD_WF_MOMENT_StrikeTalk_NO'), hint: () => getLangString('MOD_WF_MOMENT_HINT_HOLD'), tone: 'no', apply: () => {} },
      ],
      defaultAnswer: 'hold',
    },
    {
      id: 'worker_folks:DayOff',
      fits: atWork,
      text: named('MOD_WF_MOMENT_DayOff'),
      answers: [
        { id: 'give', label: label('MOD_WF_MOMENT_DayOff_YES'), hint: () => breakHint(DAY_OFF_H), tone: 'go', apply: (folk) => { hiring.payroll?.breakFor(folk, DAY_OFF_H * H); } },
        { id: 'refuse', label: label('MOD_WF_MOMENT_DayOff_NO'), hint: (folk) => grudgeHint(folk, GRUDGE_BIG_H), tone: 'no', apply: (folk) => { grudge(folk, GRUDGE_BIG_H); } },
      ],
      defaultAnswer: 'refuse',
    },
    {
      id: 'worker_folks:BetterTools',
      fits: (folk) => atWork(folk) && folk.tier !== 'Newbie',
      text: named('MOD_WF_MOMENT_BetterTools'),
      answers: [
        {
          id: 'buy',
          label: label('MOD_WF_MOMENT_BetterTools_YES'),
          hint: (folk) => templateLangString('MOD_WF_MOMENT_HINT_MASTERY', { cost: numberWithCommas(costOf(folk)), hours: hours(MASTERY_H) }),
          why: needsGp,
          tone: 'go',
          apply: (folk) => { if (pay(folk)) hiring.addFolkMastery(folk, MASTERY_H * H); },
        },
        { id: 'decline', label: label('MOD_WF_MOMENT_BetterTools_NO'), hint: (folk) => grudgeHint(folk, GRUDGE_SMALL_H), tone: 'no', apply: (folk) => { grudge(folk, GRUDGE_SMALL_H); } },
      ],
      defaultAnswer: 'decline',
    },
    {
      id: 'worker_folks:Quarrel',
      fits: (folk) => atWork(folk) && others(folk).length > 0,
      partner: (folk) => {
        const list = others(folk);
        return list[Math.floor(rand() * list.length)]?.id;
      },
      text: (folk) => {
        const other = folk.moment?.with === undefined ? undefined : hiring.crew.byId(folk.moment.with);
        return other === undefined ? templateLangString('MOD_WF_MOMENT_Quarrel_ALONE', { name: folk.name })
          : templateLangString('MOD_WF_MOMENT_Quarrel', { name: folk.name, other: other.name });
      },
      answers: [
        { id: 'send', label: label('MOD_WF_MOMENT_Quarrel_YES'), hint: () => breakHint(QUARREL_BREAK_H), tone: 'go', apply: (folk) => { hiring.payroll?.breakFor(folk, QUARREL_BREAK_H * H); } },
        {
          id: 'leave',
          label: label('MOD_WF_MOMENT_Quarrel_NO'),
          hint: () => templateLangString('MOD_WF_MOMENT_HINT_GRUDGE_BOTH', { hours: hours(GRUDGE_SMALL_H), trait: trait('Resentful') }),
          tone: 'no',
          apply: (folk, { with: otherId } = {}) => {
            grudge(folk, GRUDGE_SMALL_H);
            const other = otherId === undefined ? undefined : hiring.crew.byId(otherId);
            if (other !== undefined) grudge(other, GRUDGE_SMALL_H);
          },
        },
      ],
      defaultAnswer: 'leave',
    },
    {
      id: 'worker_folks:TryOther',
      fits: (folk) => !has(folk, 'Specialist') && specialistMs(folk) >= TRY_FROM_H * H,
      text: named('MOD_WF_MOMENT_TryOther'),
      answers: [
        {
          id: 'let',
          label: label('MOD_WF_MOMENT_TryOther_YES'),
          hint: () => templateLangString('MOD_WF_MOMENT_HINT_TRY', { trait: trait('QuickLearner') }),
          tone: 'go',
          apply: (folk) => {
            traits()?.clearLearning(folk, 'Specialist');
            if (rand() < QUICK_LEARNER_CHANCE) traits()?.teach(folk, 'QuickLearner');
          },
        },
        { id: 'no', label: label('MOD_WF_MOMENT_TryOther_NO'), hint: (folk) => grudgeHint(folk, GRUDGE_SMALL_H), tone: 'no', apply: (folk) => { grudge(folk, GRUDGE_SMALL_H); } },
      ],
      defaultAnswer: 'no',
    },
    {
      id: 'worker_folks:Bonus',
      // A Greedy Folk asks at half the grudge.
      fits: (folk) => !has(folk, 'Resentful')
        && (traits()?.grudgeOf(folk, 'Resentful') ?? 0) >= (has(folk, 'Greedy') ? BONUS_FROM_H / 2 : BONUS_FROM_H) * H,
      text: named('MOD_WF_MOMENT_Bonus'),
      answers: [
        {
          id: 'pay',
          label: label('MOD_WF_MOMENT_Bonus_YES'),
          hint: (folk) => templateLangString('MOD_WF_MOMENT_HINT_BONUS', { cost: numberWithCommas(costOf(folk)) }),
          why: needsGp,
          tone: 'go',
          apply: (folk) => { if (pay(folk)) traits()?.clearGrudge(folk, 'Resentful'); },
        },
        { id: 'refuse', label: label('MOD_WF_MOMENT_Bonus_NO'), hint: (folk) => grudgeHint(folk, GRUDGE_BIG_H), tone: 'no', apply: (folk) => { grudge(folk, GRUDGE_BIG_H); } },
      ],
      defaultAnswer: 'refuse',
    },
    {
      id: 'worker_folks:Poorly',
      fits: (folk) => health() !== undefined && folk.travel !== 'walking' && (has(folk, 'Sickly') || hpShare(folk) < POORLY_SHARE),
      text: named('MOD_WF_MOMENT_Poorly'),
      answers: [
        {
          id: 'rest',
          label: label('MOD_WF_MOMENT_Poorly_YES'),
          hint: (folk) => (atWork(folk) ? templateLangString('MOD_WF_MOMENT_HINT_REST', { hours: hours(REST_H) }) : getLangString('MOD_WF_MOMENT_HINT_REST_IDLE')),
          tone: 'go',
          apply: (folk) => {
            if (atWork(folk)) hiring.payroll?.breakFor(folk, REST_H * H);
            health()?.heal(folk, health().maxHpOf(folk), { cause: 'rest' });
          },
        },
        {
          id: 'work',
          label: label('MOD_WF_MOMENT_Poorly_NO'),
          hint: (folk) => (has(folk, 'Sickly') ? templateLangString('MOD_WF_MOMENT_HINT_SICKLY', { trait: trait('Sickly') })
            : templateLangString('MOD_WF_MOMENT_HINT_HURT', { hp: numberWithCommas(workOnHp(folk)) })),
          tone: 'no',
          apply: (folk) => {
            // Sickly's recovery counts full-health time; this sends it back to the start. Otherwise a little HP, never the last.
            if (has(folk, 'Sickly')) { traits()?.onHurt(folk, health()?.hpOf(folk) ?? 1, health()?.maxHpOf(folk) ?? 1); return; }
            const hp = workOnHp(folk);
            if (hp > 0) health()?.damage(folk, hp, { eat: false, cause: 'moment' });
          },
        },
      ],
      defaultAnswer: 'work',
    },
    {
      id: 'worker_folks:DoubleShift',
      fits: (folk) => atWork(folk) && (has(folk, 'Loyal') || has(folk, 'Workaholic')),
      text: named('MOD_WF_MOMENT_DoubleShift'),
      answers: [
        { id: 'accept', label: label('MOD_WF_MOMENT_DoubleShift_YES'), hint: () => templateLangString('MOD_WF_MOMENT_HINT_MASTERY_FREE', { hours: hours(MASTERY_H) }), tone: 'go', apply: (folk) => { hiring.addFolkMastery(folk, MASTERY_H * H); } },
        { id: 'decline', label: label('MOD_WF_MOMENT_DoubleShift_NO'), hint: () => getLangString('MOD_WF_MOMENT_HINT_NOTHING'), tone: 'no', apply: () => {} },
      ],
      defaultAnswer: 'decline',
    },
  ];

  /**
   * One strike short of a general strike: Strike talk opens on a Folk at work, once per build-up (the crew clock's
   * `warned`), again only after the strikers drop below the line. A warning that no longer holds closes unanswered.
   */
  const warnStrike = () => {
    const payroll = hiring.payroll;
    const moments = hiring.moments;
    if (payroll === undefined || moments === undefined) return;
    const clock = hiring.crew.moments;
    const on = payroll.generalOn;
    const { warn } = on ? payroll.generalView() : { warn: false };
    if (!warn) {
      // Runs every second: only a Folk that still holds the talk is touched.
      for (const folk of hiring.crew.all) if (folk.moment?.id === STRIKE_TALK) moments.dismiss(folk, STRIKE_TALK);
      if (clock.warned) hiring.crew.moments = { ...clock, warned: false };
      return;
    }
    if (clock.warned) return;
    // Only a Folk that would walk out gets the talk: not a Loyal one, not one on the road (the walkout spares both).
    const free = hiring.crew.all.filter((folk) => !folk.onStrike && hiring.isWorking(folk) && hiring.traits?.neverStrikes(folk) !== true
      && folk.travel !== 'walking' && (folk.moment === null || folk.moment === undefined));
    const folk = free[Math.floor(rand() * free.length)];
    if (folk === undefined || !moments.force(folk, STRIKE_TALK)) return;
    hiring.crew.moments = { ...hiring.crew.moments, warned: true };
  };

  ctx.patch(Game, 'tick').after(function () {
    if (hiring?.crew === undefined) return;
    ticks += 1;
    if (ticks < WARN_TICKS) return;
    ticks = 0;
    try {
      warnStrike();
    } catch (e) {
      log(`strike warning failed: ${e?.message ?? e}`);
    }
  });

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    if (hiring.moments === undefined) return;
    for (const def of MOMENTS) {
      try {
        hiring.moments.register(def);
      } catch (e) {
        log(`moment ${def.id} not registered: ${e?.message ?? e}`);
      }
    }
  });

  return { ids: MOMENTS.map((d) => d.id), warnStrike };
}
