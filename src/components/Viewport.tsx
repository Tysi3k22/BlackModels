import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Edges,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import type { Mesh, Object3D } from "three";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { useApp } from "../constants";
import { Cube, TransformUpdate, useModel } from "../stores/modelStore";
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

function CubeMesh({ cube }: { cube: Cube }) {
  const selected = useModel((s) => s.selectedId === cube.id);
  const select = useModel((s) => s.select);

  const [x0, y0, z0] = cube.from;
  const [x1, y1, z1] = cube.to;
  const position: [number, number, number] = [
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2,
  ];
  const size: [number, number, number] = [x1 - x0, y1 - y0, z1 - z0];

  return (
    <mesh
      position={position}
      scale={size}
      rotation={cube.rotation}
      onClick={(e) => {
        e.stopPropagation();
        select(cube.id);
      }}
    >
      <boxGeometry />
      <meshStandardMaterial color={cube.color} transparent opacity={0.9} />
      {selected && <Edges color="#4ea1ff" lineWidth={2} />}
    </mesh>
  );
}

/**
 * The selected cube, rendered by itself so the TransformControls gizmo can be
 * attached directly to its mesh (the canonical drei pattern). The gizmo edits
 * the mesh transform in place; every change is committed to the store, and the
 * store values are re-applied through the position/scale/rotation props.
 */
function SelectedCube() {
  const selected = useModel(selectSelectedCube);
  const select = useModel((s) => s.select);
  const setTransform = useModel((s) => s.setTransform);
  const beginTransform = useModel((s) => s.beginTransform);
  const tool = useApp((s) => s.modelTool);
  const meshRef = useRef<Mesh>(null);

  const [x0, y0, z0] = selected?.from ?? [0, 0, 0];
  const [x1, y1, z1] = selected?.to ?? [1, 1, 1];
  const position: [number, number, number] = [
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2,
  ];
  const size: [number, number, number] = [
    Math.max(1e-6, x1 - x0),
    Math.max(1e-6, y1 - y0),
    Math.max(1e-6, z1 - z0),
  ];

  const mode =
    tool === "Move"
      ? "translate"
      : tool === "Rotate"
        ? "rotate"
        : tool === "Scale"
          ? "scale"
          : null;

  // Keep the gizmo in sync when the cube changes externally (undo, add, etc.)
  useEffect(() => {
    const m = meshRef.current;
    if (!m || !selected) return;
    m.position.set(...position);
    m.scale.set(...size);
    m.rotation.set(...selected.rotation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.from, selected?.to, selected?.rotation]);

  if (!selected) return null;

  const commit = () => {
    const m = meshRef.current;
    if (!m) return;
    const s: [number, number, number] = [
      Math.max(1, m.scale.x),
      Math.max(1, m.scale.y),
      Math.max(1, m.scale.z),
    ];
    const update: TransformUpdate = {
      from: [
        m.position.x - s[0] / 2,
        m.position.y - s[1] / 2,
        m.position.z - s[2] / 2,
      ],
      to: [
        m.position.x + s[0] / 2,
        m.position.y + s[1] / 2,
        m.position.z + s[2] / 2,
      ],
      rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
    };
    setTransform(update);
  };

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        scale={size}
        rotation={selected.rotation}
        onClick={(e) => {
          e.stopPropagation();
          select(selected.id);
        }}
      >
        <boxGeometry />
        <meshStandardMaterial color={selected.color} transparent opacity={0.9} />
        <Edges color="#4ea1ff" lineWidth={2} />
      </mesh>

      {mode && (
        <TransformControls
          ref={(tc: TransformControlsImpl | null) => {
            gizmo.controls = tc;
          }}
          object={meshRef as React.RefObject<Object3D>}
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
      camera={{ position: [32, 28, 32], fov: 50, near: 0.1, far: 2000 }}
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
        fadeDistance={128}
        fadeStrength={1}
        infiniteGrid
      />

      {cubes
        .filter((c) => c.id !== selectedId)
        .map((cube) => (
          <CubeMesh key={cube.id} cube={cube} />
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
