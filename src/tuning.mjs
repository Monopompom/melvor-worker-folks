// Tuning settings in Mod Settings: hire and Shift Slot prices, a price multiplier, severance, the apology and the
// strike cooldown, each either way from today's value (the user, 24 Nov 2026), and whether Folks may hold Alt. Magic.
// Game-facing; the limits and the tuned rules are in tuning-model.mjs.
//
// create() runs before anything prices a hire, so every module gets the tuned pricing and wages; the settings are added
// by register(), late in setup, so they come after the older ones in their sections. Until then, and for a stored
// value outside the limits, a knob reads its default or its nearest limit.

export function create(ctx, { model, settingTexts, log }) {
  let hiring;
  let registered = false;
  const sectionOf = (knob) => ctx.settings.section(knob.section);
  const stored = (knob) => {
    if (!registered) return undefined;
    try { return sectionOf(knob).get(knob.name); } catch { return undefined; }
  };
  /** The value in use for a knob (by name), or whether Folks may hold Alt. Magic. */
  const value = (name) => {
    if (name === model.ALT_MAGIC.name) return stored(model.ALT_MAGIC) !== false;
    const knob = model.knobOf(name);
    if (knob === undefined) throw new Error(`Unknown Worker Folks tuning knob: ${name}`);
    return model.knobValue(knob, stored(knob));
  };

  /** A number as the game writes it in the player's language (1,2 in German; GP with the thousands). */
  const shown = (n) => numberWithCommas(Math.round(n * 100) / 100);
  const multiplier = (n) => templateLangString('MOD_WF_TIMES', { value: shown(n) });
  /** A percentage in the player's language ("20 %" in German), a tenth shown only when there is one. */
  const percent = (n) => formatPercent(n, Number.isInteger(n) ? 0 : 1);
  const limitsOf = (knob) => ({ min: shown(knob.min), max: shown(knob.max), default: shown(knob.default) });

  /** The Shop's hire and Shift Slot texts, with the rises as they are set now. */
  let shopData;
  const refreshShopTexts = () => {
    if (hiring === undefined || shopData === undefined) return;
    const t = (key, vars = {}) => templateLangString(key, vars);
    const hireGrowth = percent(model.growthPercent(value('hirePriceGrowth')));
    const slotGrowth = percent(model.growthPercent(value('slotPriceGrowth')));
    for (const tier of shopData.TIER_ORDER) {
      const purchase = hiring.purchase(`Hire_${tier}`);
      if (purchase !== undefined) purchase._customDescription = shopData.hirePurchase(tier, t, hireGrowth).customDescription;
    }
    const slot = hiring.purchase('Shift_Slot');
    if (slot !== undefined) slot._customDescription = shopData.shiftSlotPurchase(t, slotGrowth).customDescription;
  };

  const changed = () => {
    // Called before the value is stored: the Shop and the cards read it once it is.
    queueMicrotask(() => {
      if (hiring === undefined) return;
      refreshShopTexts();
      hiring.refreshShop?.();
      hiring.crew.touch();
    });
  };

  // ---- Alt. Magic off: a built-in guard, as Qualification's, so tiles, Worker boxes and cards say why ----
  const altMagicOff = (skill) => skill?.id === model.ALT_MAGIC_ID && value(model.ALT_MAGIC.name) === false;
  const altMagicReason = (skill) => templateLangString('MOD_WF_ALT_MAGIC_OFF', { skill: hiring.skillName(skill) });
  let stoppedOnLoad = [];
  const stopAltMagic = () => {
    const stopped = [];
    if (hiring === undefined) return stopped;
    for (const skill of Array.from(hiring.delegated)) {
      if (!altMagicOff(skill)) continue;
      const folk = hiring.crew.bySkill(skill.id);
      if (folk === undefined) continue;
      hiring.forceStop(skill);
      stopped.push({ folk, skill });
      log(`${folk.name} stopped on ${skill.id}: Alt. Magic is off for Folks`);
    }
    if (stopped.length > 0) hiring.renderQueue.folks = true;
    return stopped;
  };
  const notify = ({ folk, skill }) => {
    game.notifications.createInfoNotification(
      'worker_folks:altMagic',
      templateLangString('MOD_WF_QUALIFY_STOPPED', { name: folk.name, skill: hiring.skillName(skill), reason: altMagicReason(skill) }),
      hiring.portraitOf(folk),
    );
  };

  // ---- The section headings: the game writes a section's saved key as its heading, so they are put in the
  //      player's language when the Mod Settings popup opens (the keys stay, or every saved value would be lost) ----
  const HEADINGS = { Hiring: 'SKILL_NAME_Hiring', Wages: 'MOD_WF_SETTINGS_WAGES' };
  // ---- The dropdowns (eat line, heal, wages): the game's menu marks no current choice (round 2 finding). The toggle
  //      shows the chosen option's text, so the option with the same text is marked, again after every pick ----
  const markChoice = (menu, toggle) => {
    const current = toggle.textContent.trim();
    menu.querySelectorAll('.dropdown-item').forEach((item) => {
      const on = item.textContent.trim() === current;
      item.classList.toggle('active', on);
      if (on) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
  };
  const markDropdowns = (html) => {
    html.querySelectorAll('button[id^="worker_folks:"][data-toggle="dropdown"]').forEach((toggle) => {
      const menu = toggle.parentElement?.querySelector('.dropdown-menu');
      if (menu === null || menu === undefined) return;
      markChoice(menu, toggle);
      // After the game's own handler on the option has written the new choice on the toggle (as first given).
      menu.addEventListener('click', () => { settingTexts?.retext(toggle); markChoice(menu, toggle); });
    });
  };

  const relabel = (html) => {
    // Ours when it holds one of this mod's inputs: the game ids each one by namespace and setting name.
    if (!(html instanceof HTMLElement) || html.querySelector('[id^="worker_folks:"]') === null) return;
    html.querySelectorAll(':scope > h2.content-heading').forEach((h2) => {
      const key = HEADINGS[h2.textContent];
      if (key !== undefined) h2.textContent = getLangString(key);
    });
    // Labels, hints and choices were given while the mod loaded, maybe before the game had the player's language.
    settingTexts?.retext(html);
    markDropdowns(html);
  };

  return {
    value,
    /** Adds the settings to their sections, the Alt. Magic guard and the heading labels. Call once, late in setup. */
    register({ getHiring, shop }) {
      shopData = shop;
      for (const knob of model.KNOBS) {
        const key = `MOD_WF_SETTING_TUNE_${knob.name}`;
        const limits = limitsOf(knob);
        sectionOf(knob).add({
          type: 'number',
          name: knob.name,
          label: getLangString(key),
          hint: templateLangString(`${key}_HINT`, { ...limits, timesMin: multiplier(knob.min), timesMax: multiplier(knob.max), timesDefault: multiplier(knob.default) }),
          default: knob.default,
          min: knob.min,
          max: knob.max,
          // The game puts min and max on the box only: a value outside them is refused here, with the limits.
          onChange: (v) => {
            if (!model.validKnob(knob, v)) return templateLangString(knob.whole === true ? 'MOD_WF_SETTING_TUNE_BAD_WHOLE' : 'MOD_WF_SETTING_TUNE_BAD', limits);
            changed();
            return undefined;
          },
        });
      }
      // The game's own name for the page, in the player's language: the skill object is Magic, shared with combat.
      const altMagicName = getLangString('PAGE_NAME_AltMagic');
      sectionOf(model.ALT_MAGIC).add({
        type: 'switch',
        name: model.ALT_MAGIC.name,
        label: templateLangString('MOD_WF_SETTING_ALT_MAGIC', { skill: altMagicName }),
        hint: templateLangString('MOD_WF_SETTING_ALT_MAGIC_HINT', { skill: altMagicName }),
        default: model.ALT_MAGIC.default,
        onChange: () => {
          queueMicrotask(() => {
            if (hiring === undefined) return;
            stopAltMagic().forEach(notify);
            hiring.crew.touch();
          });
        },
      });
      registered = true;

      ctx.onModsLoaded(() => {
        hiring = getHiring();
        hiring.tuning = {
          value,
          /** What the help's strike text says: the severance and the apology as they are set. */
          tipVars: () => ({
            severance: percent(value('severanceRate')),
            apology: multiplier(value('apologyMultiplier')),
          }),
        };
        const refuse = (skill) => (altMagicOff(skill) ? { reason: altMagicReason(skill) } : undefined);
        hiring.ownGuards.register('work', ({ skill }) => refuse(skill));
        hiring.ownGuards.register('staff', ({ action, skill }) => (action === 'assign' ? refuse(skill) : undefined));
      });
      ctx.onCharacterLoaded(() => {
        if (hiring === undefined) return;
        // A stored value outside the limits (an older save, a backup code) comes back to the one in use.
        for (const knob of model.KNOBS) {
          try {
            const raw = stored(knob);
            if (raw !== undefined && !model.validKnob(knob, raw)) sectionOf(knob).set(knob.name, value(knob.name));
          } catch (e) { log(`tuning: ${knob.name} check failed`, e); }
        }
        // Before offline progress: a Folk on Alt. Magic with it off does no offline work.
        stoppedOnLoad = stopAltMagic();
        refreshShopTexts();
      });
      ctx.onInterfaceReady(() => {
        stoppedOnLoad.forEach(notify);
        stoppedOnLoad = [];
        refreshShopTexts();
      });
      // The Mod Settings popup is built and fired in one go by the game: its headings are put right before it shows.
      try {
        const fire = Swal.fire;
        if (typeof fire === 'function') {
          Swal.fire = function (...args) {
            try { relabel(args[0]?.html); } catch (e) { log('tuning: heading labels or dropdown marks failed', e); }
            return fire.apply(this, args);
          };
        }
      } catch (e) { log('tuning: heading labels not installed', e); }
    },
  };
}
