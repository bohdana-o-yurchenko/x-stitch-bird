import type { CheckOptions, Finding } from "@/core/checks/checks";
import type { Editor } from "../createEditor";

/*
 * Chart checks in the editor (SPEC §15.4): the findings of the last run, the one being looked at, and the ones
 * ignored for this session. Nothing is stored in the pattern.
 */

export interface ChecksState {
  findings: Finding[];
  /** Ids hidden with Ignore. */
  ignored: string[];
  /** Index into the visible findings; -1 = none chosen yet. */
  current: number;
  /** `docRevision` when the checks ran: the chart changed since when it differs. */
  revision: number;
}

/** The findings not ignored, in the panel's order. */
export const visibleFindings = (c: ChecksState | null): Finding[] => (c ? c.findings.filter((f) => !c.ignored.includes(f.id)) : []);

/** Runs the checks off the main thread, on the chart as it is now (a big chart takes a while). */
export async function runChartChecks(ed: Editor, o: CheckOptions) {
  const revision = ed.state.docRevision, id = ed.doc.id;
  const findings = await ed.jobs.run("checks", { pattern: ed.doc, options: o });
  // another pattern opened meanwhile: these findings aren't about it
  if (ed.doc.id !== id) return;
  ed.store.setState({ checks: { findings, ignored: [], current: -1, revision } });
}

/** Show finding `i` (of the visible ones): centre the chart on it, as Go to cell does. */
export function goToFinding(ed: Editor, i: number) {
  const c = ed.state.checks, list = visibleFindings(c), f = list[i];
  if (!c || !f) return;
  ed.store.setState({ checks: { ...c, current: i } });
  ed.viewport.centreOn(f.cells[0]!);
}

/** Next (1) or previous (-1) finding, wrapping around; from none chosen, the first or the last. */
export function stepFinding(ed: Editor, dir: 1 | -1) {
  const c = ed.state.checks, n = visibleFindings(c).length;
  if (!c || !n) return;
  const next = c.current < 0 ? (dir > 0 ? 0 : n - 1) : (c.current + dir + n) % n;
  goToFinding(ed, next);
}

export function ignoreFinding(ed: Editor, id: string) {
  const c = ed.state.checks;
  if (!c) return;
  const before = visibleFindings(c).findIndex((f) => f.id === id), next = { ...c, ignored: [...c.ignored, id] };
  // keep looking at the same place in the list: the one after the ignored finding moves up
  const n = visibleFindings(next).length;
  next.current = c.current < 0 || !n ? -1 : before >= 0 && before < c.current ? c.current - 1 : Math.min(c.current, n - 1);
  ed.store.setState({ checks: next });
}

export const closeChecks = (ed: Editor) => ed.store.setState({ checks: null });
