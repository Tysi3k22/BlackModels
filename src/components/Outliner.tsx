import { selectSelectedCube, useModel } from "../stores/modelStore";
import { PanelTitle } from "./Panel";

export default function Outliner() {
  const cubes = useModel((s) => s.cubes);
  const selected = useModel(selectSelectedCube);
  const select = useModel((s) => s.select);
  const deleteSelected = useModel((s) => s.deleteSelected);

  return (
    <>
      <PanelTitle>Hierarchy</PanelTitle>
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {cubes.length === 0 && (
          <p className="px-2 py-1 text-xs text-neutral-500">
            No cubes yet. Use “Add Cube”.
          </p>
        )}
        {cubes.map((cube) => (
          <button
            key={cube.id}
            onClick={() => select(cube.id)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
              selected?.id === cube.id
                ? "bg-accent/20 text-accent"
                : "text-neutral-300 hover:bg-panel-2"
            }`}
          >
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: cube.color }}
            />
            <span className="truncate">{cube.name}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="border-t border-border p-2">
          <div className="mb-1 px-2 text-xs font-medium text-neutral-300">
            {selected.name}
          </div>
          <div className="px-2 text-[11px] leading-5 text-neutral-500">
            from {selected.from.join(", ")}
            <br />
            to&nbsp;&nbsp;{selected.to.join(", ")}
          </div>
          <button
            onClick={deleteSelected}
            className="mt-2 w-full rounded px-2 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}
