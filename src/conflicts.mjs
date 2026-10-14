// Mods that cannot run beside Worker Folks. Pure: no game globals.
// Detection is by the Mod Manager's loaded-mod display names (and, when the other
// mod registered game data, by namespace), so it works whichever loads first.

export const INCOMPATIBLE_MODS = [
  {
    key: 'multitasking',
    /** Display name as shown on mod.io / in the Mod Manager. */
    title: 'Multitasking',
    /** Normalised name prefixes: "Multitasking", "Multi-Tasking", "Multitasking (fixed)"… */
    names: ['multitasking'],
    namespace: 'multitasking',
  },
];

const normalise = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** The first incompatible mod found among `loadedNames`, or null. `hasNamespace` is an optional extra probe. */
export function findConflict(loadedNames, { hasNamespace = () => false, mods = INCOMPATIBLE_MODS } = {}) {
  const names = Array.isArray(loadedNames) ? loadedNames.map(normalise) : [];
  for (const mod of mods) {
    if (mod.namespace && hasNamespace(mod.namespace)) return mod;
    if (names.some((n) => mod.names.some((prefix) => n.startsWith(prefix)))) return mod;
  }
  return null;
}
