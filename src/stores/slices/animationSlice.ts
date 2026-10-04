import type { StateCreator } from "zustand";

export interface AnimationClip {
  id: string;
  name: string;
  length: number; // seconds
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
  setClipLength: (id: string, length: number) => void;

  addTrackToClip: (
    clipId: string,
    targetId: string,
    targetKind: "cube" | "bone",
  ) => void;
  removeTrack: (clipId: string, trackId: string) => void;
  setKeyframe: (
    clipId: string,
    trackId: string,
    keyframe: AnimationKeyframe,
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

export const createAnimationSlice: StateCreator<
  AnimationSliceState & AnimationSliceActions,
  [],
  [],
  AnimationSliceActions
> = (set, get) => ({
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

  addClip: (name: string, length: number) =>
    set((state) => {
      const nextId = newId("clip");
      return {
        animationClips: [
          ...state.animationClips,
          { id: nextId, name, length: Math.max(0.1, length), tracks: [] },
        ],
        selectedAnimationClipId: nextId,
      };
    }),

  removeClip: (id: string) =>
    set((state) => ({
      animationClips: state.animationClips.filter((c) => c.id !== id),
      selectedAnimationClipId:
        state.selectedAnimationClipId === id ? null : state.selectedAnimationClipId,
    })),

  selectClip: (id: string | null) => set({ selectedAnimationClipId: id }),

  renameClip: (id: string, name: string) =>
    set((state) => ({
      animationClips: state.animationClips.map((c) =>
        c.id === id ? { ...c, name } : c,
      ),
    })),

  setClipLength: (id: string, length: number) =>
    set((state) => ({
      animationClips: state.animationClips.map((c) =>
        c.id === id ? { ...c, length: Math.max(0.1, length) } : c,
      ),
    })),

  addTrackToClip: (clipId: string, targetId: string, targetKind: "cube" | "bone") =>
    set((state) => ({
      animationClips: state.animationClips.map((c) => {
        if (c.id !== clipId) return c;
        const trackId = newId("track");
        return {
          ...c,
          tracks: [
            ...c.tracks,
            {
              id: trackId,
              targetId,
              targetKind,
              keyframes: [],
            },
          ],
        };
      }),
    })),

  removeTrack: (clipId: string, trackId: string) =>
    set((state) => ({
      animationClips: state.animationClips.map((c) =>
        c.id === clipId
          ? { ...c, tracks: c.tracks.filter((t) => t.id !== trackId) }
          : c,
      ),
    })),

  setKeyframe: (clipId: string, trackId: string, keyframe: AnimationKeyframe) =>
    set((state) => ({
      animationClips: state.animationClips.map((c) => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          tracks: c.tracks.map((t) => {
            if (t.id !== trackId) return t;
            const existing = t.keyframes.find(
              (k) => k.time === keyframe.time,
            );
            if (existing)
              return {
                ...t,
                keyframes: t.keyframes.map((k) =>
                  k.time === keyframe.time ? keyframe : k,
                ),
              };
            return {
              ...t,
              keyframes: [...t.keyframes, keyframe].sort(
                (a, b) => a.time - b.time,
              ),
            };
          }),
        };
      }),
    })),

  removeKeyframe: (clipId: string, trackId: string, time: number) =>
    set((state) => ({
      animationClips: state.animationClips.map((c) => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          tracks: c.tracks.map((t) => {
            if (t.id !== trackId) return t;
            return {
              ...t,
              keyframes: t.keyframes.filter((k) => k.time !== time),
            };
          }),
        };
      }),
    })),

  play: () => set((s) => ({ playback: { ...s.playback, playing: true } })),
  pause: () => set((s) => ({ playback: { ...s.playback, playing: false } })),
  togglePlay: () =>
    set((s) => ({
      playback: { ...s.playback, playing: !s.playback.playing },
    })),
  seek: (time: number) => get().setPlayhead(time),
  setSpeed: (speed: number) =>
    set((s) => ({
      playback: { ...s.playback, speed: Math.min(8, Math.max(0.05, speed)) },
    })),
  tick: (dt: number) =>
    set((s) => {
      if (!s.playback.playing) return {};
      const clip = s.animationClips.find(
        (c) => c.id === s.selectedAnimationClipId,
      );
      const end = clip ? clip.length : s.timeline.duration;
      let time = s.playback.time + dt * s.playback.speed;
      let playing = true;
      if (time >= end) {
        // Stop on the last frame of the clip.
        time = end;
        playing = false;
      }
      return {
        playback: { ...s.playback, time, playing },
        timeline: { ...s.timeline, playhead: time },
      };
    }),

  setTimelineDuration: (duration: number) =>
    set((s) => ({
      timeline: { ...s.timeline, duration: Math.max(0.1, duration) },
    })),
  setPlayhead: (time: number) =>
    set((s) => {
      const t = Math.max(0, time);
      return {
        playback: { ...s.playback, time: t },
        timeline: { ...s.timeline, playhead: t },
      };
    }),
  snapPlayhead: (time: number) => {
    const step = Math.max(0.001, get().timeline.snapSeconds);
    const snapped = Math.max(0, Math.round(time / step) * step);
    // Trim float noise (0.15000000000000002 -> 0.15).
    get().setPlayhead(Number(snapped.toFixed(4)));
  },
  setSnapSeconds: (snap: number) =>
    set((s) => ({
      timeline: { ...s.timeline, snapSeconds: Math.max(0.01, snap) },
    })),
  movePlayheadToStartOfSelectedClip: () =>
    set((s) => {
      return {
        playback: { ...s.playback, time: 0 },
        timeline: { ...s.timeline, playhead: 0 },
      };
    }),
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
});

