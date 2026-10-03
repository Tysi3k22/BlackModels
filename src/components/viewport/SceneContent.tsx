import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useApp } from "../../constants";
import {
  Bone,
  Cube,
  isCubeHidden,
  useModel,
  type Vec3,
} from "../../stores/modelStore";
import { getPaintContext, floodFillAt, paintLine, paintSquare } from "../../lib/paint";
import { cubeMaterial } from "./CubeMaterial";
import { PixelGridMaterial } from "./PixelGridMaterial";
import { SelectedBone, SelectedCube } from "./SelectionRigs";
import {
  BOX_FACE_ORDER,
  buildTextureMap,
  eulerDeg,
  flushToLiveTexture,
  inflateBox,
  useCubeGeometry,
  type TextureMap,
} from "./shared";

/** True in the Texture tab: every cube (also the selected one) is drawn in place inside its bone. */
const TextureModeContext = createContext(false);

/**
 * Non-selected cube. Lives inside its bone's group, whose origin is the bone
 * pivot. bbmodel semantics: the cube frame is T(cubeOrigin - bonePivot) ·
 * R(cubeRotation), and the box sits at (center - cubeOrigin) inside it.
 */
function CubeObject({
  cube,
  offset,
  textures,
  resolution,
  forceVisible = false,
}: {
  cube: Cube;
  /** Bone pivot in model space (omit for root cubes). */
  offset?: Vec3;
  textures: TextureMap;
  resolution: [number, number];
  /** Draw even when selected (texture mode selection highlight). */
  forceVisible?: boolean;
}) {
  const select = useModel((s) => s.select);
  const selectedId = useModel((s) => s.selectedId);
  const bones = useModel((s) => s.bones);
  const activeTexture = useModel((s) => s.activeTexture);
  const commitTexturePixels = useModel((s) => s.commitTexturePixels);

  const textureTool = useApp((s) => s.textureTool);
  const textureColor = useApp((s) => s.textureColor);
  const textureBrushSize = useApp((s) => s.textureBrushSize);
  const setTextureColor = useApp((s) => s.setTextureColor);

  const [ifrom, ito] = useMemo(
    () => inflateBox(cube.from, cube.to, cube.inflate),
    [cube.from, cube.to, cube.inflate]
  );
  const geometry = useCubeGeometry(cube, resolution);
  const textureMode = useContext(TextureModeContext);
  const stroke = useRef<{ last: [number, number] } | null>(null);
  /** UV under the pointer on this cube (texture mode) — drives the 3D brush cursor. */
  const [hoverUV, setHoverUV] = useState<[number, number] | null>(null);
  const sizeTool = textureTool === "Brush" || textureTool === "Pencil" || textureTool === "Eraser";
  const effBrushSize = textureTool === "Pencil" ? 1 : textureBrushSize;

  // The selected cube is drawn by <SelectedCube/> (with gizmo) instead —
  // except in texture mode, where it stays in its bone like every other cube.
  if ((cube.id === selectedId && !forceVisible && !textureMode) || isCubeHidden(cube, bones)) return null;

  const pivot: Vec3 = offset ?? [0, 0, 0];
  const o: Vec3 = cube.origin;
  const groupPos: Vec3 = [o[0] - pivot[0], o[1] - pivot[1], o[2] - pivot[2]];
  const meshPos: Vec3 = [
    (ifrom[0] + ito[0]) / 2 - o[0],
    (ifrom[1] + ito[1]) / 2 - o[1],
    (ifrom[2] + ito[2]) / 2 - o[2],
  ];
  const size: Vec3 = [
    Math.max(1e-6, ito[0] - ifrom[0]),
    Math.max(1e-6, ito[1] - ifrom[1]),
    Math.max(1e-6, ito[2] - ifrom[2]),
  ];

  const handlePointerDown = async (e: ThreeEvent<PointerEvent>) => {
    if (!textureMode) return;
    e.stopPropagation();
    // The UV tool edits face rects in the 2D canvas; it never paints.
    if (textureTool === "UV") return;
    if (e.uv) setHoverUV([e.uv.x, e.uv.y]);
    const texId = activeTexture;
    if (texId == null) return;
    const tex = textures.get(texId);
    if (!tex) return;
    if (!e.uv) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const [w, h] = resolution;
    const px = Math.floor(e.uv.x * w);
    const py = Math.floor((1 - e.uv.y) * h);
    const hit: [number, number] = [px, py];

    const ctx = await getPaintContext(tex, w, h);

    if (textureTool === "Picker") {
      const d = ctx.getImageData(hit[0], hit[1], 1, 1).data;
      if (d[3] > 0) {
        setTextureColor(`#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
      }
      return;
    }
    if (textureTool === "Fill") {
      floodFillAt(ctx, hit[0], hit[1], textureColor, w, h);
      flushToLiveTexture(texId);
      commitTexturePixels(ctx.canvas.toDataURL("image/png"), { faces: [] });
      return;
    }
    stroke.current = { last: hit };
    paintSquare(ctx, hit[0], hit[1], effBrushSize, textureTool === "Eraser", textureColor);
    flushToLiveTexture(texId);
  };

  const handlePointerMove = async (e: ThreeEvent<PointerEvent>) => {
    if (!textureMode) return;
    if (e.uv) setHoverUV([e.uv.x, e.uv.y]);
    if (!stroke.current) return;
    e.stopPropagation();
    const texId = activeTexture;
    if (texId == null) return;
    const tex = textures.get(texId);
    if (!tex) return;
    if (!e.uv) return;

    const [w, h] = resolution;
    const px = Math.floor(e.uv.x * w);
    const py = Math.floor((1 - e.uv.y) * h);
    const hit: [number, number] = [px, py];

    const ctx = await getPaintContext(tex, w, h);
    paintLine(ctx, stroke.current.last, hit, effBrushSize, textureTool === "Eraser", textureColor);
    stroke.current = { last: hit };
    flushToLiveTexture(texId);
  };

  const handlePointerUp = async () => {
    if (!textureMode) return;
    if (stroke.current) {
      stroke.current = null;
      const tex = activeTexture != null ? textures.get(activeTexture) : undefined;
      if (tex) {
        const [w, h] = resolution;
        const ctx = await getPaintContext(tex, w, h);
        commitTexturePixels(ctx.canvas.toDataURL("image/png"), { faces: [] });
      }
    }
  };

  return (
    <group
      position={groupPos}
      rotation={eulerDeg(cube.rotation)}
      onClick={(e) => {
        e.stopPropagation();
        select(cube.id, "cube");
      }}
    >
      <mesh
        position={meshPos}
        scale={size}
        geometry={geometry}
        userData={{ clickCube: cube.id }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={() => setHoverUV(null)}
      >
        {cubeMaterial(cube, textures)}
      </mesh>

      {textureMode && (
        <mesh position={meshPos} scale={size} geometry={geometry}>
          {BOX_FACE_ORDER.map((face, i) => (
            <PixelGridMaterial
              key={face}
              attach={`material-${i}`}
              resolution={resolution}
              cursorUV={hoverUV ?? undefined}
              brushSize={effBrushSize}
              showCursor={sizeTool && hoverUV != null}
            />
          ))}
        </mesh>
      )}

      {textureMode && cube.id === selectedId && (
        <lineSegments position={meshPos} scale={size}>
          <edgesGeometry args={[geometry]} />
          <lineBasicMaterial color="#fbbf24" depthTest={false} />
        </lineSegments>
      )}
    </group>
  );
}

/**
 * A bone: nested group with the bone's pivot transform. Cubes under the bone
 * are model-space and are simply added as children (three composes the
 * hierarchy matrices). Child bones recurse.
 */
const EMPTY_BONES: Bone[] = [];
const EMPTY_CUBES: Cube[] = [];

/** Lookups built once per cubes/bones change (O(n)) instead of filter()/find() per node. */
interface SceneTree {
  boneById: Map<string, Bone>;
  bonesByParent: Map<string, Bone[]>;
  cubesByBone: Map<string, Cube[]>;
  rootBones: Bone[];
  rootCubes: Cube[];
}

function buildSceneTree(cubes: Cube[], bones: Bone[]): SceneTree {
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
    } else rootBones.push(b); // orphaned parents fall back to root
  }
  for (const c of cubes) {
    if (c.boneId && boneById.has(c.boneId)) {
      const l = cubesByBone.get(c.boneId);
      if (l) l.push(c);
      else cubesByBone.set(c.boneId, [c]);
    } else rootCubes.push(c);
  }
  return { boneById, bonesByParent, cubesByBone, rootBones, rootCubes };
}

function BoneNode({
  bone,
  tree,
  textures,
  resolution,
}: {
  bone: Bone;
  tree: SceneTree;
  textures: TextureMap;
  resolution: [number, number];
}) {
  const select = useModel((s) => s.select);
  const showPivots = useApp((s) => s.showPivots);
  const childBones = tree.bonesByParent.get(bone.id) ?? EMPTY_BONES;
  const boneCubes = tree.cubesByBone.get(bone.id) ?? EMPTY_CUBES;
  // Bones use relative position to the parent's pivot (or absolute for roots)
  // and the full rotation from the file — the verified bbmodel semantics.
  const parent = bone.parentId ? tree.boneById.get(bone.parentId) : undefined;
  const relPos: Vec3 = parent
    ? [bone.origin[0] - parent.origin[0], bone.origin[1] - parent.origin[1], bone.origin[2] - parent.origin[2]]
    : bone.origin;

  if (bone.hidden) return null;

  return (
    <group position={relPos} rotation={eulerDeg(bone.rotation)}>
      {/* Pivot markers: hidden by default (toggle in UI) */}
      {showPivots && (
        <>
          <mesh
            userData={{ clickBone: bone.id }}
            onClick={(e) => {
              e.stopPropagation();
              select(bone.id, "bone");
            }}
          >
            <octahedronGeometry args={[0.75, 0]} />
            <meshBasicMaterial color={bone.color} wireframe />
          </mesh>
          <mesh
            position={[0, -1.6, 0]}
            userData={{ clickBone: bone.id }}
            onClick={(e) => {
              e.stopPropagation();
              select(bone.id, "bone");
            }}
          >
            <cylinderGeometry args={[0.12, 0.12, 2.4, 6]} />
            <meshBasicMaterial color={bone.color} transparent opacity={0.6} />
          </mesh>
        </>
      )}

      {/* Cube coords are model-space; CubeObject subtracts the bone pivot
          because this group's origin already sits on the pivot. */}
      {boneCubes.map((cube) => (
        <CubeObject key={cube.id} cube={cube} offset={bone.origin} textures={textures} resolution={resolution} />
      ))}
      {childBones.map((child) => (
        <BoneNode
          key={child.id}
          bone={child}
          tree={tree}
          textures={textures}
          resolution={resolution}
        />
      ))}
    </group>
  );
}

/** Renders the full scene graph: root cubes, bone trees, and the selection rig. */
export function SceneContent({ textureMode }: { textureMode: boolean }) {
  const cubes = useModel((s) => s.cubes);
  const bones = useModel((s) => s.bones);
  const textures = useModel((s) => s.textures);
  const resolution = useModel((s) => s.resolution);

  const tree = useMemo(() => buildSceneTree(cubes, bones), [cubes, bones]);
  const textureMap = useMemo(() => buildTextureMap(textures), [textures]);
  const { rootCubes, rootBones } = tree;

  return (
    <TextureModeContext.Provider value={textureMode}>
      <group>
        {rootCubes.map((cube) => (
          <CubeObject key={cube.id} cube={cube} textures={textureMap} resolution={resolution} />
        ))}
        {rootBones.map((bone) => (
          <BoneNode
            key={bone.id}
            bone={bone}
            tree={tree}
            textures={textureMap}
            resolution={resolution}
          />
        ))}
        {!textureMode && (
          <>
            <SelectedCube />
            <SelectedBone />
          </>
        )}
      </group>
    </TextureModeContext.Provider>
  );
}
