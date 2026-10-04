import { useEffect, useMemo } from "react";
import { useModel } from "../stores/modelStore";
import type { AnimationClip } from "../stores/slices/animationSlice";

/**
 * Returns a small set of helpers for a single playback loop that
 * drives timeline position + current clip state.
 *
 * Owns the requestAnimationFrame playback loop (runs only while playing).
 */
export function useAnimation() {
  const clips = useModel((s) => s.animationClips);
  const selectedClipId = useModel((s) => s.selectedAnimationClipId);
  const playing = useModel((s) => s.playback.playing);
  const time = useModel((s) => s.playback.time);
  const timeline = useModel((s) => s.timeline);
  const speed = useModel((s) => s.playback.speed);
  const tick = useModel((s) => s.tick);

  /** Clip boundaries for timeline rendering, derived (not stored) so it can't go stale. */
  const timelineClipMap = useMemo(
    () =>
      clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        start: 0,
        end: clip.length,
        length: clip.length,
      })),
    [clips],
  );

  // Playback loop: advances the playhead with requestAnimationFrame while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      tick(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, tick]);

  const play = useModel((s) => s.play);
  const pause = useModel((s) => s.pause);
  const togglePlay = useModel((s) => s.togglePlay);
  const seek = useModel((s) => s.seek);
  const setPlayhead = useModel((s) => s.setPlayhead);
  const snapPlayhead = useModel((s) => s.snapPlayhead);
  const setSpeed = useModel((s) => s.setSpeed);
  const setSnapSeconds = useModel((s) => s.setSnapSeconds);
  const movePlayheadToStartOfSelectedClip = useModel(
    (s) => s.movePlayheadToStartOfSelectedClip,
  );
  const movePlayheadToEndOfSelectedClip = useModel(
    (s) => s.movePlayheadToEndOfSelectedClip,
  );
  const setTimelineDuration = useModel((s) => s.setTimelineDuration);

  return {
    clips,
    selectedClipId,
    playing,
    time,
    speed,
    timeline,
    timelineClipMap,
    play,
    pause,
    togglePlay,
    seek,
    setPlayhead,
    snapPlayhead,
    setSpeed,
    setSnapSeconds,
    movePlayheadToStartOfSelectedClip,
    movePlayheadToEndOfSelectedClip,
    setTimelineDuration,
    tick,
  };
}

/** Thin internal helper that mirrors the store shape for type consumers. */
export type UseAnimationReturn = ReturnType<typeof useAnimation>;
export type { AnimationClip };
