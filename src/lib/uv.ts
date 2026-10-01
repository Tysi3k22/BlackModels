import type { Cube, CubeFaces, FaceName, FaceUV, Vec3 } from "../stores/modelStore";

/**
 * UV mapping helpers. All UV rects are in texture pixels, y-down,
 * stored as [x1, y1, x2, y2] (same convention as bbmodel).
 */

export type UVRect = FaceUV;

/** Size of a cube in whole texture pixels: [width(x), height(y), depth(z)]. */
export function cubePixelSize(cube: Pick<Cube, "from" | "to" | "inflate">): Vec3 {
  const inflate = cube.inflate ?? 0;
  return [0, 1, 2].map((i) =>
    Math.max(0, Math.ceil(Math.abs(cube.to[i] - cube.from[i]) + inflate * 2 - 1e-6))
  ) as Vec3;
}

/** Size of the unwrapped "cross" block a cube occupies in the atlas: [w, h]. */
export function blockSize(size: Vec3): [number, number] {
  const [w, h, d] = size;
  return [2 * (d + w), d + h];
}

/**
 * Classic Minecraft box layout with its top-left corner at (u, v):
 *
 *          d     w     w
 *       +-----+-----+-----+
 *     d |     | up  |down |
 *       +-----+-----+-----+-----+
 *     h |east |north|west |south|
 *       +-----+-----+-----+-----+
 *          d     w     d     w
 */
export function boxUnwrap(size: Vec3, u: number, v: number): Record<FaceName, UVRect> {
  const [w, h, d] = size;
  return {
    up: [u + d, v, u + d + w, v + d],
    down: [u + d + w, v, u + d + 2 * w, v + d],
    east: [u, v + d, u + d, v + d + h],
    north: [u + d, v + d, u + d + w, v + d + h],
    west: [u + d + w, v + d, u + 2 * d + w, v + d + h],
    south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
  };
}

/** Wrap UV rects into CubeFaces bound to `texture` (null = untextured). */
export function toCubeFaces(
  rects: Record<FaceName, UVRect>,
  texture: number | null
): Required<CubeFaces> {
  const out = {} as Required<CubeFaces>;
  for (const face of Object.keys(rects) as FaceName[]) {
    out[face] = { uv: [...rects[face]] as UVRect, texture };
  }
  return out;
}

/** Bounding box [x1, y1, x2, y2] of all of a cube's face UVs, or null if it has none. */
export function uvBounds(faces: CubeFaces | undefined): UVRect | null {
  if (!faces) return null;
  let b: UVRect | null = null;
  for (const f of Object.values(faces)) {
    if (!f?.uv) continue;
    const [a, c, d, e] = f.uv;
    const x1 = Math.min(a, d);
    const x2 = Math.max(a, d);
    const y1 = Math.min(c, e);
    const y2 = Math.max(c, e);
    b = b
      ? [Math.min(b[0], x1), Math.min(b[1], y1), Math.max(b[2], x2), Math.max(b[3], y2)]
      : [x1, y1, x2, y2];
  }
  return b;
}

/** Occupancy grid used for first-fit placement of blocks into the atlas. */
export class AtlasGrid {
  readonly width: number;
  readonly height: number;
  private cells: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
  }

  /** Mark a rect as used (clamped to the atlas). */
  occupy(x1: number, y1: number, x2: number, y2: number) {
    const xa = Math.max(0, Math.floor(x1));
    const ya = Math.max(0, Math.floor(y1));
    const xb = Math.min(this.width, Math.ceil(x2));
    const yb = Math.min(this.height, Math.ceil(y2));
    for (let y = ya; y < yb; y++) this.cells.fill(1, y * this.width + xa, y * this.width + Math.max(xa, xb));
  }

  private isFree(x: number, y: number, bw: number, bh: number): boolean {
    for (let yy = y; yy < y + bh; yy++) {
      const row = yy * this.width;
      for (let xx = x; xx < x + bw; xx++) if (this.cells[row + xx]) return false;
    }
    return true;
  }

  /** First free top-left position (row by row) for a bw x bh block, or null if none fits. */
  findSlot(bw: number, bh: number): [number, number] | null {
    if (bw > this.width || bh > this.height) return null;
    for (let y = 0; y + bh <= this.height; y++) {
      for (let x = 0; x + bw <= this.width; x++) {
        if (this.isFree(x, y, bw, bh)) return [x, y];
      }
    }
    return null;
  }
}

/** Grid pre-filled with the UV areas already used by `cubes`. */
export function gridFromCubes(cubes: Cube[], resolution: [number, number]): AtlasGrid {
  const grid = new AtlasGrid(resolution[0], resolution[1]);
  for (const c of cubes) {
    const b = uvBounds(c.faces);
    if (b) grid.occupy(b[0], b[1], b[2], b[3]);
  }
  return grid;
}

export interface PackResult {
  /** New faces for every cube that was placed, keyed by cube id. */
  placed: Map<string, Required<CubeFaces>>;
  /** Cube ids that did not fit in the atlas (left at (0,0), overlapping). */
  overflow: string[];
}

/**
 * Unwrap and pack the given cubes into a fresh atlas (largest blocks first).
 * Cubes that do not fit are still unwrapped at (0, 0) so they stay editable.
 */
export function packCubes(
  cubes: Cube[],
  resolution: [number, number],
  texture: number | null
): PackResult {
  const grid = new AtlasGrid(resolution[0], resolution[1]);
  const items = cubes
    .map((c) => {
      const size = cubePixelSize(c);
      return { id: c.id, size, block: blockSize(size) };
    })
    .sort((a, b) => b.block[1] - a.block[1] || b.block[0] - a.block[0]);

  const placed = new Map<string, Required<CubeFaces>>();
  const overflow: string[] = [];
  for (const it of items) {
    const [bw, bh] = it.block;
    const slot = grid.findSlot(bw, bh);
    if (!slot) overflow.push(it.id);
    const [u, v] = slot ?? [0, 0];
    if (slot) grid.occupy(u, v, u + bw, v + bh);
    placed.set(it.id, toCubeFaces(boxUnwrap(it.size, u, v), texture));
  }
  return { placed, overflow };
}

/** Pick a free spot for a single new cube given the cubes already in the model. */
export function findSlotForCube(
  cube: Pick<Cube, "from" | "to" | "inflate">,
  existing: Cube[],
  resolution: [number, number]
): [number, number] {
  const [bw, bh] = blockSize(cubePixelSize(cube));
  return gridFromCubes(existing, resolution).findSlot(bw, bh) ?? [0, 0];
}

/** Clamp a UV rect into the atlas, rounding to whole pixels. Keeps flipped (x1 > x2) rects flipped. */
export function clampUV(uv: UVRect, resolution: [number, number]): UVRect {
  const [w, h] = resolution;
  const cx = (n: number) => Math.min(w, Math.max(0, Math.round(n)));
  const cy = (n: number) => Math.min(h, Math.max(0, Math.round(n)));
  return [cx(uv[0]), cy(uv[1]), cx(uv[2]), cy(uv[3])];
}

/** Flip a UV rect horizontally / vertically (mirrors the face texture). */
export function flipUV(uv: UVRect, axis: "h" | "v"): UVRect {
  return axis === "h" ? [uv[2], uv[1], uv[0], uv[3]] : [uv[0], uv[3], uv[2], uv[1]];
}
