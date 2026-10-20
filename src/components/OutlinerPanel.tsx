import { useState } from "react";
import Outliner from "./Outliner";
import IssueList from "./IssueList";
import { useModel } from "../stores/modelStore";

/**
 * Combines the hierarchy outliner with a collapsed, off-by-default Issues panel.
 * The list is recomputed live; the badge summarises it without expanding.
 */
export default function OutlinerPanel() {
  const [open, setOpen] = useState(false);
  const issues = useModel((s) => s.issues);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;

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
          {errorCount > 0 ? (
            <span className="ml-auto rounded bg-red-900/40 px-1 text-[10px] text-red-300" title={`${errorCount} error(s)`}>
              {errorCount}
            </span>
          ) : warnCount > 0 ? (
            <span className="ml-auto rounded bg-amber-900/40 px-1 text-[10px] text-amber-300" title={`${warnCount} warning(s)`}>
              {warnCount}
            </span>
          ) : null}
        </button>
        {open && <IssueList />}
      </div>
    </div>
  );
}