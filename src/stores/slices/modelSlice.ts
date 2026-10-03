import type { StateCreator } from "zustand";
import type { ModelState } from "../modelStore";
import { cubeTextureId, descendantBoneIds, newTextureFaces, nextIdNumber } from "../modelHelpers";
import { pushHistory, sameTransform, snapshot } from "../modelHistory";
import {
  BB_MARKER_COLORS,
  type Bone,
  type BoneTransformUpdate,
  type Cube,
  type SelectedKind,
  type TransformUpdate,
  type Vec3,
} from "../modelTypes";

/** Palette used for auto-coloring newly created cubes. */
const CUBE_COLORS = ["#b7c0cc", "#8fb7e8", "#a8d8a8", "#e8cf8f", "#d8a8b8"];
const BONE_COLORS = ["#e8b968", "#b9a0e8", "#68d4b9", "#e87979", "#79b1e8"];

export interface ModelSliceActions {
  addCube: () => void;
  addBone: (parentId?: string | null) => void;
  deleteSelected: () => void;
  select: (id: string | null, kind?: SelectedKind | null) => void;
  /** Turn directional lighting on/off for one cube (one undo step). */
  setCubeShade: (cubeId: string, shade: boolean) => void;
  setTransform: (t: TransformUpdate) => void;
  setBoneTransform: (t: BoneTransformUpdate) => void;
  commitTransform: (t: TransformUpdate, errors: string[]) => void;
  commitBoneTransform: (t: BoneTransformUpdate, errors: string[]) => void;
  setCubeParent: (cubeId: string, boneId: string | null) => void;
  setBoneParent: (boneId: string, parentId: string | null) => void;
  renameSelected: (name: string) => void;
  /** Show/hide one cube or bone (a hidden bone hides its whole subtree). */
  toggleHidden: (id: string, kind: SelectedKind) => void;
  /** Make every cube and bone visible again. */
  showAll: () => void;
}

export const createModelSlice: StateCreator<ModelState, [], [], ModelSliceActions> = (set) => ({
  addCube: () =>
    set((state) => {
      const n = nextIdNumber(state.cubes.map((c) => c.id), "cube-");
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
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        cubes: [...state.cubes, cube],
        selectedId: id,
        selectedKind: "cube" as const,
      };
    }),

  addBone: (parentId) =>
    set((state) => {
      const n = nextIdNumber(state.bones.map((b) => b.id), "bone-");
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
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
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
          past: pushHistory(state.past, snapshot(state)),
          future: [],
          dirty: true,
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
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        cubes: state.cubes.filter((c) => c.id !== state.selectedId),
        selectedId: null,
        selectedKind: null,
      };
    }),

  renameSelected: (name: string) =>
    set((state) => {
      if (!state.selectedId) return {};
      const isCube = state.selectedKind === "cube";
      const current =
        isCube
          ? state.cubes.find((c) => c.id === state.selectedId)
          : state.bones.find((b) => b.id === state.selectedId);
      if (!current || current.name === name) return {};
      const update =
        isCube
          ? { cubes: state.cubes.map((c) => (c.id === state.selectedId ? { ...c, name } : c)) }
          : { bones: state.bones.map((b) => (b.id === state.selectedId ? { ...b, name } : b)) };
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        ...update,
      };
    }),

  select: (selectedId, selectedKind) =>
    set((state) => {
      const kind: SelectedKind | null = selectedId ? (selectedKind ?? "cube") : null;
      // Picking a cube also focuses the texture file that cube is painted
      // with, so the texture editor shows the whole right atlas.
      if (kind === "cube" && selectedId) {
        const cube = state.cubes.find((c) => c.id === selectedId);
        const texId = cube ? cubeTextureId(cube) : null;
        if (texId != null && state.textures.some((t) => t.id === texId)) {
          return { selectedId, selectedKind: kind, activeTexture: texId };
        }
      }
      return { selectedId, selectedKind: kind };
    }),

  setCubeShade: (cubeId, shade) =>
    set((state) => {
      const cube = state.cubes.find((c) => c.id === cubeId);
      if (!cube || (cube.shade !== false) === shade) return {};
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        // shade defaults to true, so only the "off" state is stored
        cubes: state.cubes.map((c) =>
          c.id === cubeId ? { ...c, shade: shade ? undefined : false } : c
        ),
      };
    }),

  setTransform: (t) =>
    set((state) => {
      const cube =
        state.selectedKind === "cube"
          ? state.cubes.find((c) => c.id === state.selectedId)
          : null;
      if (!cube) return {};
      const next: Cube = {
        ...cube,
        from: t.from,
        to: t.to,
        origin: t.origin ?? cube.origin,
        rotation: t.rotation ?? cube.rotation,
      };
      // Gizmo callbacks fire on every mouse move; ignore no-op updates so a
      // click without a drag never creates an undo step.
      if (sameTransform.cube(next, cube)) return {};
      return {
        dirty: true,
        cubes: state.cubes.map((c) => (c.id === cube.id ? next : c)),
      };
    }),

  commitTransform: (t: TransformUpdate, errors: string[]) =>
    set((state) => {
      const cube =
        state.selectedKind === "cube"
          ? state.cubes.find((c) => c.id === state.selectedId)
          : null;
      if (!cube) return {};
      const next: Cube = {
        ...cube,
        from: t.from,
        to: t.to,
        origin: t.origin ?? cube.origin,
        rotation: t.rotation ?? cube.rotation,
      };
      if (sameTransform.cube(next, cube) && errors.length === 0) return {};
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        cubes: state.cubes.map((c) => (c.id === cube.id ? next : c)),
        transformErrors: errors,
      };
    }),

  setBoneTransform: (t) =>
    set((state) => {
      const bone =
        state.selectedKind === "bone"
          ? state.bones.find((b) => b.id === state.selectedId)
          : null;
      if (!bone) return {};
      if (sameTransform.bone(bone, t)) return {};
      return {
        dirty: true,
        bones: state.bones.map((b) => (b.id === bone.id ? { ...b, ...t } : b)),
      };
    }),

  commitBoneTransform: (t: BoneTransformUpdate, errors: string[]) =>
    set((state) => {
      const bone =
        state.selectedKind === "bone"
          ? state.bones.find((b) => b.id === state.selectedId)
          : null;
      if (!bone) return {};
      const next: Bone = { ...bone, ...t };
      if (sameTransform.bone(bone, t) && errors.length === 0) return {};
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        bones: state.bones.map((b) => (b.id === bone.id ? next : b)),
        transformErrors: errors,
      };
    }),

  setCubeParent: (cubeId, boneId) =>
    set((state) => {
      const cube = state.cubes.find((c) => c.id === cubeId);
      if (!cube || cube.boneId === boneId) return {};
      if (boneId && !state.bones.some((b) => b.id === boneId)) return {};
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
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
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        bones: state.bones.map((b) => (b.id === boneId ? { ...b, parentId } : b)),
      };
    }),

  toggleHidden: (id, kind) =>
    set((state) => ({
      dirty: true,
      ...(kind === "bone"
        ? { bones: state.bones.map((b) => (b.id === id ? { ...b, hidden: !b.hidden } : b)) }
        : { cubes: state.cubes.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)) }),
    })),

  showAll: () =>
    set((state) => ({
      dirty: true,
      bones: state.bones.map((b) => (b.hidden ? { ...b, hidden: false } : b)),
      cubes: state.cubes.map((c) => (c.hidden ? { ...c, hidden: false } : c)),
    })),
});
