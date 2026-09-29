import { useApp } from "../constants"
import NavBar from "../components/Nav";

export default function EditorMenu() {
    const tab = useApp((state) => state.tab);

    return (
        <main>
            <NavBar />

            {tab === "Model" && <div>Model Editor</div>}
            {tab === "Texture" && <div>Texture Editor</div>}
            {tab === "Animation" && <div>Animation Editor</div>}
        </main>
    )
};