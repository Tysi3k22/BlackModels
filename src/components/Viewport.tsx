import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Edges,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import * as THREE from "three";
import type { Object3D } from "three";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { useApp } from "../constants";
import {
  Bone,
  Cube,
  CubeFaces,
  Vec3,
  isCubeHidden,
  boneAncestors,
  selectSelectedBone,
  selectSelectedCube,
  useModel,
} from "../stores/modelStore";

// Minecraft coordinate system: +X = East, +Y = Up, +Z = South
// 1 grid cell = 1 in-game pixel, 1 section (16 cells) = 1 Minecraft block

// Module-local gizmo state so onPointerMissed can ignore clicks on the gizmo
const gizmo = {
  dragging: false,
  controls: null as TransformControlsImpl | null,
};

// Accessing the private `axis` property of three's TransformControls
const isGizmoBusy = () =>
  gizmo.dragging ||
  (gizmo.controls as unknown as { axis: string | null } | null)?.axis != null;

const DEG = Math.PI / 180;

// Blockbench applies group/cube rotations (degrees) in Z-Y-X order.
const ROT_ORDER = "ZYX" as const;
const eulerDeg = (r: Vec3) =>
  new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, ROT_ORDER);

// Shared texture cache: one THREE.Texture per unique embedded image
const textureCache = new Map<string, THREE.Texture>();

function getSharedTexture(source: string): THREE.Texture | null {
  const cached = textureCache.get(source);
  if (cached) return cached;
  try {
    const t = new THREE.TextureLoader().load(source);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(source, t);
    return t;
  } catch {
    return null;
  }
}

// BoxGeometry face order: px, nx, py, ny, pz, nz
// Minecraft/bbmodel: east=+X, west=-X, up=+Y, down=-Y, south=+Z, north=-Z
const BOX_FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;

/**
 * Rewrites a BoxGeometry's UVs so each face samples its bbmodel face UV
 * rectangle (given in texture pixels, y-down).
 */
function applyFaceUVs(
  geo: THREE.BoxGeometry,
  faces: CubeFaces | undefined,
  resolution: [number, number]
) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const [w, h] = resolution;
  for (let face = 0; face < 6; face++) {
    const f = faces?.[BOX_FACE_ORDER[face]];
    if (!f?.uv) continue;
    const [x1, y1, x2, y2] = f.uv;
    const u1 = x1 / w;
    const u2 = x2 / w;
    const v1 = 1 - y1 / h;
    const v2 = 1 - y2 / h;
    // BoxGeometry per-face vertex order: TL, TR, BL, BR (uv-space)
    const base = face * 4;
    uv.setXY(base + 0, u1, v1);
    uv.setXY(base + 1, u2, v1);
    uv.setXY(base + 2, u1, v2);
    uv.setXY(base + 3, u2, v2);
  }
  uv.needsUpdate = true;
}

function inflateBox(from: Vec3, to: Vec3, inflate?: number): [Vec3, Vec3] {
  if (!inflate) return [from, to];
  const s = inflate;
  return [
    [from[0] - s, from[1] - s, from[2] - s],
    [to[0] + s, to[1] + s, to[2] + s],
  ];
}

function cubeMaterial(cube: {
  color: string;
  faces?: CubeFaces;
  inflate?: number;
  from: Vec3;
  to: Vec3;
}, tex: THREE.Texture | null) {
  const hasFaceUVs =
    !!cube.faces &&
    Object.values(cube.faces).some(
      (f) => f?.uv && (f.uv[0] !== f.uv[2] || f.uv[1] !== f.uv[3])
    );
  const [fx, fy, fz] = cube.from;
  const [tx, ty, tz] = cube.to;
  const zeroThickness = tx - fx === 0 || ty - fy === 0 || tz - fz === 0;
  if (tex && hasFaceUVs) {
    return (
      <meshStandardMaterial
        map={tex}
        side={zeroThickness ? THREE.DoubleSide : THREE.FrontSide}
        transparent
        alphaTest={0.01}
      />
    );
  }
  return <meshStandardMaterial color={cube.color} transparent opacity={0.9} />;
}

