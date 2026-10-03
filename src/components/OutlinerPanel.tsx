import { useState } from "react";
import Outliner from "./Outliner";
import IssueList from "./IssueList";

/**
 * Combines the hierarchy outliner with a collapsed, off-by-default Issues panel.
 * The list is recomputed live, but it stays hidden until the user expands it.
 */
export default function OutlinerPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-0">
      <Outliner />
      <div className="shrink-0 border-t border-border p-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-1 text-left text-[11px] font-semibold tracking-widest text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <span className="inline-block w-3 shrink-0 text-center text-[10px] text-neutral-500">
            {open ? "▾" : "▸"}
          </span>
          Issues
          {open ? null : <span className="ml-auto text-[10px] text-neutral-600">{/* off by default */}</span>}
        </button>
        {open && <IssueList />}
      </div>
    </div>
  );
}
