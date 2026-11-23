import { afterEach, describe, expect, it, vi } from "vitest";
import { parseUsage } from "@/core/usage/featureUsage";
import { USAGE_FLUSH_MS, UsageCounter } from "./usage";

afterEach(() => vi.useRealTimers());

describe("the feature usage counter (SPEC §15.54)", () => {
  it("counts clicks and shortcuts per feature, signed in or not, and starts again after sending", () => {
    let signed = false;
    const sent: string[] = [];
    const u = new UsageCounter(() => signed, (b) => sent.push(b));
    u.count("history.undo", undefined, "click");
    u.count("history.undo", undefined, "key");
    u.count("history.undo", undefined, "key");
    u.count("tool.select", "fill", "click");
    signed = true;
    u.count("history.undo", undefined, "click");
    u.flush();
    expect(parseUsage(sent[0]!)).toEqual([
      ["history.undo", false, 1, 2],
      ["tool.select:fill", false, 1, 0],
      ["history.undo", true, 1, 0],
    ]);
    u.flush();
    expect(sent).toHaveLength(1);
  });

  it("sends on its own a while after the first count; a failed send is just lost", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => { throw new Error("offline"); });
    const u = new UsageCounter(() => false, send);
    u.count("view.fit", undefined, "key");
    vi.advanceTimersByTime(USAGE_FLUSH_MS - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledOnce();
    u.count("view.fit", undefined, "key");
    expect(() => u.flush()).not.toThrow();
  });
});
