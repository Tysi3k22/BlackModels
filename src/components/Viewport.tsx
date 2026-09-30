import { Canvas } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from "@react-three/drei";

export default function Viewport() {
  return (
    <Canvas
      camera={{ position: [32, 28, 32], fov: 50, near: 0.1, far: 2000 }}
      dpr={[1, 2]}
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
