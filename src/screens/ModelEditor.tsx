import { useEffect } from "react";
import {Divider, PanelTitle, ToolButton} from "../components/Panel";
import { ModelTools, useApp } from "../constants";
import Viewport from "../components/Viewport";
import Outliner from "../components/Outliner";
import { useModel } from "../stores/modelStore";

const tools: ModelTools[] = ["Select", "Move", "Rotate", "Scale"];

export default function ModelEditor() {
    const modelTool = useApp((state) => state.modelTool);
    const setModelTool = useApp((state) => state.setModelTool);

    const hasSelection = useModel((s) => s.selectedId !== null);
    const addCube = useModel((s) => s.addCube);
    const deleteSelected = useModel((s) => s.deleteSelected);

    const undo = useModel((s) => s.undo);
    const redo = useModel((s) => s.redo);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                deleteSelected();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [deleteSelected, undo, redo]);

    return (
        <main className="flex min-h-0 w-full flex-1 flex-row items-stretch justify-start">
            <div id="leftContainer" className="flex w-1/8 min-w-44 flex-col border-r border-border">
                <PanelTitle>Tools</PanelTitle>
                {tools.map((tool) => (
                    <ToolButton
                        key={tool}
                        label={tool}
                        active={modelTool === tool}
                        onClick={() => setModelTool(tool)}
                    />
                ))}
                <Divider />

                <div className="mt-auto flex flex-col gap-1.5 p-2">
                    <button
                        onClick={addCube}
                        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-[filter] hover:brightness-110"
                    >
                        + Add Cube
                    </button>
                    <button
                        onClick={deleteSelected}
                        disabled={!hasSelection}
                        className="rounded px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-30"
                    >
                        Delete selected
                    </button>
                </div>
            </div>


            <div id="middleContainer" className="relative flex min-h-0 w-full flex-col">
                <Viewport />
            </div>

            <div id="rightContainer" className="flex w-1/8 min-w-44 flex-col border-l border-border">
                <Outliner />
            </div>
        </main>
    )
} 