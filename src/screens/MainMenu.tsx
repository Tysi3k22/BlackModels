export default function MainMenu() {

    return (
        <main className="flex h-full flex-col items-center justify-center gap-10">
        <header className="text-center">
          <h1 className="text-5xl font-bold tracking-[0.3em]">BLOCKMODELS</h1>
          <p className="mt-3 text-sm text-neutral-400">
            AI-powered Minecraft modeling
          </p>
        </header>
  
        <div className="w-[28rem] max-w-[90vw] rounded-lg bg-accent py-3 text-center font-medium text-black">
          + New Model
        </div>
  
        <div className="flex gap-4">
            {/* few recent models */}
        </div>
      </main>
    )
};

