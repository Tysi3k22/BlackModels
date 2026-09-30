import { create } from "zustand";

export type Screen = "menu" | "editor";
export type Tab = "Model" | "Texture" | "Animation" | "AI";
export type ModelTools = "Select" | "Move" | "Rotate" | "Scale";
export type TextureTools = "Brush" | "Pencil" | "Eraser" | "Fill";

interface AppState {
    screen: Screen;
    tab: Tab;
    modelTool: ModelTools;
    textureTool: TextureTools;
    setScreen: (s: Screen) => void;
    setTab: (t: Tab) => void;
    setModelTool: (t: ModelTools) => void;
    setTextureTool: (t: TextureTools) => void;
}

export const useApp = create<AppState>((set) => ({
    screen: "menu",
    tab: "Model",
    modelTool: "Select",
    textureTool: "Brush",
    setScreen: (screen) => set({ screen }),
    setTab: (tab) => set({ tab }),
    setModelTool: (modelTool) => set({ modelTool }),
    setTextureTool: (textureTool) => set({ textureTool })
}));