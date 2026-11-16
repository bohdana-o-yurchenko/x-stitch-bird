import type { PatternFile } from "@/core/formats/json/serialize";
import type { UnderlayData } from "@/core/underlay/underlay";

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
}

export type SaveResult = { ok: true } | { ok: false; reason: "quota" | "conflict" | "error" };

export interface PatternRepository {
  list(): Promise<PatternSummary[]>;
  load(id: string): Promise<PatternFile | null>;
  save(doc: PatternFile): Promise<SaveResult>;
  remove(id: string): Promise<void>;
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
}

/** A reference window inside a .json file: the pictures travel along as data URLs. */
export type RefWindowFile = Omit<RefWindowData, "image" | "marks"> & { src: string; marks: string | null };

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

export interface Persistence {
  patterns: PatternRepository;
  references: ReferenceRepository;
  underlays: UnderlayRepository;
  draft: DraftStore;
  snapshots: SnapshotRepository;
  images: ImageRepository;
}
