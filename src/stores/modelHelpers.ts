import { boxUnwrap, cubePixelSize, findSlotForCube, toCubeFaces } from "../lib/uv";
import { FACE_NAMES, type Bone, type Cube, type CubeFaces, type Vec3 } from "./modelTypes";
import type { ModelState } from "./modelStore";

const maxIdNumber = (ids: string[], prefix: string): number =>
  ids.reduce((m, id) => {
    const n = parseInt(id.replace(prefix, ""), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);

/** Next auto-generated id number for ids shaped like `prefix-N`. */
export const nextIdNumber = (ids: string[], prefix: string): number =>
  maxIdNumber(ids, prefix) + 1;

/** All bone ids that would become invalid if `removed` (incl. itself). */
export function descendantBoneIds(bones: Bone[], removed: string): Set<string> {
  const byParent = new Map<string | null, string[]>();
  for (const b of bones) {
    const list = byParent.get(b.parentId) ?? [];
    list.push(b.id);
    byParent.set(b.parentId, list);
  }
  const out = new Set<string>([removed]);
  const queue = [removed];
  while (queue.length) {
    const cur = queue.pop() as string;
    for (const child of byParent.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return out;
}

/** Ordered list of a bone's ancestors (the bone itself first, then parents). */
export function boneAncestors(bones: Bone[], id: string | null): Bone[] {
  const byId = new Map(bones.map((b) => [b.id, b]));
  const out: Bone[] = [];
  let cur = id ? byId.get(id) ?? null : null;
  let guard = 0;
  while (cur && guard++ < 100) {
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  return out;
}

/** Most common texture id across a cube's faces (null when untextured). */
export function cubeTextureId(cube: Cube): string | null {
  const counts = new Map<string, number>();
  for (const face of FACE_NAMES) {
    const t = cube.faces?.[face]?.texture;
    if (t != null) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

/** True if the cube itself or any bone above it is hidden. */
export function isCubeHidden(cube: Cube, bones: Bone[]): boolean {
  if (cube.hidden) return true;
  return boneAncestors(bones, cube.boneId).some((b) => b.hidden);
}

/** Box-unwrapped UV faces in a free atlas slot, bound to the active texture (for new cubes). */
export function newTextureFaces(
  state: {
    activeTexture: string | null;
    resolution: [number, number];
    cubes: Cube[];
  },
  geometry: { from: Vec3; to: Vec3 }
): CubeFaces | undefined {
  if (state.activeTexture == null) return undefined;
  const [u, v] = findSlotForCube(geometry, state.cubes, state.resolution);
  return toCubeFaces(boxUnwrap(cubePixelSize(geometry), u, v), state.activeTexture);
}

export const selectSelectedCube = (state: ModelState) =>
  state.selectedKind === "cube"
    ? state.cubes.find((c) => c.id === state.selectedId) ?? null
    : null;

export const selectSelectedBone = (state: ModelState) =>
  state.selectedKind === "bone"
    ? state.bones.find((b) => b.id === state.selectedId) ?? null
    : null;

/** Describe the painted-face overlay for the texture editor's 2D canvas. */
export interface FaceOverlay {
  kind: "cube" | "model";
  id?: string;
  name: string;
  faces: CubeFaces;
  resolution: [number, number];
}

/** Show the selected cube's faces (or all faces when nothing is selected) as editor-colored wireframes. */
// NOTE: zustand selectors must return a stable reference — the result is
// cached per state object, otherwise React loops on getSnapshot.
let overlayCache: { state: ModelState; result: FaceOverlay | null } | null = null;
export const selectFaceOverlay = (state: ModelState): FaceOverlay | null => {
  if (overlayCache?.state === state) return overlayCache.result;
  let result: FaceOverlay | null;
  if (state.activeTexture == null) {
    result = null;
  } else if (state.selectedKind === "cube" && state.selectedId) {
    const cube = state.cubes.find((c) => c.id === state.selectedId);
    result = cube
      ? { kind: "cube", id: cube.id, name: cube.name, faces: cube.faces ?? {}, resolution: state.resolution }
      : null;
  } else {
    result = {
      kind: "model",
      name: state.name,
      faces: state.cubes.reduce((acc, c) => {
        for (const face of FACE_NAMES) if (c.faces?.[face]) acc[face] = c.faces![face]!;
        return acc;
      }, {} as CubeFaces),
      resolution: state.resolution,
    };
  }
  overlayCache = { state, result };
  return result;
};
