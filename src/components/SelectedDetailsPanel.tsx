import { useState } from "react";
import { useModel, selectSelectedCube, selectSelectedBone } from "../stores/modelStore";
import { PanelTitle } from "./Panel";
import type { Bone } from "../stores/modelStore";

function transformErrorList(errors: string[] | null) {
  return errors ?? [];
}

function DotsButton({ title }: { title?: string }) {
  return (
    <button
      type="button"
      title={title ?? "More"}
      className="shrink-0 rounded px-1 text-neutral-500 transition-colors hover:text-neutral-200"
    >
      <span className="leading-[9px] text-[10px]">⋮</span>
    </button>
  );
}
export default function SelectedDetailsPanel() {
  type Tab = "hierarchy" | "block-info";
  const [tab, setTab] = useState<Tab>("block-info");

  // If the whole app has a recent field-level transform error, surface it
  // at the top of this component so the user sees it immediately.
  const errors = transformErrorList(useModel((s) => s.transformErrors));

  return (
    <div className="flex flex-col rounded border border-border bg-[#22262d] p-1">
      {errors.length > 0 && (
        <div className="mb-1 rounded bg-red-900/30 px-2 py-1 text-[11px] leading-5 text-red-300">
          {errors.map((error, i) => (
            <span key={i}>
              {error}
              {i < errors.length - 1 && <br />}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1 border-b border-border px-1 pb-1">
        <button
          type="button"
          onClick={() => setTab("hierarchy")}          className={`rounded-t px-2 text-[11px] font-medium tracking-wide text-neutral-400 hover:text-neutral-200 ${tab === "hierarchy" ? "bg-panel-2 text-white" : ""}`}
        >
          Hierarchy
        </button>
        <button
          type="button"
          onClick={() => setTab("block-info")}
          className={`rounded-t px-2 text-[11px] font-medium tracking-wide text-neutral-400 hover:text-neutral-200 ${tab === "block-info" ? "bg-panel-2 text-white" : ""}`}
        >
          Block info
        </button>
      </div>

      <div className="min-h-[3.5rem]">
        {tab === "hierarchy" ? (
          <HierarchyTab />
        ) : (
          <BlockInfoTab />
        )}
      </div>
    </div>
  );
}

function HierarchyTab() {
  const selectedCube = useModel(selectSelectedCube);
  const selectedBone = useModel(selectSelectedBone);
  const bones = useModel((s) => s.bones);
  const setCubeParent = useModel((s) => s.setCubeParent);
  const setBoneParent = useModel((s) => s.setBoneParent);
  const deleteSelected = useModel((s) => s.deleteSelected);
  const renameSelected = useModel((s) => s.renameSelected);

  const selectedKind = selectedCube ? "cube" : selectedBone ? "bone" : null;
  const selected = selectedCube ?? selectedBone;
  const name = selected?.name ?? "";

  return (
    <div className="flex flex-col min-h-[3.5rem]">
      {!selected && (
        <p className="px-2 py-1 text-xs text-neutral-500">
          Select a cube or bone to see its hierarchy.
        </p>
      )}

      {selected && (
        <>
          <div className="flex items-center gap-2 px-2 py-1">
            <PanelTitle>{name}</PanelTitle>
            <span className="rounded bg-panel-2 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
              {selectedKind}
            </span>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => renameSelected(e.target.value)}
            className="rounded-md border border-border bg-[#22262d] px-2 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
            placeholder="Name"
          />

          {selectedCube && (
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-neutral-500">
              <div>from {selectedCube.from.map((v) => +v.toFixed(3)).join(", ")}</div>
              <div>to {selectedCube.to.map((v) => +v.toFixed(3)).join(", ")}</div>
              <div>size {(() => {
                const s = [
                  selectedCube.to[0] - selectedCube.from[0],
                  selectedCube.to[1] - selectedCube.from[1],
                  selectedCube.to[2] - selectedCube.from[2],
                ];
                return s.map((v) => +v.toFixed(3)).join(", ");
              })()}</div>
              <div>origin {selectedCube.origin.map((v) => +v.toFixed(3)).join(", ")}</div>
              <div>rotation {selectedCube.rotation.map((v) => +v.toFixed(3)).join(", ")}</div>
              <div>shade {selectedCube.shade === false ? "off" : "on"}</div>
            </div>
          )}
          {selectedBone && (
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-neutral-500">
              <div>origin {selectedBone.origin.map((v) => +v.toFixed(3)).join(", ")}</div>
              <div>rotation {selectedBone.rotation.map((v) => +v.toFixed(3)).join(", ")}</div>
              <div>parent {parentName(selectedBone.parentId, bones) ?? "model root"}</div>
            </div>
          )}

          <div className="mt-1 flex items-center gap-2 px-2">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">Parent</span>
            <select
              value={selectedCube ? selectedCube.boneId ?? "" : selectedBone!.parentId ?? ""}
              onChange={(e) => {
                if (selectedCube) {
                  setCubeParent(selectedCube.id, e.target.value || null);
                } else {
                  setBoneParent(selectedBone!.id, e.target.value || null);
                }
              }}
              className="min-w-0 flex-1 rounded border border-border bg-[#22262d] px-1.5 py-1 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="">model root</option>
              {bones.map((bone) => (
                <option key={bone.id} value={bone.id}>
                  {bone.name}
                </option>
              ))}
            </select>
            <DotsButton />
          </div>

          <button
            type="button"
            onClick={deleteSelected}
            className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}

function BlockInfoTab() {
  const selectedCube = useModel(selectSelectedCube);
  const selectedBone = useModel(selectSelectedBone);

  return (
    <div className="flex flex-col min-h-[3.5rem]">
      {!selectedCube && !selectedBone && (
        <p className="px-2 py-1 text-xs text-neutral-500">
          Select a cube or bone to see block info.
        </p>
      )}

      {selectedCube && <CubeBlockInfo />}
      {selectedBone && <BoneBlockInfo />}
    </div>
  );
}

function parentName(id: string | null, bones: Bone[]) {
  if (!id) return "model root";
  return bones.find((bone) => bone.id === id)?.name ?? "model root";
}

function CubeBlockInfo() {
  const cube = useModel(selectSelectedCube);
  const bones = useModel((s) => s.bones);
  const setCubeParent = useModel((s) => s.setCubeParent);

  if (!cube) return null;

  const from = cube.from;
  const to = cube.to;
  const origin = cube.origin;
  const rotation = cube.rotation;
  const size = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const center = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const pivotOffset = [origin[0] - center[0], origin[1] - center[1], origin[2] - center[2]];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <PanelTitle>{cube.name}</PanelTitle>
        <span className="rounded bg-panel-2 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Cube</span>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-neutral-500">
        <div>from {from.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>to {to.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>size {size.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>origin {origin.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>rotation {rotation.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>pivot offset {pivotOffset.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>shade {cube.shade === false ? "off" : "on"}</div>
        <div>parent {parentName(cube.boneId, bones)}</div>
      </div>

      <select
        value={cube.boneId ?? ""}
        onChange={(e) => setCubeParent(cube.id, e.target.value || null)}
        className="mt-1 rounded border border-border bg-[#22262d] px-1.5 py-1 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-accent/50"
      >
        <option value="">model root</option>
        {bones.map((bone) => (
          <option key={bone.id} value={bone.id}>
            {bone.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function BoneBlockInfo() {
  const bone = useModel(selectSelectedBone);
  const bones = useModel((s) => s.bones);
  const setBoneParent = useModel((s) => s.setBoneParent);
  const renameSelected = useModel((s) => s.renameSelected);
  const deleteSelected = useModel((s) => s.deleteSelected);

  if (!bone) return null;

  const origin = bone.origin;
  const rotation = bone.rotation;
  const parentId = bone.parentId;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <PanelTitle>{bone.name}</PanelTitle>
        <span className="rounded bg-panel-2 px-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Bone</span>
      </div>

      <input
        type="text"
        value={bone.name}
        onChange={(e) => renameSelected(e.target.value)}
        className="rounded-md border border-border bg-[#22262d] px-2 py-1.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
        placeholder="Name"
      />

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-neutral-500">
        <div>origin {origin.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>rotation {rotation.map((v) => +v.toFixed(3)).join(", ")}</div>
        <div>parent {parentName(parentId, bones)}</div>
      </div>

      <select
        value={parentId ?? ""}
        onChange={(e) => setBoneParent(bone.id, e.target.value || null)}
        className="rounded border border-border bg-[#22262d] px-1.5 py-1 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-accent/50"
      >
        <option value="">model root</option>
        {boneParentOptions(bone, bones).map((bone) => (
          <option key={bone.id} value={bone.id}>
            {bone.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={deleteSelected}
        className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
      >
        Delete
      </button>
    </div>
  );
}

function boneParentOptions(bone: Bone, bones: Bone[]) {
  const invalid = new Set<string>([bone.id]);
  let cur: Bone = bone;
  while (cur.parentId) {
    const parent = bones.find((parent) => parent.id === cur.parentId);
    if (!parent || invalid.has(parent.id)) break;
    invalid.add(parent.id);
    cur = parent;
  }
  return bones.filter((candidate) => candidate.id !== bone.id && !invalid.has(candidate.id));
}

