import type { PatternFile } from "@/core/formats/json/serialize";
import type { UnderlayData } from "@/core/underlay/underlay";
import type { PatternDetails } from "@/core/pattern/stats";

/*
 * Storage interfaces (ARCHITECTURE §13). The editor only knows these; `persistence/index.ts` picks the
 * implementation (browser storage today, an API + database later).
 */

export interface PatternSummary {
  id: string;
  name: string;
  w: number;
  h: number;
  updatedAt: number;
  designer?: string;
  /** Where it is kept: this browser, the signed-in account, or both (absent: this browser). */
  where?: "browser" | "account" | "both";
  /** The account has a preview picture of it. */
  hasPreview?: boolean;
  /** The account's figures for it (SPEC §15.36); patterns here get theirs worked out in the browser. */
  details?: PatternDetails;
}

/**
 * `limit`: refused — the account has its most patterns (SPEC §15.35); the browser keeps it.
 * `account`: while signed in, whether the account got it too (false: offline or refused — the browser copy has it).
 * `rev`: the account's revision of it now. `conflict`: refused — the account's copy had another save since the one
 * this change was made over (SPEC §15.34); here it is.
 */
export type SaveResult =
  | { ok: true; account?: boolean; rev?: number; conflict?: { rev: number; doc: PatternFile }; limit?: number }
  | { ok: false; reason: "quota" | "conflict" | "error" };

/**
 * `base`: the account revision the change was made over (null: not known — it saves regardless, as before revisions;
 * absent: the one this browser last had). `window`: the window saving, which keeps the editing. `localOnly`: this
 * browser only (a copy of what the account already has).
 */
export interface SaveOptions {
  base?: number | null;
  window?: string;
  localOnly?: boolean;
}

export interface PatternRepository {
  list(): Promise<PatternSummary[]>;
  load(id: string): Promise<PatternFile | null>;
  save(doc: PatternFile, o?: SaveOptions): Promise<SaveResult>;
  remove(id: string): Promise<void>;
  /** Signed in: patterns saved in this browser after their last copy reached the account (an upload cut off) go up now. */
  catchUp?(): Promise<void>;
  /**
   * Signed in: this browser keeps the account's patterns only as a cache — the `keep` ones and the most recent few.
   * `all`: none (signing out). Patterns not in the account stay. Returns the ids taken out of this browser.
   */
  trimCache?(o: { keep?: string[]; all?: boolean }): Promise<string[]>;
}

/** A reference window (SPEC §11.1). `image` and `marks` are ids in the image store. */
export interface RefWindowData {
  id: string;
  name: string;
  image: string;
  x: number;
  y: number;
  w: number;
  h: number;
  min: boolean;
  op: number;
  view: { s: number; tx: number; ty: number } | null;
  tool: "pan" | "marker" | "eraser";
  color: string;
  size: number;
  grid: boolean;
  showSt: boolean;
  marks: string | null;
  /**
   * A page of a PDF (SPEC §15.41): the PDF (`source`) is the stored picture; `image` is the page shown, drawn from
   * it (this browser only, drawn again where missing). `marks` are the page shown's; the other pages' are kept here.
   */
  pdf?: { source: string; page: number; pages: number; marks?: Record<string, string> };
}

/** A reference window inside a .json file: the pictures travel along as data URLs. */
export type RefWindowFile = Omit<RefWindowData, "image" | "marks" | "pdf"> & { src: string; marks: string | null; pdf?: PdfFile };

/** A PDF inside a .xbird file (SPEC §15.41): the PDF and its pages' marks as data URLs. */
export interface PdfFile {
  src: string;
  page: number;
  pages: number;
  marks?: Record<string, string>;
}

/**
 * Pictures (photos, marks, chart underlays), stored once as binary and referred to by id from the small records
 * above — so moving a window or nudging an underlay never rewrites the picture itself.
 */
export interface ImageRepository {
  put(blob: Blob): Promise<string>;
  get(id: string): Promise<Blob | null>;
  /** Removes pictures nothing refers to any more (keeps very recent ones that may not be saved yet). */
  collectGarbage(): Promise<void>;
}

export interface ReferenceRepository {
  load(patternId: string): Promise<RefWindowData[]>;
  save(patternId: string, refs: RefWindowData[]): Promise<SaveResult>;
}

/** The chart underlay per pattern (SPEC §15.15); `null` removes it. */
export interface UnderlayRepository {
  load(patternId: string): Promise<UnderlayData | null>;
  save(patternId: string, underlay: UnderlayData | null): Promise<SaveResult>;
}

/** The pattern being edited, written on every change and read at start-up. */
export interface DraftStore {
  load(): Promise<PatternFile | null>;
  save(doc: PatternFile): void;
  /** Forget it (signing out: an account's pattern doesn't stay behind). */
  clear?(): Promise<void>;
}

export interface Snapshot {
  projectId: string;
  time: number;
  reason: string;
  w: number;
  h: number;
  data: string;
  thumb: string | null;
}
export type SnapshotSummary = Omit<Snapshot, "data">;

export interface SnapshotRepository {
  add(s: Snapshot): Promise<void>;
  list(projectId: string): Promise<SnapshotSummary[]>;
  get(projectId: string, time: number): Promise<Snapshot | null>;
  removeMany(keys: [projectId: string, time: number][]): Promise<void>;
}

/**
 * Signed in: a pattern's photo windows and underlay in the account too (SPEC §15.33). Changes go up on their own;
 * these are for the moments around them.
 */
export interface PictureSync {
  /** Send the pattern's pictures and records soon (after the pattern itself reached the account). */
  push(patternId: string): void;
  /** Send everything not sent yet (signing in, back online). */
  catchUp(): Promise<void>;
  /** Fetch the account's newer records for the pattern; listeners hear when this browser's changed. */
  refresh(patternId: string): Promise<void>;
  /** Wait until changes waiting to go up have gone (or failed). */
  settle(): Promise<void>;
  /** Signing out: these patterns' windows leave this browser — only where the account surely has them. */
  forget(patternIds: string[]): Promise<void>;
  /** Called when the account's records replaced or joined this browser's. Returns unsubscribe. */
  onChange(fn: (patternId: string) => void): () => void;
  /** This browser's windows and underlay of a pattern, as they are here (nothing fetched). */
  localRecords(patternId: string): Promise<{ refs: RefWindowData[]; underlay: UnderlayData | null }>;
  /** Called when a picture didn't fit in the account's room for photos (SPEC §15.35); it stays in this browser. */
  onFull(fn: (room: { used: number; max: number }) => void): () => void;
}

export interface Persistence {
  patterns: PatternRepository;
  references: ReferenceRepository;
  underlays: UnderlayRepository;
  draft: DraftStore;
  snapshots: SnapshotRepository;
  images: ImageRepository;
  pictures?: PictureSync;
}
