import "./App.css";
import { useApp } from "./constants";
import EditorMenu from "./screens/EditorMenu";
import MainMenu from "./screens/MainMenu";

function App() {
  const screen = useApp((state) => state.screen);

  return (
    <>
      {screen === "menu" && <MainMenu />}
      {screen === "editor" && <EditorMenu />}
    </>
  );
}

export default App;
