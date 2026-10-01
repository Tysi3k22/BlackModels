import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  ProjectTexture,
  boneAncestors,
  selectSelectedBone,
  selectSelectedCube,
  textureMaterial,
  useModel,
} from "../stores/modelStore";

// Minecraft coordinate system: +X = East, +Y = Up, +Z = South
// 1 grid cell = 1 in-game pixel, 1 section (16 cells) = 1 Minecraft block

// Module-local gizmo state so onPointerMissed can ignore clicks on the gizmo
const gizmo = {
  dragging: false,
  controls: null as TransformControlsImpl | null,
};
const isGizmoBusy = () =>
  gizmo.dragging ||
  (gizmo.controls as unknown as { axis: string | null } | null)?.axis != null;

const DEG = Math.PI / 180;

/** True in the Texture tab: every cube (also the selected one) is drawn in place inside its bone. */
const TextureModeContext = createContext(false);

// Blockbench applies group/cube rotations (degrees) in Z-Y-X order.
const ROT_ORDER = "ZYX" as const;
const eulerDeg = (r: Vec3) =>
  new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, ROT_ORDER);

// Texture cache keyed by texture index — reuses the same THREE.Texture object
// and updates its image in-place when the source changes, avoiding full reloads.
const textureCacheByIndex = new Map<number, { tex: THREE.Texture; source: string }>();
function getSharedTexture(source: string, index?: number): THREE.Texture | null {
  if (index != null) {
    const cached = textureCacheByIndex.get(index);
    if (cached) {
      if (cached.source !== source) {
        // Source changed (paint stroke) — update image in place
        const img = new Image();
        img.onload = () => {
          cached.tex.image = img;
          cached.tex.needsUpdate = true;
        };
        img.src = source;
        cached.source = source;
      }
      return cached.tex;
    }
  }
  try {
    const t = new THREE.TextureLoader().load(source);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    if (index != null) {
      textureCacheByIndex.set(index, { tex: t, source });
    }
    return t;
  } catch {
    return null;
  }
}

// BoxGeometry face order: px, nx, py, ny, pz, nz
// Minecraft/bbmodel: east=+X, west=-X, up=+Y, down=-Y, south=+Z, north=-Z
const BOX_FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;
// Material slots matching BOX_FACE_ORDER (0=px east, 1=nx west, 2=py up, 3=ny down, 4=pz south, 5=nz north)

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

function cubeMaterial(
  cube: {
    color: string;
    faces?: CubeFaces;
    shade?: boolean;
    inflate?: number;
    from: Vec3;
    to: Vec3;
  },
  textures: ProjectTexture[]
) {
  const [fx, fy, fz] = cube.from;
  const [tx, ty, tz] = cube.to;
  const zeroThickness = tx - fx === 0 || ty - fy === 0 || tz - fz === 0;
  const side = zeroThickness ? THREE.DoubleSide : THREE.FrontSide;

  const anyTextured =
    !!cube.faces &&
    Object.values(cube.faces).some((f) => f?.texture != null && textures[f.texture]);

  // shade === false: no directional lighting, the cube is drawn flat/fullbright
  const unlit = cube.shade === false;

  if (!anyTextured) {
    return unlit ? (
      <meshBasicMaterial color={cube.color} transparent opacity={0.9} side={side} />
    ) : (
      <meshStandardMaterial
        color={cube.color}
        transparent
        opacity={0.9}
        side={side}
      />
    );
  }

  return (
    <>
      {BOX_FACE_ORDER.map((face, i) => {
        const f = cube.faces?.[face];
        const texIdx = f?.texture != null ? f.texture : undefined;
        const src = texIdx != null ? textures[texIdx]?.source : undefined;
        const tex = src ? getSharedTexture(src, texIdx) : null;
        if (tex) {
          const mat = textureMaterial(texIdx != null ? textures[texIdx] : null);
          const faceSide =
            mat.sides === "double"
              ? THREE.DoubleSide
              : mat.sides === "front"
                ? THREE.FrontSide
                : side;
          const key = `${face}-${mat.renderMode}-${unlit ? "u" : "l"}`;
          if (unlit) {
            return mat.renderMode === "additive" ? (
              <meshBasicMaterial
                key={key}
                attach={`material-${i}`}
                map={tex}
                side={faceSide}
                transparent
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            ) : (
              <meshBasicMaterial
                key={key}
                attach={`material-${i}`}
                map={tex}
                side={faceSide}
                transparent
                alphaTest={0.01}
              />
            );
          }
          if (mat.renderMode === "emissive") {
            // fullbright: the texture lights itself regardless of scene lights
            return (
              <meshStandardMaterial
                key={key}
                attach={`material-${i}`}
                map={tex}
                emissive="#ffffff"
                emissiveMap={tex}
                emissiveIntensity={1}
                side={faceSide}
                transparent
                alphaTest={0.01}
              />
            );
          }
          if (mat.renderMode === "additive") {
            return (
              <meshStandardMaterial
                key={key}
                attach={`material-${i}`}
                map={tex}
                side={faceSide}
                transparent
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            );
          }
          // "default" and "layered" (layering is export-only, the preview shows the base)
          return (
            <meshStandardMaterial
              key={key}
              attach={`material-${i}`}
              map={tex}
              side={faceSide}
              transparent
              alphaTest={0.01}
            />
          );
        }
        return unlit ? (
          <meshBasicMaterial
            key={face}
            attach={`material-${i}`}
            color={cube.color}
            side={side}
            transparent
            opacity={0.9}
          />
        ) : (
          <meshStandardMaterial
            key={face}
            attach={`material-${i}`}
            color={cube.color}
            side={side}
            transparent
            opacity={0.9}
          />
        );
      })}
    </>
  );
}

