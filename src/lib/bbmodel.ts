import { saveTextFile } from "./files";
import { pushRecent } from "./recent";
import { clampUV, type UVRect } from "./uv";
import {
  BB_MARKER_COLORS,
  Bone,
  Cube,
  CubeFaces,
  FaceName,
  ProjectTexture,
  RenderMode,
  RenderSides,
  Vec3,
  newTextureId,
  useModel,
} from "../stores/modelStore";
import {
  CHANNELS,
  roundTime,
  type AnimationClip,
  type AnimationKeyframe,
  type AnimationTrack,
  type Channel,
  type Interpolation,
  type LoopMode,
} from "../stores/slices/animationSlice";

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
  faces?: Record<string, BbFace>;
  uuid?: string;
  rescale?: boolean;
  locked?: boolean;
  autouv?: number;
  visibility?: boolean;
  shade?: boolean;
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
  render_mode?: string;
  render_sides?: string;
}

/** One bbmodel keyframe = one channel at one time (x/y/z are numbers or strings). */
interface BbKeyframe {
  channel: string;
  data_points: { x: number | string; y: number | string; z: number | string }[];
  uuid?: string;
  time: number;
  color?: number;
  interpolation?: string;
}

interface BbAnimator {
  name: string;
  type: string;
  keyframes: BbKeyframe[];
}

interface BbAnimation {
  uuid?: string;
  name: string;
  loop?: string;
  override?: boolean;
  length: number;
  snapping?: number;
  selected?: boolean;
  anim_time_update?: string;
  blend_weight?: string;
  start_delay?: string;
  loop_delay?: string;
  animators?: Record<string, BbAnimator>;
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
  animations?: BbAnimation[];
}

/** Shape of a parsed .bbmodel that the store accepts. */
export interface ParsedBbmodel {
  name: string;
  cubes: Cube[];
  bones: Bone[];
  textures: ProjectTexture[];
  resolution: [number, number];
  animations: AnimationClip[];
  meta?: Record<string, unknown>;
}


const FACE_ORDER: FaceName[] = ["north", "east", "south", "west", "up", "down"];

/** bbmodel face texture index -> our stable texture id (null = dropped texture). */
type TextureIdMap = Map<number, string | null>;

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuid = (id: string): string => (UUID_RE.test(id) ? id : randomUuid());

/**
 * Best-effort extraction of the Blockbench format version + model format.
 * Missing fields are treated as "unknown", not as an error.
 */
function readBbmodelMeta(meta: Record<string, unknown>): {
  formatVersion: string | null;
  modelFormat: string | null;
  agent?: string | null;
} {
  const formatVersion: string | null =
    typeof meta.format_version === "string"
      ? meta.format_version
      : typeof meta.format_version === "number"
        ? String(meta.format_version)
        : null;
  const modelFormat: string | null =
    typeof meta.model_format === "string" ? meta.model_format.toLowerCase() : null;
  const agent: string | null =
    typeof meta.agent === "string" && meta.agent.length > 0 ? meta.agent : null;
  return { formatVersion, modelFormat, agent };
}

/**
 * bbmodel faces store a texture *index* into the texture list. Ours store a
 * stable id, so every face has to be remapped on import and export.
 */
function toFace(
  raw: BbFace | undefined,
  textureIds: TextureIdMap,
  resolution: [number, number]
): { uv: UVRect; texture: string | null } | null {
  if (!raw || !Array.isArray(raw.uv) || raw.uv.length < 4) return null;
  const [x1, y1, x2, y2] = raw.uv.slice(0, 4).map(Number);
  if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) return null;
  const uv = clampUV([x1, y1, x2, y2], resolution);
  const index = typeof raw.texture === "number" ? raw.texture : null;
  return { uv, texture: index != null ? textureIds.get(index) ?? null : null };
}

function toFaces(
  raw: unknown,
  textureIds: TextureIdMap,
  resolution: [number, number]
): CubeFaces | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, BbFace>;
  const out: CubeFaces = {};
  for (const face of FACE_ORDER) {
    const parsed = toFace(record[face], textureIds, resolution);
    if (parsed) out[face] = parsed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function toCube(
  el: BbElement,
  index: number,
  boneId: string | null,
  textureIds: TextureIdMap,
  resolution: [number, number],
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
    inflate: typeof el.inflate === "number" && Number.isFinite(el.inflate) ? el.inflate : undefined,
    marker: el.color,
    color: BB_MARKER_COLORS[((el.color ?? 0) % BB_MARKER_COLORS.length + BB_MARKER_COLORS.length) % BB_MARKER_COLORS.length],
    faces: toFaces(el.faces, textureIds, resolution),
    boneId,
    shade: el.shade === false ? false : undefined,
    hidden: el.visibility === false || inHitbox ? true : undefined,
  };
}

