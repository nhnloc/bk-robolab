// Vật liệu procedural chạy trên máy: phôi tròn, thùng, sản phẩm, khay, và thùng carton có bản lề gấp.
// Tọa độ item: mm, hệ FreeCAD (Z lên), z = mặt đáy. Lớp chứa (fcRoot) đã đổi FreeCAD → three (xoay -90° quanh X, 0.001).
import * as THREE from 'three';

const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts }));
  return mats.get(key);
}
const KRAFT = '#c8a273', KRAFT_IN = '#b48a5a', TAPE = '#9a6b35';

function shadow(o) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }

function makeBox(it, color, tapeOn = true) {
  const [l, w, hgt] = it.size || [300, 200, 200];
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, w, hgt), mat(color));
  m.position.z = hgt / 2; g.add(m);
  // băng keo trên nắp cho giống thùng thật
  if (tapeOn) { const tape = new THREE.Mesh(new THREE.BoxGeometry(l + 2, 48, 1.5), mat(TAPE)); tape.position.z = hgt + 0.5; g.add(tape); }
  if (it.label) g.add(labelSprite(String(it.label), hgt + 60));
  return g;
}

function labelSprite(text, z) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#0a3d62'; x.lineWidth = 4; x.stroke();
  x.fillStyle = '#0a3d62'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 32, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(90, 90, 1); sp.position.z = z; sp.renderOrder = 10;
  return sp;
}

function makePuck(it) {
  const [d, , hgt] = it.size || [50, 50, 25];
  const geo = new THREE.CylinderGeometry(d / 2, d / 2, hgt, 28); geo.rotateX(Math.PI / 2); geo.translate(0, 0, hgt / 2);
  return new THREE.Group().add(new THREE.Mesh(geo, mat(it.color || '#c8553d', { metalness: 0.3, roughness: 0.5 })));
}

/** Lon nước: thân trụ + nắp kim loại. */
function makeCan(it) {
  const [d, , hgt] = it.size || [66, 66, 120];
  const g = new THREE.Group();
  const body = new THREE.CylinderGeometry(d / 2, d / 2, hgt - 8, 24); body.rotateX(Math.PI / 2); body.translate(0, 0, hgt / 2);
  g.add(new THREE.Mesh(body, mat(it.color || '#d32f2f', { metalness: 0.35, roughness: 0.45 })));
  const lid = new THREE.CylinderGeometry(d / 2 - 4, d / 2 - 2, 8, 24); lid.rotateX(Math.PI / 2); lid.translate(0, 0, hgt - 4);
  const lid2 = lid.clone(); lid2.translate(0, 0, -(hgt - 8));
  const metal = mat('#c9ced3', { metalness: 0.7, roughness: 0.3 });
  g.add(new THREE.Mesh(lid, metal), new THREE.Mesh(lid2, metal));
  return g;
}

function makeTray(it) {
  const [l, w, hgt] = it.size || [300, 200, 60];
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(l, w, 6), mat(it.color || '#3d4a57')); base.position.z = 3; g.add(base);
  for (const [sx, sy, lx, ly] of [[0, -w / 2, l, 6], [0, w / 2, l, 6], [-l / 2, 0, 6, w], [l / 2, 0, 6, w]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(lx, ly, hgt), mat(it.color || '#3d4a57')); s.position.set(sx, sy, hgt / 2); g.add(s);
  }
  g.userData.slots = new THREE.Group(); g.add(g.userData.slots);
  return g;
}
function updateTray(g, it) {
  const n = it.filled | 0;
  if (g.userData.n === n) return;
  g.userData.n = n;
  const s = g.userData.slots; s.clear();
  const [l, w] = it.size || [300, 200];
  for (let i = 0; i < n; i++) {
    const col = i % 3, row = Math.floor(i / 3) % 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(l / 3 - 16, w / 2 - 16, 50), mat('#2f7fc1'));
    p.position.set(-l / 3 + col * (l / 3), -w / 4 + row * (w / 2), 31); p.castShadow = true; s.add(p);
  }
}

