import { countUse, mergeTipState, newTipState, today, validTipState, type TipState } from "@/core/tips/tips";
import { accountTipApi } from "@/persistence";

const KEY = "stitchwork.tips";
/** This browser's copy is written this long after a change; the account's this long after (and when the page goes). */
const LOCAL_MS = 2_000, ACCOUNT_MS = 60_000;

/**
 * Tip of the day's memory (SPEC §15.60): tips seen, the day of the last one, on or off, and how often each feature
 * was used by click and by key. Kept in this browser always; signed in, also in the account — merged both ways on
 * sign-in and on every save, so another device's tips and uses are never lost.
 */
export class TipsService {
  state: TipState;
  private localTimer: ReturnType<typeof setTimeout> | null = null;
  private accountTimer: ReturnType<typeof setTimeout> | null = null;
  private signedIn = false;
  private changedForAccount = false;

  constructor() {
    this.state = TipsService.read() ?? TipsService.fresh();
  }

  private static read(): TipState | null {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
      return validTipState(v) ? v : null;
    } catch {
      return null;
    }
  }

  /** Someone who used the app before tips existed (the guide was seen) doesn't wait a day for the first one. */
  private static fresh(): TipState {
    let old = false;
    try {
      old = !!localStorage.getItem("stitchwork.guideSeen");
    } catch {
      // no storage: a new person
    }
    return newTipState(today(), old);
  }

  /** A command run (feature usage counting, SPEC §15.54, hands each one here too). */
  count(feature: string, via: "click" | "key") {
    countUse(this.state, feature, via);
    this.changed();
  }

  markShown(id: string) {
    this.state.shown[id] = Date.now();
    this.changed();
  }

  /** Today's tip came: the next one tomorrow. */
  shownToday() {
    this.state.day = today();
    this.changed();
  }

  setOff(off: boolean) {
    this.state.off = off;
    this.state.offAt = Date.now();
    this.changed(true);
  }

  private changed(soon = false) {
    this.localTimer ??= setTimeout(() => this.writeLocal(), LOCAL_MS);
    this.changedForAccount = true;
    if (this.signedIn && (soon || !this.accountTimer)) {
      if (this.accountTimer) clearTimeout(this.accountTimer);
      this.accountTimer = setTimeout(() => void this.sendAccount(), soon ? LOCAL_MS : ACCOUNT_MS);
    }
  }

  /** Merged with what is there: another tab of the editor may have written its own since. */
  private writeLocal() {
    if (this.localTimer) clearTimeout(this.localTimer);
    this.localTimer = null;
    const there = TipsService.read();
    if (there) this.state = mergeTipState(this.state, there);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // private mode: remembered for this visit only
    }
  }

  private async sendAccount(keepalive = false) {
    if (this.accountTimer) clearTimeout(this.accountTimer);
    this.accountTimer = null;
    if (!this.signedIn || !this.changedForAccount) return;
    this.changedForAccount = false;
    const merged = await accountTipApi.put(this.state, keepalive);
    if (merged && !keepalive) this.adopt(merged);
    else if (!merged) this.changedForAccount = true;
  }

  /** The merged state, plus anything that happened here meanwhile. */
  private adopt(s: TipState) {
    this.state = mergeTipState(this.state, s);
    this.writeLocal();
  }

  /** Signed in: the account's state and this browser's become one, in both places. Signed out: this browser's alone. */
  async setSignedIn(on: boolean) {
    if (this.signedIn === on) return;
    this.signedIn = on;
    if (!on) return;
    const theirs = await accountTipApi.get();
    if (theirs === undefined) return;
    if (theirs) this.adopt(theirs);
    this.changedForAccount = true;
    await this.sendAccount();
  }

  /** The page is going: write everything now. */
  flush() {
    this.writeLocal();
    void this.sendAccount(true);
  }
}
