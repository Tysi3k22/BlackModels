import { create } from "zustand";

/** bbmodel marker colors used by Blockbench (index into this palette). */
export const BB_MARKER_COLORS = [
  "#A7E1F5", "#FF94B5", "#A6FF94", "#FFFF94", "#D49EE8",
  "#9AB6F5", "#FFD694", "#94FFF5", "#94B0FF", "#FF9494",
];

/** Palette used for auto-coloring newly created cubes. */
const CUBE_COLORS = ["#b7c0cc", "#8fb7e8", "#a8d8a8", "#e8cf8f", "#d8a8b8"];
const BONE_COLORS = ["#e8b968", "#b9a0e8", "#68d4b9", "#e87979", "#79b1e8"];

export type Vec3 = [number, number, number];
export type FaceName = "north" | "east" | "south" | "west" | "up" | "down";

/** All faces in canonical order. */
export const FACE_NAMES: FaceName[] = ["north", "east", "south", "west", "up", "down"];

/** Outward normal of each cube face (Minecraft convention). */
export const FACE_DIRS: Record<FaceName, Vec3> = {
  north: [0, 0, -1],
  east: [1, 0, 0],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};
export type FaceUV = [number, number, number, number];

export interface CubeFaces {
  north?: { uv: FaceUV; texture?: number | null };
  east?: { uv: FaceUV; texture?: number | null };
  south?: { uv: FaceUV; texture?: number | null };
  west?: { uv: FaceUV; texture?: number | null };
  up?: { uv: FaceUV; texture?: number | null };
  down?: { uv: FaceUV; texture?: number | null };
}

export interface Cube {
  id: string;
  name: string;
  /** Minecraft convention: Y-up, sizes in "pixels" (1 block = 16 units). */
  from: Vec3;
  to: Vec3;
  /** Pivot point (bbmodel `origin`), also the rotation center. */
  origin: Vec3;
  /** Rotation in degrees around origin (bbmodel stores degrees, XYZ order). */
  rotation: Vec3;
  /** Blockbench inflate: expands the cube by this amount on every side. */
  inflate?: number;
  faces?: CubeFaces;
  /** Marker color index (bbmodel `color`). */
  marker?: number;
  color: string;
  /** Parent bone id, or null for model root. */
  boneId: string | null;
  /** When true the cube is not drawn in the viewport. */
  hidden?: boolean;
}

/** A bone (bbmodel outliner group): a named pivot that cubes and other bones attach to. */
export interface Bone {
  id: string;
  name: string;
  /** Pivot point in model space (bbmodel `origin`). */
  origin: Vec3;
  /** Rotation in degrees around origin (XYZ order). */
  rotation: Vec3;
  /** Parent bone id, or null for model root. */
  parentId: string | null;
  /** Marker color index (bbmodel `color`). */
  marker?: number;
  color: string;
  /** When true the bone and everything under it is not drawn. */
  hidden?: boolean;
}

export interface ProjectTexture {
  /** Base64 data URL (embedded PNG). */
  source: string;
  name: string;
}

export type SelectedKind = "cube" | "bone";

interface HistoryEntry {
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  selectedId: string | null;
  selectedKind: SelectedKind | null;
}

/** One face's UV after a paint stroke. */
export interface FaceUVUpdate {
  face: FaceName;
  uv: FaceUV;
}

/** Result of committing a paint stroke: new texture data + per-cube UV updates. */
export interface TextureUpdates {
  /** Per-cube UV rect updates (cubeId missing = applies to every cube with a face on that side). */
  faces: (FaceUVUpdate & { cubeId?: string })[];
}

export interface TransformUpdate {
  from: Vec3;
  to: Vec3;
  rotation?: Vec3;
  /** New pivot position (move the pivot together with the cube). */
  origin?: Vec3;
}

export interface BoneTransformUpdate {
  origin: Vec3;
  rotation: Vec3;
}

