import { useMemo } from "react";
import * as THREE from "three";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import type { Bone, Cube, CubeFaces, ProjectTexture, Vec3 } from "../../stores/modelStore";
import { flushCanvasToLiveTexture } from "../../lib/textureCache";
import type { PaintWindow } from "../../lib/paint";

// Minecraft coordinate system: +X = East, +Y = Up, +Z = South
// 1 grid cell = 1 in-game pixel, 1 section (16 cells) = 1 Minecraft block

export const DEG = Math.PI / 180;

// Blockbench applies group/cube rotations (degrees) in Z-Y-X order.
export const ROT_ORDER = "ZYX" as const;
export const eulerDeg = (r: Vec3) =>
  new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, ROT_ORDER);

// BoxGeometry face order: px, nx, py, ny, pz, nz
// Minecraft/bbmodel: east=+X, west=-X, up=+Y, down=-Y, south=+Z, north=-Z
export const BOX_FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;
// Material slots matching BOX_FACE_ORDER (0=px east, 1=nx west, 2=py up, 3=ny down, 4=pz south, 5=nz north)

/** Textures looked up by stable id, built once per scene instead of per face. */
export type TextureMap = Map<string, ProjectTexture>;

export const buildTextureMap = (textures: ProjectTexture[]): TextureMap =>
  new Map(textures.map((t) => [t.id, t]));

// Module-local gizmo state so onPointerMissed can ignore clicks on the gizmo
export const gizmo = {
  dragging: false,
  controls: null as TransformControlsImpl | null,
};
export const isGizmoBusy = () =>
  gizmo.dragging ||
  (gizmo.controls as unknown as { axis: string | null } | null)?.axis != null;

/**
 * Rewrites a BoxGeometry's UVs so each face samples its bbmodel face UV
 * rectangle (given in texture pixels, y-down).
 */
export function applyFaceUVs(
  geo: THREE.BoxGeometry,
  faces: CubeFaces | undefined,
  resolution: [number, number]
) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const [w, h] = resolution;
  for (let face = 0; face < 6; face++) {
    const f = faces?.[BOX_FACE_ORDER[face]];
    if (!f?.uv) continue;
    const [x1, y1, x2, y2] = f.uv;
    const u1 = x1 / w;
    const u2 = x2 / w;
    const v1 = 1 - y1 / h;
    const v2 = 1 - y2 / h;
    // BoxGeometry per-face vertex order: TL, TR, BL, BR (uv-space)
    const base = face * 4;
    uv.setXY(base + 0, u1, v1);
    uv.setXY(base + 1, u2, v1);
    uv.setXY(base + 2, u1, v2);
    uv.setXY(base + 3, u2, v2);
  }
  uv.needsUpdate = true;
}

export function inflateBox(from: Vec3, to: Vec3, inflate?: number): [Vec3, Vec3] {
  if (!inflate) return [from, to];
  const s = inflate;
  return [
    [from[0] - s, from[1] - s, from[2] - s],
    [to[0] + s, to[1] + s, to[2] + s],
  ];
}

/** Cube geometry with per-face UVs from bbmodel data. `cube` may be null. */
export function useCubeGeometry(
  cube: Cube | null,
  resolution: [number, number]
): THREE.BoxGeometry {
  return useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    if (cube) applyFaceUVs(g, cube.faces, resolution);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube?.id, cube?.faces, resolution[0], resolution[1]]);
}

/**
 * Accumulated world (model-space) matrix of a bone in the rig hierarchy:
 * W(bone) = W(parent) · T(origin − parentOrigin) · R(rotation). Identity for
 * a null bone (model root). Verified against Blockbench semantics.
 */
export function boneWorldMatrix(bones: Bone[], boneId: string | null): THREE.Matrix4 {
  const byId = new Map(bones.map((b) => [b.id, b]));
  const chain: Bone[] = [];
  let cur = boneId ? byId.get(boneId) ?? null : null;
  while (cur) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  const m = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const b = chain[i];
    const parent = i + 1 < chain.length ? chain[i + 1] : null;
    const rel: Vec3 = parent
      ? [b.origin[0] - parent.origin[0], b.origin[1] - parent.origin[1], b.origin[2] - parent.origin[2]]
      : b.origin;
    m.multiply(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...rel),
        new THREE.Quaternion().setFromEuler(eulerDeg(b.rotation)),
        new THREE.Vector3(1, 1, 1)
      )
    );
  }
  return m;
}

/** Flush the offscreen paint canvas into the live THREE texture so strokes appear instantly. */
export function flushToLiveTexture(textureId: string) {
  flushCanvasToLiveTexture(textureId, (window as PaintWindow).__paintOffscreen ?? null);
}