/** Cube geometry with per-face UVs from bbmodel data. */
function useCubeGeometry(
  cube: Cube,
  tex: THREE.Texture | null,
  resolution: [number, number]
): THREE.BoxGeometry {
  return useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    if (tex) {
      const hasFaceUVs =
        !!cube.faces &&
        Object.values(cube.faces).some(
          (f) => f?.uv && (f.uv[0] !== f.uv[2] || f.uv[1] !== f.uv[3])
        );
      if (hasFaceUVs) applyFaceUVs(g, cube.faces, resolution);
    }
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex?.uuid, cube.faces, resolution[0], resolution[1]]);
}

/**
 * Non-selected cube. Lives inside its bone's group, whose origin is the bone
 * pivot. bbmodel semantics: the cube frame is T(cubeOrigin - bonePivot) ·
 * R(cubeRotation), and the box sits at (center - cubeOrigin) inside it.
 */
function CubeObject({
  cube,
  offset,
  depth,
  tex,
  resolution,
}: {
  cube: Cube;
  /** Bone pivot in model space (omit for root cubes). */
  offset?: Vec3;
  depth: number;
  tex: THREE.Texture | null;
  resolution: [number, number];
}) {
  const select = useModel((s) => s.select);
  const selectedId = useModel((s) => s.selectedId);
  const bones = useModel((s) => s.bones);
  const [ifrom, ito] = useMemo(
    () => inflateBox(cube.from, cube.to, cube.inflate),
    [cube.from, cube.to, cube.inflate]
  );
  const geometry = useCubeGeometry(cube, tex, resolution);

  // The selected cube is drawn by <SelectedCube/> (with gizmo) instead
  if (cube.id === selectedId || isCubeHidden(cube, bones)) return null;

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

  return (
    <group
      position={groupPos}
      rotation={eulerDeg(cube.rotation)}
      onClick={(e) => {
        e.stopPropagation();
        select(cube.id, "cube");
      }}
    >
      <mesh position={meshPos} scale={size} geometry={geometry} userData={{ clickCube: cube.id, depth }}>
        {cubeMaterial(cube, tex)}
      </mesh>
    </group>
  );
}

/**
 * Accumulated world (model-space) matrix of a bone in the rig hierarchy:
 * W(bone) = W(parent) · T(origin − parentOrigin) · R(rotation). Identity for
 * a null bone (model root). Verified against Blockbench semantics.
 */
function boneWorldMatrix(bones: Bone[], boneId: string | null): THREE.Matrix4 {
  const byId = new Map(bones.map((b) => [b.id, b]));
  const chain: Bone[] = [];
  let cur = boneId ? byId.get(boneId) ?? null : null;
  while (cur) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) ?? null : null;
  }
  const m = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const b = chain[i];
    const parent = i + 1 < chain.length ? chain[i + 1] : null;
    const rel: Vec3 = parent
      ? [b.origin[0] - parent.origin[0], b.origin[1] - parent.origin[1], b.origin[2] - parent.origin[2]]
      : b.origin;
    m.multiply(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...rel),
        new THREE.Quaternion().setFromEuler(eulerDeg(b.rotation)),
        new THREE.Vector3(1, 1, 1)
      )
    );
  }
  return m;
}

/**
 * A bone: nested group with the bone's pivot transform. Cubes under the bone
 * are model-space and are simply added as children (three composes the
 * hierarchy matrices). Child bones recurse.
 */
