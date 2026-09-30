import {PanelTitle, ToolButton, Divider} from "../components/Panel";
import { TextureTools, useApp } from "../constants";

export default function TextureEditor() {
    const tools: TextureTools[] = ["Brush", "Pencil", "Eraser", "Fill"];
    const textureTool = useApp((state) => state.textureTool);
    const setTextureTool = useApp((state) => state.setTextureTool);

    return (
        <main className="flex h-full w-full flex-row items-stretch justify-start">
            <div id="leftContainer" className="flex w-1/8 min-w-44 flex-col">    
                <PanelTitle>Tools</PanelTitle>
                {
                    tools.map((tool) => (
                        <ToolButton
                            key={tool}
                            label={tool}
                            active={textureTool === tool}
                            onClick={() => setTextureTool(tool)}
                        />
                    ))
                }
                <Divider />
            </div>


            <div id="middleContainer" className="flex w-full flex-col">
                {/* TODO: 3D viewport (Three.js) */}
            </div>

            <div id="rightContainer" className="flex w-1/8 min-w-44 flex-col">
                <PanelTitle>Texture file Preview</PanelTitle>
            </div>
        </main>
    )
} 