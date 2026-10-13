import { create } from "zustand";
import type { Bone, Cube, ProjectTexture, SelectedKind } from "./modelTypes";
import type { HistoryEntry } from "./modelHistory";
import { validateModel } from "../lib/validate";
import type { ValidationIssue } from "../lib/validate";
import { createHistorySlice, type HistorySliceActions } from "./slices/historySlice";
import { createModelSlice, type ModelSliceActions } from "./slices/modelSlice";
import { createTextureSlice, type TextureSliceActions } from "./slices/textureSlice";
import { createAnimationSlice, type AnimationSliceState, type AnimationSliceActions } from "./slices/animationSlice";

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
  /** Live validation results for the current model (import sanity, format, atlas). */
  issues: ValidationIssue[];
  /** Metadata carried through import/export (format version, bbmodel model_format, etc.). */
  meta?: Record<string, unknown>;
  /** Last field-level transform errors, shown in the selected-details panel. */
  transformErrors: string[] | null;
}

export interface ModelState extends ModelData, ModelSliceActions, TextureSliceActions, HistorySliceActions, AnimationSliceState, AnimationSliceActions {}

export const useModel = create<ModelState>()((set, get, api) => ({
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
  meta: undefined,
  transformErrors: null,
  ...createAnimationSlice(set, get, api),
  ...createModelSlice(set, get, api),
  ...createTextureSlice(set, get, api),
  ...createHistorySlice(set, get, api),
}));

// Dev-only hook for live testing / debugging in the browser
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __model?: typeof useModel }).__model = useModel;
}

// Live Minecraft constraint validation: recompute only when model content changes.
useModel.subscribe((state, prev) => {
  if (
    state.cubes === prev.cubes &&
    state.bones === prev.bones &&
    state.textures === prev.textures &&
    state.resolution === prev.resolution
  ) {
    return;
  }
  const issues = validateModel(state.cubes, state.bones, state.textures, state.resolution);
  const prevIssues = state.issues;
  if (
    issues.length !== prevIssues.length ||
    issues.some((issue, i) => issue.severity !== prevIssues[i]?.severity || issue.message !== prevIssues[i]?.message)
  ) {
    useModel.setState({ issues });
  }
});

// Live transform-error banner: clear when errors disappear safely.
useModel.subscribe((state) => {
  if (state.transformErrors && state.transformErrors.length === 0) {
    useModel.setState({ transformErrors: null });
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