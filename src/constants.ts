import { create } from "zustand";

export type Screen = "menu" | "editor";
export type Tab = "Model" | "Texture" | "Animation" | "AI";
export type ModelTools = "Select" | "Move" | "Rotate" | "Scale";
export type TextureTools = "Brush" | "Pencil" | "Eraser" | "Fill" | "Picker";

interface AppState {
    screen: Screen;
    tab: Tab;
    modelTool: ModelTools;
    textureTool: TextureTools;
    textureColor: string;
    textureBrushSize: number;
    /** Show bone pivot markers in the 3D viewport. */
    showPivots: boolean;
    setScreen: (s: Screen) => void;
    setTab: (t: Tab) => void;
    setModelTool: (t: ModelTools) => void;
    setTextureTool: (t: TextureTools) => void;
    setTextureColor: (c: string) => void;
    setTextureBrushSize: (s: number) => void;
    setShowPivots: (v: boolean) => void;
}

export const useApp = create<AppState>((set) => ({
    screen: "menu",
    tab: "Model",
    modelTool: "Select",
    textureTool: "Brush",
    textureColor: "#da6c2c",
    textureBrushSize: 2,
    showPivots: false,
    setScreen: (screen) => set({ screen }),
    setTab: (tab) => set({ tab }),
    setModelTool: (modelTool) => set({ modelTool }),
    setTextureTool: (textureTool) => set({ textureTool }),
    setTextureColor: (textureColor) => set({ textureColor }),
    setTextureBrushSize: (textureBrushSize) => set({ textureBrushSize }),
    setShowPivots: (showPivots) => set({ showPivots })
}));