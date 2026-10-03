import {
  BB_MARKER_COLORS,
  Bone,
  Cube,
  CubeFaces,
  FACE_NAMES,
  ProjectTexture,
  RenderMode,
  RenderSides,
  TextureMaterial,
  Vec3,
  newTextureId,
  useModel,
} from "../stores/modelStore";
import { clampUV } from "./uv";
import { openTextFile, saveTextFile } from "./files";
import { pushRecent } from "./recent";
import { parseBbmodel } from "./bbmodel";

const PROJECT_EXTENSION = "bmproj";
const PROJECT_FILTER_NAME = "BlackModels Project";
const PROJECT_FILTER = {
  name: PROJECT_FILTER_NAME,
  extensions: [PROJECT_EXTENSION],
};

/** Current file format. v3 stored texture *indices* in faces; v4 stores stable ids. */
export const PROJECT_VERSION = 4;

export interface ProjectFile {
  version: number;
  app: "blackmodels";
  name: string;
  resolution: [number, number];
  textures: ProjectTexture[];
  bones: Bone[];
  cubes: Cube[];
}

/** Parsed model, ready for `importProject`. */
export interface ParsedModel {
  name: string;
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  resolution: [number, number];
}

export function serializeProject(): string {
  const { name, cubes, bones, textures, resolution } = useModel.getState();
  const project: ProjectFile = {
    version: PROJECT_VERSION,
    app: "blackmodels",
    name,
    resolution,
    textures,
    bones,
    cubes,
  };
  // Plain JSON: embedded base64 textures dominate the size, so pretty-printing
  // only inflates the file and slows the write down.
  return JSON.stringify(project);
}

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

const RENDER_MODES: RenderMode[] = ["default", "emissive", "additive", "layered"];
const RENDER_SIDES: RenderSides[] = ["auto", "front", "double"];

function parseResolution(value: unknown): [number, number] {
  if (value == null) return [256, 256];
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("Corrupted texture resolution in project file");
  }
  const [w, h] = value;
  if (typeof w !== "number" || typeof h !== "number" || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error("Corrupted texture resolution in project file");
  }
  return [Math.round(w), Math.round(h)];
}

function parseTextures(value: unknown): ProjectTexture[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Corrupted texture list in project file");
  const out: ProjectTexture[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Corrupted texture entry in project file");
    }
    const t = raw as Partial<ProjectTexture>;
    if (typeof t.source !== "string" || t.source.length === 0) {
      throw new Error("Corrupted texture entry in project file");
    }
    // v3 had no ids: assign one so faces keep pointing at the right texture.
    const id = typeof t.id === "string" && t.id.length > 0 ? t.id : newTextureId();
    const name = typeof t.name === "string" && t.name ? t.name : `texture-${out.length + 1}.png`;
    const texture: ProjectTexture = { id, source: t.source, name };
    const m = t.material as Partial<TextureMaterial> | undefined;
    if (m && typeof m === "object") {
      const renderMode = RENDER_MODES.includes(m.renderMode as RenderMode)
        ? (m.renderMode as RenderMode)
        : "default";
      const sides = RENDER_SIDES.includes(m.sides as RenderSides) ? (m.sides as RenderSides) : "auto";
      if (renderMode !== "default" || sides !== "auto") texture.material = { renderMode, sides };
    }
    out.push(texture);
  }
  // Duplicate ids would alias two textures in the cache and in face refs.
  const seen = new Set<string>();
  for (const t of out) {
    if (seen.has(t.id)) t.id = newTextureId();
    seen.add(t.id);
  }
  return out;
}

