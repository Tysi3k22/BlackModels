import { useMemo, useState } from "react";
import {
  Bone,
  Cube,
  selectSelectedBone,
  selectSelectedCube,
  useModel,
} from "../stores/modelStore";
import { PanelTitle } from "./Panel";

/** Ids of `root` and everything under it. */
function descendantBoneIds(bones: Bone[], root: string): Set<string> {
  const byParent = new Map<string | null, string[]>();
  for (const b of bones) {
    const list = byParent.get(b.parentId) ?? [];
    list.push(b.id);
    byParent.set(b.parentId, list);
  }
  const out = new Set<string>([root]);
  const queue = [root];
  while (queue.length) {
    const cur = queue.pop() as string;
    for (const child of byParent.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return out;
}

function EyeButton({
  hidden,
  onToggle,
  dimmed,
}: {
  hidden: boolean;
  onToggle: () => void;
  /** An ancestor is hidden, so this item is invisible regardless. */
  dimmed?: boolean;
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      title={hidden ? "Show" : "Hide"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`ml-auto inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-panel-2 ${
        hidden ? "text-neutral-600" : dimmed ? "text-neutral-600" : "text-neutral-400 hover:text-neutral-100"
      }`}
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
        <circle cx="8" cy="8" r="2" />
        {hidden && <path d="M2.5 13.5 13.5 2.5" />}
      </svg>
    </span>
  );
}

function BoneRow({
  bone,
  allBones,
  allCubes,
  depth,
  ancestorHidden = false,
}: {
  bone: Bone;
  allBones: Bone[];
  allCubes: Cube[];
  depth: number;
  ancestorHidden?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const selectedId = useModel((s) => s.selectedId);
  const select = useModel((s) => s.select);
  const toggleHidden = useModel((s) => s.toggleHidden);

  const childBones = allBones.filter((b) => b.parentId === bone.id);
  const boneCubes = allCubes.filter((c) => c.boneId === bone.id);
  const hasChildren = childBones.length > 0 || boneCubes.length > 0;
  const selected = selectedId === bone.id;
  const hiddenHere = !!bone.hidden || ancestorHidden;

  return (
    <>
      <button
        onClick={() => select(bone.id, "bone")}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors ${
          selected ? "bg-accent/20 text-accent" : "text-neutral-300 hover:bg-panel-2"
        } ${hiddenHere ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className={`inline-block w-3 shrink-0 text-center text-[10px] text-neutral-500 ${
            hasChildren ? "cursor-pointer hover:text-neutral-300" : "invisible"
          }`}
        >
          {open ? "▾" : "▸"}
        </span>
        <span
          className="size-2.5 shrink-0 rotate-45 rounded-[2px] border"
          style={{ borderColor: bone.color }}
        />
        <span className="truncate">{bone.name}</span>
        <EyeButton
          hidden={!!bone.hidden}
          dimmed={ancestorHidden}
          onToggle={() => toggleHidden(bone.id, "bone")}
        />
      </button>

      {open && (
        <>
          {childBones.map((child) => (
            <BoneRow
              key={child.id}
              bone={child}
              allBones={allBones}
              allCubes={allCubes}
              depth={depth + 1}
              ancestorHidden={hiddenHere}
            />
          ))}
          {boneCubes.map((cube) => (
            <CubeRow key={cube.id} cube={cube} depth={depth + 1} ancestorHidden={hiddenHere} />
          ))}
        </>
      )}
    </>
  );
}

function CubeRow({
  cube,
  depth,
  ancestorHidden = false,
}: {
  cube: Cube;
  depth: number;
  ancestorHidden?: boolean;
}) {
  const selectedId = useModel((s) => s.selectedId);
  const select = useModel((s) => s.select);
  const toggleHidden = useModel((s) => s.toggleHidden);
  const selected = selectedId === cube.id;
  const hiddenHere = !!cube.hidden || ancestorHidden;
  return (
    <button
      onClick={() => select(cube.id, "cube")}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors ${
        selected ? "bg-accent/20 text-accent" : "text-neutral-300 hover:bg-panel-2"
      } ${hiddenHere ? "opacity-50" : ""}`}
      style={{ paddingLeft: `${8 + depth * 14 + 14}px` }}
    >
      <span
        className="size-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: cube.color }}
      />
      <span className="truncate">{cube.name}</span>
      <EyeButton
        hidden={!!cube.hidden}
        dimmed={ancestorHidden}
        onToggle={() => toggleHidden(cube.id, "cube")}
      />
    </button>
  );
}

export default function Outliner() {
  const cubes = useModel((s) => s.cubes);
  const bones = useModel((s) => s.bones);
  const selectedCube = useModel(selectSelectedCube);
  const selectedBone = useModel(selectSelectedBone);
  const deleteSelected = useModel((s) => s.deleteSelected);
  const setCubeParent = useModel((s) => s.setCubeParent);
  const setBoneParent = useModel((s) => s.setBoneParent);
  const showAll = useModel((s) => s.showAll);
  const anyHidden =
    cubes.some((c) => c.hidden) || bones.some((b) => b.hidden);

  const rootCubes = cubes.filter((c) => !c.boneId);
  const rootBones = bones.filter(
    (b) => !b.parentId || !bones.some((x) => x.id === b.parentId)
  );
  const empty = cubes.length === 0 && bones.length === 0;

  const selected = selectedCube ?? selectedBone;
  const selectedKind = selectedCube ? "cube" : selectedBone ? "bone" : null;

  // Valid new parents for the selected bone: everything except itself and its subtree
  const boneParentOptions = useMemo(() => {
    if (!selectedBone) return [];
    const invalid = descendantBoneIds(bones, selectedBone.id);
    return bones.filter((b) => !invalid.has(b.id));
  }, [selectedBone, bones]);

  const parentName = (id: string | null) =>
    id ? (bones.find((b) => b.id === id)?.name ?? null) : null;

  return (
    <>
      <PanelTitle>Hierarchy</PanelTitle>
      {anyHidden && (
        <button
          onClick={showAll}
          className="mx-2 mb-1 rounded px-2 py-1 text-left text-[11px] text-neutral-400 transition-colors hover:bg-panel-2 hover:text-neutral-100"
        >
          Show all hidden
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {empty && (
          <p className="px-2 py-1 text-xs text-neutral-500">
            Nothing here yet. Use “+ Add Cube” or “+ Add Bone”.
          </p>
        )}
        {rootBones.map((bone) => (
          <BoneRow
            key={bone.id}
            bone={bone}
            allBones={bones}
            allCubes={cubes}
            depth={0}
          />
        ))}
        {rootCubes.map((cube) => (
          <CubeRow key={cube.id} cube={cube} depth={0} />
        ))}
      </div>

      {selected && (
        <div className="border-t border-border p-2">
          <div className="mb-1 flex items-center gap-2 px-2">
            <span className="text-xs font-medium text-neutral-300">
              {selected.name}
            </span>
            <span className="rounded bg-panel-2 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
              {selectedKind}
            </span>
          </div>

          {selectedCube && (
            <div className="px-2 text-[11px] leading-5 text-neutral-500">
              from {selectedCube.from.map((v) => +v.toFixed(2)).join(", ")}
              <br />
              to&nbsp;&nbsp;{selectedCube.to.map((v) => +v.toFixed(2)).join(", ")}
              <br />
              parent: {parentName(selectedCube.boneId) ?? "model root"}
            </div>
          )}
          {selectedBone && (
            <div className="px-2 text-[11px] leading-5 text-neutral-500">
              origin {selectedBone.origin.map((v) => +v.toFixed(2)).join(", ")}
              <br />
              rotation {selectedBone.rotation.map((v) => +v.toFixed(2)).join(", ")}
            </div>
          )}

          {/* Parent selector */}
          <label className="mt-2 flex items-center gap-2 px-2 text-[11px] text-neutral-500">
            Parent
            {selectedKind === "cube" ? (
              <select
                value={selectedCube!.boneId ?? ""}
                onChange={(e) =>
                  setCubeParent(selectedCube!.id, e.target.value || null)
                }
                className="min-w-0 flex-1 rounded border border-border bg-panel px-1 py-0.5 text-xs text-neutral-200"
              >
                <option value="">model root</option>
                {bones.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedBone!.parentId ?? ""}
                onChange={(e) =>
                  setBoneParent(selectedBone!.id, e.target.value || null)
                }
                className="min-w-0 flex-1 rounded border border-border bg-panel px-1 py-0.5 text-xs text-neutral-200"
              >
                <option value="">model root</option>
                {boneParentOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </label>

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
