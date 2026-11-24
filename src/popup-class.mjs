// One look for every popup's buttons: confirm green, cancel blue outline (the game's default cancel is red, and grey
// means disabled). A popup passes only what differs: a red confirm for what is lost, Promote's primary, its own popup
// classes.

export const swalClass = (extra = {}) => {
  const cls = { popup: 'wf-ui', confirmButton: 'btn btn-success m-1', cancelButton: 'btn btn-outline-info m-1', ...extra };
  return typeof createSwalCustomClass === 'function' ? createSwalCustomClass(cls) : cls;
};

let steadyWatch = null;

/** The reserved scrollbar width stays for as long as any popup is up: one that replaces ours adds no padding of its own. */
const releaseSteady = () => {
  const done = () => {
    if (document.body.classList.contains('swal2-shown')) return false;
    document.documentElement.classList.remove('wf-popup-steady');
    steadyWatch?.disconnect();
    steadyWatch = null;
    return true;
  };
  if (done() || steadyWatch !== null) return;
  steadyWatch = new MutationObserver(done);
  steadyWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
};

/**
 * Opens a popup without the two costs that grow with the game's very large page, so it shows sooner after a press.
 * The page keeps its scrollbar's width reserved, so nothing behind the popup moves and no padding is needed. The page
 * is hidden from screen readers right after the popup's first paint instead of before it.
 */
export const fireQuick = (options) => {
  const opts = { ...options };
  // With a popup already up the page has its padding, and reserving the width as well would move it.
  if (!document.body.classList.contains('swal2-shown') && typeof CSS !== 'undefined' && CSS.supports('scrollbar-gutter', 'stable')) {
    document.documentElement.classList.add('wf-popup-steady');
    opts.scrollbarPadding = false;
    opts.heightAuto = false;
    opts.didDestroy = (...args) => {
      releaseSteady();
      options.didDestroy?.(...args);
    };
  }
  const page = document.getElementById('page-container');
  if (page === null) return SwalLocale.fire(opts);
  let hidden;
  page.setAttribute = (name, value) => {
    if (name === 'aria-hidden') hidden = value;
    else Element.prototype.setAttribute.call(page, name, value);
  };
  try {
    return SwalLocale.fire(opts);
  } finally {
    delete page.setAttribute;
    if (hidden !== undefined) {
      requestAnimationFrame(() => setTimeout(() => { if (Swal.isVisible()) page.setAttribute('aria-hidden', hidden); }, 0));
    }
  }
};
