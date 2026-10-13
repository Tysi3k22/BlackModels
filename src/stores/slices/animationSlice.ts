import type { StateCreator } from "zustand";
import type { ModelState } from "../modelStore";

/** `step` holds the value until the next keyframe; `catmullrom` is a smooth spline. */
export type Interpolation = "linear" | "catmullrom" | "step";
export type Channel = "position" | "rotation" | "scale";
export const CHANNELS: Channel[] = ["position", "rotation", "scale"];

/** once = play and stop, hold = same but stays on the last frame in-game, loop = repeat. */
export type LoopMode = "once" | "hold" | "loop";

export interface AnimationClip {
  id: string;
  name: string;
  length: number; // seconds
  /** Missing = "once". */
  loopMode?: LoopMode;
  /** bbmodel `override`: the clip replaces the default pose instead of blending. */
  override?: boolean;
  /** bbmodel `snapping` (frames per second); kept for round-tripping. */
  snapping?: number;
  tracks: AnimationTrack[];
}

export interface AnimationTrack {
  id: string;
  targetId: string;
  targetKind: "cube" | "bone";
  keyframes: AnimationKeyframe[];
}

export interface AnimationKeyframe {
  time: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Per channel, like bbmodel. Missing channel = "linear". */
  interpolation?: Partial<Record<Channel, Interpolation>>;
}

export interface PlaybackState {
  playing: boolean;
  time: number;
  speed: number;
}

export interface TimelineState {
  /** Logical width of the timeline in seconds (zoom / scroll context for later phases). */
  duration: number;
  /** Playhead position in seconds. Kept in sync with playback.time in the UI layer. */
  playhead: number;
  /** Snapping step used by the timeline scrubber and keyframe placement. */
  snapSeconds: number;
}

export type AnimationSliceState = {
  animationClips: AnimationClip[];
  selectedAnimationClipId: string | null;
  playback: PlaybackState;
  timeline: TimelineState;
};

export interface AnimationSliceActions {
  addClip: (name: string, length: number) => void;
  removeClip: (id: string) => void;
  selectClip: (id: string | null) => void;
  renameClip: (id: string, name: string) => void;
  /** Never shorter than the clip's last keyframe, so no keyframe is cut off. */
  setClipLength: (id: string, length: number) => void;
  setClipLoopMode: (id: string, mode: LoopMode) => void;
  setClipOverride: (id: string, override: boolean) => void;

  addTrackToClip: (
    clipId: string,
    targetId: string,
    targetKind: "cube" | "bone",
  ) => void;
  removeTrack: (clipId: string, trackId: string) => void;
  /** Insert or replace the keyframe at `keyframe.time`. */
  setKeyframe: (
    clipId: string,
    trackId: string,
    keyframe: AnimationKeyframe,
  ) => void;
  /**
   * Add a keyframe at `time` (clamped to the clip). It starts from a copy of the
   * nearest earlier keyframe's channels (or the first one), or a zero rotation
   * when the track is empty. No-op if a keyframe already exists at that time.
   */
  addKeyframeAt: (clipId: string, trackId: string, time: number) => void;
  /** Copy a keyframe (all channels + interpolation) to another time. No-op if occupied. */
  duplicateKeyframe: (
    clipId: string,
    trackId: string,
    fromTime: number,
    toTime: number,
  ) => void;
  /** Move a keyframe to a new time. No-op if another keyframe already sits there. */
  moveKeyframe: (
    clipId: string,
    trackId: string,
    fromTime: number,
    toTime: number,
  ) => void;
  removeKeyframe: (clipId: string, trackId: string, time: number) => void;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setSpeed: (speed: number) => void;
  tick: (dt: number) => void;

  setTimelineDuration: (duration: number) => void;
  setPlayhead: (time: number) => void;
  snapPlayhead: (time: number) => void;
  setSnapSeconds: (snap: number) => void;
  /** Move playhead to start of the currently selected clip, or to 0 if none. */
  movePlayheadToStartOfSelectedClip: () => void;
  /** Move playhead to the end of the currently selected clip, clamped to timeline duration. */
  movePlayheadToEndOfSelectedClip: () => void;
}

let idCounter = 0;
/** Collision-free id (Date.now() alone repeats when called twice in one ms). */
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/** Keyframe times are stored with 4 decimals so equality checks stay reliable. */
export const roundTime = (t: number): number => Number(t.toFixed(4));

