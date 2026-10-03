import type { Cube, Bone, ProjectTexture, SelectedKind, Vec3 } from "./modelTypes";

/** One undo step: the whole content of the model (arrays are shared by reference). */
export interface HistoryEntry {
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  selectedId: string | null;
  selectedKind: SelectedKind | null;
}

export const HISTORY_LIMIT = 100;
/**
 * Cap on the base64 texture data kept per undo stack. A full snapshot per paint
 * stroke would otherwise pin a PNG copy of the atlas for every stroke; this
 * trims the oldest entries once the embedded texture data exceeds the budget.
 */
export const HISTORY_BYTE_LIMIT = 64 * 1024 * 1024;

export const snapshot = (s: {
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  selectedId: string | null;
  selectedKind: SelectedKind | null;
}): HistoryEntry => ({
  cubes: s.cubes,
  bones: s.bones,
  textures: s.textures,
  selectedId: s.selectedId,
  selectedKind: s.selectedKind,
});

/** Approximate in-memory cost of one snapshot (base64 sources dominate). */
const entryBytes = (entry: HistoryEntry): number =>
  entry.textures.reduce((n, t) => n + t.source.length, 0);

/** Drop oldest entries until the stack fits the byte budget (keeps at least one). */
export function trimHistory(
  stack: HistoryEntry[],
  byteLimit = HISTORY_BYTE_LIMIT
): HistoryEntry[] {
  const next = stack.slice(-HISTORY_LIMIT);
  let bytes = next.reduce((n, e) => n + entryBytes(e), 0);
  while (next.length > 1 && bytes > byteLimit) {
    bytes -= entryBytes(next[0]);
    next.shift();
  }
  return next;
}

/** Push a snapshot onto an undo stack, bounded by entry count and bytes. */
export function pushHistory(stack: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return trimHistory([...stack, entry]);
}

const sameVec = (a: Vec3, b: Vec3): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** True when two snapshots describe the same model content. */
export function sameContent(
  a: Pick<HistoryEntry, "cubes" | "bones" | "textures">,
  b: Pick<HistoryEntry, "cubes" | "bones" | "textures">
): boolean {
  if (a.textures !== b.textures) return false;
  if (a.cubes === b.cubes && a.bones === b.bones) return true;
  return (
    JSON.stringify(a.cubes) === JSON.stringify(b.cubes) &&
    JSON.stringify(a.bones) === JSON.stringify(b.bones)
  );
}

/** True when the transform fields of two cubes/bones are identical. */
export const sameTransform = {
  cube(
    a: Pick<Cube, "from" | "to" | "origin" | "rotation">,
    b: Pick<Cube, "from" | "to" | "origin" | "rotation">
  ): boolean {
    return (
      sameVec(a.from, b.from) &&
      sameVec(a.to, b.to) &&
      sameVec(a.origin, b.origin) &&
      sameVec(a.rotation, b.rotation)
    );
  },
  bone(
    a: Pick<Bone, "origin" | "rotation">,
    b: Pick<Bone, "origin" | "rotation">
  ): boolean {
    return sameVec(a.origin, b.origin) && sameVec(a.rotation, b.rotation);
  },
};

/**
 * Snapshot pushed by beginTransform; endTransform drops it when the drag
 * changed nothing. Module-level so it survives across slice closures.
 */
let pendingTransform: HistoryEntry | null = null;

export function setPendingTransform(entry: HistoryEntry | null): void {
  pendingTransform = entry;
}

export function takePendingTransform(): HistoryEntry | null {
  const entry = pendingTransform;
  pendingTransform = null;
  return entry;
}
