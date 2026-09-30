import {Divider, PanelTitle, ToolButton} from "../components/Panel";
import { ModelTools, useApp } from "../constants";
import Viewport from "../components/Viewport";

const tools: ModelTools[] = ["Select", "Move", "Rotate", "Scale"];

export default function ModelEditor() {
    const modelTool = useApp((state) => state.modelTool);
    const setModelTool = useApp((state) => state.setModelTool);

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

            </div>


            <div id="middleContainer" className="relative flex min-h-0 w-full flex-col">
                <Viewport />
            </div>

            <div id="rightContainer" className="flex w-1/8 min-w-44 flex-col border-l border-border">
                <PanelTitle>Hierarchy</PanelTitle>
            </div>
        </main>
    )
} 