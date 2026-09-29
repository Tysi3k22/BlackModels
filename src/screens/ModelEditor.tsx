export default function ModelingMenu() {
    return (
        <main className="flex h-full w-full flex-column items-start justify-start p-4">
            <div id="leftContainer" className="flex flex-col w-1/8 bg-white">    
                <h1>Tools</h1>
            </div>


            <div id="middleContainer" className="flex flex-col w-full bg-white">
                <h1>Model Preview</h1>
                {/* there will be a canvas that shows the model in 3D, and you can rotate it and zoom in/out */}

            </div>

            <div id="rightContainer" className="flex flex-col w-1/8 bg-white">
                <h1>Hierarchy</h1>
            </div>
        </main>
    )
} 