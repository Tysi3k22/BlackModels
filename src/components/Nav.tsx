import { Tab, useApp } from "../constants";

const tabs: Tab[] = ["Model", "Texture", "Animation"];

export default function NavBar() {
    const { tab, setTab, setScreen } = useApp();
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