import {PanelTitle, ToolButton, Divider} from "../components/Panel";
import { ModelTools, useApp } from "../constants";

const tools: ModelTools[] = ["Select", "Move", "Rotate", "Scale"];

export default function ModelEditor() {
    const modelTool = useApp((state) => state.modelTool);
    const setModelTool = useApp((state) => state.setModelTool);

    return (
        <main className="flex h-full w-full flex-row items-stretch justify-start">
            <div id="leftContainer" className="flex w-1/8 min-w-44 flex-col">    
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


            <div id="middleContainer" className="flex w-full flex-col">
                {/* TODO: 3D viewport (Three.js) */}
            </div>

            <div id="rightContainer" className="flex w-1/8 min-w-44 flex-col">
                <PanelTitle>Hierarchy</PanelTitle>
            </div>
        </main>
    )
} 