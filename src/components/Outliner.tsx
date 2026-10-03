import { useMemo, useState } from "react";
import {
  Bone,
  Cube,
  selectSelectedBone,
  selectSelectedCube,
  useModel,
} from "../stores/modelStore";
import { PanelTitle } from "./Panel";
import SelectedDetailsPanel from "./SelectedDetailsPanel";

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

interface OutlinerTree {
  bonesByParent: Map<string, Bone[]>;
  cubesByBone: Map<string, Cube[]>;
}

const EMPTY_BONES: Bone[] = [];
const EMPTY_CUBES: Cube[] = [];

interface DropTargetCallbacks {
  onDropCube?: (cubeId: string) => void;
  draggingOverBoneId?: string | null;
  setDraggingOverBoneId?: (id: string | null) => void;
}

function BoneRow({
  bone,
  tree,
  depth,
  ancestorHidden = false,
  drop,
}: {
  bone: Bone;
  tree: OutlinerTree;
  depth: number;
  ancestorHidden?: boolean;
  drop?: DropTargetCallbacks;
}) {
  const [open, setOpen] = useState(true);
  const selectedId = useModel((s) => s.selectedId);
  const select = useModel((s) => s.select);
  const toggleHidden = useModel((s) => s.toggleHidden);

  const childBones = tree.bonesByParent.get(bone.id) ?? EMPTY_BONES;
  const boneCubes = tree.cubesByBone.get(bone.id) ?? EMPTY_CUBES;
  const selected = selectedId === bone.id;
  const hiddenHere = !!bone.hidden || ancestorHidden;

  const isHovered = drop?.draggingOverBoneId === bone.id;

  return (
    <>
      <button
        onClick={() => select(bone.id, "bone")}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (drop?.setDraggingOverBoneId) drop.setDraggingOverBoneId(bone.id);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
        }}
        onDragLeave={() => {
          if (drop?.setDraggingOverBoneId && drop.draggingOverBoneId === bone.id) drop.setDraggingOverBoneId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (drop?.setDraggingOverBoneId) drop.setDraggingOverBoneId(null);
          const cubeId = e.dataTransfer.getData("model/cube");
          if (cubeId && drop?.onDropCube) drop.onDropCube(cubeId);
        }}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors ${
          selected
            ? "bg-accent/20 text-accent"
            : isHovered
              ? "bg-panel-2 text-white"
              : "text-neutral-300 hover:bg-panel-2"
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
            childBones.length || boneCubes.length ? "cursor-pointer hover:text-neutral-300" : "invisible"
          }`}
        >
          {open ? "▾" : "▸"}
        </span>
        <span className="size-2.5 shrink-0 rotate-45 rounded-[2px] border" style={{ borderColor: bone.color }} />
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
              tree={tree}
              depth={depth + 1}
              ancestorHidden={hiddenHere}
              drop={drop}
            />
          ))}
          {boneCubes.map((cube) => (
            <CubeRow key={cube.id} cube={cube} depth={depth + 1} ancestorHidden={hiddenHere} draggable />
          ))}
        </>
      )}
    </>
  );
}

function CubeRow({
  cube,
  depth,
  draggable = false,
  ancestorHidden = false,
}: {
  cube: Cube;
  depth: number;
  draggable?: boolean;
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
      draggable={draggable}        onDragStart={(e) => {
        if (!draggable) return;
        try { e.dataTransfer.setData("model/cube", cube.id); } catch {} 
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setDragImage(new Image(), 0, 0);
      }}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors ${
        selected ? "bg-accent/20 text-accent" : "text-neutral-300 hover:bg-panel-2"
      } ${hiddenHere ? "opacity-50" : ""}`}
      style={{ paddingLeft: `${8 + depth * 14 + 14}px` }}
    >
      <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: cube.color }} />
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
  const setCubeParent = useModel((s) => s.setCubeParent);
  const showAll = useModel((s) => s.showAll);

  // One O(n) pass builds the lookups every row uses (no filter() per row).
  const { tree, rootCubes, rootBones } = useMemo(() => {
    const boneById = new Map(bones.map((b) => [b.id, b]));
    const bonesByParent = new Map<string, Bone[]>();
    const cubesByBone = new Map<string, Cube[]>();
    const rootBones: Bone[] = [];
    const rootCubes: Cube[] = [];
    for (const b of bones) {
      if (b.parentId && boneById.has(b.parentId)) {
        const l = bonesByParent.get(b.parentId);
        if (l) l.push(b);
        else bonesByParent.set(b.parentId, [b]);
      } else rootBones.push(b);
    }
    for (const c of cubes) {
      if (c.boneId && boneById.has(c.boneId)) {
        const l = cubesByBone.get(c.boneId);
        if (l) l.push(c);
        else cubesByBone.set(c.boneId, [c]);
      } else rootCubes.push(c);
    }
    return { tree: { bonesByParent, cubesByBone }, rootCubes, rootBones };
  }, [bones, cubes]);

  const anyHidden = cubes.some((c) => c.hidden) || bones.some((b) => b.hidden);
  const selectedCube = useModel(selectSelectedCube);
  const selectedBone = useModel(selectSelectedBone);
  const selected = selectedCube ?? selectedBone;

  const [draggingOverBoneId, setDraggingOverBoneId] = useState<string | null>(null);

  const drop: DropTargetCallbacks = {
    onDropCube: (cubeId) => setCubeParent(cubeId, null),
    draggingOverBoneId,
    setDraggingOverBoneId,
  };

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
        {rootBones.length === 0 && rootCubes.length === 0 && (
          <p className="px-2 py-1 text-xs text-neutral-500">
            Nothing here yet. Use "Add Cube" or "Add Bone".
          </p>
        )}
        {rootBones.map((bone) => (
          <BoneRow
            key={bone.id}
            bone={bone}
            tree={tree}
            depth={0}
            drop={{
              ...drop,
              onDropCube: (cubeId) => setCubeParent(cubeId, bone.id),
            }}
          />
        ))}
        {rootCubes.map((cube) => (
          <CubeRow key={cube.id} cube={cube} depth={0} draggable />
        ))}
        {!selected && (
          <p className="px-2 py-1 text-xs text-neutral-500">
            Select a cube or bone to see its details.
          </p>
        )}
      </div>

      {selected && (
        <SelectedDetailsPanel />
      )}
    </>
  );
}


