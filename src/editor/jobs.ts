import { runJob, type JobInput, type JobKind, type JobOutput, type JobReply, type JobRequest } from "@/workers/jobs";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; req: JobRequest };

/**
 * Runs the jobs of `workers/jobs` in one long-lived worker, in the order asked for; on the main thread where workers
 * aren't available (tests, old browsers) or the worker failed (ARCHITECTURE-REVIEW §1).
 */
export class JobRunner {
  private worker: Worker | null | undefined;
  private pending = new Map<number, Pending>();
  private next = 1;

  constructor(private makeWorker: () => Worker | null = defaultWorker) {}

  run<K extends JobKind>(kind: K, input: JobInput<K>): Promise<JobOutput<K>> {
    const req: JobRequest = { id: this.next++, kind, input };
    const w = this.ensureWorker();
    // no worker: done at once, so it works on the input as it is now, like a worker's copy would
    if (!w) {
      try {
        return Promise.resolve(settle(runJob(req)) as JobOutput<K>);
      } catch (e) {
        return Promise.reject(e as Error);
      }
    }
    return new Promise((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject, req } as Pending);
      try {
        w.postMessage(req);
      } catch {
        // something that can't be copied to a worker: done here instead
        this.pending.delete(req.id);
        try {
          resolve(settle(runJob(req)) as JobOutput<K>);
        } catch (e) {
          reject(e as Error);
        }
      }
    });
  }

  /** Starts the worker ahead of its first job (after start-up), so the first save doesn't wait for it to load. */
  warm() {
    this.ensureWorker();
  }

  private ensureWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      this.worker = this.makeWorker();
    } catch {
      this.worker = null;
    }
    if (this.worker) {
      this.worker.onmessage = (e: MessageEvent<JobReply>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.value);
        else p.reject(new Error(e.data.error));
      };
      // the worker is gone: what it had in hand, and everything after, runs here
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        const left = [...this.pending.values()];
        this.pending.clear();
        for (const p of left) {
          try {
            p.resolve(settle(runJob(p.req)));
          } catch (e) {
            p.reject(e as Error);
          }
        }
      };
    }
    return this.worker;
  }
}

function settle(r: JobReply): unknown {
  if (r.ok) return r.value;
  throw new Error(r.error);
}

function defaultWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("../workers/jobs.worker.ts", import.meta.url), { type: "module" });
}