/** Copy a keyframe's channels to a new time (only the channels that exist). */
function cloneChannels(src: AnimationKeyframe, time: number): AnimationKeyframe {
  const kf: AnimationKeyframe = { time };
  if (src.position) kf.position = [...src.position];
  if (src.rotation) kf.rotation = [...src.rotation];
  if (src.scale) kf.scale = [...src.scale];
  if (src.interpolation) kf.interpolation = { ...src.interpolation };
  return kf;
}

/** End of playback: the selected clip's length, or the whole timeline. */
function playbackEnd(s: AnimationSliceState): number {
  const clip = s.animationClips.find((c) => c.id === s.selectedAnimationClipId);
  return clip ? clip.length : s.timeline.duration;
}

export const createAnimationSlice: StateCreator<
  ModelState,
  [],
  [],
  AnimationSliceState & AnimationSliceActions
> = (set, get) => {
  // Every clip edit marks the model dirty, so autosave and the unsaved-changes
  // guard see animation work too.
  const editClips = (fn: (clips: AnimationClip[]) => AnimationClip[]) =>
    set((s) => ({ dirty: true, animationClips: fn(s.animationClips) }));

  const editClip = (id: string, fn: (clip: AnimationClip) => AnimationClip) =>
    editClips((clips) => clips.map((c) => (c.id === id ? fn(c) : c)));

  const editTrack = (
    clipId: string,
    trackId: string,
    fn: (track: AnimationTrack, clip: AnimationClip) => AnimationTrack,
  ) =>
    editClip(clipId, (c) => ({
      ...c,
      tracks: c.tracks.map((t) => (t.id === trackId ? fn(t, c) : t)),
    }));

  const byTime = (a: AnimationKeyframe, b: AnimationKeyframe) => a.time - b.time;

  return {
    animationClips: [],
    selectedAnimationClipId: null,
    playback: {
      playing: false,
      time: 0,
      speed: 1,
    },
    timeline: {
      duration: 5,
      playhead: 0,
      snapSeconds: 0.05,
    },

    addClip: (name, length) =>
      set((state) => {
        const nextId = newId("clip");
        return {
          dirty: true,
          animationClips: [
            ...state.animationClips,
            { id: nextId, name, length: Math.max(0.1, length), tracks: [] },
          ],
          selectedAnimationClipId: nextId,
        };
      }),

    removeClip: (id) =>
      set((state) => ({
        dirty: true,
        animationClips: state.animationClips.filter((c) => c.id !== id),
        selectedAnimationClipId:
          state.selectedAnimationClipId === id ? null : state.selectedAnimationClipId,
      })),

    selectClip: (id) => set({ selectedAnimationClipId: id }),

    renameClip: (id, name) => editClip(id, (c) => ({ ...c, name })),

    setClipLength: (id, length) =>
      editClip(id, (c) => {
        const lastKey = c.tracks.reduce(
          (m, t) => t.keyframes.reduce((mm, k) => Math.max(mm, k.time), m),
          0,
        );
        return { ...c, length: roundTime(Math.max(0.1, lastKey, length)) };
      }),

    setClipLoopMode: (id, mode) =>
      editClip(id, (c) => ({ ...c, loopMode: mode === "once" ? undefined : mode })),

    setClipOverride: (id, override) =>
      editClip(id, (c) => ({ ...c, override: override ? true : undefined })),

    addTrackToClip: (clipId, targetId, targetKind) =>
      editClip(clipId, (c) => {
        // One track per target: a second one would just fight the first.
        if (c.tracks.some((t) => t.targetId === targetId)) return c;
        return {
          ...c,
          tracks: [
            ...c.tracks,
            { id: newId("track"), targetId, targetKind, keyframes: [] },
          ],
        };
      }),

    removeTrack: (clipId, trackId) =>
      editClip(clipId, (c) => ({
        ...c,
        tracks: c.tracks.filter((t) => t.id !== trackId),
      })),

    setKeyframe: (clipId, trackId, keyframe) =>
      editTrack(clipId, trackId, (t) => {
        const exists = t.keyframes.some((k) => k.time === keyframe.time);
        return {
          ...t,
          keyframes: exists
            ? t.keyframes.map((k) => (k.time === keyframe.time ? keyframe : k))
            : [...t.keyframes, keyframe].sort(byTime),
        };
      }),

    addKeyframeAt: (clipId, trackId, time) =>
      editTrack(clipId, trackId, (tr, c) => {
        const t = roundTime(Math.min(c.length, Math.max(0, time)));
        if (tr.keyframes.some((k) => k.time === t)) return tr;
        const before = [...tr.keyframes].reverse().find((k) => k.time < t);
        const src = before ?? tr.keyframes[0];
        const kf: AnimationKeyframe = src
          ? cloneChannels(src, t)
          : { time: t, rotation: [0, 0, 0] };
        return { ...tr, keyframes: [...tr.keyframes, kf].sort(byTime) };
      }),

    duplicateKeyframe: (clipId, trackId, fromTime, toTime) =>
      editTrack(clipId, trackId, (tr, c) => {
        const to = roundTime(Math.min(c.length, Math.max(0, toTime)));
        const src = tr.keyframes.find((k) => k.time === fromTime);
        if (!src || tr.keyframes.some((k) => k.time === to)) return tr;
        return {
          ...tr,
          keyframes: [...tr.keyframes, cloneChannels(src, to)].sort(byTime),
        };
      }),

    moveKeyframe: (clipId, trackId, fromTime, toTime) =>
      editTrack(clipId, trackId, (tr, c) => {
        const to = roundTime(Math.min(c.length, Math.max(0, toTime)));
        if (to === fromTime) return tr;
        if (tr.keyframes.some((k) => k.time === to)) return tr;
        return {
          ...tr,
          keyframes: tr.keyframes
            .map((k) => (k.time === fromTime ? { ...k, time: to } : k))
            .sort(byTime),
        };
      }),

    removeKeyframe: (clipId, trackId, time) =>
      editTrack(clipId, trackId, (t) => ({
        ...t,
        keyframes: t.keyframes.filter((k) => k.time !== time),
      })),

    play: () =>
      set((s) => {
        // Pressing Play at the end restarts instead of doing nothing.
        const atEnd = s.playback.time >= playbackEnd(s);
        const time = atEnd ? 0 : s.playback.time;
        return {
          playback: { ...s.playback, playing: true, time },
          timeline: { ...s.timeline, playhead: time },
        };
      }),
    pause: () => set((s) => ({ playback: { ...s.playback, playing: false } })),
    togglePlay: () => {
      if (get().playback.playing) get().pause();
      else get().play();
    },
    seek: (time) => get().setPlayhead(time),
    setSpeed: (speed) =>
      set((s) => ({
        playback: { ...s.playback, speed: Math.min(8, Math.max(0.05, speed)) },
      })),
    tick: (dt) =>
      set((s) => {
        if (!s.playback.playing) return {};
        const clip = s.animationClips.find((c) => c.id === s.selectedAnimationClipId);
        const end = clip ? clip.length : s.timeline.duration;
        let time = s.playback.time + dt * s.playback.speed;
        let playing = true;
        if (time >= end) {
          if (clip?.loopMode === "loop" && end > 0) {
            time = time % end;
          } else {
            // Stop on the last frame of the clip.
            time = end;
            playing = false;
          }
        }
        return {
          playback: { ...s.playback, time, playing },
          timeline: { ...s.timeline, playhead: time },
        };
      }),

    setTimelineDuration: (duration) =>
      set((s) => ({
        timeline: { ...s.timeline, duration: Math.max(0.1, duration) },
      })),
    setPlayhead: (time) =>
      set((s) => {
        const t = Math.max(0, time);
        return {
          playback: { ...s.playback, time: t },
          timeline: { ...s.timeline, playhead: t },
        };
      }),
    snapPlayhead: (time) => {
      const step = Math.max(0.001, get().timeline.snapSeconds);
      const snapped = Math.max(0, Math.round(time / step) * step);
      // Trim float noise (0.15000000000000002 -> 0.15).
      get().setPlayhead(Number(snapped.toFixed(4)));
    },
    setSnapSeconds: (snap) =>
      set((s) => ({
        timeline: { ...s.timeline, snapSeconds: Math.max(0.01, snap) },
      })),
    movePlayheadToStartOfSelectedClip: () =>
      set((s) => ({
        playback: { ...s.playback, time: 0 },
        timeline: { ...s.timeline, playhead: 0 },
      })),
    movePlayheadToEndOfSelectedClip: () =>
      set((s) => {
        const clip =
          s.selectedAnimationClipId != null
            ? s.animationClips.find((c) => c.id === s.selectedAnimationClipId)
            : null;
        const maxTime =
          clip != null ? Math.min(s.timeline.duration, clip.length) : 0;
        return {
          playback: { ...s.playback, time: maxTime },
          timeline: { ...s.timeline, playhead: maxTime },
        };
      }),
  };
};