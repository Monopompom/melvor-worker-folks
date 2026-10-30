// A Folk's daydream on its card (build .155): the game icon in a thought bubble and the line under it. Game-facing.
// The card fills its bubble on each render; a timer here changes it every so often without a full re-render.

export function install({ model }) {
  let pool = null; // the daydreams whose icon this game has, found on first use (after all game data is in)
  const usable = () => model.DREAMS.map(([kind, id], index) => {
    const registry = { item: game.items, skill: game.skills, pet: game.pets, monster: game.monsters }[kind];
    const media = registry?.getObjectByID(id)?.media;
    return typeof media === 'string' && media !== '' ? { index, media } : null;
  }).filter((d) => d !== null);

  /** Writes the daydream the card's Folk has now; only when it changed, so the line fades in once per change. */
  function refresh(el) {
    pool ??= usable();
    const seed = el.dataset.wfSeed;
    if (pool.length === 0 || seed === undefined) { el.dataset.wfReady = ''; return; }
    const dream = pool[model.pickDream({ seed, now: Date.now(), count: pool.length })];
    const text = templateLangString(model.dreamKey(dream.index), { name: el.dataset.wfName ?? '' });
    el.dataset.wfReady = '1';
    if (el.dataset.wfDream === `${dream.index}|${text}`) return;
    const first = el.dataset.wfDream === undefined;
    el.dataset.wfDream = `${dream.index}|${text}`;
    const img = el.querySelector('[data-wf="dream-icon"]');
    if (img !== null) img.src = dream.media;
    const line = el.querySelector('[data-wf="dream-text"]');
    if (line !== null) line.textContent = text;
    if (first) return;
    el.classList.remove('wf-dream-in');
    void el.offsetWidth; // restart the fade
    el.classList.add('wf-dream-in');
  }

  setInterval(() => {
    const list = document.getElementById('worker-folks-folks');
    if (list === null || list.offsetParent === null) return;
    list.querySelectorAll('[data-wf="dream"]').forEach(refresh);
  }, 5000);

  return {
    minSpare: model.DREAM_MIN_SPARE,
    fill(el, folk) {
      el.dataset.wfSeed = folk.id;
      el.dataset.wfName = folk.name;
      refresh(el);
    },
  };
}