function BoneNode({
  bone,
  allCubes,
  allBones,
  depth,
  tex,
  resolution,
}: {
  bone: Bone;
  allCubes: Cube[];
  allBones: Bone[];
  depth: number;
  tex: THREE.Texture | null;
  resolution: [number, number];
}) {
  const select = useModel((s) => s.select);
  const showPivots = useApp((s) => s.showPivots);
  const childBones = useMemo(
    () => allBones.filter((b) => b.parentId === bone.id),
    [allBones, bone.id]
  );
  const boneCubes = useMemo(
    () => allCubes.filter((c) => c.boneId === bone.id),
    [allCubes, bone.id]
  );
  // Bones use relative position to the parent's pivot (or absolute for roots)
  // and the full rotation from the file — the verified bbmodel semantics.
  const parent = allBones.find((b) => b.id === bone.parentId);
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
            userData={{ clickBone: bone.id, depth }}
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
            userData={{ clickBone: bone.id, depth }}
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
        <CubeObject key={cube.id} cube={cube} offset={bone.origin} depth={depth + 1} tex={tex} resolution={resolution} />
      ))}
      {childBones.map((child) => (
        <BoneNode
          key={child.id}
          bone={child}
          allCubes={allCubes}
          allBones={allBones}
          depth={depth + 1}
          tex={tex}
          resolution={resolution}
        />
      ))}
    </group>
  );
}

/**
 * The selected cube rendered as an editable rig. The rig sits inside the bone
 * hierarchy (parent chain of groups), so gizmo edits happen in the bone's
 * local space; stored values are converted back to model space.
 */
function SelectedCube() {
  const selected = useModel(selectSelectedCube);
  const bones = useModel((s) => s.bones);
  const select = useModel((s) => s.select);
  const setTransform = useModel((s) => s.setTransform);
  const beginTransform = useModel((s) => s.beginTransform);
  const tool = useApp((s) => s.modelTool);
  const textures = useModel((s) => s.textures);

  const rigRef = useRef<Object3D>(null);
  const innerRef = useRef<Object3D>(null);

  const mode =
    tool === "Move"
      ? "translate"
      : tool === "Rotate"
        ? "rotate"
        : tool === "Scale"
          ? "scale"
          : null;

  // Frame of the cube's bone: model-space coordinates are mapped into the
  // scene by W(bone) · T(-bonePivot), exactly like the unselected cubes.
  const frame = useMemo(() => {
    if (!selected) return null;
    const bone = bones.find((b) => b.id === selected.boneId);
    const m = boneWorldMatrix(bones, selected.boneId);
    if (bone) m.multiply(new THREE.Matrix4().makeTranslation(-bone.origin[0], -bone.origin[1], -bone.origin[2]));
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    m.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat };
  }, [selected?.boneId, bones]);

  const [ifrom, ito] = useMemo(
    () => (selected ? inflateBox(selected.from, selected.to, selected.inflate) : ([null, null] as const)),
    [selected]
  );

  // Sync rig objects from store data (also after undo/import)
  useEffect(() => {
    const rig = rigRef.current;
    const inner = innerRef.current;
    if (!rig || !inner || !selected || !ifrom || !ito) return;
    rig.position.set(...selected.origin);
    rig.rotation.set(
      selected.rotation[0] * DEG,
      selected.rotation[1] * DEG,
      selected.rotation[2] * DEG,
      ROT_ORDER
    );
    inner.position.set(
      (ifrom[0] + ito[0]) / 2 - selected.origin[0],
      (ifrom[1] + ito[1]) / 2 - selected.origin[1],
      (ifrom[2] + ito[2]) / 2 - selected.origin[2]
    );
    inner.scale.set(
      Math.max(1e-6, ito[0] - ifrom[0]),
      Math.max(1e-6, ito[1] - ifrom[1]),
      Math.max(1e-6, ito[2] - ifrom[2])
    );
  }, [selected, ifrom, ito]);

  const tex = textures.length > 0 ? getSharedTexture(textures[0].source) : null;

  if (!selected || !frame || !ifrom || !ito || isCubeHidden(selected, bones)) return null;

  const commit = () => {
    const rig = rigRef.current;
    const inner = innerRef.current;
    if (!rig || !inner) return;
    // The rig lives in model space (inside the bone frame), so values are
    // stored as-is, apart from undoing inflate.
    const origin: Vec3 = [rig.position.x, rig.position.y, rig.position.z];
    const size: Vec3 = [
      Math.max(1e-6, inner.scale.x),
      Math.max(1e-6, inner.scale.y),
      Math.max(1e-6, inner.scale.z),
    ];
    const cx = inner.position.x + origin[0];
    const cy = inner.position.y + origin[1];
    const cz = inner.position.z + origin[2];
    const inf = selected.inflate ?? 0;
    setTransform({
      from: [cx - size[0] / 2 + inf, cy - size[1] / 2 + inf, cz - size[2] / 2 + inf],
      to: [cx + size[0] / 2 - inf, cy + size[1] / 2 - inf, cz + size[2] / 2 - inf],
      origin,
      rotation: [
        +(rig.rotation.x / DEG).toFixed(4),
        +(rig.rotation.y / DEG).toFixed(4),
        +(rig.rotation.z / DEG).toFixed(4),
      ],
    });
  };

  return (
    <>
      <group position={frame.pos} quaternion={frame.quat}>
        <group ref={rigRef}>
          <mesh
            ref={innerRef}
            userData={{ clickCube: selected.id, depth: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              select(selected.id, "cube");
            }}
          >
            <boxGeometry />
            {cubeMaterial(selected, tex)}
            <Edges color="#4ea1ff" lineWidth={2} />
          </mesh>
        </group>
      </group>

      {mode && (
        <TransformControls
          ref={(tc: TransformControlsImpl | null) => {
            gizmo.controls = tc;
          }}
          object={mode === "scale" ? (innerRef as React.RefObject<Object3D>) : (rigRef as React.RefObject<Object3D>)}
          mode={mode}
          size={0.85}
          translationSnap={1}
          scaleSnap={1}
          onObjectChange={commit}
          onMouseDown={() => {
            beginTransform();
            gizmo.dragging = true;
          }}
          onMouseUp={() => {
            gizmo.dragging = false;
          }}
        />
      )}
    </>
  );
}

