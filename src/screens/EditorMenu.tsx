import { useEffect } from "react";
import { useApp } from "../constants"
import NavBar from "../components/Nav";
import ModelEditor from "./ModelEditor";
import TextureEditor from "./TextureEditor";
import AnimationEditor from "./AnimationEditor";
import { useModel } from "../stores/modelStore";

function AIEditor() {
    return (
        <main className="flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="max-w-md rounded-lg border border-border bg-panel px-6 py-8 text-center">
                <div className="mb-2 text-lg font-semibold text-neutral-200">AI tools</div>
                <p className="text-sm leading-6 text-neutral-400">
                    AI-assisted modeling is not available yet. Use the Model, Texture and
                    Animation tabs to build your model in the meantime.
                </p>
            </div>
        </main>
    );
}

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
            {tab === "Animation" && <AnimationEditor />}
            {tab === "AI" && <AIEditor />}
        </main>
    )
};