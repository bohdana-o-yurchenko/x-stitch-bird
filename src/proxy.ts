import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** The landing page's addresses: `/`, `/uk`, `/en`. */
const LANDING = /^\/(?:(uk|en)\/?)?$/;

/** The editor's own requests (`?open=<id>`, `?new=1`, `?new=pdf`) from before it moved to /editor. */
const EDITOR_PARAMS = ["open", "new"];

/**
 * The landing page (SPEC §15.53) is for newcomers: a signed-in visitor goes straight on to the editor, and so do
 * old links to the editor (`/uk?new=1`). Only the session cookie's presence is checked — no network call; a stale one
 * just means the editor, which checks the session itself.
 */
export default function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const landing = LANDING.exec(pathname);
  if (landing) {
    const signedIn = request.cookies.getAll().some((c) => c.name.endsWith("neon-auth.session_token"));
    if (signedIn || EDITOR_PARAMS.some((p) => searchParams.has(p))) {
      const url = request.nextUrl.clone();
      url.pathname = `/${landing[1] ?? routing.defaultLocale}/editor`;
      return NextResponse.redirect(url);
    }
  }
  return intl(request);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