/**
 * The selected bone rendered as a pivot rig: gizmo acts on a group placed at
 * the bone's world transform (parent chain composed). Rotation naturally
 * happens around the bone's pivot.
 */
function SelectedBone() {
  const bone = useModel(selectSelectedBone);
  const bones = useModel((s) => s.bones);
  const select = useModel((s) => s.select);
  const setBoneTransform = useModel((s) => s.setBoneTransform);
  const beginTransform = useModel((s) => s.beginTransform);
  const tool = useApp((s) => s.modelTool);

  const rigRef = useRef<Object3D>(null);

  const mode =
    tool === "Move"
      ? "translate"
      : tool === "Rotate"
        ? "rotate"
        : tool === "Scale"
          ? "rotate" // scale on a bone = rotate (bones are points, not volumes)
          : null;

  // World transform of the bone = chain matrix of the rig hierarchy
  const world = useMemo(() => {
    if (!bone) return null;
    return boneWorldMatrix(bones, bone.id);
  }, [bone, bones]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig || !bone || !world) return;
    rig.position.setFromMatrixPosition(world);
    rig.quaternion.setFromRotationMatrix(world);
  }, [bone, world]);

  if (!bone || !world) return null;
  if (bone.hidden || boneAncestors(bones, bone.parentId).some((b) => b.hidden)) return null;

  const commit = () => {
    const rig = rigRef.current;
    if (!rig) return;
    // world -> parent-local: divide out the parent chain's world matrix.
    // Position stays in model space (bone.origin is model-space); only the
    // rotation is expressed relative to the parent chain.
    const parentM = boneWorldMatrix(
      bones,
      bones.find((b) => b.id === bone.id)?.parentId ?? null
    );
    const inv = parentM.clone().invert();
    const localM = inv.clone().multiply(new THREE.Matrix4().compose(
      rig.position.clone(),
      rig.quaternion.clone(),
      new THREE.Vector3(1, 1, 1)
    ));
    const pos = new THREE.Vector3().setFromMatrixPosition(localM);
    // Same Z-Y-X Euler convention as everywhere else
    const m4 = new THREE.Matrix4().extractRotation(localM);
    const e = new THREE.Euler().setFromRotationMatrix(m4, ROT_ORDER);
    const localRot: Vec3 = [e.x / DEG, e.y / DEG, e.z / DEG];
    // `pos` is the parent-relative offset; the store keeps absolute origin.
    const parentBone = bones.find((b) => b.id === bone.parentId) ?? null;
    const newOrigin: Vec3 = parentBone
      ? [parentBone.origin[0] + pos.x, parentBone.origin[1] + pos.y, parentBone.origin[2] + pos.z]
      : [pos.x, pos.y, pos.z];
    setBoneTransform({
      origin: newOrigin,
      rotation: [
        +localRot[0].toFixed(4),
        +localRot[1].toFixed(4),
        +localRot[2].toFixed(4),
      ],
    });
  };

  return (
    <>
      <group ref={rigRef}>
        <mesh
          userData={{ clickBone: bone.id, depth: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            select(bone.id, "bone");
          }}
        >
          <octahedronGeometry args={[1.4, 0]} />
          <meshBasicMaterial color={bone.color} wireframe />
        </mesh>
      </group>

      {mode && (
        <TransformControls
          ref={(tc: TransformControlsImpl | null) => {
            gizmo.controls = tc;
          }}
          object={rigRef as React.RefObject<Object3D>}
          mode={mode}
          size={0.85}
          translationSnap={1}
          rotationSnap={THREE.MathUtils.degToRad(22.5)}
          onObjectChange={commit}
          onMouseDown={() => {
            beginTransform();
            gizmo.dragging = true;
          }}
          onMouseUp={() => {
            gizmo.dragging = false;
          }}
        />
      )}
    </>
  );
}

