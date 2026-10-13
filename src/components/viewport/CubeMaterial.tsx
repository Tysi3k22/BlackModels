import * as THREE from "three";
import type { CubeFaces, ProjectTexture, Vec3 } from "../../stores/modelStore";
import { textureMaterial } from "../../stores/modelStore";
import { getSharedTexture } from "../../lib/textureCache";
import { BOX_FACE_ORDER, type TextureMap } from "./shared";

/**
 * One textured material (lit / unlit / emissive / additive). `attach` is set
 * for per-face material slots and omitted for a single whole-cube material.
 */
function texturedMaterial(
  proj: ProjectTexture,
  tex: THREE.Texture,
  unlit: boolean,
  side: THREE.Side,
  key: string,
  attach?: string
) {
  const mat = textureMaterial(proj);
  const faceSide =
    mat.sides === "double"
      ? THREE.DoubleSide
      : mat.sides === "front"
        ? THREE.FrontSide
        : side;
  const k = `${key}-${mat.renderMode}-${unlit ? "u" : "l"}`;
  const a = attach ? { attach } : {};

  if (unlit) {
    return mat.renderMode === "additive" ? (
      <meshBasicMaterial
        key={k}
        {...a}
        map={tex}
        side={faceSide}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    ) : (
      <meshBasicMaterial
        key={k}
        {...a}
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
        key={k}
        {...a}
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
        key={k}
        {...a}
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
      key={k}
      {...a}
      map={tex}
      side={faceSide}
      transparent
      alphaTest={0.01}
    />
  );
}

/**
 * Materials for one cube: textured where the face has a texture id and
 * solid-colored otherwise. When all six faces share one texture the cube gets
 * a single material (one draw call instead of six); mixed cubes get one
 * material per BoxGeometry face slot.
 */
export function cubeMaterial(
  cube: {
    color: string;
    faces?: CubeFaces;
    shade?: boolean;
    inflate?: number;
    from: Vec3;
    to: Vec3;
  },
  textures: TextureMap
) {
  const [fx, fy, fz] = cube.from;
  const [tx, ty, tz] = cube.to;
  const zeroThickness = tx - fx === 0 || ty - fy === 0 || tz - fz === 0;
  const side = zeroThickness ? THREE.DoubleSide : THREE.FrontSide;

  const anyTextured =
    !!cube.faces &&
    Object.values(cube.faces).some((f) => f?.texture != null && textures.has(f.texture));

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

  // Fast path: every face uses the same (known) texture -> one material.
  const ids = BOX_FACE_ORDER.map((face) => cube.faces?.[face]?.texture ?? null);
  const first = ids[0];
  if (first != null && ids.every((id) => id === first)) {
    const proj = textures.get(first);
    const tex = proj ? getSharedTexture(proj.source, first) : null;
    if (proj && tex) return texturedMaterial(proj, tex, unlit, side, "all");
  }

  return (
    <>
      {BOX_FACE_ORDER.map((face, i) => {
        const f = cube.faces?.[face];
        const texId = f?.texture ?? null;
        const proj = texId != null ? textures.get(texId) : undefined;
        const tex = proj ? getSharedTexture(proj.source, texId) : null;
        if (proj && tex) {
          return texturedMaterial(proj, tex, unlit, side, face, `material-${i}`);
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