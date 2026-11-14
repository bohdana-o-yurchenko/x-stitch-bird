/** Run-length encoding used by the JSON format: "0*73,20,4" = 73 zeros, then 20, then 4. */
export function rle(a: ArrayLike<number>): string {
  const out: string[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(j - i > 1 ? `${a[i]}*${j - i}` : `${a[i]}`);
    i = j;
  }
  return out.join(",");
}

export function unrle(s: string | undefined, length: number): Uint16Array {
  const a = new Uint16Array(length);
  if (!s) return a;
  let k = 0;
  for (const token of s.split(",")) {
    const [v, n] = token.split("*");
    const value = Number(v), count = n ? Number(n) : 1;
    for (let q = 0; q < count && k < length; q++) a[k++] = value;
  }
  return a;
}
