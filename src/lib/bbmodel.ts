import { openTextFile, saveTextFile } from "./files";
import { pushRecent } from "./recent";
import {
  BB_MARKER_COLORS,
  Cube,
  CubeFaces,
  FaceName,
  ProjectTexture,
  Vec3,
  useModel,
} from "../stores/modelStore";

/** Blockbench .bbmodel import/export for cube-based ("free" / generic) models. */

const BB_EXTENSION = "bbmodel";
const BB_FILTER = { name: "Blockbench Model", extensions: [BB_EXTENSION] };

interface BbFace {
  uv: [number, number, number, number];
  texture?: number | null;
}

interface BbElement {
  name: string;
  type: "cube";
  from: Vec3;
  to: Vec3;
  origin?: Vec3;
  rotation?: Vec3;
  inflate?: number;
  color?: number;
  faces?: Record<FaceName, BbFace>;
  uuid?: string;
  rescale?: boolean;
  locked?: boolean;
  autouv?: number;
}

interface BbTexture {
  source?: string;
  name?: string;
}

interface BbModel {
  meta: Record<string, unknown>;
  name?: string;
  model_identifier?: string;
  visible_box?: [number, number, number];
  variable_placeholders?: string;
  variable_placeholder_buttons?: unknown[];
  timeline_setups?: unknown[];
  resolution?: { width: number; height: number };
  elements?: BbElement[];
  outliner?: unknown[];
  textures?: BbTexture[];
}

const FACE_ORDER: FaceName[] = ["north", "east", "south", "west", "up", "down"];

function toCube(el: BbElement, index: number): Cube {
  return {
    id: el.uuid ?? `cube-${index + 1}`,
    name: el.name || `Cube ${index + 1}`,
    from: el.from,
    to: el.to,
    origin: el.origin ?? [
      (el.from[0] + el.to[0]) / 2,
      (el.from[1] + el.to[1]) / 2,
      (el.from[2] + el.to[2]) / 2,
    ],
    rotation: el.rotation ?? [0, 0, 0],
    inflate: el.inflate,
    marker: el.color,
    color: BB_MARKER_COLORS[((el.color ?? 0) % BB_MARKER_COLORS.length + BB_MARKER_COLORS.length) % BB_MARKER_COLORS.length],
    faces: el.faces as CubeFaces | undefined,
  };
}

export function parseBbmodel(json: string): {
  name: string;
  cubes: Cube[];
  textures: ProjectTexture[];
  resolution: [number, number];
} {
  const data = JSON.parse(json) as BbModel;
  if (!data || !Array.isArray(data.elements)) {
    throw new Error("Not a valid .bbmodel file");
  }
  const cubes = data.elements
    .filter((el) => el.type === "cube" || Array.isArray(el.from))
    .map(toCube);
  const textures: ProjectTexture[] = (data.textures ?? [])
    .filter((t) => typeof t.source === "string" && t.source.startsWith("data:"))
    .map((t, i) => ({ source: t.source as string, name: t.name ?? `texture-${i}.png` }));
  const resolution: [number, number] = data.resolution
    ? [data.resolution.width, data.resolution.height]
    : [256, 256];
  return {
    name: data.name || "Imported model",
    cubes,
    textures,
    resolution,
  };
}

export async function importBbmodel(): Promise<"ok" | "cancelled" | "error"> {
  try {
    const file = await openTextFile([BB_FILTER]);
    if (!file) return "cancelled";
    const data = parseBbmodel(file.contents);
    useModel.getState().importProject(data);
    return "ok";
  } catch (e) {
    console.error("Failed to import .bbmodel", e);
    return "error";
  }
}

function toBbElement(cube: Cube): BbElement {
  const el: BbElement = {
    name: cube.name,
    rescale: false,
    locked: false,
    from: cube.from,
    to: cube.to,
    autouv: 0,
    color: cube.marker ?? 0,
    faces: {} as Record<FaceName, BbFace>,
    type: "cube",
    uuid: cube.id.includes("-") ? cube.id : randomUuid(),
  };
  if (cube.inflate !== undefined) el.inflate = cube.inflate;
  if (cube.rotation.some((r) => r !== 0)) el.rotation = cube.rotation;
  el.origin = cube.origin ?? [
    (cube.from[0] + cube.to[0]) / 2,
    (cube.from[1] + cube.to[1]) / 2,
    (cube.from[2] + cube.to[2]) / 2,
  ];

  const faces = cube.faces ?? {};
  const outFaces = el.faces as Record<FaceName, BbFace>;
  for (const face of FACE_ORDER) {
    const f = faces[face];
    if (f && f.uv) {
      outFaces[face] = { uv: f.uv, texture: f.texture ?? 0 };
    } else {
      // Zero-size UV (all pixels at one point) — valid, renders untextured
      outFaces[face] = { uv: [0, 0, 0, 0], texture: 0 };
    }
  }
  return el;
}

function randomUuid(): string {
  // RFC 4122 version 4-ish, good enough for exported models
  const hex = "0123456789abcdef";
  let u = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) u += "-";
    else if (i === 14) u += "4";
    else u += hex[Math.floor(Math.random() * 16)];
  }
  return u;
}

export function serializeBbmodel(
  name: string,
  cubes: Cube[],
  textures: ProjectTexture[],
  resolution: [number, number]
): string {
  const model: BbModel = {
    meta: {
      format_version: "4.0",
      model_format: "free",
      box_uv: false,
    },
    name,
    visible_box: undefined,
    variable_placeholders: "",
    variable_placeholder_buttons: [],
    timeline_setups: [],
    resolution: { width: resolution[0], height: resolution[1] },
    elements: cubes.map(toBbElement),
    textures: textures.map((t) => ({
      path: t.name,
      name: t.name,
      folder: "block",
      namespace: "",
      id: "0",
      particle: false,
      render_mode: "normal",
      visible: true,
      mode: "bitmap",
      saved: false,
      uuid: randomUuid(),
      relative_path: `../${t.name}`,
      source: t.source,
    })),
  };
  // Undefined fields are dropped and defaults restored for the JSON output
  const clean = JSON.parse(JSON.stringify(model)) as BbModel;
  clean.visible_box = [1, 1, 0];
  // Outliner references element uuids at the root level
  clean.outliner = (clean.elements as BbElement[]).map((e) => e.uuid);
  return JSON.stringify(clean, null, 2);
}

export async function exportBbmodel(): Promise<boolean> {
  const { name, cubes, textures, resolution } = useModel.getState();
  const safeName = (name || "model").replace(/[^\w\- ]+/g, "_");
  const contents = serializeBbmodel(name, cubes, textures, resolution);
  const saved = await saveTextFile({
    defaultName: `${safeName}.${BB_EXTENSION}`,
    filters: [BB_FILTER],
    contents,
  });
  if (saved && cubes.length > 0) {
    pushRecent({ name, format: "bbmodel", data: contents });
  }
  return saved;
}
