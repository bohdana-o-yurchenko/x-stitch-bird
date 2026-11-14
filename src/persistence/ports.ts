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
}

export type SaveResult = { ok: true } | { ok: false; reason: "quota" | "conflict" | "error" };

export interface PatternRepository {
  list(): Promise<PatternSummary[]>;
  load(id: string): Promise<PatternFile | null>;
  save(doc: PatternFile): Promise<SaveResult>;
  remove(id: string): Promise<void>;
}

/** Serialized reference window (SPEC §11.1); `src` and `marks` are data URLs. */
export interface RefWindowData {
  id: string;
  name: string;
  src: string;
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
  load(): PatternFile | null;
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
}
