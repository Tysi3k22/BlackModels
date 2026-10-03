import * as THREE from "three";
import type { CubeFaces, Vec3 } from "../../stores/modelStore";
import { textureMaterial } from "../../stores/modelStore";
import { getSharedTexture } from "../../lib/textureCache";
import { BOX_FACE_ORDER, type TextureMap } from "./shared";

/**
 * Materials for one cube: one per BoxGeometry face slot, textured where the
 * face has a texture id and solid-colored otherwise.
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

  return (
    <>
      {BOX_FACE_ORDER.map((face, i) => {
        const f = cube.faces?.[face];
        const texId = f?.texture ?? null;
        const proj = texId != null ? textures.get(texId) : undefined;
        const tex = proj ? getSharedTexture(proj.source, texId) : null;
        if (tex) {
          const mat = textureMaterial(proj);
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
