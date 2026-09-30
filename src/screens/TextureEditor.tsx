import {PanelTitle, ToolButton, Divider} from "../components/Panel";

export default function TextureEditor() {
    return (
        <main className="flex h-full w-full flex-column items-start justify-start p-4">
            <div id="leftContainer" className="flex flex-col w-1/8">    
                <PanelTitle>Tools</PanelTitle>
                <ToolButton label="Brush" active={true} onClick={() => {}} />
                <ToolButton label="Pencil" onClick={() => {}} />
                <ToolButton label="Eraser" onClick={() => {}} />
                <ToolButton label="Fill" onClick={() => {}} />
                <Divider />
            </div>


            <div id="middleContainer" className="flex flex-col w-full bg-white">
                <h1>Model Preview</h1>
                {/* there will be a canvas that shows the model in 3D, and you can rotate it and zoom in/out */}

            </div>

            <div id="rightContainer" className="flex flex-col w-1/8 bg-white">
                <h1>Texture file Preview</h1>
            </div>
        </main>
    )
} 