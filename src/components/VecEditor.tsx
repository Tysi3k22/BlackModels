import { useEffect, useState } from "react";
import type { Vec3 } from "../stores/modelStore";

interface VecEditorProps {
  label?: string;
  value: Vec3;
  onChange: (value: Vec3) => void;
  colors?: [string, string, string];
  postfix?: React.ReactNode;
}

export default function VecEditor({
  label,
  value: [vx, vy, vz],
  onChange,
  colors = ["#ff5f56", "#7dd87d", "#5b8def"],
  postfix,
}: VecEditorProps) {
  const [draft, setDraft] = useState<Vec3>([vx, vy, vz]);

  useEffect(() => setDraft([vx, vy, vz]), [vx, vy, vz]);

  const commit = () => onChange(draft);
  const channel: Array<"X" | "Y" | "Z"> = ["X", "Y", "Z"];

  return (
    <div className="mt-1">
      {label && (
        <div className="-mx-1 mb-0.5 text-[10px] uppercase tracking-widest text-neutral-500">
          {label}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {channel.map((ch, i) => (
          <span
            key={ch}
            className="inline-flex size-3 shrink-0 items-center justify-center rounded text-[9px] text-white font-bold"
            style={{ backgroundColor: colors[i] ?? "#999" }}
          >
            {ch}
          </span>
        ))}
        {draft.map((v, i) => (
          <input
            key={i}
            type="number"
            step="any"
            inputMode="decimal"
            value={String(v)}
            onInput={(e) =>
              setDraft((prev) => {
                const next = [...prev] as Vec3;
                next[i] = parseFloat(e.currentTarget.value ?? "0");
                return next;
              })
            }
            onBlur={commit}
            className="min-w-[9ch] rounded-md border border-border bg-[#22262d] px-1.5 py-1 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        ))}
        {postfix ?? null}
      </div>
    </div>
  );
}
