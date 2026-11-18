/** Chrome's and Edge's install prompt (not in the DOM types). */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __installPrompt?: InstallPrompt | null;
  }
}

const CHANGED = "installchange";

/**
 * Runs before the app (inlined in the page head): Chrome and Edge offer their prompt once, soon after the page loads,
 * possibly before ☰ is there to keep it. Kept for ☰ ▸ Install the app…; gone once installed.
 */
export const INSTALL_BOOT_SCRIPT = `addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installPrompt=e;dispatchEvent(new Event("${CHANGED}"))});addEventListener("appinstalled",function(){window.__installPrompt=null;dispatchEvent(new Event("${CHANGED}"))})`;

/**
 * How this browser installs the app (SPEC §15.50): its own prompt (Chrome, Edge), its own button only (Chrome, Edge
 * when the prompt has been used or isn't offered yet), Safari's File ▸ Add to Dock — or not at all: on phones and
 * tablets (laptops only), in Firefox, or already in the app's own window.
 */
export type InstallWay = "prompt" | "chromium" | "safari";

const LAPTOP = "(pointer: fine) and (hover: hover) and (min-width: 1024px)";
const IN_APP = "(display-mode: standalone)";

export function installWay(): InstallWay | null {
  if (!matchMedia(LAPTOP).matches || matchMedia(IN_APP).matches) return null;
  if (window.__installPrompt) return "prompt";
  if ("onbeforeinstallprompt" in window) return "chromium";
  const ua = navigator.userAgent;
  // Add to Dock: Safari 17 on a Mac (an iPad's Safari says Macintosh too, but has a touch screen)
  const safari = /Macintosh/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua) && Number(/Version\/(\d+)/.exec(ua)?.[1]) >= 17;
  return safari && navigator.maxTouchPoints === 0 ? "safari" : null;
}

/**
 * Calls `changed` when the install way may have changed. (No React in this file: the layout, a server component,
 * inlines its boot script.)
 */
export function watchInstall(changed: () => void) {
  const media = [matchMedia(LAPTOP), matchMedia(IN_APP)];
  window.addEventListener(CHANGED, changed);
  for (const m of media) m.addEventListener("change", changed);
  return () => {
    window.removeEventListener(CHANGED, changed);
    for (const m of media) m.removeEventListener("change", changed);
  };
}

/** Chrome's or Edge's prompt; it can be shown once — after that, the browser's own button. */
export async function promptInstall() {
  const p = window.__installPrompt;
  if (!p) return;
  window.__installPrompt = null;
  await p.prompt();
  await p.userChoice;
  window.dispatchEvent(new Event(CHANGED));
}
