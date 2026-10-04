import { useEffect } from "react";
import { useAnimation } from "../hooks/useAnimation";
import { useModel } from "../stores/modelStore";
import type { AnimationClip } from "../stores/slices/animationSlice";

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
        style={{ height: Math.max(96, 36 + clips.length * 22) }}
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

          <div
            className="absolute top-0 bottom-0 w-0.5 bg-accent shadow-sm"
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

      <div className="flex items-center gap-3 text-zinc-400 text-[10px]">
        <span>Snap: {snapSeconds.toFixed(2)}s</span>
      </div>
    </div>
  );
}

export default function AnimationEditor() {
  const {
    clips,
    selectedClipId,
    playing,
    time,
    timeline,
    timelineClipMap,
    togglePlay,
    seek,
    setPlayhead,
    snapPlayhead,
    setTimelineDuration,
    movePlayheadToStartOfSelectedClip,
    movePlayheadToEndOfSelectedClip,
  } = useAnimation();
  const selectAnimationClip = useModel((s) => s.selectClip);
  const removeClip = useModel((s) => s.removeClip);
  const addClip = useModel((s) => s.addClip);
  const renameClip = useModel((s) => s.renameClip);
  const setClipLength = useModel((s) => s.setClipLength);


  const activeClip = clips.find((c: AnimationClip) => c.id === selectedClipId) ?? null;

  // The timeline must always be long enough to show the longest clip.
  const longestClip = clips.reduce((m: number, c: AnimationClip) => Math.max(m, c.length), 0);
  const timelineDuration = Math.max(timeline.duration, longestClip);

  useEffect(() => {
    if (longestClip > timeline.duration) setTimelineDuration(longestClip);
  }, [longestClip, timeline.duration, setTimelineDuration]);

  const handlePlayheadDrag = (t: number) => {
    const limit = activeClip ? activeClip.length : timelineDuration;
    setPlayhead(Math.min(limit, Math.max(0, t)));
  };

  return (
    <div className="flex flex-col h-full gap-2 px-3 pt-2">
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

      <div className="flex flex-col gap-3 flex-1 rounded border border-border bg-[#1a1f26] p-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
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
                  className={
                    "rounded border bg-[#22262d] px-2 py-1 text-left transition-colors hover:bg-zinc-800/60 " +
                    (selectedClipId === clip.id
                      ? "border-accent/80 bg-accent/20"
                      : "border-zinc-700")
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-medium text-zinc-200">{clip.name}</div>
                    <input
                      type="text"
                      defaultValue={clip.name}
                      onBlur={(e) => renameClip(clip.id, e.currentTarget.value || clip.name)}
                      className="w-32 bg-transparent border border-zinc-700 rounded px-1 py-0 text-zinc-200 text-xs focus:outline-none focus:border-accent/80"
                    />
                    <div className="flex items-center gap-1 text-zinc-400">
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

        <div className="mt-auto rounded border border-border bg-[#22262d] p-3 text-left text-zinc-500 text-xs">
            <div className="mb-1 font-medium text-zinc-300">Keyframes</div>
            {activeClip ? (
              <div className="flex flex-col gap-1">
                {activeClip.tracks.length === 0 ? (
                  <div className="text-zinc-500">No tracks in this clip</div>
                ) : (
                  activeClip.tracks.map((track) => (
                    <div key={track.id} className="rounded border border-border bg-[#1a1f26] p-2">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-zinc-300">
                          {track.targetKind === "bone" ? "Bone" : "Cube"}
                        </span>
                        <span className="text-zinc-500">{track.targetId}</span>
                      </div>
                      {track.keyframes.length === 0 ? (
                        <div className="text-zinc-500">No keyframes</div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {track.keyframes.map((kf) => (
                            <div
                              key={kf.time}
                              className="rounded border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-zinc-200"
                            >
                              <div className="text-zinc-400">{kf.time.toFixed(2)}s</div>
                              {kf.position && (
                                <div>pos: {kf.position.join(", ")}</div>
                              )}
                              {kf.rotation && (
                                <div>rot: {kf.rotation.join(", ")}</div>
                              )}
                              {kf.scale && (
                                <div>scl: {kf.scale.join(", ")}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="text-zinc-500">Select a clip to inspect keyframes</div>
            )}
          </div>
      </div>
    </div>
  );
}

