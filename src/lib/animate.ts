import type { Vec3 } from "../stores/modelTypes";
import type {
  AnimationClip,
  AnimationKeyframe,
  AnimationTrack,
  Channel,
  Interpolation,
} from "../stores/slices/animationSlice";

/**
 * Animation sampling. Channel values are offsets on top of the base pose
 * (Blockbench semantics): position and rotation are added, scale multiplies.
 */

export interface Pose {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}

/** Poses keyed by `poseKey(kind, id)`. */
export type PoseMap = Map<string, Pose>;

export const poseKey = (kind: "cube" | "bone", id: string): string => `${kind}:${id}`;

const lerpVec = (a: Vec3, b: Vec3, f: number): Vec3 => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];

export const addVec = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Uniform Catmull-Rom spline through p1 -> p2 (p0 / p3 are the neighbours). */
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};

const catmullVec = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 => [
  catmull(p0[0], p1[0], p2[0], p3[0], t),
  catmull(p0[1], p1[1], p2[1], p3[1], t),
  catmull(p0[2], p1[2], p2[2], p3[2], t),
];

const interpOf = (k: AnimationKeyframe, ch: Channel): Interpolation =>
  k.interpolation?.[ch] ?? "linear";

/**
 * Value of one channel at `time`. Only keyframes that define the channel take
 * part. Before the first one the first value is held, after the last one the
 * last value is held. `step` on the previous keyframe disables blending;
 * `catmullrom` on either side of the span uses a spline through the
 * neighbouring keyframes (missing neighbours fall back to the span's ends).
 */
function sampleChannel(
  keys: AnimationKeyframe[],
  channel: Channel,
  time: number
): Vec3 | undefined {
  const list = keys.filter((k) => k[channel]);
  if (list.length === 0) return undefined;

  let i = -1;
  for (let j = 0; j < list.length; j++) {
    if (list[j].time <= time) i = j;
    else break;
  }
  if (i < 0) return list[0][channel] as Vec3;

  const prev = list[i];
  const a = prev[channel] as Vec3;
  const next = list[i + 1];
  if (!next) return a;

  const pm = interpOf(prev, channel);
  if (pm === "step") return a;
  const span = next.time - prev.time;
  if (span <= 0) return a;
  const f = (time - prev.time) / span;
  const b = next[channel] as Vec3;

  if (pm === "catmullrom" || interpOf(next, channel) === "catmullrom") {
    const p0 = (list[i - 1]?.[channel] as Vec3 | undefined) ?? a;
    const p3 = (list[i + 2]?.[channel] as Vec3 | undefined) ?? b;
    return catmullVec(p0, a, b, p3, f);
  }
  return lerpVec(a, b, f);
}

export function sampleTrack(track: AnimationTrack, time: number): Pose | null {
  // Keyframes are kept sorted by the slice, so no sorting here.
  const position = sampleChannel(track.keyframes, "position", time);
  const rotation = sampleChannel(track.keyframes, "rotation", time);
  const scale = sampleChannel(track.keyframes, "scale", time);
  if (!position && !rotation && !scale) return null;
  const pose: Pose = {};
  if (position) pose.position = position;
  if (rotation) pose.rotation = rotation;
  if (scale) pose.scale = scale;
  return pose;
}

/** Pose of every animated target of the clip at `time` (clamped to the clip). */
export function sampleClip(clip: AnimationClip, time: number): PoseMap {
  const t = Math.min(clip.length, Math.max(0, time));
  const out: PoseMap = new Map();
  for (const track of clip.tracks) {
    const pose = sampleTrack(track, t);
    if (pose) out.set(poseKey(track.targetKind, track.targetId), pose);
  }
  return out;
}