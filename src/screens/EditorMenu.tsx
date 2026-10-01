import { useEffect } from "react";
import { useApp } from "../constants"
import NavBar from "../components/Nav";
import ModelEditor from "./ModelEditor";
import TextureEditor from "./TextureEditor";
import { useModel } from "../stores/modelStore";

export default function EditorMenu() {
    const tab = useApp((state) => state.tab);
    const undo = useModel((s) => s.undo);
    const redo = useModel((s) => s.redo);

    // Global undo/redo on every tab (Delete stays Model-only via ModelEditor).
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const key = e.key.toLowerCase();
            if (key === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (key === "y") {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [undo, redo]);

    return (
        <main className="flex h-full w-full flex-col overflow-hidden">
            <NavBar />

            {tab === "Model" && <ModelEditor />}
            {tab === "Texture" && <TextureEditor />}
            {tab === "Animation" && <div>Animation Editor</div>}
        </main>
    )
};