/** Numeric value of a data point; Molang expressions / junk give null. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const BB_CHANNELS: readonly string[] = CHANNELS;

/**
 * bbmodel animations -> clips. bbmodel keeps one keyframe per channel and time
 * (each with its own interpolation) under an animator keyed by the group uuid;
 * ours merge the channels of one time into one keyframe. Animators that point
 * at neither an imported bone nor a cube (effects, locators…) and channels we
 * cannot represent (sound, particle, timeline, Molang, bezier) are skipped or
 * simplified, with a console warning.
 */
function parseBbAnimations(
  raw: unknown,
  boneIdByUuid: Map<string, string>,
  cubeIds: Set<string>
): AnimationClip[] {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set<string>();
  const out: AnimationClip[] = [];
  let skippedAnimators = 0;
  let skippedChannels = 0;
  let expressions = 0;
  let beziers = 0;

  raw.forEach((a: BbAnimation, i) => {
    if (!a || typeof a !== "object") return;
    let id = typeof a.uuid === "string" && a.uuid ? a.uuid : `clip-${i + 1}`;
    if (usedIds.has(id)) id = `${id}-${i + 1}`;
    usedIds.add(id);

    const tracks: AnimationTrack[] = [];
    for (const [uuid, animator] of Object.entries(a.animators ?? {})) {
      const boneId = boneIdByUuid.get(uuid);
      const target: { kind: "bone" | "cube"; id: string } | null = boneId
        ? { kind: "bone", id: boneId }
        : cubeIds.has(uuid)
          ? { kind: "cube", id: uuid }
          : null;
      if (!target || !Array.isArray(animator?.keyframes)) {
        skippedAnimators++;
        continue;
      }

      const byTime = new Map<number, AnimationKeyframe>();
      for (const k of animator.keyframes) {
        if (!BB_CHANNELS.includes(k?.channel)) {
          skippedChannels++;
          continue;
        }
        const channel = k.channel as Channel;
        const time = typeof k.time === "number" && Number.isFinite(k.time) ? roundTime(Math.max(0, k.time)) : null;
        const dp = Array.isArray(k.data_points) ? k.data_points[0] : undefined;
        if (time == null || !dp) continue;

        const xyz = [dp.x, dp.y, dp.z].map((v) => {
          const n = toNumber(v);
          if (n == null) expressions++;
          return n ?? 0;
        }) as Vec3;

        let interp: Interpolation = "linear";
        if (k.interpolation === "catmullrom" || k.interpolation === "step") interp = k.interpolation;
        else if (k.interpolation === "bezier") beziers++;

        const kf = byTime.get(time) ?? { time };
        kf[channel] = xyz;
        if (interp !== "linear") kf.interpolation = { ...kf.interpolation, [channel]: interp };
        byTime.set(time, kf);
      }

      const keyframes = [...byTime.values()].sort((x, y) => x.time - y.time);
      if (keyframes.length === 0) continue;
      tracks.push({
        id: `track-${i + 1}-${tracks.length + 1}`,
        targetId: target.id,
        targetKind: target.kind,
        keyframes,
      });
    }

    const lastKey = tracks.reduce(
      (m, t) => t.keyframes.reduce((mm, k) => Math.max(mm, k.time), m),
      0
    );
    const declared = typeof a.length === "number" && Number.isFinite(a.length) ? a.length : 0;
    const clip: AnimationClip = {
      id,
      name: a.name || `Animation ${i + 1}`,
      length: roundTime(Math.max(0.1, lastKey, declared)),
      tracks,
    };
    if (a.loop === "loop" || a.loop === "hold") clip.loopMode = a.loop as LoopMode;
    if (a.override === true) clip.override = true;
    if (typeof a.snapping === "number" && Number.isFinite(a.snapping) && a.snapping > 0) {
      clip.snapping = a.snapping;
    }
    out.push(clip);
  });

  if (skippedAnimators || skippedChannels || expressions || beziers) {
    console.warn(
      `bbmodel animations: skipped ${skippedAnimators} animator(s) without a bone/cube, ` +
        `${skippedChannels} non-transform keyframe(s); ${expressions} Molang/invalid value(s) read as 0; ` +
        `${beziers} bezier keyframe(s) read as linear.`
    );
  }
  return out;
}

