import { create } from "zustand";
import type { Bone, Cube, ProjectTexture, SelectedKind } from "./modelTypes";
import type { HistoryEntry } from "./modelHistory";
import { validateModel } from "../lib/validate";
import type { ValidationIssue } from "../lib/validate";
import { createHistorySlice, type HistorySliceActions } from "./slices/historySlice";
import { createModelSlice, type ModelSliceActions } from "./slices/modelSlice";
import { createTextureSlice, type TextureSliceActions } from "./slices/textureSlice";

/** Content fields of the model, shared by every slice. */
export interface ModelData {
  name: string;
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  /** Id of the texture being edited/painted, or null. */
  activeTexture: string | null;
  /** Texture resolution in pixels (e.g. [256, 256]). */
  resolution: [number, number];
  selectedId: string | null;
  selectedKind: SelectedKind | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** True when there are unsaved edits (cleared by markSaved / importProject). */
  dirty: boolean;
  /** Live Minecraft-specific validation results for the current model. */
  issues: ValidationIssue[];
}

export interface ModelState extends ModelData, ModelSliceActions, TextureSliceActions, HistorySliceActions {}

export const useModel = create<ModelState>()((...a) => ({
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
  dirty: false,
  issues: [],
  ...createModelSlice(...a),
  ...createTextureSlice(...a),
  ...createHistorySlice(...a),
}));

// Dev-only hook for live testing / debugging in the browser
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __model?: typeof useModel }).__model = useModel;
}

// Live Minecraft constraint validation: recompute whenever model content changes.
useModel.subscribe((state) => {
  const issues = validateModel(state.cubes, state.bones, state.textures, state.resolution);
  const prev = useModel.getState().issues;
  if (
    issues.length !== prev.length ||
    issues.some((issue, i) => issue.severity !== prev[i]?.severity || issue.message !== prev[i]?.message)
  ) {
    useModel.setState({ issues });
  }
});

// Backwards-compatible surface: everyone imports model types/helpers from here.
export * from "./modelTypes";
export {
  HISTORY_BYTE_LIMIT,
  HISTORY_LIMIT,
  trimHistory,
  type HistoryEntry,
} from "./modelHistory";
export {
  boneAncestors,
  cubeTextureId,
  descendantBoneIds,
  isCubeHidden,
  selectFaceOverlay,
  selectSelectedBone,
  selectSelectedCube,
  type FaceOverlay,
} from "./modelHelpers";
