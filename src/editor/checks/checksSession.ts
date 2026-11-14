import { CHECKS } from "@/core/checks/registry";
import { optionDefaults, type Finding } from "@/core/checks/types";
import type { Editor } from "../createEditor";
import type { ChecksState } from "../store/editorStore";

/** The "Check chart" panel: runs checks on demand, steps through findings, ignores for this session only. */
export class ChecksSession {
  constructor(private ed: Editor) {}

  private get state(): ChecksState {
    return (
      this.ed.state.checks ?? {
        findings: [],
        index: -1,
        ignored: new Set(),
        enabled: Object.fromEntries(CHECKS.map((c) => [c.id, true])),
        options: Object.fromEntries(CHECKS.map((c) => [c.id, optionDefaults(c)])),
      }
    );
  }

  private set(patch: Partial<ChecksState>) {
    this.ed.store.setState({ checks: { ...this.state, ...patch } });
  }

  open() {
    this.ed.store.setState({ checksOpen: true, checks: this.state });
  }

  close() {
    this.ed.store.setState({ checksOpen: false });
  }

  setEnabled(id: string, on: boolean) {
    this.set({ enabled: { ...this.state.enabled, [id]: on } });
  }

  setOption(checkId: string, option: string, value: number | boolean) {
    const s = this.state;
    this.set({ options: { ...s.options, [checkId]: { ...s.options[checkId], [option]: value } } });
  }

  run() {
    const s = this.state, p = this.ed.doc;
    const findings = CHECKS.filter((c) => s.enabled[c.id]).flatMap((c) => c.run(p, s.options[c.id] ?? optionDefaults(c))).filter((f) => !s.ignored.has(f.id));
    this.set({ findings, index: -1 });
    if (findings.length) this.go(0);
  }

  visible(): Finding[] {
    const s = this.state;
    return s.findings.filter((f) => !s.ignored.has(f.id));
  }

  go(index: number) {
    const list = this.visible();
    if (!list.length) return;
    const i = ((index % list.length) + list.length) % list.length, f = list[i]!;
    this.set({ index: i });
    if (f.cell !== undefined) this.ed.viewport.centreOn(f.cell);
    if (f.entry) this.ed.setActiveEntry(f.entry);
  }

  next() {
    this.go(this.state.index + 1);
  }

  prev() {
    this.go(this.state.index - 1);
  }

  current(): Finding | undefined {
    return this.visible()[this.state.index];
  }

  ignore() {
    const f = this.current();
    if (!f) return;
    this.set({ ignored: new Set([...this.state.ignored, f.id]) });
    this.go(this.state.index);
  }

  applySuggestion() {
    const f = this.current();
    if (!f?.suggestion) return;
    const p = this.ed.doc, S = p.layers.stitches;
    this.ed.history.transaction("checkFix", () => {
      for (const s of f.suggestion!) {
        S[s.to] = S[s.from] ?? 0;
      }
    });
    this.ed.changed({ keys: true });
    this.ignore();
  }
}
