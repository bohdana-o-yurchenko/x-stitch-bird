import { runChecks, type CheckOptions } from "@/core/checks/checks";
import { serializePattern } from "@/core/formats/json/serialize";
import type { PdfContent } from "@/core/formats/pdfChart/content";
import { readChart } from "@/core/formats/pdfChart/read";
import type { Pattern } from "@/core/pattern/types";

/**
 * Heavy work that may run off the main thread: one entry per kind of job, the same function in the worker and,
 * where there is no worker, on the main thread (editor/jobs). A new kind of job is one more line here.
 */
export const JOBS = {
  /** The pattern as its JSON document (autosave, saved patterns). */
  serialize: (p: Pattern) => serializePattern(p),
  /** Another app's PDF chart: its grids, symbols and key (SPEC §15.46). */
  readChart: (i: { content: PdfContent; use?: readonly boolean[] }) => readChart(i.content, { use: i.use }),
  /** Chart checks (SPEC §15.4). */
  checks: (i: { pattern: Pattern; options: CheckOptions }) => runChecks(i.pattern, i.options),
};

export type JobKind = keyof typeof JOBS;
export type JobInput<K extends JobKind> = Parameters<(typeof JOBS)[K]>[0];
export type JobOutput<K extends JobKind> = ReturnType<(typeof JOBS)[K]>;

export interface JobRequest {
  id: number;
  kind: JobKind;
  input: unknown;
}
export type JobReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

/** Runs one request: what the worker does with each message. */
export function runJob(req: JobRequest): JobReply {
  try {
    return { id: req.id, ok: true, value: (JOBS[req.kind] as (i: unknown) => unknown)(req.input) };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
