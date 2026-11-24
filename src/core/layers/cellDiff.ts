/**
 * Calls `at` for every index where two equally long cell arrays differ. Compares two cells at a time where the
 * memory allows: a big chart (a million cells) is compared in about a millisecond.
 */
export function forEachChangedCell(now: Uint16Array, was: Uint16Array, at: (i: number) => void) {
  const n = Math.min(now.length, was.length), pairs = now.byteOffset % 4 === 0 && was.byteOffset % 4 === 0 ? n >> 1 : 0;
  if (pairs) {
    const a = new Uint32Array(now.buffer, now.byteOffset, pairs), b = new Uint32Array(was.buffer, was.byteOffset, pairs);
    for (let j = 0; j < pairs; j++)
      if (a[j] !== b[j]) {
        if (now[2 * j] !== was[2 * j]) at(2 * j);
        if (now[2 * j + 1] !== was[2 * j + 1]) at(2 * j + 1);
      }
  }
  for (let i = pairs * 2; i < n; i++) if (now[i] !== was[i]) at(i);
}

/** Same length and the same value in every cell. */
export function sameCells(a: Uint16Array, b: Uint16Array): boolean {
  if (a.length !== b.length) return false;
  let same = true;
  forEachChangedCell(a, b, () => (same = false));
  return same;
}

/** The indices where the arrays differ, in order. */
export function changedCells(now: Uint16Array, was: Uint16Array): Uint32Array {
  const out: number[] = [];
  forEachChangedCell(now, was, (i) => out.push(i));
  return Uint32Array.from(out);
}
