import { readFileSync } from "node:fs";
import * as THREE from "three";

// Verify the PROPER bbmodel interpretation:
// W(bone) = W(parent) * T(origin - parentOrigin) * R(rotation)   [full rotations]
// cube world = W(bone) * T(origin_c - origin_bone) * R(rot_c) applied to box(center - origin_c, size)
const D = Math.PI / 180;

for (const file of [
  "C:/Users/kacpe/Desktop/kopia/ModelEngine/blueprints/adults/nocsy_drakonin3.bbmodel",
  "C:/Users/kacpe/Desktop/kopia/ModelEngine/blueprints/adults/nocsy_drakonin.bbmodel",
]) {
  const d = JSON.parse(readFileSync(file, "utf8"));
  const name = file.split("/").pop();
  const bones = new Map();
  const cubeParent = new Map();
  (function walk(nodes, parent) {
    for (const n of nodes) {
      if (typeof n === "string") { cubeParent.set(n, parent); continue; }
      bones.set(n.uuid, { name: n.name, origin: n.origin, rot: n.rotation ?? [0, 0, 0], parent });
      walk(n.children ?? [], n.uuid);
    }
  })(d.outliner, null);
  const cubeById = new Map(d.elements.map((e) => [e.uuid, e]));

  const worldM = new Map(); // bone uuid -> Matrix4
  const getWorld = (uuid) => {
    if (worldM.has(uuid)) return worldM.get(uuid);
    const b = bones.get(uuid);
    const pm = b.parent ? getWorld(b.parent) : new THREE.Matrix4();
    const rel = b.parent
      ? new THREE.Vector3(b.origin[0] - bones.get(b.parent).origin[0], b.origin[1] - bones.get(b.parent).origin[1], b.origin[2] - bones.get(b.parent).origin[2])
      : new THREE.Vector3(...b.origin);
    const m = pm.clone().multiply(new THREE.Matrix4().compose(
      rel,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(b.rot[0] * D, b.rot[1] * D, b.rot[2] * D)),
      new THREE.Vector3(1, 1, 1)
    ));
    worldM.set(uuid, m);
    return m;
  };

  const root = new THREE.Group();
  for (const [uuid, c] of cubeById) {
    const size = new THREE.Vector3(c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]);
    const center = new THREE.Vector3((c.from[0] + c.to[0]) / 2, (c.from[1] + c.to[1]) / 2, (c.from[2] + c.to[2]) / 2);
    const o = new THREE.Vector3(...(c.origin ?? center.toArray()));
    const boneUuid = cubeParent.get(uuid) ?? null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
    const boneM = boneUuid ? getWorld(boneUuid) : new THREE.Matrix4();
    // cube frame within bone: T(o - boneOrigin) * R(rot_c)
    const boneOriginModel = boneUuid ? new THREE.Vector3(...bones.get(boneUuid).origin) : new THREE.Vector3(0, 0, 0);
    const rel = o.clone().sub(boneOriginModel);
    const local = new THREE.Matrix4().compose(rel, new THREE.Quaternion().setFromEuler(new THREE.Euler((c.rotation ?? [0,0,0])[0] * D, (c.rotation ?? [0,0,0])[1] * D, (c.rotation ?? [0,0,0])[2] * D)), new THREE.Vector3(1, 1, 1));
    mesh.applyMatrix4(boneM.clone().multiply(local).multiply(new THREE.Matrix4().makeTranslation(center.clone().sub(o))));
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const mn = box.min.toArray().map((v) => +v.toFixed(1));
  const mx = box.max.toArray().map((v) => +v.toFixed(1));
  const symX = Math.abs(Math.abs(mn[0]) - Math.abs(mx[0])) < 4;
  console.log(`${name}: bbox x [${mn[0]}..${mx[0]}] y [${mn[1]}..${mx[1]}] z [${mn[2]}..${mx[2]}] | x-symmetric: ${symX} | grounded(min y): ${mn[1]}`);

  // wing pivot world positions
  for (const bn of ["left_wing", "left_wing_end"]) {
    const e = [...bones.entries()].find(([, b]) => b.name === bn);
    if (!e) continue;
    const p = new THREE.Vector3().setFromMatrixPosition(getWorld(e[0]));
    console.log(`  ${bn}: world pivot [${p.toArray().map((v) => +v.toFixed(1)).join(", ")}] (raw origin: ${e[1].origin.map((v) => +v.toFixed(1)).join(", ")})`);
  }
}
