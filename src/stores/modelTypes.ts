/** Pure model data types shared by the store, its slices and the file formats. */

/** bbmodel marker colors used by Blockbench (index into this palette). */
export const BB_MARKER_COLORS = [
  "#A7E1F5", "#FF94B5", "#A6FF94", "#FFFF94", "#D49EE8",
  "#9AB6F5", "#FFD694", "#94FFF5", "#94B0FF", "#FF9494",
];

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
  north?: { uv: FaceUV; texture?: string | null };
  east?: { uv: FaceUV; texture?: string | null };
  south?: { uv: FaceUV; texture?: string | null };
  west?: { uv: FaceUV; texture?: string | null };
  up?: { uv: FaceUV; texture?: string | null };
  down?: { uv: FaceUV; texture?: string | null };
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
  /** Stable identifier; faces, the live THREE cache and the active selection use it. */
  id: string;
  /** Base64 data URL (embedded PNG). */
  source: string;
  name: string;
  /** Material settings; missing = defaults. */
  material?: TextureMaterial;
}

/** A texture as the UI creates it — the store assigns an id when missing. */
export interface ProjectTextureInput {
  id?: string;
  source: string;
  name: string;
  material?: TextureMaterial;
}

/** Stable id for a texture, independent of its position in the list. */
export function newTextureId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `tex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Material of a texture with defaults filled in. */
export function textureMaterial(t: ProjectTexture | null | undefined): TextureMaterial {
  return { ...DEFAULT_MATERIAL, ...(t?.material ?? {}) };
}

export type SelectedKind = "cube" | "bone";

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

/** Import payload for `importProject`. */
export interface ProjectImport {
  name?: string;
  cubes: Cube[];
  bones?: Bone[];
  textures?: ProjectTextureInput[];
  resolution?: [number, number];
}
