import { useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
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
import { Cube, CubeFaces, Vec3, useModel } from "../stores/modelStore";
import { selectSelectedCube } from "../stores/modelStore";

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

/**
 * One model cube. Rendered as a group positioned at the pivot (origin) with
 * rotation applied to the group, and the mesh offset relative to the pivot —
 * this matches bbmodel semantics (rotation happens around `origin`).
 */
function CubeObject({ cube }: { cube: Cube }) {
  const selected = useModel((s) => s.selectedId === cube.id);
  const select = useModel((s) => s.select);
  const textures = useModel((s) => s.textures);
  const resolution = useModel((s) => s.resolution);
  const [fx, fy, fz] = cube.from;
  const [tx, ty, tz] = cube.to;
  const origin = cube.origin ?? [(fx + tx) / 2, (fy + ty) / 2, (fz + tz) / 2];
  const [ifrom, ito] = useMemo(
    () => inflateBox(cube.from, cube.to, cube.inflate),
    [cube.from, cube.to, cube.inflate]
  );

  // Mesh position relative to the pivot
  const meshPos: Vec3 = [
    (ifrom[0] + ito[0]) / 2 - origin[0],
    (ifrom[1] + ito[1]) / 2 - origin[1],
    (ifrom[2] + ito[2]) / 2 - origin[2],
  ];
  const size: Vec3 = [
    Math.max(1e-6, ito[0] - ifrom[0]),
    Math.max(1e-6, ito[1] - ifrom[1]),
    Math.max(1e-6, ito[2] - ifrom[2]),
  ];

  const tex = textures.length > 0 ? getSharedTexture(textures[0].source) : null;
  const hasFaceUVs =
    !!cube.faces && Object.values(cube.faces).some((f) => f?.uv && (f.uv[0] !== f.uv[2] || f.uv[1] !== f.uv[3]));

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    if (tex && hasFaceUVs) applyFaceUVs(g, cube.faces, resolution);
    return g;
  }, [tex?.uuid, cube.faces, resolution[0], resolution[1]]);

  const zeroThickness =
    tx - fx === 0 || ty - fy === 0 || tz - fz === 0;

  return (
    <group
      position={origin}
      rotation={[cube.rotation[0] * DEG, cube.rotation[1] * DEG, cube.rotation[2] * DEG]}
      onClick={(e) => {
        e.stopPropagation();
        select(cube.id);
      }}
    >
      <mesh position={meshPos} scale={size} geometry={geometry}>
        {tex && hasFaceUVs ? (
          <meshStandardMaterial
            map={tex}
            side={zeroThickness ? THREE.DoubleSide : THREE.FrontSide}
            transparent
            alphaTest={0.01}
          />
        ) : (
          <meshStandardMaterial color={cube.color} transparent opacity={0.9} />
        )}
        {selected && <Edges color="#4ea1ff" lineWidth={2} />}
      </mesh>
    </group>
  );
}

/**
 * The selected cube rendered as an editable rig: group at pivot (translate +
 * rotate gizmos act on this) with the mesh inside (scale gizmo acts on it).
 */
