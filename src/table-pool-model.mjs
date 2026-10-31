// One long-lived object per key, made once and handed back on every later ask. Pure: no game globals.
//
// Worker Folks keeps a modifier table per Folk. The game's modifier queries cache their results in a Map keyed by
// table and never let go of a table they were asked about, so a table made per rebuild stays in memory for good (a
// long offline count ran the browser out of memory). A Folk's table is made once and refilled; a fired Folk's table
// goes to the next hire.

export function createTablePool(make) {
  /** key → object in use */
  const inUse = new Map();
  /** objects of released keys, waiting for the next new key */
  const spare = [];
  let made = 0;

  return {
    /** The key's object: the one it had, else a released one, else a new one. */
    get(key) {
      let obj = inUse.get(key);
      if (obj === undefined) {
        obj = spare.pop();
        if (obj === undefined) {
          obj = make();
          made += 1;
        }
        inUse.set(key, obj);
      }
      return obj;
    },
    /** The key is gone (a Folk fired): its object waits for the next key. */
    release(key) {
      const obj = inUse.get(key);
      if (obj === undefined) return;
      inUse.delete(key);
      spare.push(obj);
    },
    /** How many objects were ever made. */
    get made() {
      return made;
    },
  };
}
