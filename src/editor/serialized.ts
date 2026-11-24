import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import type { Pattern } from "@/core/pattern/types";
import type { JobRunner } from "./jobs";

interface Made {
  doc: Pattern;
  revision: number;
  spent: number;
  file: PatternFile;
}

/**
 * The open pattern as its JSON document, made once per change however many savers want it (draft, saved patterns,
 * versions, live editing): `now()` on this thread, when it's needed at once (the page closing); `later()` off it
 * (ARCHITECTURE-REVIEW §1). The time spent grows without a new revision, so it's part of what's compared.
 */
export class SerializedPattern {
  private made: Made | null = null;

  constructor(private state: () => { doc: Pattern; docRevision: number }, private jobs: JobRunner) {}

  private fresh(): Made | null {
    const { doc, docRevision } = this.state(), m = this.made;
    return m && m.doc === doc && m.revision === docRevision && m.spent === doc.spent ? m : null;
  }

  now(): PatternFile {
    const hit = this.fresh();
    if (hit) return hit.file;
    const { doc, docRevision } = this.state();
    const file = serializePattern(doc);
    this.made = { doc, revision: docRevision, spent: doc.spent, file };
    return file;
  }

  /** As `now()`, worked out by the job worker; the pattern as it is at the call, whatever changes meanwhile. */
  async later(): Promise<PatternFile> {
    const hit = this.fresh();
    if (hit) return hit.file;
    const { doc, docRevision } = this.state(), spent = doc.spent;
    const file = await this.jobs.run("serialize", doc);
    // kept only if nothing newer was made meanwhile
    if (!this.made || this.made.revision <= docRevision) this.made = { doc, revision: docRevision, spent, file };
    return file;
  }
}
