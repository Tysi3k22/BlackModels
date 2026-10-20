import { useEffect, useState, type ReactNode } from "react";
import type { Vec3 } from "../stores/modelStore";

interface VecEditorProps {
  label?: string;
  value: Vec3;
  onChange: (value: Vec3) => void;
  colors?: [string, string, string];
  postfix?: ReactNode;
}

const AXES = ["X", "Y", "Z"] as const;
const fmt = (n: number) => String(+n.toFixed(4));

export default function VecEditor({
  label,
  value,
  onChange,
  colors = ["#ff5f56", "#7dd87d", "#5b8def"],
  postfix,
}: VecEditorProps) {
  const [vx, vy, vz] = value;
  const [draft, setDraft] = useState<string[]>([fmt(vx), fmt(vy), fmt(vz)]);

  useEffect(() => setDraft([fmt(vx), fmt(vy), fmt(vz)]), [vx, vy, vz]);

  /** Drafts -> numbers; untouched or invalid fields keep their current value. */
  const resolve = (): Vec3 => {
    const cur: Vec3 = [vx, vy, vz];
    return cur.map((c, i) => {
      if (draft[i] === fmt(c)) return c;
      const n = parseFloat(draft[i].replace(",", "."));
      return Number.isFinite(n) ? n : c;
    }) as Vec3;
  };

  const commit = () => {
    const next = resolve();
    setDraft(next.map(fmt));
    if (next[0] !== vx || next[1] !== vy || next[2] !== vz) onChange(next);
  };

  const nudge = (i: number, dir: 1 | -1, e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const next = resolve();
    next[i] = +(next[i] + dir * step).toFixed(4);
    setDraft(next.map(fmt));
    onChange(next);
  };

  return (
    <div>
      {label && <div className="mb-1 text-[11px] font-medium text-neutral-500">{label}</div>}
      <div className="flex items-center gap-1.5">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
          {AXES.map((axis, i) => (
            <label
              key={axis}
              className="flex min-w-0 items-center overflow-hidden rounded-md border border-border bg-[#22262d] transition-colors focus-within:border-accent/60"
            >
              <span
                className="flex w-4 shrink-0 items-center justify-center self-stretch text-[9px] font-bold text-black/80"
                style={{ backgroundColor: colors[i] ?? "#999" }}
              >
                {axis}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={draft[i]}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  setDraft((prev) => prev.map((s, j) => (j === i ? e.target.value : s)))
                }
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") {
                    setDraft([fmt(vx), fmt(vy), fmt(vz)]);
                    e.currentTarget.blur();
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    nudge(i, 1, e);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    nudge(i, -1, e);
                  }
                }}
                className="w-full min-w-0 bg-transparent px-1.5 py-1 text-xs tabular-nums text-white outline-none"
              />
            </label>
          ))}
        </div>
        {postfix ?? null}
      </div>
    </div>
  );
}