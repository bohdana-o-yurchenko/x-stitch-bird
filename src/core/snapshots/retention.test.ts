import { describe, expect, it } from "vitest";
import { snapshotsToDelete } from "./retention";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const now = 100 * DAY;

describe("snapshot retention (SPEC §15.7)", () => {
  it("keeps the newest ones whatever their age", () => {
    const times = [now - 1 * MIN, now - 30 * DAY];
    expect(snapshotsToDelete(times, now, { keepLatest: 2, hourlyFor: DAY, dailyFor: 14 * DAY, max: 50 })).toEqual([]);
  });

  it("then one per hour for a day, one per day for two weeks, and nothing older", () => {
    const policy = { keepLatest: 1, hourlyFor: DAY, dailyFor: 14 * DAY, max: 50 };
    const latest = now - MIN;
    const hourA = now - 5 * HOUR + 10 * MIN, hourA2 = now - 5 * HOUR + 20 * MIN; // same hour: the newer stays
    const dayA = now - 3 * DAY + HOUR, dayA2 = now - 3 * DAY + 2 * HOUR; // same day: the newer stays
    const old = now - 20 * DAY;
    const del = snapshotsToDelete([latest, hourA, hourA2, dayA, dayA2, old], now, policy);
    expect(del.sort()).toEqual([hourA, dayA, old].sort());
  });

  it("never keeps more than the maximum", () => {
    const times = Array.from({ length: 8 }, (_, i) => now - i * MIN);
    expect(snapshotsToDelete(times, now, { keepLatest: 8, hourlyFor: DAY, dailyFor: 14 * DAY, max: 5 })).toEqual(times.slice(5));
  });
});