export function parseBbmodel(json: string): ParsedBbmodel {
  const raw = JSON.parse(json) as BbModel | unknown;
  if (!raw || typeof raw !== "object") {
    throw new Error("Not a valid .bbmodel file");
  }
  const data = raw as BbModel;
  if (!Array.isArray(data.elements)) {
    throw new Error("Not a valid .bbmodel file");
  }

  const rawMeta = data.meta && typeof data.meta === "object" ? data.meta : {};
  const { formatVersion, modelFormat, agent } = readBbmodelMeta(rawMeta as Record<string, unknown>);

  // Diagnostics-only: we do not reject files just because the version/format is
  // undocumented. Older Blockbench exports sometimes omit `format_version`.
  const meta = Object.assign(
    { agent: agent ?? undefined, modelFormat: modelFormat ?? undefined },
    formatVersion != null ? { formatVersion } : {}
  ) as Record<string, unknown>;

  const resolution: [number, number] = data.resolution
    ? [data.resolution.width, data.resolution.height]
    : [256, 256];

  // Textures first: cubes need the index -> id map. Textures that are not
  // embedded (external file paths) are dropped, and because the map is built
  // per original index, the remaining textures never shift.
  const textureIds: TextureIdMap = new Map();
  const textures: ProjectTexture[] = [];
  (data.textures ?? []).forEach((t, i) => {
    if (typeof t.source !== "string" || !t.source.startsWith("data:")) {
      textureIds.set(i, null);
      return;
    }
    const id = newTextureId();
    textureIds.set(i, id);
    const renderMode: RenderMode = (["emissive", "additive", "layered"] as const).find(
      (m) => m === t.render_mode
    ) ?? "default";
    const sides: RenderSides = t.render_sides === "front" || t.render_sides === "double" ? t.render_sides : "auto";
    const tex: ProjectTexture = { id, source: t.source, name: t.name ?? `texture-${i}.png` };
    // Only keep non-default settings so plain models stay plain
    if (renderMode !== "default" || sides !== "auto") tex.material = { renderMode, sides };
    textures.push(tex);
  });

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
    .filter((el) => (el.type === "cube" || isVec3(el.from)) && isVec3(el.from) && isVec3(el.to))
    .map((el, i) => {
      const parentId = cubeParent.get(el.uuid ?? "") ?? null;
      return toCube(el, i, parentId, textureIds, resolution, parentId != null && hitboxGroups.has(parentId));
    });

  const animations = parseBbAnimations(
    data.animations,
    boneIdByUuid,
    new Set(cubes.map((c) => c.id))
  );

  return {
    name: data.name || "Imported model",
    cubes,
    bones,
    textures,
    resolution,
    animations,
    meta,
  };
}