function parseBones(value: unknown): Bone[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Corrupted bone list in project file");
  const byId = new Map<string, Bone>();
  const rawParent = new Map<string, unknown>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Partial<Bone>;
    if (
      typeof b.id !== "string" ||
      typeof b.name !== "string" ||
      !isVec3(b.origin) ||
      !isVec3(b.rotation) ||
      byId.has(b.id)
    ) {
      continue;
    }
    const marker = typeof b.marker === "number" ? b.marker : 0;
    byId.set(b.id, {
      id: b.id,
      name: b.name,
      origin: [...b.origin],
      rotation: [...b.rotation],
      parentId: null,
      marker: b.marker,
      color:
        typeof b.color === "string" && b.color
          ? b.color
          : BB_MARKER_COLORS[((marker % BB_MARKER_COLORS.length) + BB_MARKER_COLORS.length) % BB_MARKER_COLORS.length],
      hidden: b.hidden === true ? true : undefined,
    });
    rawParent.set(b.id, b.parentId);
  }
  for (const bone of byId.values()) {
    const p = rawParent.get(bone.id);
    bone.parentId = typeof p === "string" && p !== bone.id && byId.has(p) ? p : null;
  }
  // Break cycles: the renderer/outliner walk the tree and would loop forever.
  for (const bone of byId.values()) {
    const seen = new Set<string>([bone.id]);
    let cur = bone.parentId ? byId.get(bone.parentId) ?? null : null;
    while (cur) {
      if (seen.has(cur.id)) {
        bone.parentId = null;
        break;
      }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
    }
  }
  return [...byId.values()];
}

function parseFaces(
  value: unknown,
  textureIds: Set<string>,
  legacyTextureIds: Map<number, string> | null,
  resolution: [number, number]
): CubeFaces | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const out: CubeFaces = {};
  for (const face of FACE_NAMES) {
    const raw = record[face];
    if (!raw || typeof raw !== "object") continue;
    const f = raw as { uv?: unknown; texture?: unknown };
    if (!Array.isArray(f.uv) || f.uv.length < 4) continue;
    const [x1, y1, x2, y2] = f.uv.slice(0, 4).map(Number);
    if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) continue;
    // Clamp into the atlas: out-of-range UVs would otherwise break the renderer.
    const uv = clampUV([x1, y1, x2, y2], resolution);
    let texture: string | null = null;
    if (typeof f.texture === "string") {
      texture = textureIds.has(f.texture) ? f.texture : null;
    } else if (typeof f.texture === "number" && legacyTextureIds) {
      // v3: face texture was an index into the textures array
      texture = legacyTextureIds.get(f.texture) ?? null;
    }
    out[face] = { uv, texture };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseCubes(
  value: unknown[],
  bones: Bone[],
  textureIds: Set<string>,
  legacyTextureIds: Map<number, string> | null,
  resolution: [number, number]
): Cube[] {
  const boneIds = new Set(bones.map((b) => b.id));
  const seenIds = new Set<string>();
  return value.map((raw, i) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`Corrupted cube entry #${i + 1} in project file`);
    }
    const c = raw as Partial<Cube>;
    if (
      typeof c.id !== "string" ||
      typeof c.name !== "string" ||
      !isVec3(c.from) ||
      !isVec3(c.to)
    ) {
      throw new Error(`Corrupted cube entry #${i + 1} in project file`);
    }
    let id = c.id;
    if (seenIds.has(id)) id = `${id}-${i + 1}`;
    seenIds.add(id);
    const center: Vec3 = [
      (c.from[0] + c.to[0]) / 2,
      (c.from[1] + c.to[1]) / 2,
      (c.from[2] + c.to[2]) / 2,
    ];
    return {
      id,
      name: c.name,
      from: [...c.from],
      to: [...c.to],
      origin: isVec3(c.origin) ? [...c.origin] : center,
      rotation: isVec3(c.rotation) ? [...c.rotation] : [0, 0, 0],
      inflate: typeof c.inflate === "number" && Number.isFinite(c.inflate) ? c.inflate : undefined,
      faces: parseFaces(c.faces, textureIds, legacyTextureIds, resolution),
      shade: c.shade === false ? false : undefined,
      marker: typeof c.marker === "number" ? c.marker : undefined,
      color: typeof c.color === "string" && c.color ? c.color : "#b7c0cc",
      // Unknown bones fall back to the model root instead of dangling refs.
      boneId: typeof c.boneId === "string" && boneIds.has(c.boneId) ? c.boneId : null,
      hidden: c.hidden === true ? true : undefined,
    };
  });
}

