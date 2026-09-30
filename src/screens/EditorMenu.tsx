import { useApp } from "../constants"
import NavBar from "../components/Nav";
import ModelEditor from "./ModelEditor";
import TextureEditor from "./TextureEditor";

export default function EditorMenu() {
    const tab = useApp((state) => state.tab);

    return (
        <main className="flex h-full w-full flex-col overflow-hidden">
            <NavBar />

            {tab === "Model" && <ModelEditor />}
            {tab === "Texture" && <TextureEditor />}
            {tab === "Animation" && <div>Animation Editor</div>}
        </main>
    )
};