interface ModelState {
  name: string;
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  /** Index into `textures` of the one being edited/painted. */
  activeTexture: number | null;
  /** Texture resolution in pixels (e.g. [256, 256]). */
  resolution: [number, number];
  selectedId: string | null;
  selectedKind: SelectedKind | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  addCube: () => void;
  addBone: (parentId?: string | null) => void;
  deleteSelected: () => void;
  select: (id: string | null, kind?: SelectedKind | null) => void;
  /** Add an imported texture (base64 data URL) and make it active. */
  addTexture: (t: ProjectTexture) => void;
  /** Remove a texture; faces referencing it fall back to untextured. */
  removeTexture: (index: number) => void;
  /** Create a blank texture (optionally with a custom resolution). */
  createTexture: (name: string, res?: [number, number]) => void;
  /** Which texture painting tools edit. */
  setActiveTexture: (index: number | null) => void;
  /** Write painted pixels into the active texture and update face UVs. */
  commitTexturePixels: (dataUrl: string, updates: TextureUpdates) => void;
  /** Snapshot before a drag starts, so the whole drag is one undo step. */
  beginTransform: () => void;
  setTransform: (t: TransformUpdate) => void;
  setBoneTransform: (t: BoneTransformUpdate) => void;
  setCubeParent: (cubeId: string, boneId: string | null) => void;
  setBoneParent: (boneId: string, parentId: string | null) => void;
  /** Show/hide one cube or bone (a hidden bone hides its whole subtree). */
  toggleHidden: (id: string, kind: SelectedKind) => void;
  /** Make every cube and bone visible again. */
  showAll: () => void;
  undo: () => void;
  redo: () => void;
  /** Replace the whole model (project load / new project). */
  importProject: (data: {
    name?: string;
    cubes: Cube[];
    bones?: Bone[];
    textures?: ProjectTexture[];
    resolution?: [number, number];
  }) => void;
}

const HISTORY_LIMIT = 100;

