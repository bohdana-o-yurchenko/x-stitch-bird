import { beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_PREFIX, OFFLINE_PAGES, offlinePages, serviceWorkerScript, type OfflineConfig } from "./serviceWorker";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The service worker as shipped (SPEC §15.53): its script runs here in a pretend worker — the browser's caches and
 * the network replaced — and is asked what a browser would ask it.
 */

const ORIGIN = "https://www.x-stitch-bird.app";
const pathOf = (r: string | { url: string }) => new URL(typeof r === "string" ? r : r.url, ORIGIN).pathname;

/** Cache Storage, kept by path (queries are never part of what is saved). */
class Cache {
  files = new Map<string, Response>();
  async put(r: string, res: Response) {
    this.files.set(pathOf(r), res);
  }
  async match(r: string) {
    return this.files.get(pathOf(r))?.clone();
  }
}
class Caches {
  all = new Map<string, Cache>();
  async open(name: string) {
    if (!this.all.has(name)) this.all.set(name, new Cache());
    return this.all.get(name)!;
  }
  async keys() {
    return [...this.all.keys()];
  }
  async delete(name: string) {
    return this.all.delete(name);
  }
  // oldest first, as the browser looks
  async match(r: string) {
    for (const c of this.all.values()) {
      const hit = await c.match(r);
      if (hit) return hit;
    }
  }
}

type Req = { url: string; method?: string; mode?: string };

