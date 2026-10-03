import { useEffect, useMemo, useRef } from "react";
import { Edges, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { Object3D } from "three";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";
import { useApp } from "../../constants";
import {
  boneAncestors,
  isCubeHidden,
  selectSelectedBone,
  selectSelectedCube,
  useModel,
  type Vec3,
} from "../../stores/modelStore";
import { cubeMaterial } from "./CubeMaterial";
import {
  DEG,
  ROT_ORDER,
  boneWorldMatrix,
  buildTextureMap,
  gizmo,
  inflateBox,
  useCubeGeometry,
} from "./shared";

/**
 * The selected cube rendered as an editable rig. The rig sits inside the bone
 * hierarchy (parent chain of groups), so gizmo edits happen in the bone's
 * local space; stored values are converted back to model space.
 */
export function SelectedCube() {
  const selected = useModel(selectSelectedCube);
  const bones = useModel((s) => s.bones);
  const select = useModel((s) => s.select);
  const setTransform = useModel((s) => s.setTransform);
  const beginTransform = useModel((s) => s.beginTransform);
  const endTransform = useModel((s) => s.endTransform);
  const tool = useApp((s) => s.modelTool);
  const textures = useModel((s) => s.textures);
  const textureMap = useMemo(() => buildTextureMap(textures), [textures]);
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
            {cubeMaterial(selected, textureMap)}
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
            endTransform();
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
export function SelectedBone() {
  const bone = useModel(selectSelectedBone);
  const bones = useModel((s) => s.bones);
  const select = useModel((s) => s.select);
  const setBoneTransform = useModel((s) => s.setBoneTransform);
  const beginTransform = useModel((s) => s.beginTransform);
  const endTransform = useModel((s) => s.endTransform);
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
            endTransform();
          }}
        />
      )}
    </>
  );
}
