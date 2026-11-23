import type { Editor } from "./createEditor";
import { handBack } from "./startRequest";

/*
 * Come from outside the editor to start a pattern — New ▾ on the patterns page: blank, a picture, an .oxs, a PDF
 * chart, a work file (SPEC §15.37). No other pattern shows first: only the steps (the picture's settings, the PDF's,
 * the questions about the file), on an empty page. The editor shows once the new pattern is in; given up (cancelled,
 * a file that can't be read), it's back to where the user came from, with what went wrong said there.
 */
export class Arrival {
  private watching: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Where "back" is: set by the page around the editor. */
  private leave: (() => void) | null = null;

  constructor(private ed: Editor) {}

  onLeave(go: () => void) {
    this.leave = go;
  }

  begin() {
    this.ed.store.setState({ arriving: true });
  }

  /** Once the first step has started. */
  watch() {
    if (!this.ed.state.arriving) return;
    this.watching ??= this.ed.store.subscribe(() => this.check());
    this.check();
  }

  /** After every change, and once a command is done: nothing asked, nothing running, no pattern — given up. */
  check() {
    if (!this.watching) return;
    if (!this.ed.state.arriving) return this.stop();
    if (this.timer) return;
    // a step may close its dialog just before starting the next one (Pick a PDF… closes, then the picker opens)
    this.timer = setTimeout(() => {
      this.timer = null;
      const s = this.ed.state;
      if (s.arriving && !s.dialog && !this.ed.commands.busy) this.giveUp();
    }, 0);
  }

  private giveUp() {
    this.stop();
    const said = this.ed.state.toasts.at(-1);
    if (said) handBack({ key: said.key, ...(said.values ? { values: said.values } : {}) });
    this.leave?.();
  }

  private stop() {
    this.watching?.();
    this.watching = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
