import type { StateCreator } from "zustand";
import { clearTextureCache } from "../../lib/textureCache";
import {
  pushHistory,
  sameContent,
  setPendingTransform,
  snapshot,
  takePendingTransform,
  trimHistory,
} from "../modelHistory";
import { newTextureId, type ProjectImport, type ProjectTexture } from "../modelTypes";
import type { ModelState } from "../modelStore";

export interface HistorySliceActions {
  /** Snapshot before a drag starts, so the whole drag is one undo step. */
  beginTransform: () => void;
  /** Drop the snapshot when the drag changed nothing (no empty undo steps). */
  endTransform: () => void;
  undo: () => void;
  redo: () => void;
  /** Clear the dirty flag after a successful save. */
  markSaved: () => void;
  /** Mark the model as edited (used when restoring an autosave). */
  markDirty: () => void;
  /** Replace the whole model (project load / new project). */
  importProject: (data: ProjectImport & { meta?: Record<string, unknown> }) => void;
}

export const createHistorySlice: StateCreator<ModelState, [], [], HistorySliceActions> = (set, get) => ({
  beginTransform: () =>
    set((state) => {
      const entry = snapshot(state);
      setPendingTransform(entry);
      return {
        past: pushHistory(state.past, entry),
        future: [],
      };
    }),

  endTransform: () =>
    set((state) => {
      const entry = takePendingTransform();
      if (!entry) return {};
      // Only drop the snapshot this drag pushed, and only if nothing changed.
      if (state.past[state.past.length - 1] !== entry) return {};
      if (!sameContent(state, entry)) return {};
      return { past: state.past.slice(0, -1) };
    }),

  undo: () => {
    const state = get();
    const prev = state.past[state.past.length - 1];
    if (!prev) return;
    setPendingTransform(null);
    set({
      past: state.past.slice(0, -1),
      future: trimHistory([...state.future, snapshot(state)]),
      dirty: true,
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
    setPendingTransform(null);
    set({
      future: state.future.slice(0, -1),
      past: pushHistory(state.past, snapshot(state)),
      dirty: true,
      cubes: next.cubes,
      bones: next.bones,
      textures: next.textures,
      selectedId: next.selectedId,
      selectedKind: next.selectedKind,
    });
  },

  markSaved: () => set({ dirty: false }),

  markDirty: () => set({ dirty: true }),

  importProject: (data) => {
    // A new project replaces every texture; drop the old THREE.Textures first
    // so a loaded model never keeps the previous model's GPU memory alive.
    clearTextureCache();
    setPendingTransform(null);
    const textures: ProjectTexture[] = (data.textures ?? []).map((t) => ({
      id: t.id ?? newTextureId(),
      source: t.source,
      name: t.name,
      ...(t.material ? { material: t.material } : {}),
    }));
    set({
      past: [],
      future: [],
      dirty: false,
      name: data.name ?? "Untitled",
      cubes: data.cubes,
      bones: data.bones ?? [],
      textures,
      activeTexture: textures[0]?.id ?? null,
      resolution: data.resolution ?? [256, 256],
      meta: data.meta,
      selectedId: null,
      selectedKind: null,
    });
  },
});
