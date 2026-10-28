// Hiring level milestones wired to the engine: milestone list in the skill's
// "View Milestones" modal and level-up modal, Hiring XP for the time Folks work
// (rate setting), and the live gates other slices read via hiring.levels. Game-facing.

export function install(ctx, { getHiring, rules, log }) {
  let hiring;
  const section = ctx.settings.section('Hiring');
  section.add([
    {
      type: 'number',
      name: 'hiringXPRate',
      label: getLangString('MOD_WF_SETTING_XP_RATE'),
      hint: getLangString('MOD_WF_SETTING_XP_RATE_HINT'),
      default: rules.DEFAULT_XP_RATE,
      min: 0,
      max: 1000,
    },
  ]);
  const xpRate = () => {
    const v = Number(section.get('hiringXPRate'));
    return Number.isFinite(v) ? Math.min(1000, Math.max(0, v)) : rules.DEFAULT_XP_RATE;
  };

  const api = {
    level: () => hiring.level,
    levelCap: () => hiring.currentLevelCap,
    xpRate,
    reserveCapacityHours: () => rules.reserveCapacityHours(hiring.level),
    promotionsUnlocked: () => rules.promotionsUnlocked(hiring.level),
    promotionLevel: rules.PROMOTION_LEVEL,
    apologyUnlocked: () => rules.apologyUnlocked(hiring.level),
    forgetUnlocked: () => hiring.level >= rules.FORGET_LEVEL,
    forgetLevel: rules.FORGET_LEVEL,
    apologyLevel: rules.APOLOGY_LEVEL,
    autoRestart: () => rules.autoRestartUnlocked(hiring.level),
    overtimeWageFactor: () => rules.overtimeWageFactor(hiring.level),
    freeShiftSlots: () => rules.freeShiftSlots(hiring.level),
    wageDiscount: () => rules.levelWageDiscount(hiring.level),
    promotionCostRate: () => rules.promotionCostRate(hiring.level),
    firingSeverance: (cost) => rules.firingSeverance(cost, hiring.level),
    firingSeveranceRate: () => rules.firingSeveranceRate(hiring.level),
    folkMarkShare: () => rules.folkMarkShare(hiring.level),
    crewBonusMax: () => rules.crewBonusMax(hiring.level),
    reserveLevel: 5,
    /** "Hiring N" label for a locked control. */
    lockText: (level) => templateLangString('MOD_WF_LOCKED_LEVEL', { level: `${level}` }),
  };

  const mediaFor = (m) => {
    if (m.icon === 'reserve') return hiring.getMediaURL('assets/payroll_reserve.webp');
    if (m.icon === 'hiring') return hiring.media;
    return hiring.portrait(m.icon);
  };

  /** Milestone objects for the engine's milestone modal: { level, name, media }. */
  const buildMilestones = () => {
    hiring.milestones = hiring.milestones.filter((m) => m.wfKey === undefined);
    rules.visibleMilestones(hiring.maxLevelCap).forEach((m) => {
      hiring.milestones.push({
        wfKey: m.key,
        level: m.level,
        abyssalLevel: 0,
        get name() {
          const text = getLangString(`MOD_WF_MILESTONE_${m.key}`);
          return rules.milestoneState(m.level, { level: hiring.level, levelCap: hiring.currentLevelCap }) === 'capped'
            ? `${text} ${getLangString('MOD_WF_MILESTONE_CAPPED')}`
            : text;
        },
        get media() { return mediaFor(m); },
      });
    });
    hiring.sortMilestones();
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.levels = api;
  });

  ctx.onCharacterLoaded(() => {
    buildMilestones();
    // Hiring XP: the Folk's tier rate for the time each action took, failed ones included (time worked, like
    // wages), so the skill a Folk works makes no difference. The engine's "+N XP" toast drops fractions, so they
    // are carried and shown once whole.
    let toastCarry = 0;
    hiring.events.on('folkActionDone', ({ folk, intervalMs }) => {
      if (folk === undefined) return;
      const xp = rules.hiringXPForWork(folk.tier, intervalMs, xpRate());
      if (!(xp > 0)) return;
      hiring.addXP(xp);
      const { extra, carry } = rules.xpToastSplit(xp, toastCarry);
      toastCarry = carry;
      if (extra > 0) game.combat.notifications.add({ type: 'SkillXP', args: [hiring, extra] });
    });
    // Level-ups change gates everywhere: cards, reserve panel, shop requirements.
    const original = hiring.onLevelUp;
    hiring.onLevelUp = function (oldLevel, newLevel) {
      original.call(this, oldLevel, newLevel);
      log(`Hiring level ${oldLevel} → ${newLevel}`);
      hiring.crew.touch();
      hiring.renderReserve?.();
    };
    log(`milestones ready (${hiring.milestones.length}); XP rate ${xpRate()}%`);
  });
  return api;
}
