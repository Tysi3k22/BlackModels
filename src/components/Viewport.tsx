import { Canvas } from "@react-three/fiber";
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls } from "@react-three/drei";
import { Cube, useModel } from "../stores/modelStore";

// Minecraft coordinate system: +X = East, +Y = Up, +Z = South
// 1 grid cell = 1 in-game pixel, 1 section (16 cells) = 1 Minecraft block

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

export default function Viewport() {
  const cubes = useModel((s) => s.cubes);
  const select = useModel((s) => s.select);

  return (
    <Canvas
      camera={{ position: [32, 28, 32], fov: 50, near: 0.1, far: 2000 }}
      dpr={[1, 2]}
      onPointerMissed={() => select(null)}
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

      {cubes.map((cube) => (
        <CubeMesh key={cube.id} cube={cube} />
      ))}

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