const snapshot = (s: {
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

const maxIdNumber = (ids: string[], prefix: string): number =>
  ids.reduce((m, id) => {
    const n = parseInt(id.replace(prefix, ""), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);

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

export const useModel = create<ModelState>((set, get) => ({
  name: "Untitled",
  cubes: [],
  bones: [],
  textures: [],
  activeTexture: null,
  resolution: [256, 256],
  selectedId: null,
  selectedKind: null,
  past: [],
  future: [],

  addCube: () =>
    set((state) => {
      const n = maxIdNumber(state.cubes.map((c) => c.id), "cube-") + 1;
      const id = `cube-${n}`;
      const row = 0;
      const cube: Cube = {
        id,
        name: `Cube ${n}`,
        from: [0, row * 16, 0],
        to: [16, row * 16 + 16, 16],
        origin: [8, row * 16 + 8, 8],
        rotation: [0, 0, 0],
        color: CUBE_COLORS[(n - 1) % CUBE_COLORS.length],
        marker: 0,
        boneId: state.selectedKind === "bone" ? state.selectedId : null,
        faces: newTextureFaces(state),
      };
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        cubes: [...state.cubes, cube],
        selectedId: id,
        selectedKind: "cube" as const,
      };
    }),

  addBone: (parentId) =>
    set((state) => {
      const n = maxIdNumber(state.bones.map((b) => b.id), "bone-") + 1;
      const id = `bone-${n}`;
      // New bone pivots at the parent's origin (or model origin) so it starts
      // as a clean joint; the pivot can then be moved with the gizmo.
      const parent = state.bones.find((b) => b.id === (parentId ?? state.selectedId));
      const origin: Vec3 = parent ? [...parent.origin] : [0, 0, 0];
      const bone: Bone = {
        id,
        name: `Bone ${n}`,
        origin,
        rotation: [0, 0, 0],
        parentId: parent ? parent.id : null,
        marker: n % BB_MARKER_COLORS.length,
        color: BONE_COLORS[(n - 1) % BONE_COLORS.length],
      };
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        bones: [...state.bones, bone],
        selectedId: id,
        selectedKind: "bone" as const,
      };
    }),

  deleteSelected: () =>
    set((state) => {
      if (!state.selectedId) return {};
      if (state.selectedKind === "bone") {
        const gone = descendantBoneIds(state.bones, state.selectedId);
        return {
          past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
          future: [],
          bones: state.bones.filter((b) => !gone.has(b.id)),
          // Cubes under removed bones fall back to the model root
          cubes: state.cubes.map((c) =>
            c.boneId && gone.has(c.boneId) ? { ...c, boneId: null } : c
          ),
          selectedId: null,
          selectedKind: null,
        };
      }
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        cubes: state.cubes.filter((c) => c.id !== state.selectedId),
        selectedId: null,
        selectedKind: null,
      };
    }),

  select: (selectedId, selectedKind) =>
    set({ selectedId, selectedKind: selectedId ? (selectedKind ?? "cube") : null }),

  addTexture: (t) =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      textures: [...state.textures, t],
      activeTexture: state.textures.length,
    })),

  removeTexture: (index) =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      textures: state.textures.filter((_, i) => i !== index),
      activeTexture:
        state.activeTexture == null
          ? null
          : state.activeTexture === index
            ? null
            : state.activeTexture > index
              ? state.activeTexture - 1
              : state.activeTexture,
    })),

  createTexture: (name, res) =>
    set((state) => {
      const [w, h] = res ?? state.resolution;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        textures: [...state.textures, { name, source: canvas.toDataURL("image/png") }],
        activeTexture: state.textures.length,
      };
    }),

  setActiveTexture: (activeTexture) => set({ activeTexture }),

  commitTexturePixels: (dataUrl, updates) =>
    set((state) => {
      const idx = state.activeTexture;
      if (idx == null || !state.textures[idx]) return {};
      const textures = state.textures.map((t, i) => (i === idx ? { ...t, source: dataUrl } : t));
      // Global updates (no cubeId) vs per-cube updates
      const globalByFace = new Map<FaceName, FaceUV>();
      const perCube = new Map<string, Map<FaceName, FaceUV>>();
      for (const u of updates.faces) {
        if (u.cubeId) {
          const m = perCube.get(u.cubeId) ?? new Map<FaceName, FaceUV>();
          m.set(u.face, u.uv);
          perCube.set(u.cubeId, m);
        } else {
          globalByFace.set(u.face, u.uv);
        }
      }
      const cubes = state.cubes.map((c) => {
        const own = perCube.get(c.id);
        if (!own && globalByFace.size === 0) return c;
        let changed = false;
        const faces: CubeFaces = { ...(c.faces ?? {}) };
        for (const face of FACE_NAMES) {
          const targeted = own?.get(face) ?? globalByFace.get(face);
          if (!targeted) continue;
          if (
            !faces[face] ||
            faces[face]!.uv[0] !== targeted[0] ||
            faces[face]!.uv[1] !== targeted[1] ||
            faces[face]!.uv[2] !== targeted[2] ||
            faces[face]!.uv[3] !== targeted[3]
          ) {
            faces[face] = { uv: [...targeted] as FaceUV, texture: idx };
            changed = true;
          }
        }
        return changed ? { ...c, faces } : c;
      });
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        textures,
        cubes,
      };
    }),

  beginTransform: () =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  setTransform: (t) =>
    set((state) => ({
      cubes: state.cubes.map((c) => {
        if (c.id !== state.selectedId || state.selectedKind !== "cube") return c;
        return { ...c, ...t, origin: t.origin ?? c.origin };
      }),
    })),

  setBoneTransform: (t) =>
    set((state) => ({
      bones: state.bones.map((b) =>
        b.id === state.selectedId && state.selectedKind === "bone" ? { ...b, ...t } : b
      ),
    })),

  setCubeParent: (cubeId, boneId) =>
    set((state) => {
      const cube = state.cubes.find((c) => c.id === cubeId);
      if (!cube || cube.boneId === boneId) return {};
      if (boneId && !state.bones.some((b) => b.id === boneId)) return {};
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        cubes: state.cubes.map((c) => (c.id === cubeId ? { ...c, boneId } : c)),
      };
    }),

  setBoneParent: (boneId, parentId) =>
    set((state) => {
      if (boneId === parentId) return {};
      if (parentId && !state.bones.some((b) => b.id === parentId)) return {};
      // Reject cycles: parentId must not be a descendant of boneId
      if (parentId && descendantBoneIds(state.bones, boneId).has(parentId)) return {};
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        bones: state.bones.map((b) => (b.id === boneId ? { ...b, parentId } : b)),
      };
    }),

  toggleHidden: (id, kind) =>
    set((state) =>
      kind === "bone"
        ? { bones: state.bones.map((b) => (b.id === id ? { ...b, hidden: !b.hidden } : b)) }
        : { cubes: state.cubes.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)) }
    ),

  showAll: () =>
    set((state) => ({
      bones: state.bones.map((b) => (b.hidden ? { ...b, hidden: false } : b)),
      cubes: state.cubes.map((c) => (c.hidden ? { ...c, hidden: false } : c)),
    })),

  undo: () => {
    const state = get();
    const prev = state.past[state.past.length - 1];
    if (!prev) return;
    set({
      past: state.past.slice(0, -1),
      future: [...state.future, snapshot(state)],
      cubes: prev.cubes,
      bones: prev.bones,
      textures: prev.textures,
      selectedId: prev.selectedId,
      selectedKind: prev.selectedKind,
    });
  },

  redo: () => {
    const state = get();
    const next = state.future[state.future.length - 1];
    if (!next) return;
    set({
      future: state.future.slice(0, -1),
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      cubes: next.cubes,
      bones: next.bones,
      textures: next.textures,
      selectedId: next.selectedId,
      selectedKind: next.selectedKind,
    });
  },

  importProject: (data) =>
    set({
      past: [],
      future: [],
      name: data.name ?? "Untitled",
      cubes: data.cubes,
      bones: data.bones ?? [],
      textures: data.textures ?? [],
      activeTexture: (data.textures ?? []).length > 0 ? 0 : null,
      resolution: data.resolution ?? [256, 256],
      selectedId: null,
      selectedKind: null,
    }),
}));

