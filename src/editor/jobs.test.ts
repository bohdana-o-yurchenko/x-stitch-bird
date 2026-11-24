import { describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { runJob, type JobRequest } from "@/workers/jobs";
import { JobRunner } from "./jobs";

/** A worker stand-in that answers when told to, the way the real one would (runJob on a copy). */
function fakeWorker() {
  const inbox: JobRequest[] = [];
  const w = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as (() => void) | null,
    terminated: false,
    postMessage: (req: JobRequest) => inbox.push(structuredClone(req)),
    terminate: () => void (w.terminated = true),
    /** Answers the oldest message. */
    answer: () => w.onmessage!({ data: runJob(inbox.shift()!) } as MessageEvent),
    crash: () => w.onerror!(),
    inbox,
  };
  return w;
}

describe("heavy work off the main thread", () => {
  it("a job goes to the worker and its answer comes back", async () => {
    const w = fakeWorker(), jobs = new JobRunner(() => w as unknown as Worker);
    const p = createPattern(3, 2, "Off");
    const out = jobs.run("serialize", p);
    expect(w.inbox).toHaveLength(1);
    w.answer();
    expect((await out).name).toBe("Off");
  });

  it("the worker gets the pattern as it was asked about, not as it is later", async () => {
    const w = fakeWorker(), jobs = new JobRunner(() => w as unknown as Worker);
    const p = createPattern(3, 2, "Before");
    const out = jobs.run("serialize", p);
    p.name = "After";
    w.answer();
    expect((await out).name).toBe("Before");
  });

  it("warming up starts the worker once, before any job", () => {
    let made = 0;
    const jobs = new JobRunner(() => (made++, fakeWorker() as unknown as Worker));
    jobs.warm();
    jobs.warm();
    void jobs.run("serialize", createPattern(2, 2));
    expect(made).toBe(1);
  });

  it("no worker: done at once on this thread", async () => {
    const jobs = new JobRunner(() => null);
    expect((await jobs.run("serialize", createPattern(2, 2, "Here"))).name).toBe("Here");
  });

  it("a worker that can't be started: on this thread", async () => {
    const jobs = new JobRunner(() => { throw new Error("no"); });
    expect((await jobs.run("serialize", createPattern(2, 2, "Here"))).name).toBe("Here");
  });

  it("the worker crashing: what it had in hand is done here, and so is what comes after", async () => {
    const w = fakeWorker(), jobs = new JobRunner(() => w as unknown as Worker);
    const a = jobs.run("serialize", createPattern(2, 2, "A"));
    w.crash();
    expect(w.terminated).toBe(true);
    expect((await a).name).toBe("A");
    expect((await jobs.run("serialize", createPattern(2, 2, "B"))).name).toBe("B");
  });

  it("a job that fails says why", async () => {
    const jobs = new JobRunner(() => null);
    await expect(jobs.run("serialize", null as never)).rejects.toThrow();
  });
});