/* ---------------- Thùng carton có bản lề ---------------- */
// Ống 4 mặt hình bình hành: góc θ = open·90° (0 = gập phẳng như tấm trong ổ chứa, 1 = hộp vuông).
// Mặt A→B (trước, dài l), B→C (vạt nhỏ phía +X = "trước" theo dòng chảy), C→D (sau), D→A (phía −X).
function makeCarton(it) {
  const [l, w, hgt] = it.size || [400, 300, 300];
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const T = 3;
  const panels = [];
  const flapsB = [], flapsT = [];
  const mIn = mat(KRAFT_IN, { side: THREE.DoubleSide });
  const mOut = mat(it.color || KRAFT, { side: THREE.DoubleSide });
  const sides = [l, w, l, w];
  sides.forEach((len, i) => {
    const pg = new THREE.Group();
    const pm = new THREE.Mesh(new THREE.BoxGeometry(len, T, hgt), [mOut, mOut, mIn, mOut, mOut, mOut]);
    pm.position.set(len / 2, 0, hgt / 2); pg.add(pm);
    const fh = w / 2 - 2;
    const major = i % 2 === 0;
    // vạt đáy
    const bp = new THREE.Group(); bp.position.z = major ? -1.5 : 0;
    const bm = new THREE.Mesh(new THREE.BoxGeometry(len - 4, T, fh), mOut); bm.position.set(len / 2, 0, -fh / 2); bp.add(bm); pg.add(bp);
    // vạt nắp
    const tp = new THREE.Group(); tp.position.z = hgt + (major ? 1.5 : 0);
    const tm = new THREE.Mesh(new THREE.BoxGeometry(len - 4, T, fh), mOut); tm.position.set(len / 2, 0, fh / 2); tp.add(tm); pg.add(tp);
    inner.add(pg); panels.push(pg); flapsB.push(bp); flapsT.push(tp);
  });
  const tapeB = new THREE.Mesh(new THREE.BoxGeometry(l + 120, 48, 1.2), mat(TAPE)); tapeB.position.set(l / 2, w / 2, -T); tapeB.visible = false; inner.add(tapeB);
  const tapeT = new THREE.Mesh(new THREE.BoxGeometry(l + 120, 48, 1.2), mat(TAPE)); tapeT.position.set(l / 2, w / 2, hgt + T + 1); tapeT.visible = false; inner.add(tapeT);
  g.userData.carton = { l, w, hgt, panels, flapsB, flapsT, inner, tapeB, tapeT, key: '' };
  return shadow(g);
}

function updateCarton(g, f = {}) {
  const c = g.userData.carton;
  const fv = (v) => Math.max(0, Math.min(1, +v || 0));
  const open = fv(f.open ?? 1);
  const tMinF = f.topMinorFront ?? f.topMinor ?? 0, tMinR = f.topMinorRear ?? f.topMinor ?? 0;
  const key = [open, f.minorFront, f.minorRear, f.major, tMinF, tMinR, f.topMajor, f.taped, f.tapedTop].join('|');
  if (key === c.key) return;
  c.key = key;
  const { l, w } = c;
  const th = (0.02 + 0.98 * open) * Math.PI / 2;
  const cs = Math.cos(th), sn = Math.sin(th);
  const A = [0, 0], B = [l, 0], C = [l + w * cs, w * sn], D = [w * cs, w * sn];
  const verts = [A, B, C, D]; const heads = [0, th, Math.PI, th + Math.PI];
  c.panels.forEach((p, i) => { p.position.set(verts[i][0], verts[i][1], 0); p.rotation.z = heads[i]; });
  c.inner.position.set(-(l + w * cs) / 2, -(w * sn) / 2, 0);
  // vạt đáy: 0 = thõng xuống, 1 = gấp vào trong (xoay quanh trục X của mặt)
  const bottom = [fv(f.major), fv(f.minorFront), fv(f.major), fv(f.minorRear)];
  const top = [fv(f.topMajor), fv(tMinF), fv(f.topMajor), fv(tMinR)];
  c.flapsB.forEach((fp, i) => { fp.rotation.x = bottom[i] * Math.PI / 2 * (open > 0.9 ? 1 : open); });
  c.flapsT.forEach((fp, i) => { fp.rotation.x = -top[i] * Math.PI / 2 * (open > 0.9 ? 1 : open); });
  c.tapeB.visible = !!f.taped && open > 0.9; c.tapeB.position.set(l / 2, w / 2, -3);
  c.tapeT.visible = !!f.tapedTop && open > 0.9;
}

export class ItemLayer {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.name = 'items';
    this.root.rotation.x = -Math.PI / 2;
    this.root.scale.setScalar(0.001);
    parent.add(this.root);
    this.map = new Map();
  }
  update(items = []) {
    const seen = new Set();
    for (const it of items) {
      if (!it) continue;
      const id = it.id ?? `${it.kind}_${seen.size}`;
      seen.add(id);
      let o = this.map.get(id);
      if (!o || o.userData.kind !== it.kind + (it.shape ? it.shape + it.color : '')) {
        if (o) this.root.remove(o);
        o = this.create(it); o.userData.kind = it.kind + (it.shape ? it.shape + it.color : '');
        this.map.set(id, o); this.root.add(o);
      }
      o.position.set(+it.x || 0, +it.y || 0, +it.z || 0);
      o.rotation.z = ((+it.rotZ || 0) * Math.PI) / 180;
      if (it.kind === 'carton') updateCarton(o, it.fold);
      if (it.kind === 'tray') updateTray(o, it);
      o.visible = it.visible !== false;
    }
    for (const [id, o] of this.map) if (!seen.has(id)) { this.root.remove(o); this.map.delete(id); }
  }
  create(it) {
    let g;
    switch (it.kind) {
      case 'puck': g = makePuck(it); break;
      case 'carton': g = makeCarton(it); break;
      case 'tray': g = makeTray(it); break;
      case 'product': g = it.shape === 'can' ? makeCan(it) : makeBox(it, it.color || '#2f7fc1', false); break;
      case 'part': g = makePuck({ ...it, size: it.size || [60, 60, 30] }); break;
      default: g = makeBox(it, it.color || KRAFT);
    }
    return shadow(g);
  }
  clear() { for (const o of this.map.values()) this.root.remove(o); this.map.clear(); }
}
