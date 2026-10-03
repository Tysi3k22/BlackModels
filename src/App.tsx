import { useEffect } from "react";
import "./App.css";
import { useApp } from "./constants";
import EditorMenu from "./screens/EditorMenu";
import MainMenu from "./screens/MainMenu";
import { openModelFile } from "./lib/project";
import { exportBbmodel } from "./lib/bbmodel";
import { startAutosave } from "./lib/autosave";
import { useModel } from "./stores/modelStore";

function App() {
  const screen = useApp((state) => state.screen);

  // Safety net behind the dirty flag: unsaved work is debounced into IndexedDB.
  useEffect(() => startAutosave(), []);

  // Browser-level guard: closing/reloading the tab with unsaved edits warns first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useModel.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void exportBbmodel();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openModelFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {screen === "menu" && <MainMenu />}
      {screen === "editor" && <EditorMenu />}
    </>
  );
}

export default App;
