import type { Vec3 } from "../stores/modelTypes";
import type {
  AnimationClip,
  AnimationKeyframe,
  AnimationTrack,
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

type Channel = "position" | "rotation" | "scale";

const lerpVec = (a: Vec3, b: Vec3, f: number): Vec3 => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];

export const addVec = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Value of one channel at `time`. Only keyframes that define the channel take
 * part. Before the first one the first value is held, after the last one the
 * last value is held. `step` on the previous keyframe disables blending.
 */
function sampleChannel(
  keys: AnimationKeyframe[],
  channel: Channel,
  time: number
): Vec3 | undefined {
  let prev: AnimationKeyframe | undefined;
  let next: AnimationKeyframe | undefined;
  for (const k of keys) {
    if (!k[channel]) continue;
    if (k.time <= time) prev = k;
    else {
      next = k;
      break;
    }
  }
  if (!prev && !next) return undefined;
  if (!prev) return next![channel] as Vec3;
  const a = prev[channel] as Vec3;
  if (!next || prev.interpolation === "step") return a;
  const span = next.time - prev.time;
  if (span <= 0) return a;
  return lerpVec(a, next[channel] as Vec3, (time - prev.time) / span);
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