function SelectedCube() {
  const selected = useModel(selectSelectedCube);
  const select = useModel((s) => s.select);
  const setTransform = useModel((s) => s.setTransform);
  const beginTransform = useModel((s) => s.beginTransform);
  const tool = useApp((s) => s.modelTool);
  const groupRef = useRef<Object3D>(null);
  const meshRef = useRef<Object3D>(null);
  const textures = useModel((s) => s.textures);

  const mode =
    tool === "Move"
      ? "translate"
      : tool === "Rotate"
        ? "rotate"
        : tool === "Scale"
          ? "scale"
          : null;

  // Rebuild the rig when the cube data changes externally (undo, import, etc.)
  useEffect(() => {
    const g = groupRef.current;
    const m = meshRef.current;
    if (!g || !m || !selected) return;
    const origin = selected.origin ?? [
      (selected.from[0] + selected.to[0]) / 2,
      (selected.from[1] + selected.to[1]) / 2,
      (selected.from[2] + selected.to[2]) / 2,
    ];
    g.position.set(...origin);
    g.rotation.set(selected.rotation[0] * DEG, selected.rotation[1] * DEG, selected.rotation[2] * DEG);
    const [ifrom, ito] = inflateBox(selected.from, selected.to, selected.inflate);
    m.position.set(
      (ifrom[0] + ito[0]) / 2 - origin[0],
      (ifrom[1] + ito[1]) / 2 - origin[1],
      (ifrom[2] + ito[2]) / 2 - origin[2]
    );
    m.scale.set(
      Math.max(1e-6, ito[0] - ifrom[0]),
      Math.max(1e-6, ito[1] - ifrom[1]),
      Math.max(1e-6, ito[2] - ifrom[2])
    );
  }, [selected?.id, selected?.from, selected?.to, selected?.origin, selected?.rotation, selected?.inflate]);

  const tex = textures.length > 0 ? getSharedTexture(textures[0].source) : null;
  const hasFaceUVs =
    !!selected?.faces && Object.values(selected.faces).some((f) => f?.uv && (f.uv[0] !== f.uv[2] || f.uv[1] !== f.uv[3]));
  const [fx, fy, fz] = selected?.from ?? [0, 0, 0];
  const [tx, ty, tz] = selected?.to ?? [1, 1, 1];
  const zeroThickness = tx - fx === 0 || ty - fy === 0 || tz - fz === 0;

  if (!selected) return null;

  const commit = () => {
    const g = groupRef.current;
    const m = meshRef.current;
    if (!g || !m) return;
    const origin: Vec3 = [g.position.x, g.position.y, g.position.z];
    const size: Vec3 = [
      Math.max(1, m.scale.x),
      Math.max(1, m.scale.y),
      Math.max(1, m.scale.z),
    ];
    const ifrom: Vec3 = [
      m.position.x - size[0] / 2 + origin[0],
      m.position.y - size[1] / 2 + origin[1],
      m.position.z - size[2] / 2 + origin[2],
    ];
    const ito: Vec3 = [
      m.position.x + size[0] / 2 + origin[0],
      m.position.y + size[1] / 2 + origin[1],
      m.position.z + size[2] / 2 + origin[2],
    ];
    // Undo inflate before storing (store keeps the raw cube)
    const inf = selected.inflate ?? 0;
    const from: Vec3 = [ifrom[0] + inf, ifrom[1] + inf, ifrom[2] + inf];
    const to: Vec3 = [ito[0] - inf, ito[1] - inf, ito[2] - inf];
    setTransform({
      from,
      to,
      rotation: [
        +(g.rotation.x / DEG).toFixed(4),
        +(g.rotation.y / DEG).toFixed(4),
        +(g.rotation.z / DEG).toFixed(4),
      ],
    });
  };

  return (
    <>
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation();
            select(selected.id);
          }}
        >
          <boxGeometry />
          {tex && hasFaceUVs ? (
            <meshStandardMaterial
              map={tex}
              side={zeroThickness ? THREE.DoubleSide : THREE.FrontSide}
              transparent
              alphaTest={0.01}
            />
          ) : (
            <meshStandardMaterial color={selected.color} transparent opacity={0.9} />
          )}
          <Edges color="#4ea1ff" lineWidth={2} />
        </mesh>
      </group>

      {mode && (
        <TransformControls
          ref={(tc: TransformControlsImpl | null) => {
            gizmo.controls = tc;
          }}
          object={mode === "scale" ? (meshRef as React.RefObject<Object3D>) : (groupRef as React.RefObject<Object3D>)}
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

export default function Viewport() {
  const cubes = useModel((s) => s.cubes);
  const selectedId = useModel((s) => s.selectedId);
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

      {cubes
        .filter((c) => c.id !== selectedId)
        .map((cube) => (
          <CubeObject key={cube.id} cube={cube} />
        ))}

      <SelectedCube />

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
