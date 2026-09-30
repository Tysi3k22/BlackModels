import { useApp } from "../constants";

export default function MainMenu() {
    const setScreen = useApp((state) => state.setScreen);

    return (
        <main className="flex h-full flex-col items-center justify-center gap-10">
        <header className="text-center">
          <h1 className="text-5xl font-bold tracking-[0.3em]">BLACKMODELS</h1>
          <p className="mt-3 text-sm text-neutral-400">
            AI-powered Minecraft modeling
          </p>
        </header>

        <button
          onClick={() => setScreen("editor")}
          className="w-[28rem] max-w-[90vw] cursor-pointer rounded-lg bg-accent py-3 text-center font-medium text-black transition-[filter] hover:brightness-110"
        >
          + New Model
        </button>

        <div className="flex gap-4">
            {/* few recent models */}
        </div>
      </main>
    )
};
