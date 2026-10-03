import type { Bone, Cube, FaceName, ProjectTexture } from "../stores/modelStore";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

/**
 * Model validation for import/export sanity, not a Minecraft size gate.
 *
 * Everything here is advisory unless it would actually break a round-trip
 * through Blockbench / ModelEngine / resource-pack pipelines:
 * - duplicate texture/cube/bone ids (break references on reload)
 * - bone ancestor cycles (break hierarchy walks)
 * - UV rects outside the atlas (invalid sampling / broken export)
 * - texture resolution under 16×16 or above 256×256 (unusual, worth flagging)
 *
 * Model extents are shown as info only. Large models are fully supported by
 * ModelEngine and other loaders, so we never treat >16 units as a problem.
 */
export function validateModel(
  cubes: Cube[],
  bones: Bone[],
  textures: ProjectTexture[],
  resolution: [number, number]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const [resW, resH] = resolution;

  // --- Texture resolution ---
  if (resW < 16 || resH < 16) {
    issues.push({
      severity: "error",
      message: `Texture resolution must be at least 16×16 (currently ${resW}×${resH}).`,
    });
  } else if (resW > 256 || resH > 256) {
    issues.push({
      severity: "warning",
      message: `Texture resolution ${resW}×${resH} exceeds the 256×256 atlas most Minecraft tooling expects.`,
    });
  }

  if (resW !== resH && issues.every((i) => i.severity !== "error")) {
    issues.push({
      severity: "info",
      message: `Non-square texture resolution ${resW}×${resH}; resource-pack tools usually prefer square.`,
    });
  }

  // --- Duplicate texture ids ---
  const texById = new Map<string, number>();
  for (let i = 0; i < textures.length; i++) {
    const t = textures[i];
    if (!texById.has(t.id)) texById.set(t.id, i);
    else
      issues.push({
        severity: "warning",
        message: `Duplicate texture id “${t.id}” (entries #${texById.get(t.id)} and #${i}).`,
      });
  }

  // --- Duplicate cube ids ---
  const cubeById = new Map<string, number>();
  for (let i = 0; i < cubes.length; i++) {
    const c = cubes[i];
    if (!cubeById.has(c.id)) cubeById.set(c.id, i);
    else
      issues.push({
        severity: "error",
        message: `Duplicate cube id “${c.id}” (entries #${cubeById.get(c.id)} and #${i}).`,
      });
  }

  // --- Duplicate bone ids ---
  const boneById = new Map<string, number>();
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    if (!boneById.has(b.id)) boneById.set(b.id, i);
    else
      issues.push({
        severity: "error",
        message: `Duplicate bone id “${b.id}” (entries #${boneById.get(b.id)} and #${i}).`,
      });
  }

  // --- Bone cycles ---
  for (const start of bones) {
    const seen = new Set<string>([start.id]);
    let cur: typeof bones[number] | null = start;
    while (cur?.parentId && cur.parentId !== start.id) {
      const parentIndex = boneById.get(cur.parentId);
      if (parentIndex == null) break;
      const parent = bones[parentIndex];
      if (seen.has(parent.id)) {
        if (parent.id === start.id) {
          issues.push({
            severity: "error",
            message: `Bone “${start.name}” is its own ancestor (cycle).`,
          });
        }
        break;
      }
      seen.add(parent.id);
      cur = parent;
    }
  }

  // --- Model extents (info only; large models are supported by ModelEngine) ---
  if (cubes.length > 0) {
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;
    for (const c of cubes) {
      minX = Math.min(minX, c.from[0], c.to[0]);
      maxX = Math.max(maxX, c.from[0], c.to[0]);
      minY = Math.min(minY, c.from[1], c.to[1]);
      maxY = Math.max(maxY, c.from[1], c.to[1]);
      minZ = Math.min(minZ, c.from[2], c.to[2]);
      maxZ = Math.max(maxZ, c.from[2], c.to[2]);
    }
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    if (sizeX > 16 || sizeY > 16 || sizeZ > 16) {
      const big: string[] = [];
      if (sizeX > 16) big.push(`width ${sizeX.toFixed(1)}`);
      if (sizeY > 16) big.push(`height ${sizeY.toFixed(1)}`);
      if (sizeZ > 16) big.push(`depth ${sizeZ.toFixed(1)}`);
      issues.push({
        severity: "info",
        message: `Model is larger than 16 units on ${big.join(", ")}. Fine for ModelEngine; only Blockbench combined entities usually stay within 16 units per axis.`,
      });
    }
  }

  // --- UVs outside the atlas ---
  for (const c of cubes) {
    for (const face of Object.keys(c.faces ?? {}) as FaceName[]) {
      const f = c.faces?.[face];
      if (!f?.uv) continue;
      const [x1, y1, x2, y2] = f.uv;
      if (x2 > resW || y2 > resH) {
        issues.push({
          severity: "error",
          message: `Cube “${c.name}” face ${face} UV ${JSON.stringify(f.uv)} exceeds the ${resW}×${resH} atlas.`,
        });
      } else if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0) {
        issues.push({
          severity: "warning",
          message: `Cube “${c.name}” face ${face} UV ${JSON.stringify(f.uv)} goes out of the atlas on the negative side.`,
        });
      }
    }
  }

  return issues;
}

export function severityClass(severity: ValidationIssue["severity"]): string {
  return severity === "error"
    ? "bg-red-900/20 text-red-200"
    : severity === "warning"
      ? "bg-amber-900/20 text-amber-200"
      : "bg-blue-900/20 text-blue-200";
}
