import { useEffect } from "react";
import "./App.css";
import { useApp } from "./constants";
import EditorMenu from "./screens/EditorMenu";
import MainMenu from "./screens/MainMenu";
import { openModelFile } from "./lib/project";
import { exportBbmodel } from "./lib/bbmodel";

function App() {
  const screen = useApp((state) => state.screen);

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
