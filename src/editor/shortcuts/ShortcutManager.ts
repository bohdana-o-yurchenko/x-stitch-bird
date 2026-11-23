import type { Editor } from "../createEditor";
import { HOLD_BINDINGS, KEYMAP, type Context, type KeyBinding } from "./keymap";

export interface KeyEventLike {
  key: string;
  /** The physical key ("KeyZ"): names the key when the layout gives a letter of another alphabet. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  /** True while typing in a field; shortcuts are ignored then. */
  inField?: boolean;
  preventDefault(): void;
}

interface Parsed {
  key: string;
  mod: boolean;
  shift: boolean;
  binding: KeyBinding;
}

const parse = (b: KeyBinding): Parsed => {
  const parts = b.keys.split("+").filter(Boolean);
  const key = b.keys.endsWith("+") ? "+" : parts[parts.length - 1]!;
  return { key, mod: parts.includes("mod"), shift: parts.includes("shift"), binding: b };
};

const respectsShift = (k: string) => /^[a-z0-9]$/.test(k) || k.length > 1;

const CODE_KEYS: Record<string, string> = { BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", NumpadAdd: "+", NumpadSubtract: "-" };

/**
 * The key a binding names. A layout of another alphabet (Ukrainian: З for P, Я for Z) types a letter the keymap
 * doesn't know — then the physical key decides, so shortcuts sit on the same keys in every layout.
 */
export function keyOf(e: Pick<KeyEventLike, "key" | "code">): string {
  const key = e.key.toLowerCase();
  // the digit row is digits whatever Shift or the layout types there (Shift+1 = "!", AZERTY's 1 = "&")
  const row = /^Digit(\d)$/.exec(e.code ?? "")?.[1];
  if (row) return row;
  if (key.length !== 1 || /^[\x20-\x7e]$/.test(key) || !e.code) return key;
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1], digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
  return letter?.toLowerCase() ?? digit ?? CODE_KEYS[e.code] ?? key;
}

/**
 * Turns key presses into commands (ARCHITECTURE §6.2): ignores keys while typing or with a dialog open,
 * handles held keys (Space, Alt) and releases them when the window loses focus.
 */
export class ShortcutManager {
  private parsed = KEYMAP.map(parse);
  private held = new Set<string>();

  constructor(private ed: Editor, private isMac: boolean) {}

  private context(c: Context): boolean {
    const s = this.ed.state;
    if (c === "floating") return !!s.floating;
    if (c === "hasSelection") return !!s.selection || !!s.floating;
    if (c === "underlayEditing") return this.ed.underlay.editing;
    if (c === "hasUnderlay") return !!s.underlay;
    if (c === "matchReview") return s.match?.phase === "review";
    return !!s.overlay.chain;
  }

  keyDown(e: KeyEventLike): void {
    if (e.inField || this.ed.state.dialog) return;
    const hold = HOLD_BINDINGS.find((h) => (h.hold === "Space" ? e.key === " " : e.key === h.hold));
    if (hold) {
      e.preventDefault();
      if (!e.repeat && !this.held.has(hold.hold)) {
        this.held.add(hold.hold);
        this.ed.setMomentaryTool(hold.tool);
      }
      return;
    }
    const mod = this.isMac ? e.metaKey : e.ctrlKey;
    if (e.altKey || (this.isMac ? e.ctrlKey : e.metaKey)) return;
    const key = keyOf(e);
    const match = this.parsed.find(
      (p) => p.key === key && p.mod === mod && (!respectsShift(key) || p.shift === e.shiftKey) && (!p.binding.when || this.context(p.binding.when)),
    );
    if (!match) return;
    e.preventDefault();
    void this.ed.commands.run(match.binding.command, match.binding.args);
  }

  keyUp(e: { key: string; preventDefault(): void }): void {
    const hold = HOLD_BINDINGS.find((h) => (h.hold === "Space" ? e.key === " " : e.key === h.hold));
    if (!hold || !this.held.has(hold.hold)) return;
    e.preventDefault();
    this.held.delete(hold.hold);
    this.ed.releaseMomentaryTool(hold.tool);
  }

  releaseAll(): void {
    for (const h of HOLD_BINDINGS) if (this.held.has(h.hold)) this.ed.releaseMomentaryTool(h.tool);
    this.held.clear();
  }

  /** Status-bar and help text are generated from here, so they always match the keymap. */
  bindingsFor(command: string): string[] {
    return KEYMAP.filter((b) => b.command === command).map((b) => b.keys);
  }
}
