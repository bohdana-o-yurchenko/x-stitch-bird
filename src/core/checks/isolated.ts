import { stitchType } from "../stitches/registry";
import type { ChartCheck, Finding } from "./types";

/** Stitches with no same-coloured neighbour among their 8 neighbours — usually typos (SPEC §15.4). */
export const isolatedCheck: ChartCheck = {
  id: "isolated",
  options: [
    { id: "clusterSize", type: "number", default: 1, min: 1, max: 2 },
    { id: "sameColour", type: "boolean", default: true },
    { id: "includeBeads", type: "boolean", default: false },
    { id: "includeHalf", type: "boolean", default: true },
  ],
  run(p, opts) {
    const { w, h } = p;
    const findings: Finding[] = [];
    const layers = [{ id: "stitches", data: p.layers.stitches }, ...(opts.includeBeads ? [{ id: "beads", data: p.layers.beads }] : [])];
    for (const layer of layers) {
      const group = (i: number): string | null => {
        const k = layer.data[i] ?? 0, e = p.key[k];
        if (!k || !e) return null;
        if (!opts.includeHalf && layer.id === "stitches" && stitchType(e.st).countsAs === "partial") return null;
        return opts.sameColour ? e.src : String(k);
      };
      const seen = new Uint8Array(w * h);
      for (let start = 0; start < w * h; start++) {
        const g = group(start);
        if (seen[start] || g === null) continue;
        const comp: number[] = [], stack = [start];
        seen[start] = 1;
        while (stack.length) {
          const i = stack.pop()!;
          comp.push(i);
          const x = i % w, y = (i / w) | 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy, j = ny * w + nx;
              if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[j] && group(j) === g) {
                seen[j] = 1;
                stack.push(j);
              }
            }
        }
        if (comp.length <= Number(opts.clusterSize))
          findings.push({ id: `isolated:${layer.id}:${start}`, checkId: "isolated", cell: start, related: comp, messageKey: "checks.isolated.finding", params: { count: comp.length } });
      }
    }
    return findings;
  },
};