export const selectSelectedCube = (state: ModelState) =>
  state.selectedKind === "cube"
    ? state.cubes.find((c) => c.id === state.selectedId) ?? null
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

// Dev-only hook for live testing / debugging in the browser
if (import.meta.env.DEV) {
  (window as unknown as { __model?: typeof useModel }).__model = useModel;
}

export const selectSelectedBone = (state: ModelState) =>
  state.selectedKind === "bone"
    ? state.bones.find((b) => b.id === state.selectedId) ?? null
    : null;

/** Ordered list of a bone's ancestors (immediate parent first). */
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

/** Blank per-face UV slots bound to the active texture (for new cubes). */
function newTextureFaces(state: {
  activeTexture: number | null;
  resolution: [number, number];
}): CubeFaces | undefined {
  if (state.activeTexture == null) return undefined;
  const [w, h] = state.resolution;
  return {
    north: { uv: [0, 0, w, h], texture: state.activeTexture },
    east: { uv: [0, 0, w, h], texture: state.activeTexture },
    south: { uv: [0, 0, w, h], texture: state.activeTexture },
    west: { uv: [0, 0, w, h], texture: state.activeTexture },
    up: { uv: [0, 0, w, h], texture: state.activeTexture },
    down: { uv: [0, 0, w, h], texture: state.activeTexture },
  };
}

/** True if the cube itself or any bone above it is hidden. */
export function isCubeHidden(cube: Cube, bones: Bone[]): boolean {
  if (cube.hidden) return true;
  return boneAncestors(bones, cube.boneId).some((b) => b.hidden);
}
