import { useEffect, useMemo, useState } from "react";
import { useApp } from "../constants";
import { applyModelFile, confirmDiscardChanges, newProject, parseProject } from "../lib/project";
import { listRecent, removeRecent, RecentProject } from "../lib/recent";
import { AutosaveRecord, clearAutosave, readAutosave } from "../lib/autosave";
import { useModel } from "../stores/modelStore";

type MenuTab = "recent" | "library";

interface LibraryEntry {
  id: string;
  name: string;
  description: string;
  url: string;
}

const LIBRARY: LibraryEntry[] = [
  {
    id: "nocsy_drakonin",
    name: "nocsy_drakonin",
    description: "Dragon · 116 cubes · 256×256 texture",
    url: "/samples/nocsy_drakonin.bbmodel",
  },
];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export default function MainMenu() {
    const setScreen = useApp((state) => state.setScreen);
    const [menuTab, setMenuTab] = useState<MenuTab>("recent");
    const [recent, setRecent] = useState<RecentProject[]>(() => listRecent());
    const [autosave, setAutosave] = useState<AutosaveRecord | null>(null);

    useEffect(() => {
        let alive = true;
        void readAutosave().then((record) => {
            if (alive) setAutosave(record);
        });
        return () => {
            alive = false;
        };
    }, []);

    const refreshRecent = () => setRecent(listRecent());

    const restoreAutosave = () => {
        if (!autosave) return;
        if (!confirmDiscardChanges()) return;
        try {
            useModel.getState().importProject(parseProject(autosave.data));
            // The restored session is still unsaved work.
            useModel.getState().markDirty();
            setScreen("editor");
        } catch (e) {
            console.error("Failed to restore autosave", e);
            void clearAutosave();
            setAutosave(null);
        }
    };

    const discardAutosave = () => {
        void clearAutosave();
        setAutosave(null);
    };

    const openLibraryModel = async (entry: LibraryEntry) => {
        const res = await fetch(entry.url);
        const json = await res.text();
        if (!confirmDiscardChanges()) return;
        if (applyModelFile(json, `${entry.id}.bbmodel`) === "ok") {
            setScreen("editor");
        }
    };

    const openRecent = (entry: RecentProject) => {
        if (!confirmDiscardChanges()) return;
        if (applyModelFile(entry.data) === "ok") {
            setScreen("editor");
        }
    };

    const startNewModel = () => {
        if (!confirmDiscardChanges()) return;
        newProject();
        setScreen("editor");
    };

    const deleteRecent = (id: string) => {
        removeRecent(id);
        refreshRecent();
    };

    const recentEntries = useMemo(
        () =>
            recent.map((e) => (
                <div
                    key={e.id}
                    className="group flex w-[28rem] max-w-[90vw] cursor-pointer items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3 text-left transition-colors hover:bg-panel-2"
                    onClick={() => openRecent(e)}
                >
                    <div className="flex-1">
                        <div className="text-sm font-medium text-neutral-200">{e.name}</div>
                        <div className="text-xs text-neutral-500">
                            {e.format === "bbmodel" ? "Blockbench model" : "BlackModels project"} ·{" "}
                            {timeAgo(e.savedAt)}
                        </div>
                    </div>
                    <button
                        onClick={(ev) => {
                            ev.stopPropagation();
                            deleteRecent(e.id);
                        }}
                        title="Remove from recent"
                        className="rounded px-2 py-1 text-xs text-neutral-500 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    >
                        ✕
                    </button>
                </div>
            )),
        [recent]
    );

    const libraryEntries = LIBRARY.map((entry) => (
        <div
            key={entry.id}
            className="flex w-[28rem] max-w-[90vw] cursor-pointer items-center gap-3 rounded-lg border border-border bg-panel px-4 py-3 text-left transition-colors hover:bg-panel-2"
            onClick={() => void openLibraryModel(entry)}
        >
            <div className="flex size-10 shrink-0 items-center justify-center rounded bg-accent/20 text-lg">
                🐲
            </div>
            <div>
                <div className="text-sm font-medium text-neutral-200">{entry.name}</div>
                <div className="text-xs text-neutral-500">{entry.description}</div>
            </div>
        </div>
    ));

    return (
        <main className="flex h-full flex-col items-center justify-center gap-8">
        <header className="text-center">
          <h1 className="text-5xl font-bold tracking-[0.3em]">BLACKMODELS</h1>
          <p className="mt-3 text-sm text-neutral-400">
            AI-powered Minecraft modeling
          </p>
        </header>

        {autosave && (
          <div className="flex w-[28rem] max-w-[90vw] items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-left">
            <div className="flex-1">
              <div className="text-sm text-neutral-200">Unsaved session found</div>
              <div className="text-xs text-neutral-500">
                {autosave.name} · {timeAgo(autosave.savedAt)}
              </div>
            </div>
            <button
              onClick={restoreAutosave}
              className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-black transition-[filter] hover:brightness-110"
            >
              Restore
            </button>
            <button
              onClick={discardAutosave}
              className="rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-panel-2 hover:text-neutral-100"
            >
              Discard
            </button>
          </div>
        )}

        <button
          onClick={startNewModel}
          className="w-[28rem] max-w-[90vw] cursor-pointer rounded-lg bg-accent py-3 text-center font-medium text-black transition-[filter] hover:brightness-110"
        >
          + New Model
        </button>

        <div className="flex w-[28rem] max-w-[90vw] flex-col">
          <div className="mb-3 flex gap-1 rounded-lg bg-panel p-1">
            {(["recent", "library"] as MenuTab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setMenuTab(t);
                  if (t === "recent") refreshRecent();
                }}
                className={`flex-1 rounded-md py-1.5 text-sm capitalize transition-colors ${
                  menuTab === t
                    ? "bg-panel-2 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {menuTab === "recent" &&
                (recentEntries.length > 0 ? (
                    recentEntries
                ) : (
                    <p className="py-6 text-center text-sm text-neutral-500">
                        No recent projects yet. Open or save a model to fill this list.
                    </p>
                ))}
            {menuTab === "library" && libraryEntries}
          </div>
        </div>
      </main>
    )
};
