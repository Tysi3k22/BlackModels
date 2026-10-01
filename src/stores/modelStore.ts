import { create } from "zustand";
import {
  blockSize,
  boxUnwrap,
  clampUV,
  cubePixelSize,
  findSlotForCube,
  gridFromCubes,
  packCubes,
  toCubeFaces,
} from "../lib/uv";

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
  /** false = no directional lighting on this cube (bbmodel `shade`); default true. */
  shade?: boolean;
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

/** How a texture is lit/blended (mirrors bbmodel texture `render_mode`). */
export type RenderMode = "default" | "emissive" | "additive" | "layered";
/** Which sides of a face show the texture (bbmodel `render_sides`). */
export type RenderSides = "auto" | "front" | "double";

export interface TextureMaterial {
  renderMode: RenderMode;
  sides: RenderSides;
}

export const DEFAULT_MATERIAL: TextureMaterial = { renderMode: "default", sides: "auto" };

export interface ProjectTexture {
  /** Base64 data URL (embedded PNG). */
  source: string;
  name: string;
  /** Material settings; missing = defaults. */
  material?: TextureMaterial;
}

/** Material of a texture with defaults filled in. */
export function textureMaterial(t: ProjectTexture | null | undefined): TextureMaterial {
  return { ...DEFAULT_MATERIAL, ...(t?.material ?? {}) };
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

/** Outcome of an auto-UV run (for UI feedback). */
export interface AutoUVResult {
  /** Cubes that were unwrapped. */
  count: number;
  /** Cubes that did not fit in the atlas and were left overlapping at (0, 0). */
  overflow: number;
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
  /** Change a texture's material settings (one undo step). */
  setTextureMaterial: (index: number, patch: Partial<TextureMaterial>) => void;
  /** Turn directional lighting on/off for one cube (one undo step). */
  setCubeShade: (cubeId: string, shade: boolean) => void;
  /** Which texture painting tools edit. */
  setActiveTexture: (index: number | null) => void;
  /** Write painted pixels into the active texture and update face UVs. */
  commitTexturePixels: (dataUrl: string, updates: TextureUpdates) => void;
  /**
   * Set one face's UV rect (clamped to the atlas, whole pixels). Pass `record`
   * for one-shot edits (typed values); drags call `beginTransform` first instead.
   */
  setFaceUV: (cubeId: string, face: FaceName, uv: FaceUV, record?: boolean) => void;
  /**
   * Box-unwrap cubes into free atlas space. "selected" re-unwraps the selected
   * cube; "all" repacks every cube on the active texture (plus untextured ones).
   */
  autoUV: (scope: "selected" | "all") => AutoUVResult;
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
      const from: Vec3 = [0, row, 0];
      const to: Vec3 = [1, row + 1, 1];
      const cube: Cube = {
        id,
        name: `Cube ${n}`,
        from,
        to,
        origin: [0.5, row + 0.5, 0.5],
        rotation: [0, 0, 0],
        color: CUBE_COLORS[(n - 1) % CUBE_COLORS.length],
        marker: 0,
        boneId: state.selectedKind === "bone" ? state.selectedId : null,
        faces: newTextureFaces(state, { from, to }),
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
    set((state) => {
      const kind: SelectedKind | null = selectedId ? (selectedKind ?? "cube") : null;
      // Picking a cube also focuses the texture file that cube is painted
      // with, so the texture editor shows the whole right atlas.
      if (kind === "cube" && selectedId) {
        const cube = state.cubes.find((c) => c.id === selectedId);
        const texIdx = cube ? cubeTextureIndex(cube) : null;
        if (texIdx != null && state.textures[texIdx]) {
          return { selectedId, selectedKind: kind, activeTexture: texIdx };
        }
      }
      return { selectedId, selectedKind: kind };
    }),

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

  setTextureMaterial: (index, patch) =>
    set((state) => {
      const tex = state.textures[index];
      if (!tex) return {};
      const cur = textureMaterial(tex);
      const next: TextureMaterial = { ...cur, ...patch };
      if (next.renderMode === cur.renderMode && next.sides === cur.sides) return {};
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        textures: state.textures.map((t, i) => (i === index ? { ...t, material: next } : t)),
      };
    }),

  setCubeShade: (cubeId, shade) =>
    set((state) => {
      const cube = state.cubes.find((c) => c.id === cubeId);
      if (!cube || (cube.shade !== false) === shade) return {};
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        // shade defaults to true, so only the "off" state is stored
        cubes: state.cubes.map((c) =>
          c.id === cubeId ? { ...c, shade: shade ? undefined : false } : c
        ),
      };
    }),

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

  setFaceUV: (cubeId, face, uv, record = false) =>
    set((state) => {
      const cube = state.cubes.find((c) => c.id === cubeId);
      if (!cube) return {};
      const next = clampUV(uv, state.resolution);
      const prev = cube.faces?.[face];
      if (
        prev &&
        prev.uv[0] === next[0] &&
        prev.uv[1] === next[1] &&
        prev.uv[2] === next[2] &&
        prev.uv[3] === next[3]
      ) {
        return {};
      }
      const faces: CubeFaces = {
        ...(cube.faces ?? {}),
        [face]: { uv: next, texture: prev?.texture ?? state.activeTexture },
      };
      return {
        ...(record
          ? { past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT), future: [] }
          : {}),
        cubes: state.cubes.map((c) => (c.id === cubeId ? { ...c, faces } : c)),
      };
    }),

  autoUV: (scope) => {
    const result: AutoUVResult = { count: 0, overflow: 0 };
    set((state) => {
      const tex = state.activeTexture;
      const res = state.resolution;
      let updated = new Map<string, Required<CubeFaces>>();

      if (scope === "selected") {
        const cube =
          state.selectedKind === "cube" ? state.cubes.find((c) => c.id === state.selectedId) : null;
        if (!cube) return {};
        const others = state.cubes.filter((c) => c.id !== cube.id);
        const size = cubePixelSize(cube);
        const slot = gridFromCubes(others, res).findSlot(...blockSize(size));
        const [u, v] = slot ?? [0, 0];
        if (!slot) result.overflow = 1;
        updated.set(cube.id, toCubeFaces(boxUnwrap(size, u, v), cubeTextureIndex(cube) ?? tex));
      } else {
        // Only cubes living on the active texture (or not textured yet) share its atlas.
        const targets = state.cubes.filter((c) => {
          const t = cubeTextureIndex(c);
          return t == null || t === tex;
        });
        if (targets.length === 0) return {};
        const packed = packCubes(targets, res, tex);
        updated = packed.placed;
        result.overflow = packed.overflow.length;
      }

      result.count = updated.size;
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        cubes: state.cubes.map((c) => {
          const faces = updated.get(c.id);
          return faces ? { ...c, faces } : c;
        }),
      };
    });
    return result;
  },

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

/** Most common texture index across a cube's faces (null when untextured). */
export function cubeTextureIndex(cube: Cube): number | null {
  const counts = new Map<number, number>();
  for (const face of FACE_NAMES) {
    const t = cube.faces?.[face]?.texture;
    if (t != null) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [idx, count] of counts) {
    if (count > bestCount) {
      best = idx;
      bestCount = count;
    }
  }
  return best;
}

/** Box-unwrapped UV faces in a free atlas slot, bound to the active texture (for new cubes). */
function newTextureFaces(
  state: {
    activeTexture: number | null;
    resolution: [number, number];
    cubes: Cube[];
  },
  geometry: { from: Vec3; to: Vec3 }
): CubeFaces | undefined {
  if (state.activeTexture == null) return undefined;
  const [u, v] = findSlotForCube(geometry, state.cubes, state.resolution);
  return toCubeFaces(boxUnwrap(cubePixelSize(geometry), u, v), state.activeTexture);
}

/** True if the cube itself or any bone above it is hidden. */
export function isCubeHidden(cube: Cube, bones: Bone[]): boolean {
  if (cube.hidden) return true;
  return boneAncestors(bones, cube.boneId).some((b) => b.hidden);
}
