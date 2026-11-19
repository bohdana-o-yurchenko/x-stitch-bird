import { describe, expect, it } from "vitest";
import { parseRemembered, resolveSession } from "./session";

const ana = { id: "u1", email: "ana@example.com" };
const bo = { id: "u2", email: "bo@example.com" };

describe("the session the app goes by (SPEC §15.53)", () => {
  it("starts with whoever was signed in here, not waiting for the check", () => {
    expect(resolveSession({ user: null, isPending: true, failed: false }, ana, true)).toEqual({ user: ana, isPending: false, offline: false });
    // no one remembered: waits, as before
    expect(resolveSession({ user: null, isPending: true, failed: false }, null, true)).toMatchObject({ user: null, isPending: true });
  });

  it("the check's answer wins, and is remembered", () => {
    expect(resolveSession({ user: bo, isPending: false, failed: false }, ana, true)).toEqual({ user: bo, isPending: false, offline: false, remember: bo });
  });

  it("no answer (offline, the server out of reach): stays signed in, offline", () => {
    expect(resolveSession({ user: null, isPending: false, failed: true }, ana, false)).toEqual({ user: ana, isPending: false, offline: true });
    expect(resolveSession({ user: null, isPending: false, failed: true }, null, false)).toEqual({ user: null, isPending: false, offline: true });
  });

  it("the server says no one is signed in: forgotten", () => {
    expect(resolveSession({ user: null, isPending: false, failed: false }, ana, true)).toEqual({ user: null, isPending: false, offline: false, remember: null });
  });

  it("the connection dropping while signed in", () => {
    expect(resolveSession({ user: ana, isPending: false, failed: false }, ana, false)).toMatchObject({ user: ana, offline: true });
  });

  it("reads back only a user it wrote", () => {
    expect(parseRemembered(JSON.stringify(ana))).toEqual(ana);
    expect(parseRemembered(null)).toBeNull();
    expect(parseRemembered("{")).toBeNull();
    expect(parseRemembered(JSON.stringify({ id: 5 }))).toBeNull();
  });
});
