import { create } from "zustand";

export type Screen = "menu" | "editor";
export type Tab = "Model" | "Texture" | "Animation" | "AI";

interface AppState {
    screen: Screen;
    tab: Tab;
    setScreen: (s: Screen) => void;
    setTab: (t: Tab) => void;
}

export const useApp = create<AppState>((set, get) => ({
    screen: "menu",
    tab: "Model",
    setScreen: (screen) => set({ screen }),
    setTab: (tab) => set({ tab })
}));