import { computeUsage, entryCount, partialCount } from "../calculator/usage";
import { findSameKey } from "../pattern/keyEntries";
import type { ChartCheck } from "./types";

const usedAmount = (p: Parameters<ChartCheck["run"]>[0]) => {
  const u = computeUsage(p).perEntry;
  return (k: number) => entryCount(u.get(k)) + partialCount(u.get(k));
};

export const unusedEntriesCheck: ChartCheck = {
  id: "unusedEntries",
  options: [],
  run(p) {
    const used = usedAmount(p);
    return p.key.flatMap((e, k) => (e && k && !used(k) ? [{ id: `unused:${k}`, checkId: "unusedEntries", entry: k, messageKey: "checks.unusedEntries.finding", params: { sym: e.sym } }] : []));
  },
};

export const rareEntriesCheck: ChartCheck = {
  id: "rareEntries",
  options: [{ id: "maxUses", type: "number", default: 3, min: 1, max: 20 }],
  run(p, opts) {
    const used = usedAmount(p);
    return p.key.flatMap((e, k) => {
      const n = e && k ? used(k) : 0;
      return n && n <= Number(opts.maxUses) ? [{ id: `rare:${k}`, checkId: "rareEntries", entry: k, messageKey: "checks.rareEntries.finding", params: { sym: e!.sym, count: n } }] : [];
    });
  },
};

export const duplicateEntriesCheck: ChartCheck = {
  id: "duplicateEntries",
  options: [],
  run(p) {
    return p.key.flatMap((e, k) => {
      const first = e && k ? findSameKey(p, e) : 0;
      return first && first < k ? [{ id: `dup:${k}`, checkId: "duplicateEntries", entry: k, messageKey: "checks.duplicateEntries.finding", params: { sym: e!.sym, other: p.key[first]!.sym } }] : [];
    });
  },
};