function worker(config: OfflineConfig, caches: Caches, net: { offline: boolean; body?: (path: string) => string; fail?: string }) {
  const fetch = vi.fn(async (r: string | Req) => {
    const path = pathOf(r);
    if (net.offline) throw new TypeError("Failed to fetch");
    return new Response(net.body?.(path) ?? `network ${path}`, { status: path === net.fail ? 500 : 200 });
  });
  const on: Record<string, (e: object) => void> = {};
  const self = { location: new URL(ORIGIN), addEventListener: (type: string, f: (e: object) => void) => (on[type] = f), skipWaiting: vi.fn(), clients: { claim: vi.fn(async () => {}) } };
  new Function("self", "caches", "fetch", serviceWorkerScript(config))(self, caches, fetch);
  const lifecycle = async (type: string) => {
    const waits: Promise<unknown>[] = [];
    on[type]!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return {
    self,
    fetch,
    install: () => lifecycle("install"),
    activate: () => lifecycle("activate"),
    message: (data: unknown) => on.message!({ data }),
    /** What the page gets: the worker's answer as text (a redirect's address), or null when it lets the request go. */
    async get(url: string, o: Omit<Req, "url"> = {}): Promise<string | null> {
      let answer: Promise<Response> | null = null;
      on.fetch!({ request: { url: new URL(url, ORIGIN).href, method: "GET", mode: "cors", ...o }, respondWith: (p: Promise<Response>) => (answer = p) });
      if (!answer) return null;
      const res: Response = await answer;
      return res.status === 302 ? `→ ${res.headers.get("location")}` : res.text();
    },
  };
}

const config = (version: string): OfflineConfig => ({
  version,
  pages: offlinePages(["en", "uk"]),
  home: "/uk",
  assets: ["/_next/static/chunks/app.js", "/_next/static/media/pdf.worker.min.mjs", "/fonts/symbols.ttf", "/en/manifest.webmanifest", "/icon.svg"],
});

let caches: Caches;
beforeEach(() => {
  caches = new Caches();
});

describe("the installed app's service worker (SPEC §15.53)", () => {
  it("saves every page in both languages and every file ahead", async () => {
    const w = worker(config("b1"), caches, { offline: false });
    await w.install();
    const saved = [...caches.all.get(`${CACHE_PREFIX}b1`)!.files.keys()];
    expect(saved).toEqual(expect.arrayContaining(["/en", "/uk", "/en/patterns", "/uk/support", "/_next/static/chunks/app.js", "/fonts/symbols.ttf", "/en/manifest.webmanifest"]));
    expect(saved).toHaveLength(OFFLINE_PAGES.length * 2 + 5);
  });

  it("doesn't take a version it couldn't save whole (the browser tries again later)", async () => {
    const w = worker(config("b1"), caches, { offline: false, fail: "/fonts/symbols.ttf" });
    await expect(w.install()).rejects.toThrow("/fonts/symbols.ttf");
  });

  it("opens every page without the internet, whatever the address asks for", async () => {
    await worker(config("b1"), caches, { offline: false }).install();
    const w = worker(config("b1"), caches, { offline: true });
    expect(await w.get("/en", { mode: "navigate" })).toBe("network /en");
    expect(await w.get("/uk/patterns?open=p1", { mode: "navigate" })).toBe("network /uk/patterns");
    expect(await w.get("/en/threads/", { mode: "navigate" })).toBe("network /en/threads");
    expect(await w.get("/_next/static/chunks/app.js?dpl=x")).toBe("network /_next/static/chunks/app.js");
    expect(await w.get("/_next/static/media/pdf.worker.min.mjs")).toBe("network /_next/static/media/pdf.worker.min.mjs");
    // the root leads to the default language's editor
    expect(await w.get("/", { mode: "navigate" })).toBe(`→ ${ORIGIN}/uk`);
  });

  it("gives saved pages at once with the internet too — no waiting for the network", async () => {
    await worker(config("b1"), caches, { offline: false, body: () => "saved" }).install();
    const w = worker(config("b1"), caches, { offline: false, body: () => "newer on the server" });
    expect(await w.get("/en/account", { mode: "navigate" })).toBe("saved");
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it("leaves the account, sign-in, in-app navigation data, analytics and other sites to the network", async () => {
    const w = worker(config("b1"), caches, { offline: false });
    await w.install();
    expect(await w.get("/api/patterns")).toBeNull();
    expect(await w.get("/api/auth/get-session")).toBeNull();
    expect(await w.get("/en/patterns?_rsc=abc")).toBeNull();
    expect(await w.get("/_vercel/insights/script.js")).toBeNull();
    expect(await w.get("https://example.com/en", { mode: "navigate" })).toBeNull();
    expect(await w.get("/api/patterns/p1", { method: "PUT" })).toBeNull();
    // a page it doesn't know
    expect(await w.get("/en/nowhere", { mode: "navigate" })).toBeNull();
  });

  it("saves a build file it hadn't, as it goes by", async () => {
    const w = worker(config("b1"), caches, { offline: false });
    await w.install();
    expect(await w.get("/_next/static/chunks/later.js")).toBe("network /_next/static/chunks/later.js");
    await vi.waitFor(() => expect(caches.all.get(`${CACHE_PREFIX}b1`)!.files.has("/_next/static/chunks/later.js")).toBe(true));
  });

  describe("a new version", () => {
    it("takes the build files it has already from the version before; pages and public files come new", async () => {
      await worker(config("b1"), caches, { offline: false }).install();
      const next = { ...config("b2"), assets: [...config("b2").assets, "/_next/static/chunks/new.js"] };
      const w = worker(next, caches, { offline: false });
      await w.install();
      const got = w.fetch.mock.calls.map(([r]) => pathOf(r as string));
      expect(got).toContain("/_next/static/chunks/new.js");
      expect(got).not.toContain("/_next/static/chunks/app.js");
      expect(got).toEqual(expect.arrayContaining(["/fonts/symbols.ttf", "/icon.svg", "/en", "/uk/patterns"]));
    });

    it("waits for the page to ask (Reload) before taking over", async () => {
      const w = worker(config("b2"), caches, { offline: false });
      w.message({ type: "something else" });
      expect(w.self.skipWaiting).not.toHaveBeenCalled();
      w.message({ type: "skip-waiting" });
      expect(w.self.skipWaiting).toHaveBeenCalled();
    });

    it("serves its own pages, not the version before's", async () => {
      await worker(config("b1"), caches, { offline: false, body: () => "old" }).install();
      const w = worker(config("b2"), caches, { offline: false, body: () => "new" });
      await w.install();
      await w.activate();
      expect(await w.get("/en", { mode: "navigate" })).toBe("new");
    });

    it("keeps the version before (windows still running it load from it) and lets older ones go", async () => {
      for (const v of ["b1", "b2", "b3"]) await worker(config(v), caches, { offline: false }).install();
      await caches.open("someone-else");
      const w = worker(config("b3"), caches, { offline: false });
      await w.activate();
      expect(await caches.keys()).toEqual([`${CACHE_PREFIX}b2`, `${CACHE_PREFIX}b3`, "someone-else"]);
      expect(w.self.clients.claim).toHaveBeenCalled();
    });
  });

  it("knows every page the app has (a new page goes into OFFLINE_PAGES)", () => {
    const app = fileURLToPath(new URL("../../app/[locale]/", import.meta.url));
    const pages = ["", ...readdirSync(app).map((d) => `/${d}`)].filter((p) => existsSync(join(app, p, "page.tsx")));
    expect(pages.sort()).toEqual([...OFFLINE_PAGES].sort());
  });
});
