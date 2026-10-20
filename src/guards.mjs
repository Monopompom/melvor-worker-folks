// Guards: another mod (Voyage) may refuse a staff change, a Folk's work or its gear, and Worker Folks shows the
// reason on its own buttons. Without a guard every path is as before. Pure: no game globals.

/**
 * staff: { action: 'hire' | 'promote' | 'fire' | 'settle' | 'assign', folk?, skillId?, skill? }  (assign: picked for a skill)
 * work:  { folk, skillId, skill }  (may this Folk work this skill where it stands)
 * gear:  { folk }                  (may the player change this Folk's gear now)
 */
export const GUARD_KINDS = ['staff', 'work', 'gear'];

export function createGuards({ onError } = {}) {
  const lists = new Map(GUARD_KINDS.map((kind) => [kind, []]));
  const listOf = (kind) => {
    const list = lists.get(kind);
    if (list === undefined) throw new Error(`Unknown Worker Folks guard kind: ${kind}`);
    return list;
  };
  return {
    /** Adds a guard: fn(request) returns undefined (allowed) or { reason }. Returns the function that removes it. */
    register(kind, fn) {
      const list = listOf(kind);
      if (typeof fn !== 'function') throw new Error('guard must be a function');
      list.push(fn);
      return () => {
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    /** The first refusal as { reason }, or undefined. A guard that throws or answers nonsense allows: fail open. */
    check(kind, request) {
      for (const fn of listOf(kind)) {
        let answer;
        try {
          answer = fn(request);
        } catch (err) {
          if (onError) onError(err, kind);
          continue;
        }
        if (answer !== null && typeof answer === 'object' && typeof answer.reason === 'string' && answer.reason !== '') return { reason: answer.reason };
      }
      return undefined;
    },
    count(kind) {
      return listOf(kind).length;
    },
  };
}
