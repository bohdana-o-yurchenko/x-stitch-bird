/*
 * The installed app's service worker (SPEC §15.53): the text served at /sw.js, made once while the app is built.
 *
 * - Installing saves this build ahead: every page in every language, every file the pages may ask for (also those
 *   loaded only when needed), the public fonts and icons. Build files never change under their name, so those an
 *   earlier version saved are taken from it rather than downloaded again.
 * - Pages and files come from what was saved, at once — with the internet or without; anything else (the account,
 *   sign-in, page data for in-app navigation, analytics) goes to the network as before.
 * - A new build waits, saved, until the page asks for it (Reload) or every window of the app has closed.
 * - The version before stays saved a while: a window still running it finds the files it loads later.
 */

export interface OfflineConfig {
  /** The build's id: names the saved copy. */
  version: string;
  /** The pages, each in every language (`/uk`, `/en/patterns`, …). */
  pages: string[];
  /** Where `/` leads: the default language's editor. */
  home: string;
  /** Everything else saved ahead, from the site's root. */
  assets: string[];
}

/** The app's pages (after the language): the editor, then the others — each opens without the internet. */
export const OFFLINE_PAGES = ["", "/patterns", "/threads", "/beads", "/account", "/check", "/privacy", "/support"];

/** Every page in every language. */
export const offlinePages = (locales: readonly string[]) => locales.flatMap((l) => OFFLINE_PAGES.map((p) => `/${l}${p}`));

/** Saved copies' names start with this; the version follows. */
export const CACHE_PREFIX = "ptashechka-";

export function serviceWorkerScript(c: OfflineConfig): string {
  return `// пташечка — opening without the internet (SPEC §15.53). Made while building; version ${c.version}.
const PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const CACHE = PREFIX + ${JSON.stringify(c.version)};
const HOME = ${JSON.stringify(c.home)};
const PAGES = new Set(${JSON.stringify(c.pages)});
const ASSETS = ${JSON.stringify(c.assets)};
const SAVED = new Set(ASSETS);
const BUILD = "/_next/static/";

// a page reached through a redirect can't answer a navigation as it is
async function download(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(url + ": " + res.status);
  return res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([
      ...ASSETS.map(async (url) => cache.put(url, (url.startsWith(BUILD) && (await caches.match(url))) || (await download(url)))),
      ...[...PAGES].map(async (url) => cache.put(url, await download(url))),
    ]);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const older = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
    await Promise.all(older.slice(0, -1).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skip-waiting") self.skipWaiting();
});

// this version's copy first (pages and public files keep their names between versions), then any saved one
async function saved(path) {
  return (await (await caches.open(CACHE)).match(path, { ignoreVary: true })) || (await caches.match(path, { ignoreVary: true }));
}

async function page(path, request) {
  return (await saved(path)) || fetch(request);
}

async function file(path, request) {
  const hit = await saved(path);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && path.startsWith(BUILD)) {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(path, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\\/+$/, "") : url.pathname;
  if (request.mode === "navigate") {
    if (path === "/") event.respondWith(fetch(request).catch(() => Response.redirect(new URL(HOME, url).href, 302)));
    else if (PAGES.has(path)) event.respondWith(page(path, request));
    return;
  }
  if (path.startsWith(BUILD) || SAVED.has(path)) event.respondWith(file(path, request));
});
`;
}