function toBbElement(cube: Cube, textureIndexById: Map<string, number>, uuid: string): BbElement {
  const el: BbElement = {
    name: cube.name,
    rescale: false,
    locked: false,
    from: cube.from,
    to: cube.to,
    autouv: 0,
    color: cube.marker ?? 0,
    faces: {} as Record<string, BbFace>,
    type: "cube",
    visibility: cube.hidden ? false : undefined,
    uuid,
  };
  if (cube.inflate !== undefined) el.inflate = cube.inflate;
  if (cube.shade === false) el.shade = false;
  if (cube.rotation.some((r) => r !== 0)) el.rotation = cube.rotation;
  el.origin = cube.origin ?? [
    (cube.from[0] + cube.to[0]) / 2,
    (cube.from[1] + cube.to[1]) / 2,
    (cube.from[2] + cube.to[2]) / 2,
  ];

  const faces = cube.faces ?? {};
  const outFaces = el.faces as Record<string, BbFace>;
  for (const face of FACE_ORDER) {
    const f = faces[face];
    if (f && f.uv) {
      // bbmodel faces reference textures by index; unknown ids fall back to the first texture
      outFaces[face] = {
        uv: f.uv,
        texture: f.texture != null ? textureIndexById.get(f.texture) ?? 0 : 0,
      };
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

function toBbGroup(bone: Bone, uuid: string, cubeUuids: string[], childGroups: BbGroup[]): BbGroup {
  return {
    name: bone.name,
    origin: bone.origin,
    rotation: bone.rotation.some((r) => r !== 0) ? bone.rotation : undefined,
    color: bone.marker ?? 0,
    uuid,
    export: true,
    isOpen: true,
    locked: false,
    visibility: !bone.hidden,
    autouv: 0,
    children: [...cubeUuids, ...childGroups],
  };
}

/** Clip -> bbmodel animation. Animators are keyed by the same uuids the groups / cubes are written with. */
function toBbAnimation(
  clip: AnimationClip,
  bones: Map<string, { name: string; uuid: string }>,
  cubes: Map<string, { name: string; uuid: string }>
): BbAnimation {
  const animators: Record<string, BbAnimator> = {};
  for (const track of clip.tracks) {
    const target = (track.targetKind === "bone" ? bones : cubes).get(track.targetId);
    if (!target) continue; // target no longer exists
    const keyframes: BbKeyframe[] = [];
    for (const kf of track.keyframes) {
      for (const channel of CHANNELS) {
        const v = kf[channel];
        if (!v) continue;
        keyframes.push({
          channel,
          data_points: [{ x: v[0], y: v[1], z: v[2] }],
          uuid: randomUuid(),
          time: kf.time,
          color: -1,
          interpolation: kf.interpolation?.[channel] ?? "linear",
        });
      }
    }
    animators[target.uuid] = {
      name: target.name,
      type: track.targetKind === "bone" ? "bone" : "cube",
      keyframes,
    };
  }
  return {
    uuid: toUuid(clip.id),
    name: clip.name,
    loop: clip.loopMode ?? "once",
    override: clip.override === true,
    length: clip.length,
    snapping: clip.snapping ?? 20,
    selected: false,
    anim_time_update: "",
    blend_weight: "",
    start_delay: "",
    loop_delay: "",
    animators,
  };
}

export function serializeBbmodel(
  name: string,
  cubes: Cube[],
  bones: Bone[],
  textures: ProjectTexture[],
  resolution: [number, number],
  animations: AnimationClip[] = []
): string {
  const textureIndexById = new Map(textures.map((t, i) => [t.id, i]));
  // Written once so groups/elements and animators always agree on their uuids.
  const cubeInfo = new Map(cubes.map((c) => [c.id, { name: c.name, uuid: toUuid(c.id) }]));
  const boneInfo = new Map(bones.map((b) => [b.id, { name: b.name, uuid: toUuid(b.id) }]));
  const elements = cubes.map((c) =>
    toBbElement(c, textureIndexById, (cubeInfo.get(c.id) as { uuid: string }).uuid)
  );

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
      (boneInfo.get(bone.id) as { uuid: string }).uuid,
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

  const meta: Record<string, unknown> = {
    format_version: "4.0",
    model_format: "free",
    box_uv: false,
  };
  const model: BbModel = {
    meta,
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
      render_mode: t.material?.renderMode ?? "default",
      render_sides: t.material?.sides ?? "auto",
      visible: true,
      mode: "bitmap",
      saved: false,
      uuid: randomUuid(),
      relative_path: `../${t.name}`,
      source: t.source,
    })),
    animations:
      animations.length > 0
        ? animations.map((clip) => toBbAnimation(clip, boneInfo, cubeInfo))
        : undefined,
  };
  // Undefined fields are dropped and defaults restored for the JSON output
  const clean = JSON.parse(JSON.stringify(model)) as BbModel;
  clean.visible_box = [1, 1, 0];
  return JSON.stringify(clean, null, 2);
}

export async function exportBbmodel(): Promise<boolean> {
  const { name, cubes, bones, textures, resolution, animationClips } = useModel.getState();
  const safeName = (name || "model").replace(/[^\w\- ]+/g, "_");
  const contents = serializeBbmodel(name, cubes, bones, textures, resolution, animationClips);
  const saved = await saveTextFile({
    defaultName: `${safeName}.${BB_EXTENSION}`,
    filters: [BB_FILTER],
    contents,
  });
  if (saved) {
    useModel.getState().markSaved();
    if (cubes.length > 0) {
      pushRecent({ name, format: "bbmodel", data: contents });
    }
  }
  return saved;
}