import { saveTextFile } from "./files";
import { pushRecent } from "./recent";
import {
  BB_MARKER_COLORS,
  Bone,
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
  visibility?: boolean;
}

interface BbGroup {
  name: string;
  origin: Vec3;
  rotation?: Vec3;
  color?: number;
  uuid?: string;
  export?: boolean;
  isOpen?: boolean;
  locked?: boolean;
  visibility?: boolean;
  autouv?: number;
  children: (string | BbGroup)[];
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

interface ParsedModel {
  name: string;
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  resolution: [number, number];
}

function toCube(
  el: BbElement,
  index: number,
  boneId: string | null,
  inHitbox = false
): Cube {
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
    boneId,
    hidden: el.visibility === false || inHitbox ? true : undefined,
  };
}

export function parseBbmodel(json: string): ParsedModel {
  const data = JSON.parse(json) as BbModel;
  if (!data || !Array.isArray(data.elements)) {
    throw new Error("Not a valid .bbmodel file");
  }

  // Walk the outliner tree: groups become bones, strings are cube uuids
  const bones: Bone[] = [];
  const boneIdByUuid = new Map<string, string>(); // bb uuid -> bone id
  const cubeParent = new Map<string, string | null>(); // cube uuid -> bone id
  // Blockbench convention: everything under a group named "hitbox" is a
  // collision marker, not rendered geometry — import it hidden.
  const hitboxGroups = new Set<string>();

  const usedIds = new Set<string>();
  const boneIdFor = (bbUuid: string): string => {
    let id = bbUuid;
    if (usedIds.has(id)) id = `${bbUuid}-${usedIds.size}`;
    usedIds.add(id);
    return id;
  };

  const walk = (nodes: unknown[], parentBoneId: string | null) => {
    for (const node of nodes) {
      if (typeof node === "string") {
        cubeParent.set(node, parentBoneId);
        continue;
      }
      const g = node as BbGroup;
      if (!g || typeof g !== "object" || !Array.isArray(g.children)) continue;
      const id = boneIdFor(g.uuid ?? `bone-${bones.length + 1}`);
      boneIdByUuid.set(g.uuid ?? id, id);
      const inHitbox = hitboxGroups.has(parentBoneId ?? "") || g.name.toLowerCase() === "hitbox";
      if (inHitbox) hitboxGroups.add(id);
      bones.push({
        id,
        name: g.name || "Group",
        origin: g.origin ?? [0, 0, 0],
        rotation: g.rotation ?? [0, 0, 0],
        parentId: parentBoneId,
        marker: g.color,
        color: BB_MARKER_COLORS[((g.color ?? 0) % BB_MARKER_COLORS.length + BB_MARKER_COLORS.length) % BB_MARKER_COLORS.length],
        hidden: g.visibility === false || inHitbox ? true : undefined,
      });
      walk(g.children, id);
    }
  };
  walk(data.outliner ?? [], null);

  const cubes = data.elements
    .filter((el) => el.type === "cube" || Array.isArray(el.from))
    .map((el, i) => {
      const parentId = cubeParent.get(el.uuid ?? "") ?? null;
      return toCube(el, i, parentId, parentId != null && hitboxGroups.has(parentId));
    });

  const textures: ProjectTexture[] = (data.textures ?? [])
    .filter((t) => typeof t.source === "string" && t.source.startsWith("data:"))
    .map((t, i) => ({ source: t.source as string, name: t.name ?? `texture-${i}.png` }));
  const resolution: [number, number] = data.resolution
    ? [data.resolution.width, data.resolution.height]
    : [256, 256];
  return {
    name: data.name || "Imported model",
    cubes,
    bones,
    textures,
    resolution,
  };
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
    visibility: cube.hidden ? false : undefined,
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

function toBbGroup(bone: Bone, cubeUuids: string[], childGroups: BbGroup[]): BbGroup {
  return {
    name: bone.name,
    origin: bone.origin,
    rotation: bone.rotation.some((r) => r !== 0) ? bone.rotation : undefined,
    color: bone.marker ?? 0,
    uuid: bone.id.includes("-") ? bone.id : randomUuid(),
    export: true,
    isOpen: true,
    locked: false,
    visibility: !bone.hidden,
    autouv: 0,
    children: [...cubeUuids, ...childGroups],
  };
}

export function serializeBbmodel(
  name: string,
  cubes: Cube[],
  bones: Bone[],
  textures: ProjectTexture[],
  resolution: [number, number]
): string {
  const elements = cubes.map(toBbElement);

  // Group cube element uuids under their bones
  const cubesByBone = new Map<string | null, string[]>();
  cubes.forEach((c, i) => {
    const key = c.boneId && bones.some((b) => b.id === c.boneId) ? c.boneId : null;
    const list = cubesByBone.get(key) ?? [];
    list.push(elements[i].uuid as string);
    cubesByBone.set(key, list);
  });

  const groupByBoneId = new Map<string, BbGroup>();
  const buildGroup = (bone: Bone): BbGroup => {
    const cached = groupByBoneId.get(bone.id);
    if (cached) return cached;
    const childBones = bones.filter((b) => b.parentId === bone.id);
    const g = toBbGroup(
      bone,
      cubesByBone.get(bone.id) ?? [],
      childBones.map(buildGroup)
    );
    groupByBoneId.set(bone.id, g);
    return g;
  };

  const rootBones = bones.filter((b) => !b.parentId || !bones.some((x) => x.id === b.parentId));
  const outliner: (string | BbGroup)[] = [
    ...(cubesByBone.get(null) ?? []),
    ...rootBones.map(buildGroup),
  ];

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
    elements,
    outliner,
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
  return JSON.stringify(clean, null, 2);
}

export async function exportBbmodel(): Promise<boolean> {
  const { name, cubes, bones, textures, resolution } = useModel.getState();
  const safeName = (name || "model").replace(/[^\w\- ]+/g, "_");
  const contents = serializeBbmodel(name, cubes, bones, textures, resolution);
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
