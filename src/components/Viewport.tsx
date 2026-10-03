import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import { useModel } from "../stores/modelStore";
import { SceneContent } from "./viewport/SceneContent";
import { isGizmoBusy } from "./viewport/shared";

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

/**
 * Shared scene for both editor modes. `mode = "model"` adds the transform
 * gizmo; `mode = "texture"` is a lighter orbit-view for texture painting.
 */
export function EditorScene({ mode }: { mode: "model" | "texture" }) {
  const select = useModel((s) => s.select);

  // R3F can mount before the flex layout settles, freezing the canvas at the
  // browser default 300x150. Nudge a resize once the container has real bounds.
  useEffect(() => {
    const t0 = setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    const t1 = setTimeout(() => window.dispatchEvent(new Event("resize")), 150);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [48, 40, 48], fov: 50, near: 0.1, far: 2000 }}
      dpr={[1, 2]}
      onPointerMissed={() => {
        if (mode === "model" && !isGizmoBusy()) select(null);
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

      <SceneContent textureMode={mode === "texture"} />
      <DevSceneHook />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.15}
        mouseButtons={{
          LEFT: (mode === "texture" ? 99 : THREE.MOUSE.ROTATE) as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE
        }}
      />

      {mode === "model" && (
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport
            axisColors={["#ff5f56", "#7dd87d", "#5b8def"]}
            labels={["E", "Up", "S"]}
            labelColor="#16171b"
          />
        </GizmoHelper>
      )}
    </Canvas>
  );
}

export default function Viewport() {
  return <EditorScene mode="model" />;
}
