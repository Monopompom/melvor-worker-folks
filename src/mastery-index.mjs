// Mastery displays found without searching the whole page. On every mastery gain the game looks for that action's
// displays with a selector over the whole document (over 100,000 elements with every skill page built): 15 to 45 ms
// each time, once per action of the player and once more per Folk action. The displays get their skill and action only
// through setMastery / setNoMastery, so a list kept by those two calls finds them at once. Game-facing.
//
// Safety: a key nobody filed is looked up in the page once (what another mod built with the ids written in its HTML
// is found and filed then), a display that left the page sends the next lookup back to the whole page, and the
// setting "Faster mastery displays" (Hiring section) turns all of it off.

export function install(ctx, { log }) {
  const Full = customElements.get('mastery-display');
  const Compact = customElements.get('compact-mastery-display');
  const usable = [Full, Compact].every((C) => C !== undefined && typeof C.prototype.setMastery === 'function')
    && typeof SkillWithMastery === 'function' && typeof SkillWithMastery.prototype.updateMasteryDisplays === 'function';
  if (!usable) {
    log('mastery displays: the game changed, the faster lookup stays off');
    return;
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
      onChange: () => { index = null; },
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

  log('mastery displays: faster lookup ready');
}
