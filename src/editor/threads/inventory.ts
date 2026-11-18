import type { CustomColor, Pattern } from "@/core/pattern/types";
import { invalidateColors } from "@/core/pattern/resolve";
import { accountThreadApi } from "@/persistence";
import type { Editor } from "../createEditor";

/*
 * Your own threads and beads, signed in (SPEC §15.28): the inventory in the account, offered in every pattern.
 * A pattern keeps a copy of each one it uses (`customs`), so files stay whole; the inventory's version is the one
 * kept up to date. Signed out there is no inventory: custom colours live in their pattern only.
 */

/** Same thread: the same kind, brand and code (letters' case and spaces aside). */
export const sameThread = (a: CustomColor, b: CustomColor) =>
  a.kind === b.kind && a.brand.trim().toLowerCase() === b.brand.trim().toLowerCase() && a.code.trim().toLowerCase() === b.code.trim().toLowerCase();

const differs = (a: CustomColor, b: CustomColor) => a.brand !== b.brand || a.code !== b.code || a.name !== b.name || a.hex !== b.hex;

export class ThreadInventory {
  constructor(private ed: Editor) {}

  private get list(): CustomColor[] | null {
    return this.ed.state.inventory;
  }

  private set(list: CustomColor[] | null) {
    this.ed.store.setState({ inventory: list });
  }

  /** Signed in: fetch the inventory, then take in the open pattern's own threads. Signed out: none. */
  async load() {
    if (!this.ed.state.account) return this.set(null);
    const list = await accountThreadApi.list();
    if (!list) return;
    this.set(list);
    await this.withPattern(this.ed.doc);
  }

  /**
   * A pattern opened (or signed in with it open): its own threads not in the inventory join it — unless the
   * inventory has the same thread already (brand + code) — and its copies of inventory threads catch up.
   */
  async withPattern(p: Pattern) {
    const list = this.list;
    if (!list) return;
    const byId = new Map(list.map((c) => [c.id, c]));
    const join: CustomColor[] = [];
    let changed = false;
    for (const c of Object.values(p.customs)) {
      const theirs = byId.get(c.id);
      if (theirs) {
        if (differs(c, theirs)) {
          p.customs[c.id] = { ...theirs };
          changed = true;
        }
      } else if (!list.some((x) => sameThread(x, c))) join.push(c);
    }
    if (changed) {
      invalidateColors(p);
      if (p === this.ed.doc) this.ed.changed({ keys: true });
    }
    if (!join.length) return;
    const saved: CustomColor[] = [];
    for (const c of join) if (await accountThreadApi.save(c)) saved.push(c);
    this.set([...(this.list ?? []), ...saved]);
    // a file brought threads or beads of its own: they're in the account now, and the user is told (SPEC §15.42)
    if (saved.length) this.ed.toast("toasts.ownAdded", { count: saved.length, names: saved.map((c) => `${c.brand} ${c.code}`).join(", ") });
  }

  /** Created or changed in the editor: the inventory gets it too (signed in). */
  async save(c: CustomColor) {
    if (!this.list) return;
    if (!(await accountThreadApi.save(c))) return;
    this.set([...this.list.filter((x) => x.id !== c.id), c]);
  }

  /** Picking an inventory thread into the open pattern: the pattern takes a copy. */
  useIn(p: Pattern, id: string) {
    const c = this.list?.find((x) => x.id === id);
    if (!c || p.customs[id]) return;
    p.customs[id] = { ...c };
    if (c.kind === "thread" && p.brands && !p.brands.includes(c.brand)) p.brands = [...p.brands, c.brand];
    invalidateColors(p);
  }
}
