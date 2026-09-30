import { create } from "zustand";

export interface Cube {
  id: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}

interface ModelState {
  cubes: Cube[];
  selectedId: string | null;
  addCube: () => void;
  deleteSelected: () => void;
  select: (id: string | null) => void;
}

const CUBE_COLORS = ["#b7c0cc", "#8fb7e8", "#a8d8a8", "#e8cf8f", "#d8a8b8"];

let cubeCounter = 0;

export const useModel = create<ModelState>((set) => ({
  cubes: [],

  selectedId: null,

  addCube: () =>
    set((state) => {
      cubeCounter += 1;
      const id = `cube-${cubeCounter}`;
      const row = state.cubes.length;
      const cube: Cube = {
        id,
        name: `Cube ${cubeCounter}`,
        from: [0, row * 16, 0],
        to: [16, row * 16 + 16, 16],
        color: CUBE_COLORS[cubeCounter % CUBE_COLORS.length],
      };
      return { cubes: [...state.cubes, cube], selectedId: id };
    }),

  deleteSelected: () =>
    set((state) => ({
      cubes: state.cubes.filter((c) => c.id !== state.selectedId),
      selectedId: null,
    })),

  select: (selectedId) => set({ selectedId }),
}));

export const selectSelectedCube = (state: ModelState) =>
  state.cubes.find((c) => c.id === state.selectedId) ?? null;
