import type { StateCreator } from "zustand";
import { blockSize, boxUnwrap, clampUV, cubePixelSize, gridFromCubes, packCubes, toCubeFaces } from "../../lib/uv";
import { disposeTexture } from "../../lib/textureCache";
import { cubeTextureId } from "../modelHelpers";
import { pushHistory, snapshot } from "../modelHistory";
import {
  FACE_NAMES,
  newTextureId,
  textureMaterial,
  type AutoUVResult,
  type CubeFaces,
  type FaceName,
  type FaceUV,
  type ProjectTexture,
  type ProjectTextureInput,
  type TextureMaterial,
  type TextureUpdates,
} from "../modelTypes";
import type { ModelState } from "../modelStore";

export interface TextureSliceActions {
  /** Add an imported texture (base64 data URL) and make it active. */
  addTexture: (t: ProjectTextureInput) => void;
  /** Remove a texture by id; faces referencing it fall back to untextured. */
  removeTexture: (id: string) => void;
  /** Create a blank texture (optionally with a custom resolution). */
  createTexture: (name: string, res?: [number, number]) => void;
  /** Change a texture's material settings (one undo step). */
  setTextureMaterial: (id: string, patch: Partial<TextureMaterial>) => void;
  /** Which texture painting tools edit (by id). */
  setActiveTexture: (id: string | null) => void;
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
}

export const createTextureSlice: StateCreator<ModelState, [], [], TextureSliceActions> = (set) => ({
  addTexture: (t) =>
    set((state) => {
      const id = t.id ?? newTextureId();
      const texture: ProjectTexture = {
        id,
        source: t.source,
        name: t.name,
        ...(t.material ? { material: t.material } : {}),
      };
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        textures: [...state.textures, texture],
        activeTexture: id,
      };
    }),

  // The THREE.Texture for this id is disposed once the entry is gone. Undo
  // restores the entry, and getSharedTexture() rebuilds the texture from its
  // source on demand. Face refs are cleared so the UI promise holds even
  // without the renderer's missing-texture fallback.
  removeTexture: (id) => {
    set((state) => {
      if (!state.textures.some((t) => t.id === id)) return {};
      const cubes = state.cubes.map((c) => {
        if (!c.faces) return c;
        let changed = false;
        const faces: CubeFaces = { ...c.faces };
        for (const face of FACE_NAMES) {
          if (faces[face]?.texture === id) {
            faces[face] = { ...faces[face]!, texture: null };
            changed = true;
          }
        }
        return changed ? { ...c, faces } : c;
      });
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        textures: state.textures.filter((t) => t.id !== id),
        cubes,
        activeTexture: state.activeTexture === id ? null : state.activeTexture,
      };
    });
    disposeTexture(id);
  },

  createTexture: (name, res) =>
    set((state) => {
      const [w, h] = res ?? state.resolution;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      const id = newTextureId();
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        textures: [...state.textures, { id, name, source: canvas.toDataURL("image/png") }],
        activeTexture: id,
      };
    }),

  setTextureMaterial: (id, patch) =>
    set((state) => {
      const tex = state.textures.find((t) => t.id === id);
      if (!tex) return {};
      const cur = textureMaterial(tex);
      const next: TextureMaterial = { ...cur, ...patch };
      if (next.renderMode === cur.renderMode && next.sides === cur.sides) return {};
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        textures: state.textures.map((t) => (t.id === id ? { ...t, material: next } : t)),
      };
    }),

  setActiveTexture: (activeTexture) => set({ activeTexture }),

  commitTexturePixels: (dataUrl, updates) =>
    set((state) => {
      const id = state.activeTexture;
      if (id == null || !state.textures.some((t) => t.id === id)) return {};
      const textures = state.textures.map((t) => (t.id === id ? { ...t, source: dataUrl } : t));
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
            faces[face] = { uv: [...targeted] as FaceUV, texture: id };
            changed = true;
          }
        }
        return changed ? { ...c, faces } : c;
      });
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
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
          ? { past: pushHistory(state.past, snapshot(state)), future: [] }
          : {}),
        dirty: true,
        cubes: state.cubes.map((c) => (c.id === cubeId ? { ...c, faces } : c)),
      };
    }),

  autoUV: (scope) => {
    const result: AutoUVResult = { count: 0, overflow: 0 };
    set((state) => {
      const texId = state.activeTexture;
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
        updated.set(cube.id, toCubeFaces(boxUnwrap(size, u, v), cubeTextureId(cube) ?? texId));
      } else {
        // Only cubes living on the active texture (or not textured yet) share its atlas.
        const targets = state.cubes.filter((c) => {
          const t = cubeTextureId(c);
          return t == null || t === texId;
        });
        if (targets.length === 0) return {};
        const packed = packCubes(targets, res, texId);
        updated = packed.placed;
        result.overflow = packed.overflow.length;
      }

      result.count = updated.size;
      return {
        past: pushHistory(state.past, snapshot(state)),
        future: [],
        dirty: true,
        cubes: state.cubes.map((c) => {
          const faces = updated.get(c.id);
          return faces ? { ...c, faces } : c;
        }),
      };
    });
    return result;
  },
});
