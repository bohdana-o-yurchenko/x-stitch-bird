/*
 * Opening without the internet (SPEC §15.53), the page's side: the service worker (/sw.js) is registered in the
 * installed app's window, or as the app is installed from a browser tab — once there, it serves every window of the
 * site. A new version, once saved, is offered with Reload. (No React here, as in install.ts.)
 */

const IN_APP = "(display-mode: standalone)";
/** The installed app stays open for days: it looks for a new version this often, and on coming back to the front. */
const CHECK_EVERY = 60 * 60 * 1000;

let started = false;
let registration: ServiceWorkerRegistration | null = null;
let ready = false;
/** Reload was chosen here: the new version, once it takes over, reloads this window. */
let reloading = false;
const listeners = new Set<() => void>();

function setReady() {
  if (ready) return;
  ready = true;
  listeners.forEach((l) => l());
}

function watch(reg: ServiceWorkerRegistration) {
  if (registration) return;
  registration = reg;
  // the saved app and the patterns in this browser aren't cleared when the disk runs low (granted quietly to an
  // installed app)
  void navigator.storage?.persist?.().catch(() => {});
  const sw = navigator.serviceWorker;
  // saved and waiting while an older version runs here
  const check = () => reg.waiting && sw.controller && setReady();
  check();
  reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    w?.addEventListener("statechange", () => w.state === "installed" && check());
  });
  const update = () => void reg.update().catch(() => {});
  setInterval(update, CHECK_EVERY);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && update());
}

/** Once per page load (the layout calls it). */
export function startOffline() {
  if (started || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;
  const sw = navigator.serviceWorker;
  if (process.env.NODE_ENV !== "production") {
    // never while developing (the files change all the time); one left from a build on this address goes
    void sw.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
    return;
  }
  // a version already runs here: another taking over is an update (the first one isn't)
  const updating = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    if (reloading) window.location.reload();
    else if (updating) setReady();
  });
  const register = () => void sw.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(watch, () => {});
  if (matchMedia(IN_APP).matches) register();
  else void sw.getRegistration("/").then((r) => r && watch(r), () => {});
  window.addEventListener("appinstalled", register);
}

/** A new version is saved and waiting (or has taken over another window): Reload brings it here. */
export const updateReady = () => ready;

export function watchUpdate(changed: () => void) {
  listeners.add(changed);
  return () => void listeners.delete(changed);
}

/** The new version takes over and this window reloads (the editor saves on the way out, as on any reload). */
export function applyUpdate() {
  reloading = true;
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: "skip-waiting" });
  else window.location.reload();
}
