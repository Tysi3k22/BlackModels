import { Tab, useApp } from "../constants";
import { useModel } from "../stores/modelStore";
import { openModelFile } from "../lib/project";
import { exportBbmodel } from "../lib/bbmodel";

const tabs: Tab[] = ["Model", "Texture", "Animation"];

export default function NavBar() {
    const { tab, setTab, setScreen } = useApp();
    const canUndo = useModel((s) => s.past.length > 0);
    const canRedo = useModel((s) => s.future.length > 0);
    const undo = useModel((s) => s.undo);
    const redo = useModel((s) => s.redo);
    const hasCubes = useModel((s) => s.cubes.length > 0);
    const modelName = useModel((s) => s.name);
    const cls = (t: string) =>
      `h-full border-b-2 px-4 text-sm transition-colors ${
        tab === t
          ? "border-accent bg-panel-2 text-white"
          : "border-transparent text-neutral-400 hover:text-white"
      }`;
    const fileBtn =
      "rounded px-2 py-1 text-sm text-neutral-300 hover:bg-panel-2 disabled:pointer-events-none disabled:opacity-30";

    return (
      <header className="flex h-10 shrink-0 items-center border-b border-border bg-panel">
        <button
          onClick={() => setScreen("menu")}
          title="Main menu"
          className="px-4 text-sm font-bold tracking-widest hover:text-accent"
        >
          BLACKMODELS
        </button>
        <nav className="flex h-full">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cls(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="ml-4 flex items-center gap-1">
          <button
            onClick={() => void openModelFile()}
            title="Open model (.bbmodel / .bmproj) — Ctrl+O"
            className={fileBtn}
          >
            Open
          </button>
          <button
            onClick={() => void exportBbmodel()}
            disabled={!hasCubes}
            title="Save model as .bbmodel — Ctrl+S"
            className={fileBtn}
          >
            Save
          </button>
          <span className="mx-2 h-5 w-px bg-border" />
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={fileBtn}
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={fileBtn}
          >
            ↷
          </button>
          {modelName && modelName !== "Untitled" && (
            <span className="ml-3 text-xs text-neutral-500">{modelName}</span>
          )}
        </div>
        <div className="ml-auto flex h-full items-center pr-2 text-sm">
          <button onClick={() => setTab("AI")} className={cls("AI")}>
            AI
          </button>
          <button className="rounded px-3 py-1 hover:bg-panel-2" title="Settings">
            ⚙
          </button>
        </div>
      </header>
    );
}