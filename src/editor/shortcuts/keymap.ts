/** A key press bound to a command. `when` names a context flag; the first matching binding wins. */
export interface KeyBinding {
  keys: string;
  command: string;
  args?: unknown;
  when?: Context;
}

/** Held keys switch to a tool while down (Space = pan, Alt/⌥ = picker). */
export interface HoldBinding {
  hold: "Space" | "Alt";
  tool: "pan" | "picker";
}

export type Context = "hasSelection" | "floating" | "chain" | "underlayEditing" | "hasUnderlay";

export const HOLD_BINDINGS: readonly HoldBinding[] = [
  { hold: "Space", tool: "pan" },
  { hold: "Alt", tool: "picker" },
];

/** `mod` = ⌘ on macOS, Ctrl elsewhere. Letters respect Shift; symbols and digits ignore it. */
export const KEYMAP: readonly KeyBinding[] = [
  { keys: "mod+z", command: "history.undo" },
  { keys: "mod+shift+z", command: "history.redo" },
  { keys: "mod+y", command: "history.redo" },
  { keys: "mod+s", command: "file.save" },
  { keys: "mod+g", command: "view.goToCell" },
  { keys: "mod+a", command: "selection.all" },
  { keys: "mod+c", command: "clipboard.copy", when: "hasSelection" },
  { keys: "mod+x", command: "clipboard.cut", when: "hasSelection" },
  { keys: "mod+v", command: "clipboard.paste" },
  { keys: "mod+d", command: "selection.none", when: "hasSelection" },
  { keys: "u", command: "underlay.toggleBehind", when: "hasUnderlay" },
  { keys: "escape", command: "underlay.toggleBehind", when: "underlayEditing" },
  ...([["arrowleft", -1, 0], ["arrowright", 1, 0], ["arrowup", 0, -1], ["arrowdown", 0, 1]] as const).flatMap(([k, dx, dy]) => [
    { keys: k, command: "underlay.nudge", args: { dx: dx / 10, dy: dy / 10 }, when: "underlayEditing" as const },
    { keys: `shift+${k}`, command: "underlay.nudge", args: { dx, dy }, when: "underlayEditing" as const },
  ]),
  { keys: "enter", command: "floating.commit", when: "floating" },
  { keys: "escape", command: "floating.cancel", when: "floating" },
  { keys: "escape", command: "selection.none", when: "hasSelection" },
  { keys: "escape", command: "tool.cancel" },
  { keys: "delete", command: "selection.clear", when: "hasSelection" },
  { keys: "backspace", command: "selection.clear", when: "hasSelection" },
  { keys: "arrowleft", command: "selection.nudge", args: { dx: -1, dy: 0 }, when: "hasSelection" },
  { keys: "arrowright", command: "selection.nudge", args: { dx: 1, dy: 0 }, when: "hasSelection" },
  { keys: "arrowup", command: "selection.nudge", args: { dx: 0, dy: -1 }, when: "hasSelection" },
  { keys: "arrowdown", command: "selection.nudge", args: { dx: 0, dy: 1 }, when: "hasSelection" },
  { keys: "shift+arrowleft", command: "selection.nudge", args: { dx: -10, dy: 0 }, when: "hasSelection" },
  { keys: "shift+arrowright", command: "selection.nudge", args: { dx: 10, dy: 0 }, when: "hasSelection" },
  { keys: "shift+arrowup", command: "selection.nudge", args: { dx: 0, dy: -10 }, when: "hasSelection" },
  { keys: "shift+arrowdown", command: "selection.nudge", args: { dx: 0, dy: 10 }, when: "hasSelection" },
  { keys: "p", command: "tool.select", args: "pencil" },
  { keys: "b", command: "tool.select", args: "pencil" },
  { keys: "l", command: "tool.select", args: "line" },
  { keys: "r", command: "tool.select", args: "rect" },
  { keys: "shift+r", command: "tool.select", args: "filledRect" },
  { keys: "f", command: "tool.select", args: "fill" },
  { keys: "e", command: "tool.select", args: "eraser" },
  { keys: "i", command: "tool.select", args: "picker" },
  { keys: "h", command: "tool.select", args: "pan" },
  { keys: "s", command: "tool.select", args: "select" },
  { keys: "w", command: "tool.select", args: "magicWand" },
  { keys: "q", command: "draw.cyclePartialKind" },
  { keys: "o", command: "draw.toggleOverride" },
  { keys: "m", command: "draw.cycleMirror" },
  { keys: "k", command: "panel.toggle" },
  { keys: "a", command: "ambiguous.toggleAtHover" },
  { keys: "shift+a", command: "ambiguous.next" },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ keys: String(n), command: "key.selectNth", args: n })),
  { keys: "+", command: "view.zoomIn" },
  { keys: "=", command: "view.zoomIn" },
  { keys: "-", command: "view.zoomOut" },
  { keys: "0", command: "view.fit" },
];
