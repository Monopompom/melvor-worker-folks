// Mastery displays found without searching the whole page. On every mastery gain the game looks for that action's
// displays with a selector over the whole document (over 100,000 elements with every skill page built): 15 to 45 ms
// each time, once per action of the player and once more per Folk action. The displays get their skill and action only
// through setMastery / setNoMastery, so a list kept by those two calls finds them at once. Game-facing.
//
// The mastery pool bars the same way: the game searches the whole page for a skill's pool bars every time its pool
// changes, which is once per Folk action for Hiring's pool and often for the worked skill's. They get their skill only
// through setSkill.
//
// Safety: a key nobody filed is looked up in the page once (what another mod built with the ids written in its HTML
// is found and filed then), a display that left the page sends the next lookup back to the whole page, and the
// setting "Faster displays" (Hiring section) turns all of it off.

export function install(ctx, { log }) {
  const Full = customElements.get('mastery-display');
  const Compact = customElements.get('compact-mastery-display');
  const usable = [Full, Compact].every((C) => C !== undefined && typeof C.prototype.setMastery === 'function')
    && typeof SkillWithMastery === 'function' && typeof SkillWithMastery.prototype.updateMasteryDisplays === 'function';
  if (!usable) {
    log('mastery displays: the game changed, the faster lookup stays off');
    return { setPools: () => false };
  }

  const SELECTOR = 'mastery-display, compact-mastery-display';
  /** `skillId|actionId` → the displays carrying those ids. null: read the page again at the next lookup. */
  let index = null;
  /** display → the key it is filed under. */
  let filedAs = new WeakMap();
  /** Keys looked up in the page and not found there, until the open page changes. */
  let misses = new Set();
  let pageSeen;

  const keyOf = (el) => {
    const skill = el.getAttribute('data-skill-id');
    const action = el.getAttribute('data-action-id');
    return skill === null || action === null ? null : `${skill}|${action}`;
  };
  const file = (el) => {
    if (index === null) return;
    const was = filedAs.get(el);
    const key = keyOf(el);
    if (was === key) return;
    if (was !== undefined) index.get(was)?.delete(el);
    if (key === null) {
      filedAs.delete(el);
      return;
    }
    let set = index.get(key);
    if (set === undefined) index.set(key, (set = new Set()));
    set.add(el);
    filedAs.set(el, key);
    misses.delete(key);
  };
  const readPage = () => {
    index = new Map();
    filedAs = new WeakMap();
    misses = new Set();
    document.querySelectorAll(SELECTOR).forEach(file);
  };

  const section = ctx.settings.section('Hiring');
  section.add([
    {
      type: 'switch',
      name: 'fastMasteryDisplays',
      label: getLangString('MOD_WF_SETTING_FAST_MASTERY'),
      hint: getLangString('MOD_WF_SETTING_FAST_MASTERY_HINT'),
      default: true,
      onChange: () => { index = null; pools = null; },
    },
  ]);
  const enabled = () => section.get('fastMasteryDisplays') !== false;

  [Full, Compact].forEach((C) => {
    ['setMastery', 'setNoMastery'].forEach((method) => {
      if (typeof C.prototype[method] === 'function') ctx.patch(C, method).after(function () { file(this); });
    });
  });

  ctx.patch(SkillWithMastery, 'updateMasteryDisplays').replace(function (original, action) {
    if (!enabled()) return original(action);
    if (index === null) readPage();
    if (game.openPage !== pageSeen) {
      pageSeen = game.openPage;
      misses.clear();
    }
    const key = `${this.id}|${action.id}`;
    let set = index.get(key);
    if (set === undefined || set.size === 0) {
      if (misses.has(key)) return undefined;
      // Not filed: the page is searched for this one, as the game does, and what it finds is filed.
      document.querySelectorAll(`mastery-display[data-skill-id="${this.id}"][data-action-id="${action.id}"], compact-mastery-display[data-skill-id="${this.id}"][data-action-id="${action.id}"]`).forEach(file);
      set = index.get(key);
      if (set === undefined || set.size === 0) {
        misses.add(key);
        return undefined;
      }
    }
    const progress = this.getMasteryProgress(action);
    for (const display of set) {
      if (!display.isConnected) {
        // A display left the page (or moved): the next lookup reads the whole page again.
        index = null;
        continue;
      }
      display.updateValues(progress);
    }
    return undefined;
  });

  // Mastery pool bars, by skill id.
  const Pool = customElements.get('mastery-pool-display');
  const poolUsable = Pool !== undefined && typeof Pool.prototype.setSkill === 'function' && typeof Pool.prototype.updateProgress === 'function'
    && typeof SkillWithMastery.prototype.renderMasteryPool === 'function';
  /** For a before / after comparison only (the dev console): false sends pool bars back to the game's search. */
  let poolsOn = true;
  /** skill id → its pool bars. null: read the page again at the next lookup. */
  let pools = null;
  let poolFiledAs = new WeakMap();
  let poolMisses = new Set();
  let poolPageSeen;
  const filePool = (el) => {
    if (pools === null) return;
    const was = poolFiledAs.get(el);
    const key = el.getAttribute('data-skill-id');
    if (was === key) return;
    if (was !== undefined) pools.get(was)?.delete(el);
    if (key === null) {
      poolFiledAs.delete(el);
      return;
    }
    let set = pools.get(key);
    if (set === undefined) pools.set(key, (set = new Set()));
    set.add(el);
    poolFiledAs.set(el, key);
    poolMisses.delete(key);
  };
  const readPools = () => {
    pools = new Map();
    poolFiledAs = new WeakMap();
    poolMisses = new Set();
    document.querySelectorAll('mastery-pool-display').forEach(filePool);
  };
  /** The skill's pool bars on the page now (an empty list when it has none). */
  const poolBars = (skillId) => {
    if (pools === null) readPools();
    if (game.openPage !== poolPageSeen) {
      poolPageSeen = game.openPage;
      poolMisses.clear();
    }
    let set = pools.get(skillId);
    if (set === undefined || set.size === 0) {
      if (poolMisses.has(skillId)) return [];
      // Not filed: the page is searched for this one, as the game does, and what it finds is filed.
      document.querySelectorAll(`mastery-pool-display[data-skill-id="${skillId}"]`).forEach(filePool);
      set = pools.get(skillId);
      if (set === undefined || set.size === 0) {
        poolMisses.add(skillId);
        return [];
      }
    }
    const bars = [];
    for (const bar of set) {
      // A bar that left the page (or moved): the next lookup reads the whole page again.
      if (bar.isConnected) bars.push(bar);
      else pools = null;
    }
    return bars;
  };

  if (poolUsable) {
    ctx.patch(Pool, 'setSkill').after(function () { filePool(this); });
    ctx.patch(SkillWithMastery, 'renderMasteryPool').replace(function (original) {
      if (!enabled() || !poolsOn) return original();
      if (this.renderQueue.masteryPool.size === 0) return undefined;
      const bars = poolBars(this.id);
      this.renderQueue.masteryPool.forEach((realm) => {
        bars.forEach((bar) => bar.updateProgress(this, realm));
        // As the game does: the open Spend Mastery XP window follows the pool (its own spelling, "curentSkill").
        const menu = typeof spendMasteryMenu === 'undefined' ? undefined : spendMasteryMenu;
        if (menu !== undefined && menu.curentSkill === this && menu.currentRealm === realm) menu.updateAllActions();
      });
      this.renderQueue.masteryPool.clear();
      return undefined;
    });
  } else {
    log('mastery pool bars: the game changed, the faster lookup stays off');
  }

  log('mastery displays: faster lookup ready');
  return {
    /** Dev only: the pool bars' lookup on or off, for timing it against the game's own search. */
    setPools(on) {
      poolsOn = on !== false;
      pools = null;
      return poolUsable && poolsOn;
    },
  };
}
