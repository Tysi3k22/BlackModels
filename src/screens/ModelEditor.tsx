import { useEffect } from "react";
import {Divider, PanelTitle, ToolButton} from "../components/Panel";
import ErrorBoundary from "../components/ErrorBoundary";
import { ModelTools, useApp } from "../constants";
import Viewport from "../components/Viewport";
import OutlinerPanel from "../components/OutlinerPanel";
import { useModel } from "../stores/modelStore";

const tools: ModelTools[] = ["Select", "Move", "Rotate", "Scale"];

export default function ModelEditor() {
    const modelTool = useApp((state) => state.modelTool);
    const setModelTool = useApp((state) => state.setModelTool);
    const showPivots = useApp((state) => state.showPivots);
    const setShowPivots = useApp((state) => state.setShowPivots);

    const hasSelection = useModel((s) => s.selectedId !== null);
    const addCube = useModel((s) => s.addCube);
    const addBone = useModel((s) => s.addBone);
    const deleteSelected = useModel((s) => s.deleteSelected);
    const modelName = useModel((s) => s.name);
    const textures = useModel((s) => s.textures);
    const cubesCount = useModel((s) => s.cubes.length);
    const bonesCount = useModel((s) => s.bones.length);


    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Delete") {
                e.preventDefault();
                deleteSelected();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [deleteSelected]);

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

                <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs text-neutral-300 select-none hover:text-white">
                    <input
                        type="checkbox"
                        checked={showPivots}
                        onChange={(e) => setShowPivots(e.target.checked)}
                        className="accent-[var(--color-accent,#4ea1ff)]"
                    />
                    Show pivots
                </label>

                <div className="px-3 pb-2 pt-1 text-[11px] leading-5 text-neutral-500">
                    <div className="font-semibold tracking-widest text-neutral-400">{modelName}</div>
                    <div>{cubesCount} cubes · {bonesCount} bones</div>
                    {textures.length > 0 && <div>{textures.length} texture(s) embedded</div>}
                </div>

                <div className="mt-auto flex flex-col gap-1.5 p-2">
                    <button
                        onClick={addCube}
                        className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-[filter] hover:brightness-110"
                    >
                        + Add Cube
                    </button>
                    <button
                        onClick={() => addBone()}
                        title="Adds a bone under the selected bone (or at the model root)"
                        className="rounded border border-border px-3 py-1.5 text-left text-sm text-neutral-200 transition-colors hover:bg-panel-2"
                    >
                        + Add Bone
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
                <ErrorBoundary label="The 3D view">
                    <Viewport />
                </ErrorBoundary>
            </div>

            <div id="rightContainer" className="flex w-1/8 min-w-44 flex-col border-l border-border">
                <OutlinerPanel />
            </div>
        </main>
    )
} 