/** Renders the full scene graph: root cubes, bone trees, and the selection rig. */
function SceneContent() {
  const cubes = useModel((s) => s.cubes);
  const bones = useModel((s) => s.bones);
  const textures = useModel((s) => s.textures);
  const resolution = useModel((s) => s.resolution);
  const tex = textures.length > 0 ? getSharedTexture(textures[0].source) : null;

  const rootCubes = useMemo(() => cubes.filter((c) => !c.boneId), [cubes]);
  const rootBones = useMemo(
    () => bones.filter((b) => !b.parentId || !bones.some((x) => x.id === b.parentId)),
    [bones]
  );

  return (
    <group>
      {rootCubes.map((cube) => (
        <CubeObject key={cube.id} cube={cube} depth={0} tex={tex} resolution={resolution} />
      ))}
      {rootBones.map((bone) => (
        <BoneNode
          key={bone.id}
          bone={bone}
          allCubes={cubes}
          allBones={bones}
          depth={0}
          tex={tex}
          resolution={resolution}
        />
      ))}
      <SelectedCube />
      <SelectedBone />
    </group>
  );
}

/** Dev-only: expose the three scene for live diagnostics. */
function DevSceneHook() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __scene?: THREE.Scene }).__scene = scene;
    }
  }, [scene]);
  return null;
}

export default function Viewport() {
  const select = useModel((s) => s.select);

  return (
    <Canvas
      camera={{ position: [48, 40, 48], fov: 50, near: 0.1, far: 2000 }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        if (!isGizmoBusy()) select(null);
      }}
    >
      <color attach="background" args={["#16171b"]} />

      <hemisphereLight intensity={0.5} groundColor="#1e2025" />
      <ambientLight intensity={0.4} />
      <directionalLight position={[24, 40, 16]} intensity={1.1} />

      <Grid
        cellSize={1}
        cellThickness={0.5}
        cellColor="#33363d"
        sectionSize={16}
        sectionThickness={1}
        sectionColor="#4ea1ff"
        fadeDistance={256}
        fadeStrength={1}
        infiniteGrid
      />

      <SceneContent />
      <DevSceneHook />

      <OrbitControls makeDefault enableDamping dampingFactor={0.15} />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport
          axisColors={["#ff5f56", "#7dd87d", "#5b8def"]}
          labels={["E", "Up", "S"]}
          labelColor="#16171b"
        />
      </GizmoHelper>
    </Canvas>
  );
}