/** Cube geometry with per-face UVs from bbmodel data. `cube` may be null. */
function useCubeGeometry(
  cube: Cube | null,
  resolution: [number, number]
): THREE.BoxGeometry {
  return useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    if (cube) applyFaceUVs(g, cube.faces, resolution);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube?.id, cube?.faces, resolution[0], resolution[1]]);
}

import { ThreeEvent, useFrame } from "@react-three/fiber";
import { getPaintContext, floodFillAt, paintLine, paintSquare } from "../lib/paint";

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

function PixelGridMaterial({ resolution, attach, cursorUV, brushSize, showCursor }: { 
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

/** Push an arbitrary canvas bitmap into the live THREE texture so strokes appear instantly. */
export function flushCanvasToLiveTexture(textureIndex: number, canvas: HTMLCanvasElement | null) {
  const cached = textureCacheByIndex.get(textureIndex);
  if (!cached || !canvas) return;
  cached.tex.image = canvas;
  cached.tex.needsUpdate = true;
}

/** Flush the offscreen paint canvas into the live THREE texture so strokes appear instantly. */
function flushToLiveTexture(textureIndex: number) {
  flushCanvasToLiveTexture(textureIndex, (window as any).__paintOffscreen as HTMLCanvasElement | undefined ?? null);
}

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
  textures: ProjectTexture[];
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
    if (activeTexture == null || !textures[activeTexture]) return;
    if (!e.uv) return;
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const tex = textures[activeTexture];
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
      flushToLiveTexture(activeTexture);
      commitTexturePixels(ctx.canvas.toDataURL("image/png"), { faces: [] });
      return;
    }
    stroke.current = { last: hit };
    paintSquare(ctx, hit[0], hit[1], effBrushSize, textureTool === "Eraser", textureColor);
    flushToLiveTexture(activeTexture);
  };
  
  const handlePointerMove = async (e: ThreeEvent<PointerEvent>) => {
    if (!textureMode) return;
    if (e.uv) setHoverUV([e.uv.x, e.uv.y]);
    if (!stroke.current) return;
    e.stopPropagation();
    if (activeTexture == null || !textures[activeTexture]) return;
    if (!e.uv) return;
    
    const tex = textures[activeTexture];
    const [w, h] = resolution;
    const px = Math.floor(e.uv.x * w);
    const py = Math.floor((1 - e.uv.y) * h);
    const hit: [number, number] = [px, py];
    
    const ctx = await getPaintContext(tex, w, h);
    paintLine(ctx, stroke.current.last, hit, effBrushSize, textureTool === "Eraser", textureColor);
    stroke.current = { last: hit };
    flushToLiveTexture(activeTexture);
  };
  
  const handlePointerUp = async () => {
    if (!textureMode) return;
    if (stroke.current) {
      stroke.current = null;
      if (activeTexture != null && textures[activeTexture]) {
        const tex = textures[activeTexture];
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
  textures,
  resolution,
}: {
  bone: Bone;
  allCubes: Cube[];
  allBones: Bone[];
  textures: ProjectTexture[];
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
          allCubes={allCubes}
          allBones={allBones}
          textures={textures}
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
  const resolution = useModel((s) => s.resolution);
  // Proper per-face UV geometry — a bare <boxGeometry/> has default UVs 0–1,
  // which painted the WHOLE texture atlas onto every face of the selection.
  const geometry = useCubeGeometry(selected, resolution);

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
            geometry={geometry}
            userData={{ clickCube: selected.id }}
            onClick={(e) => {
              e.stopPropagation();
              select(selected.id, "cube");
            }}
          >
            {cubeMaterial(selected, textures)}
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
function SceneContent({ textureMode }: { textureMode: boolean }) {
  const cubes = useModel((s) => s.cubes);
  const bones = useModel((s) => s.bones);
  const textures = useModel((s) => s.textures);
  const resolution = useModel((s) => s.resolution);

  const rootCubes = useMemo(() => cubes.filter((c) => !c.boneId), [cubes]);
  const rootBones = useMemo(
    () => bones.filter((b) => !b.parentId || !bones.some((x) => x.id === b.parentId)),
    [bones]
  );

  return (
    <TextureModeContext.Provider value={textureMode}>
      <group>
        {rootCubes.map((cube) => (
          <CubeObject key={cube.id} cube={cube} textures={textures} resolution={resolution} />
        ))}
        {rootBones.map((bone) => (
          <BoneNode
            key={bone.id}
            bone={bone}
            allCubes={cubes}
            allBones={bones}
            textures={textures}
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
          LEFT: mode === "texture" ? 99 as any : THREE.MOUSE.ROTATE,
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