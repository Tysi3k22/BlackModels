import { create } from "zustand";

/** bbmodel marker colors used by Blockbench (index into this palette). */
export const BB_MARKER_COLORS = [
  "#A7E1F5", "#FF94B5", "#A6FF94", "#FFFF94", "#D49EE8",
  "#9AB6F5", "#FFD694", "#94FFF5", "#94B0FF", "#FF9494",
];

/** Palette used for auto-coloring newly created cubes. */
const CUBE_COLORS = ["#b7c0cc", "#8fb7e8", "#a8d8a8", "#e8cf8f", "#d8a8b8"];

export type Vec3 = [number, number, number];
export type FaceName = "north" | "east" | "south" | "west" | "up" | "down";
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
}

export interface ProjectTexture {
  /** Base64 data URL (embedded PNG). */
  source: string;
  name: string;
}

interface HistoryEntry {
  cubes: Cube[];
  selectedId: string | null;
}

interface ModelState {
  name: string;
  cubes: Cube[];
  textures: ProjectTexture[];
  /** Texture resolution in pixels (e.g. [256, 256]). */
  resolution: [number, number];
  selectedId: string | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  addCube: () => void;
  deleteSelected: () => void;
  select: (id: string | null) => void;
  /** Snapshot before a drag starts, so the whole drag is one undo step. */
  beginTransform: () => void;
  setTransform: (t: TransformUpdate) => void;
  undo: () => void;
  redo: () => void;
  /** Replace the whole model (project load / new project). */
  importProject: (data: {
    name?: string;
    cubes: Cube[];
    textures?: ProjectTexture[];
    resolution?: [number, number];
  }) => void;
}

export interface TransformUpdate {
  from: Vec3;
  to: Vec3;
  rotation?: Vec3;
}

const HISTORY_LIMIT = 100;

const snapshot = (s: { cubes: Cube[]; selectedId: string | null }): HistoryEntry => ({
  cubes: s.cubes,
  selectedId: s.selectedId,
});

const nextCubeId = (cubes: Cube[]): string => {
  const max = cubes.reduce((m, c) => {
    const n = parseInt(c.id.replace("cube-", ""), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `cube-${max + 1}`;
};

export const useModel = create<ModelState>((set, get) => ({
  name: "Untitled",
  cubes: [],
  textures: [],
  resolution: [256, 256],
  selectedId: null,
  past: [],
  future: [],

  addCube: () =>
    set((state) => {
      const id = nextCubeId(state.cubes);
      const n = parseInt(id.replace("cube-", ""), 10);
      const row = state.cubes.length;
      const cube: Cube = {
        id,
        name: `Cube ${n}`,
        from: [0, row * 16, 0],
        to: [16, row * 16 + 16, 16],
        origin: [8, row * 16 + 8, 8],
        rotation: [0, 0, 0],
        color: CUBE_COLORS[(n - 1) % CUBE_COLORS.length],
        marker: 0,
      };
      return {
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        cubes: [...state.cubes, cube],
        selectedId: id,
      };
    }),

  deleteSelected: () =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      cubes: state.cubes.filter((c) => c.id !== state.selectedId),
      selectedId: null,
    })),

  select: (selectedId) => set({ selectedId }),

  beginTransform: () =>
    set((state) => ({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  setTransform: (t) =>
    set((state) => ({
      cubes: state.cubes.map((c) =>
        c.id === state.selectedId ? { ...c, ...t } : c
      ),
    })),

  undo: () => {
    const state = get();
    const prev = state.past[state.past.length - 1];
    if (!prev) return;
    set({
      past: state.past.slice(0, -1),
      future: [...state.future, snapshot(state)],
      cubes: prev.cubes,
      selectedId: prev.selectedId,
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
      selectedId: next.selectedId,
    });
  },

  importProject: (data) =>
    set({
      past: [],
      future: [],
      name: data.name ?? "Untitled",
      cubes: data.cubes,
      textures: data.textures ?? [],
      resolution: data.resolution ?? [256, 256],
      selectedId: null,
    }),
}));

export const selectSelectedCube = (state: ModelState) =>
  state.cubes.find((c) => c.id === state.selectedId) ?? null;
