import { useEffect, useState } from "react";
import { useAnimation } from "../hooks/useAnimation";
import { useModel, type Vec3 } from "../stores/modelStore";
import VecEditor from "../components/VecEditor";
import ErrorBoundary from "../components/ErrorBoundary";
import { EditorScene } from "../components/Viewport";
import type {
  AnimationClip,
  AnimationKeyframe,
  AnimationTrack,
  Interpolation,
} from "../stores/slices/animationSlice";

const btn =
  "rounded border border-border bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 text-[10px] disabled:pointer-events-none disabled:opacity-30";
const selectCls =
  "rounded border border-border bg-panel-2 px-1 py-0.5 text-[11px] text-neutral-200 outline-none focus:border-accent";

const SPEEDS = [0.25, 0.5, 1, 2];
const SNAPS = [0.01, 0.05, 0.1, 0.25];

function Timeline(
  props: {
    duration: number;
    playhead: number;
    snapSeconds: number;
    clips: readonly {
      id: string;
      name: string;
      start: number;
      end: number;
      length: number;
    }[];
    selectedClipId: string | null;
    keyframeTimes: number[];
    onSelectClip: (id: string | null) => void;
    onPlayheadDrag: (time: number) => void;
  },
) {
  const {
    duration,
    playhead,
    snapSeconds,
    clips,
    selectedClipId,
    keyframeTimes,
    onSelectClip,
    onPlayheadDrag,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-zinc-400 text-[10px] uppercase tracking-wider">
        <span>Timeline</span>
        <span className="text-zinc-600">/</span>
        <span>{duration.toFixed(2)}s</span>
      </div>

      <div
        className="relative overflow-hidden rounded border border-border bg-[#22262d]"
        style={{ height: Math.max(110, 64 + clips.length * 22) }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-800" />
        <div className="absolute left-0 top-0 bottom-0 w-full">
          <div className="absolute inset-0">
            {Array.from({ length: Math.max(0, Math.floor(duration)) }).map(
              (_, i) => {
                const t = i + 1;
                const x = (t / duration) * 100;
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-px bg-zinc-800"
                    style={{ left: `${x}%` }}
                  />
                );
              },
            )}
          </div>

          {clips.map((clip, row) => {
            const left = (clip.start / duration) * 100;
            const pct =
              duration > 0 ? (clip.length / duration) * 100 : 0;
            const baseClass =
              "absolute h-5 rounded px-1 text-left text-[11px] leading-none border transition-colors hover:bg-zinc-800/60";
            const selectedClass =
              "border-accent/80 bg-accent/20 text-accent";
            const unselectedClass =
              "border-zinc-700 bg-[#2a313a] text-zinc-200";
            return (
              <button
                key={clip.id}
                type="button"
                className={
                  selectedClipId === clip.id
                    ? `${baseClass} ${selectedClass}`
                    : `${baseClass} ${unselectedClass}`
                }
                style={{
                  left: `${left}%`,
                  top: 6 + row * 22,
                  width: `${Math.min(100 - left, Math.max(4, pct))}%`,
                }}
                onClick={() => onSelectClip(clip.id)}
              >
                <div className="truncate font-medium">
                  {clip.name}{" "}
                  <span className="text-zinc-500">{clip.end.toFixed(2)}s</span>
                </div>
              </button>
            );
          })}

          {/* Keyframe markers of the selected clip */}
          {duration > 0 &&
            keyframeTimes.map((t) => (
              <button
                key={t}
                type="button"
                title={`Keyframe @ ${t.toFixed(2)}s`}
                onClick={() => onPlayheadDrag(t)}
                className="absolute size-2.5 -translate-x-1/2 rotate-45 border border-amber-200 bg-amber-400 hover:bg-amber-300"
                style={{
                  left: `${Math.min(100, (t / duration) * 100)}%`,
                  bottom: 26,
                }}
              />
            ))}

          <div
            className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent shadow-sm"
            style={{ left: `calc(${Math.min(100, (playhead / duration) * 100)}% - 1px)` }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={duration}
          step={snapSeconds}
          value={Math.min(playhead, duration)}
          onChange={(e) => onPlayheadDrag(parseFloat(e.target.value))}
          className="absolute bottom-0 left-12 right-0 h-5 opacity-0 cursor-pointer"
          aria-label="Timeline scrubber"
        />

        <button
          type="button"
          className="absolute bottom-1 left-2 rounded border border-border bg-[#1a1f26] px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800"
          onClick={() => onPlayheadDrag(0)}
        >
          0s
        </button>
      </div>
    </div>
  );
}

/** Replace NaN (empty input) with 0 so bad typing never poisons a keyframe. */
const cleanVec = (v: Vec3): Vec3 =>
  v.map((n) => (Number.isFinite(n) ? n : 0)) as Vec3;

/** Time field: edits as text, commits on blur / Enter. */
function TimeField({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      step="0.05"
      min={0}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className="w-16 rounded border border-border bg-panel-2 px-1 py-0.5 text-[11px] text-neutral-200 outline-none focus:border-accent"
    />
  );
}

function ChannelEditor({
  label,
  value,
  initial,
  onChange,
  onRemove,
}: {
  label: string;
  value: Vec3 | undefined;
  initial: Vec3;
  onChange: (v: Vec3 | undefined) => void;
  onRemove: () => void;
}) {
  if (!value) {
    return (
      <button type="button" onClick={() => onChange(initial)} className={`${btn} mr-1`}>
        + {label}
      </button>
    );
  }
  return (
    <VecEditor
      label={label}
      value={value}
      onChange={(v) => onChange(cleanVec(v))}
      postfix={
        <button
          type="button"
          title={`Remove ${label} channel`}
          onClick={onRemove}
          className="rounded px-1 text-xs text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
        >
          ✕
        </button>
      }
    />
  );
}

function KeyframeRow({
  clip,
  track,
  kf,
  playhead,
  snapSeconds,
}: {
  clip: AnimationClip;
  track: AnimationTrack;
  kf: AnimationKeyframe;
  playhead: number;
  snapSeconds: number;
}) {
  const setKeyframe = useModel((s) => s.setKeyframe);
  const moveKeyframe = useModel((s) => s.moveKeyframe);
  const duplicateKeyframe = useModel((s) => s.duplicateKeyframe);
  const removeKeyframe = useModel((s) => s.removeKeyframe);
  const setPlayhead = useModel((s) => s.setPlayhead);

  const patch = (changes: Partial<Omit<AnimationKeyframe, "time">>) => {
    const next: AnimationKeyframe = { ...kf, ...changes };
    // Drop channels set to undefined so they disappear from the keyframe.
    (["position", "rotation", "scale", "interpolation"] as const).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    setKeyframe(clip.id, track.id, next);
  };

  // Duplicate onto the playhead, or just after this keyframe if the playhead is on it.
  const dupTarget =
    Math.abs(playhead - kf.time) < 1e-6 ? kf.time + snapSeconds : playhead;

  return (
    <div className="rounded border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 text-zinc-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="size-2 shrink-0 rotate-45 bg-amber-400" />
        <TimeField
          value={kf.time}
          onCommit={(n) => moveKeyframe(clip.id, track.id, kf.time, n)}
        />
        <span className="text-[10px] text-zinc-500">s</span>
        <select
          value={kf.interpolation ?? "linear"}
          onChange={(e) =>
            patch({ interpolation: e.target.value === "step" ? "step" : undefined })
          }
          title="Interpolation to the next keyframe"
          className={selectCls}
        >
          {(["linear", "step"] as Interpolation[]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button type="button" className={btn} onClick={() => setPlayhead(kf.time)} title="Move playhead here">
          Go to
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => duplicateKeyframe(clip.id, track.id, kf.time, dupTarget)}
          title="Copy this keyframe to the playhead"
        >
          Duplicate
        </button>
        <button
          type="button"
          title="Delete keyframe"
          onClick={() => removeKeyframe(clip.id, track.id, kf.time)}
          className="ml-auto rounded px-1 text-xs text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
        >
          ✕
        </button>
      </div>
      <div className="mt-1">
        <ChannelEditor
          label="Position"
          value={kf.position}
          initial={[0, 0, 0]}
          onChange={(v) => patch({ position: v })}
          onRemove={() => patch({ position: undefined })}
        />
        <ChannelEditor
          label="Rotation"
          value={kf.rotation}
          initial={[0, 0, 0]}
          onChange={(v) => patch({ rotation: v })}
          onRemove={() => patch({ rotation: undefined })}
        />
        <ChannelEditor
          label="Scale"
          value={kf.scale}
          initial={[1, 1, 1]}
          onChange={(v) => patch({ scale: v })}
          onRemove={() => patch({ scale: undefined })}
        />
      </div>
    </div>
  );
}

function KeyframesPanel({
  clip,
  playhead,
  snapSeconds,
}: {
  clip: AnimationClip | null;
  playhead: number;
  snapSeconds: number;
}) {
  const bones = useModel((s) => s.bones);
  const cubes = useModel((s) => s.cubes);
  const selectedId = useModel((s) => s.selectedId);
  const selectedKind = useModel((s) => s.selectedKind);
  const addTrackToClip = useModel((s) => s.addTrackToClip);
  const removeTrack = useModel((s) => s.removeTrack);
  const addKeyframeAt = useModel((s) => s.addKeyframeAt);

  if (!clip) {
    return (
      <div className="mt-auto rounded border border-border bg-[#22262d] p-3 text-left text-zinc-500 text-xs">
        <div className="mb-1 font-medium text-zinc-300">Keyframes</div>
        Select a clip to edit keyframes
      </div>
    );
  }

  const targetName = (track: AnimationTrack) => {
    const list = track.targetKind === "bone" ? bones : cubes;
    return list.find((x) => x.id === track.targetId)?.name ?? `${track.targetId} (missing)`;
  };

  const selectedName =
    selectedId && selectedKind
      ? (selectedKind === "bone" ? bones : cubes).find((x) => x.id === selectedId)?.name
      : null;
  const canAddTrack =
    !!selectedId && !!selectedKind && !clip.tracks.some((t) => t.targetId === selectedId);

  return (
    <div className="mt-auto flex min-h-0 flex-col gap-2 rounded border border-border bg-[#22262d] p-3 text-left text-zinc-500 text-xs">
      <div className="flex items-center gap-2">
        <div className="font-medium text-zinc-300">Keyframes</div>
        <button
          type="button"
          disabled={!canAddTrack}
          onClick={() => selectedId && selectedKind && addTrackToClip(clip.id, selectedId, selectedKind)}
          title="Animate the cube/bone selected in the Model tab (or clicked in the preview)"
          className={`${btn} ml-auto`}
        >
          + Track{selectedName ? `: ${selectedName}` : ""}
        </button>
      </div>

      {clip.tracks.length === 0 ? (
        <div className="text-zinc-500">
          No tracks yet. Select a bone or cube in the Model tab (or click a cube in the preview), then press “+ Track”.
        </div>
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {clip.tracks.map((track) => (
            <div key={track.id} className="rounded border border-border bg-[#1a1f26] p-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-panel-2 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                  {track.targetKind}
                </span>
                <span className="truncate text-zinc-300">{targetName(track)}</span>
                <button
                  type="button"
                  className={`${btn} ml-auto`}
                  onClick={() => addKeyframeAt(clip.id, track.id, playhead)}
                  title="Add a keyframe at the playhead"
                >
                  + Key @ {playhead.toFixed(2)}s
                </button>
                <button
                  type="button"
                  title="Remove track"
                  onClick={() => removeTrack(clip.id, track.id)}
                  className="rounded px-1 text-xs text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
              {track.keyframes.length === 0 ? (
                <div className="text-zinc-500">No keyframes</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {track.keyframes.map((kf) => (
                    <KeyframeRow
                      key={kf.time}
                      clip={clip}
                      track={track}
                      kf={kf}
                      playhead={playhead}
                      snapSeconds={snapSeconds}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnimationEditor() {
  const {
    clips,
    selectedClipId,
    playing,
    time,
    speed,
    timeline,
    timelineClipMap,
    togglePlay,
    pause,
    seek,
    setPlayhead,
    snapPlayhead,
    setSpeed,
    setSnapSeconds,
    setTimelineDuration,
    movePlayheadToStartOfSelectedClip,
    movePlayheadToEndOfSelectedClip,
  } = useAnimation();
  const selectAnimationClip = useModel((s) => s.selectClip);
  const removeClip = useModel((s) => s.removeClip);
  const addClip = useModel((s) => s.addClip);
  const renameClip = useModel((s) => s.renameClip);
  const setClipLength = useModel((s) => s.setClipLength);
  const setClipLoop = useModel((s) => s.setClipLoop);

  const activeClip = clips.find((c: AnimationClip) => c.id === selectedClipId) ?? null;

  // The timeline must always be long enough to show the longest clip.
  const longestClip = clips.reduce((m: number, c: AnimationClip) => Math.max(m, c.length), 0);
  const timelineDuration = Math.max(timeline.duration, longestClip);

  useEffect(() => {
    if (longestClip > timeline.duration) setTimelineDuration(longestClip);
  }, [longestClip, timeline.duration, setTimelineDuration]);

  // The playback loop lives in this screen, so leaving the tab stops playback.
  useEffect(() => () => pause(), [pause]);

  // Space = play / pause (ignored while typing in a field).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay]);

  const handlePlayheadDrag = (t: number) => {
    const limit = activeClip ? activeClip.length : timelineDuration;
    setPlayhead(Math.min(limit, Math.max(0, t)));
  };

  // Unique keyframe times of the selected clip, drawn as markers on the timeline.
  const keyframeTimes = activeClip
    ? [...new Set(activeClip.tracks.flatMap((t) => t.keyframes.map((k) => k.time)))].sort(
        (a, b) => a - b,
      )
    : [];

  return (
    <main className="flex min-h-0 w-full flex-1 flex-row items-stretch">
      {/* Left: live 3D preview of the selected clip */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center border-b border-border bg-panel px-3 text-[11px] font-semibold tracking-widest text-neutral-500">
          3D PREVIEW
          {activeClip ? (
            <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
              {activeClip.name} · {time.toFixed(2)}s
            </span>
          ) : null}
        </div>
        <div className="relative min-h-0 flex-1">
          <ErrorBoundary label="The 3D preview">
            <EditorScene mode="animation" />
          </ErrorBoundary>
          {!activeClip && (
            <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-neutral-500">
              Select or create a clip to preview it
            </div>
          )}
        </div>
      </section>

      {/* Right: clips, timeline and keyframes */}
      <aside className="flex w-[30rem] shrink-0 flex-col gap-2 overflow-y-auto border-l border-border px-3 pb-3 pt-2">
        <div className="flex gap-4">
          <button
            type="button"
            className="rounded border border-border bg-[#22262d] px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            onClick={movePlayheadToStartOfSelectedClip}
          >
            ⏮ Start
          </button>
          <button
            type="button"
            className="rounded border border-border bg-[#22262d] px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            onClick={movePlayheadToEndOfSelectedClip}
          >
            End ⏭
          </button>
        </div>

        <div className="flex shrink-0 flex-col gap-3 rounded border border-border bg-[#1a1f26] p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              title="Play / pause (Space)"
              className="rounded border border-border bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => snapPlayhead(time)}
              className="rounded border border-border bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 text-[10px]"
            >
              Snap
            </button>
            <div className="flex items-center gap-1 text-zinc-400">
              <span className="tabular-nums">{time.toFixed(2)}s</span>
              {activeClip ? (
                <span className="text-zinc-500">
                  / {activeClip.length.toFixed(2)}s
                </span>
              ) : null}
            </div>

            <label className="flex items-center gap-1 text-[10px] text-zinc-400">
              Speed
              <select
                value={SPEEDS.includes(speed) ? speed : 1}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className={selectCls}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-zinc-400">
              Snap step
              <select
                value={SNAPS.includes(timeline.snapSeconds) ? timeline.snapSeconds : 0.05}
                onChange={(e) => setSnapSeconds(parseFloat(e.target.value))}
                className={selectCls}
              >
                {SNAPS.map((s) => (
                  <option key={s} value={s}>
                    {s.toFixed(2)}s
                  </option>
                ))}
              </select>
            </label>
            <label
              className={`flex items-center gap-1 text-[10px] select-none ${
                activeClip ? "cursor-pointer text-zinc-300" : "text-zinc-600"
              }`}
            >
              <input
                type="checkbox"
                disabled={!activeClip}
                checked={!!activeClip?.loop}
                onChange={(e) => activeClip && setClipLoop(activeClip.id, e.target.checked)}
                className="accent-[var(--color-accent,#4ea1ff)]"
              />
              Loop
            </label>

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => addClip("New Clip", 1)}
                className="rounded border border-border bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 text-[10px]"
              >
                + Clip
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeClip) {
                    setClipLength(activeClip.id, activeClip.length + 0.5);
                  }
                }}
                className="rounded border border-border bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 text-[10px]"
              >
                + Length
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeClip) {
                    removeClip(activeClip.id);
                  }
                }}
                className="rounded border border-border bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700 text-[10px]"
              >
                Delete Clip
              </button>
            </div>
          </div>

          <Timeline
            duration={timelineDuration}
            playhead={timeline.playhead}
            snapSeconds={timeline.snapSeconds}
            clips={timelineClipMap}
            selectedClipId={selectedClipId}
            keyframeTimes={keyframeTimes}
            onSelectClip={(id) => {
              if (id === selectedClipId) {
                seek(0);
              } else {
                selectAnimationClip(id);
              }
            }}
            onPlayheadDrag={handlePlayheadDrag}
          />

          <div className="flex flex-col gap-1 text-zinc-400">
            <div className="text-[10px] uppercase tracking-wider">Clips</div>
            {clips.length === 0 ? (
              <div className="rounded border border-border bg-[#22262d] py-6 text-center text-zinc-500">
                No animation clips yet
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {clips.map((clip: AnimationClip) => (
                  <div
                    key={clip.id}
                    onClick={() => selectAnimationClip(clip.id)}
                    className={
                      "cursor-pointer rounded border bg-[#22262d] px-2 py-1 text-left transition-colors hover:bg-zinc-800/60 " +
                      (selectedClipId === clip.id
                        ? "border-accent/80 bg-accent/20"
                        : "border-zinc-700")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <input
                        key={clip.name}
                        type="text"
                        defaultValue={clip.name}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => renameClip(clip.id, e.currentTarget.value || clip.name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="min-w-0 flex-1 bg-transparent border border-zinc-700 rounded px-1 py-0 text-zinc-200 text-xs focus:outline-none focus:border-accent/80"
                      />
                      <div
                        className="flex items-center gap-1 text-zinc-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {clip.loop && <span title="Loops" className="text-[10px] text-accent">⟲</span>}
                        <span>{clip.length.toFixed(2)}s</span>
                        <button
                          type="button"
                          onClick={() => setClipLength(clip.id, clip.length + 0.5)}
                          className="rounded border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-400 hover:bg-zinc-700"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => setClipLength(clip.id, Math.max(0.1, clip.length - 0.5))}
                          className="rounded border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-400 hover:bg-zinc-700"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => removeClip(clip.id)}
                          className="rounded border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-400 hover:bg-red-900/60 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <KeyframesPanel
            clip={activeClip}
            playhead={timeline.playhead}
            snapSeconds={timeline.snapSeconds}
          />
        </div>
      </aside>
    </main>
  );
}