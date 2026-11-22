/** Shuffle a copy of a list (Fisher-Yates). */
export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffle so the same question never comes twice in a row (`same` gives the key that makes two questions "the same"),
 * and the first question isn't `avoidFirst` (the one that ended the last try). Builds the order one question at a time:
 * a random pick (weighted by how many are left) among questions different from the last one, except that a question
 * which needs every other remaining spot is taken right away. Only when that is impossible (e.g. most questions are
 * identical) does a repeat happen.
 */
export function shuffleNoRepeats<T>(xs: T[], same: (x: T) => string, avoidFirst?: string): T[] {
  const groups = new Map<string, T[]>();
  for (const x of shuffle(xs)) {
    const k = same(x);
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  const out: T[] = [];
  let prev = avoidFirst;
  while (out.length < xs.length) {
    const left = [...groups].filter(([, v]) => v.length);
    const remaining = xs.length - out.length;
    const cands = left.filter(([k]) => k !== prev);
    let pick: [string, T[]];
    if (!cands.length) pick = left[0]; // only repeats are left
    else {
      const biggest = cands.reduce((a, b) => (b[1].length > a[1].length ? b : a));
      if (biggest[1].length * 2 - 1 >= remaining) pick = biggest;
      else {
        let r = Math.random() * cands.reduce((n, [, v]) => n + v.length, 0);
        pick = cands.find(([, v]) => (r -= v.length) < 0) ?? cands[0];
      }
    }
    out.push(pick[1].pop() as T);
    prev = pick[0];
  }
  return out;
}
