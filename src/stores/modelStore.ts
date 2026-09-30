import { create } from "zustand";

const CUBE_COLORS = ["#b7c0cc", "#8fb7e8", "#a8d8a8", "#e8cf8f", "#d8a8b8"];

export interface Cube {
  id: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  // Euler rotation in radians (XYZ order)
  rotation: [number, number, number];
  color: string;
}

export interface TransformUpdate {
  from: [number, number, number];
  to: [number, number, number];
  rotation: [number, number, number];
}

interface HistoryEntry {
  cubes: Cube[];
  selectedId: string | null;
}

const HISTORY_LIMIT = 100;

interface ModelState {
  cubes: Cube[];
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
}

const snapshot = (s: { cubes: Cube[]; selectedId: string | null }): HistoryEntry => ({
  cubes: s.cubes,
  selectedId: s.selectedId,
});

export const useModel = create<ModelState>((set, get) => ({
  cubes: [],

  selectedId: null,

  past: [],
  future: [],

  addCube: () =>
    set((state) => {
      const cubeCounter =
        state.cubes.reduce((max, c) => {
          const n = parseInt(c.id.replace("cube-", ""), 10);
          return Number.isNaN(n) ? max : Math.max(max, n);
        }, 0) + 1;
      const id = `cube-${cubeCounter}`;
      const row = state.cubes.length;
      const cube: Cube = {
        id,
        name: `Cube ${cubeCounter}`,
        from: [0, row * 16, 0],
        to: [16, row * 16 + 16, 16],
        rotation: [0, 0, 0],
        color: CUBE_COLORS[cubeCounter % CUBE_COLORS.length],
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
}));

export const selectSelectedCube = (state: ModelState) =>
  state.cubes.find((c) => c.id === state.selectedId) ?? null;
