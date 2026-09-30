import { Tab, useApp } from "../constants";
import { useModel } from "../stores/modelStore";

const tabs: Tab[] = ["Model", "Texture", "Animation"];

export default function NavBar() {
    const { tab, setTab, setScreen } = useApp();
    const canUndo = useModel((s) => s.past.length > 0);
    const canRedo = useModel((s) => s.future.length > 0);
    const undo = useModel((s) => s.undo);
    const redo = useModel((s) => s.redo);
    const cls = (t: string) =>
      `h-full border-b-2 px-4 text-sm transition-colors ${
        tab === t
          ? "border-accent bg-panel-2 text-white"
          : "border-transparent text-neutral-400 hover:text-white"
      }`;

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
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="rounded px-2 py-1 text-sm text-neutral-300 hover:bg-panel-2 disabled:pointer-events-none disabled:opacity-30"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="rounded px-2 py-1 text-sm text-neutral-300 hover:bg-panel-2 disabled:pointer-events-none disabled:opacity-30"
          >
            ↷
          </button>
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