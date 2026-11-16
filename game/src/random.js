// A small seeded generator (mulberry32): the same seed always deals the same
// run, which is what the screenshot scenes and any replay need.
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** An integer in [0, n). */
    int(n) {
      return Math.floor(next() * n);
    },
    /** A float in [a, b). */
    range(a, b) {
      return a + next() * (b - a);
    },
    /** One element of a non-empty array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}