/**
 * Parse a .bmproj file. Structural damage throws; recoverable issues (unknown
 * bone/texture refs, out-of-range UVs, duplicate ids, bone cycles) are repaired
 * so a slightly damaged file still opens.
 */
export function parseProject(json: string): ParsedModel {
  const data = JSON.parse(json) as Partial<ProjectFile>;
  if (!data || data.app !== "blackmodels" || !Array.isArray(data.cubes)) {
    throw new Error("Not a valid BlackModels project file");
  }
  const version = data.version;
  if (version !== 3 && version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(version)}`);
  }
  const legacy = version === 3;
  const resolution = parseResolution(data.resolution);
  const textures = parseTextures(data.textures);
  const textureIds = new Set(textures.map((t) => t.id));
  const legacyTextureIds = legacy
    ? new Map(textures.map((t, i) => [i, t.id] as const))
    : null;
  const bones = parseBones(data.bones);
  const cubes = parseCubes(data.cubes, bones, textureIds, legacyTextureIds, resolution);
  return {
    name: typeof data.name === "string" && data.name ? data.name : "Untitled",
    cubes,
    bones,
    textures,
    resolution,
  };
}

/** Ask before replacing an unsaved model. Returns false when the user cancels. */
export function confirmDiscardChanges(): boolean {
  if (!useModel.getState().dirty) return true;
  return window.confirm("This model has unsaved changes. Discard them?");
}

/** Opens a model file (.bmproj or .bbmodel) and loads it into the store. */
export async function openModelFile(): Promise<
  "ok" | "cancelled" | "error"
> {
  try {
    const file = await openTextFile([
      { name: "Model (bbmodel / bmproj)", extensions: ["bbmodel", "bmproj"] },
    ]);
    if (!file) return "cancelled";
    if (!confirmDiscardChanges()) return "cancelled";
    return applyModelFile(file.contents, file.name);
  } catch (e) {
    console.error("Failed to open model file", e);
    return "error";
  }
}

/** Parses a model file's contents and loads it; records it in Recent. */
export function applyModelFile(
  contents: string,
  fileName?: string
): "ok" | "error" {
  try {
    let data: ParsedModel;
    let format: "bbmodel" | "bmproj";
    if (fileName?.endsWith(".bmproj")) {
      data = parseProject(contents);
      format = "bmproj";
    } else if (fileName?.endsWith(".bbmodel")) {
      data = parseBbmodel(contents);
      format = "bbmodel";
    } else {
      // Detect by content
      const probe = JSON.parse(contents) as {
        app?: string;
        meta?: unknown;
        elements?: unknown;
        cubes?: unknown;
      };
      if (probe.meta && probe.elements) {
        data = parseBbmodel(contents);
        format = "bbmodel";
      } else if (probe.cubes) {
        data = parseProject(contents);
        format = "bmproj";
      } else {
        throw new Error("Unrecognized file format");
      }
    }
    useModel.getState().importProject(data);
    pushRecent({ name: data.name, format, data: contents });
    return "ok";
  } catch (e) {
    console.error("Failed to parse model file", e);
    return "error";
  }
}

export async function saveProject(): Promise<boolean> {
  const { name } = useModel.getState();
  const safeName = (name || "project").replace(/[^\w\- ]+/g, "_");
  const contents = serializeProject();
  const saved = await saveTextFile({
    defaultName: `${safeName}.${PROJECT_EXTENSION}`,
    filters: [PROJECT_FILTER],
    contents,
  });
  if (saved) {
    useModel.getState().markSaved();
    pushRecent({ name, format: "bmproj", data: contents });
  }
  return saved;
}

export function newProject(): void {
  useModel.getState().importProject({
    name: "Untitled",
    cubes: [],
    bones: [],
    textures: [],
    resolution: [256, 256],
  });
}
