import type { Vec3 } from "../stores/modelTypes";
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

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

const INTERPOLATIONS: Interpolation[] = ["linear", "catmullrom", "step"];
const LOOP_MODES: LoopMode[] = ["once", "hold", "loop"];

function parseKeyframes(value: unknown): AnimationKeyframe[] {
  if (!Array.isArray(value)) return [];
  const byTime = new Map<number, AnimationKeyframe>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const k = raw as Record<string, unknown>;
    if (typeof k.time !== "number" || !Number.isFinite(k.time) || k.time < 0) continue;
    const kf: AnimationKeyframe = { time: roundTime(k.time) };
    for (const ch of CHANNELS) {
      const v = k[ch];
      if (isVec3(v)) kf[ch] = [...v];
    }
    if (!kf.position && !kf.rotation && !kf.scale) continue;
    if (k.interpolation && typeof k.interpolation === "object") {
      const map: Partial<Record<Channel, Interpolation>> = {};
      for (const ch of CHANNELS) {
        const m = (k.interpolation as Record<string, unknown>)[ch];
        if (kf[ch] && INTERPOLATIONS.includes(m as Interpolation) && m !== "linear") {
          map[ch] = m as Interpolation;
        }
      }
      if (Object.keys(map).length > 0) kf.interpolation = map;
    }
    byTime.set(kf.time, kf); // a duplicate time keeps the last one
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function parseTracks(value: unknown): AnimationTrack[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  const usedTargets = new Set<string>();
  const out: AnimationTrack[] = [];
  value.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const t = raw as Record<string, unknown>;
    if (typeof t.targetId !== "string" || !t.targetId) return;
    if (t.targetKind !== "bone" && t.targetKind !== "cube") return;
    if (usedTargets.has(t.targetId)) return; // one track per target
    usedTargets.add(t.targetId);
    let id = typeof t.id === "string" && t.id ? t.id : `track-${i + 1}`;
    if (usedIds.has(id)) id = `${id}-${i + 1}`;
    usedIds.add(id);
    out.push({
      id,
      targetId: t.targetId,
      targetKind: t.targetKind,
      keyframes: parseKeyframes(t.keyframes),
    });
  });
  return out;
}

/**
 * Parse the `animations` array of a .bmproj. Missing = no animations;
 * unusable entries are dropped, the rest is repaired (sorted keyframes, unique
 * ids, clip length at least as long as its last keyframe).
 */
export function parseAnimations(value: unknown): AnimationClip[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Corrupted animation list in project file");
  const usedIds = new Set<string>();
  const out: AnimationClip[] = [];
  value.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const c = raw as Record<string, unknown>;
    let id = typeof c.id === "string" && c.id ? c.id : `clip-${i + 1}`;
    if (usedIds.has(id)) id = `${id}-${i + 1}`;
    usedIds.add(id);
    const tracks = parseTracks(c.tracks);
    const lastKey = tracks.reduce(
      (m, t) => t.keyframes.reduce((mm, k) => Math.max(mm, k.time), m),
      0
    );
    const declared = typeof c.length === "number" && Number.isFinite(c.length) ? c.length : 0;
    const clip: AnimationClip = {
      id,
      name: typeof c.name === "string" && c.name ? c.name : `Animation ${i + 1}`,
      length: roundTime(Math.max(0.1, lastKey, declared)),
      tracks,
    };
    if (LOOP_MODES.includes(c.loopMode as LoopMode) && c.loopMode !== "once") {
      clip.loopMode = c.loopMode as LoopMode;
    }
    if (c.override === true) clip.override = true;
    if (typeof c.snapping === "number" && Number.isFinite(c.snapping) && c.snapping > 0) {
      clip.snapping = c.snapping;
    }
    out.push(clip);
  });
  return out;
}