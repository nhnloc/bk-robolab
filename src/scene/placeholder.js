// Máy placeholder (khối hộp) khi chưa có GLB: cùng tên node như GLB để binder hoạt động y hệt.
import * as THREE from 'three';
import { PLACEHOLDER } from './nodes.js';

export const fc2three = (x, y, z) => new THREE.Vector3(x / 1000, z / 1000, -y / 1000);

function boxMesh(b, color, origin) {
  const [x0, y0, z0, x1, y1, z1] = b;
  const geo = new THREE.BoxGeometry(Math.abs(x1 - x0) / 1000, Math.abs(z1 - z0) / 1000, Math.abs(y1 - y0) / 1000);
  const m = new THREE.Mesh(geo, material(color));
  m.position.copy(fc2three((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)).sub(origin);
  return m;
}
function cylMesh(spec, color, origin) {
  const { r, h, at = [0, 0, 0] } = spec;
  const geo = new THREE.CylinderGeometry(r / 1000, r / 1000, h / 1000, 40);
  const m = new THREE.Mesh(geo, material(color));
  m.position.copy(fc2three(at[0], at[1], (at[2] || 0) + h / 2 + (spec.z0 || 0)));
  return m;
}
const cache = new Map();
function material(color) {
  if (!cache.has(color)) cache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: color === '#E8EAEC' || color === '#D5D9DD' ? 0.5 : 0.1 }));
  return cache.get(color);
}

export function buildPlaceholder(machineId) {
  const root = new THREE.Group();
  root.name = 'placeholder_' + machineId;
  const spec = PLACEHOLDER[machineId] || [];
  const zero = new THREE.Vector3();
  for (const p of spec) {
    if (p.node) {
      const g = new THREE.Group(); g.name = p.node;
      const origin = p.pivot ? fc2three(...p.pivot) : zero.clone();
      g.position.copy(origin);
      if (p.b) g.add(boxMesh(p.b, p.c, origin));
      if (p.cylinder) g.add(cylMesh(p.cylinder, p.c, origin));
      for (const e of p.extra || []) g.add(e.b ? boxMesh(e.b, e.c, origin) : cylMesh(e.cyl, e.c, zero));
      root.add(g);
    } else {
      const m = boxMesh(p.b, p.c, zero);
      if (p.name) m.name = p.name; else m.name = 'static_ph';
      root.add(m);
    }
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}
