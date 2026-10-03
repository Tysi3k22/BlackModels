import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const gridVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const gridFragmentShader = `
  uniform vec2 uResolution;
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform vec2 uCursor;
  uniform float uBrushSize;
  uniform float uShowCursor;
  varying vec2 vUv;
  
  void main() {
    vec2 px = vUv * uResolution;
    vec2 grid = fract(px);
    
    vec2 fw = fwidth(px);
    vec2 dist = min(grid, 1.0 - grid);
    
    vec2 edge = smoothstep(fw * 0.0, fw * 1.5, dist);
    float gridAlpha = 1.0 - min(edge.x, edge.y);
    
    // Brush cursor highlight
    float cursorAlpha = 0.0;
    if (uShowCursor > 0.5) {
      float h = floor(uBrushSize / 2.0);
      vec2 cursorMin = uCursor - h;
      vec2 cursorMax = cursorMin + uBrushSize;
      vec2 pixelPos = floor(px);
      if (pixelPos.x >= cursorMin.x && pixelPos.x < cursorMax.x &&
          pixelPos.y >= cursorMin.y && pixelPos.y < cursorMax.y) {
        cursorAlpha = 0.35;
      }
    }
    
    float totalAlpha = max(gridAlpha * uAlpha, cursorAlpha);
    if (totalAlpha < 0.05) discard;
    
    vec3 finalColor = uColor;
    if (cursorAlpha > gridAlpha * uAlpha) {
      finalColor = vec3(1.0, 0.75, 0.15); // brush cursor color (amber)
    }
    gl_FragColor = vec4(finalColor, totalAlpha);
  }
`;

/** Pixel grid overlay + 3D brush cursor drawn on top of a cube in texture mode. */
export function PixelGridMaterial({ resolution, attach, cursorUV, brushSize, showCursor }: {
  resolution: [number, number];
  attach?: string;
  cursorUV?: [number, number];
  brushSize?: number;
  showCursor?: boolean;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(resolution[0], resolution[1]) },
      uColor: { value: new THREE.Color("#000000") },
      uAlpha: { value: 0.65 },
      uCursor: { value: new THREE.Vector2(-999, -999) },
      uBrushSize: { value: 1.0 },
      uShowCursor: { value: 0.0 },
    }),
    [resolution[0], resolution[1]]
  );

  // Update cursor uniforms every frame for smooth tracking
  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;
    if (showCursor && cursorUV) {
      mat.uniforms.uCursor.value.set(
        cursorUV[0] * resolution[0],
        cursorUV[1] * resolution[1]
      );
      mat.uniforms.uBrushSize.value = brushSize ?? 1;
      mat.uniforms.uShowCursor.value = 1.0;
    } else {
      mat.uniforms.uShowCursor.value = 0.0;
    }
  });

  return (
    <shaderMaterial
      ref={matRef}
      attach={attach}
      uniforms={uniforms}
      vertexShader={gridVertexShader}
      fragmentShader={gridFragmentShader}
      transparent
      depthWrite={false}
      polygonOffset
      polygonOffsetFactor={-1}
    />
  );
}
