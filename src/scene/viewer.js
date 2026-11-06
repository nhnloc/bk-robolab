// Trình xem máy 3D (three.js): nạp GLB theo manifest (hoặc placeholder), gắn node chuyển động với
// m.getVisual().parts, LED cảm biến, đèn tháp, băng tải cuộn texture, vật liệu procedural, camera quỹ đạo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NODE_DEFS } from './nodes.js';
import { buildPlaceholder } from './placeholder.js';
import { ItemLayer } from './items.js';
import { EffectsLayer } from './effects.js';
import { drawSeg } from './seg7.js';
import { t } from '../app/i18n.js';
import { nodesForTag } from './ioNodes.js';

let manifestP = null;
export function loadManifest() {
  if (!manifestP) manifestP = fetch('assets/models/manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return manifestP;
}

const axisToThree = (a) => new THREE.Vector3(a[0], a[2], -a[1]).normalize();
const BELT_PERIOD = 0.08; // m giữa 2 vạch trên băng tải

function stripeTexture(base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  const col = new THREE.Color(base);
  x.fillStyle = '#' + col.getHexString(); x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#' + col.clone().multiplyScalar(0.72).getHexString(); x.fillRect(0, 0, 10, 64);
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(30, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MachineViewer {
  constructor(container, { machineId, inputTags = [] } = {}) {
    this.container = container; this.machineId = machineId; this.inputTags = inputTags;
    this.source = null; this.disposed = false; this.isPlaceholder = false;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true; // node có clipAboveZFC / clipZ (vd. cửa cuốn cuộn lên lô)
    r.domElement.className = 'viewer-canvas';
    r.domElement.setAttribute('aria-label', t('mv.aria3d'));
    r.domElement.setAttribute('role', 'img');
    container.appendChild(r.domElement);

    const s = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 60);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12; this.controls.maxPolarAngle = Math.PI * 0.495;

    s.add(new THREE.HemisphereLight(0xf3f6fa, 0x5b6168, 1.1));
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 1.8));
    sun.position.set(2.5, 4.5, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
    s.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(-3, 2, -2); s.add(fill);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 0.95 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; s.add(this.ground);
    this.grid = new THREE.GridHelper(20, 40, 0x8a949e, 0xaab2ba); this.grid.position.y = 0.001; this.grid.material.transparent = true; this.grid.material.opacity = 0.35; s.add(this.grid);

    this.machine = new THREE.Group(); s.add(this.machine);
    this.items = new ItemLayer(s);
    this.fx = new EffectsLayer(s, container, (n) => this.machine.getObjectByName(n));
    this.bindings = []; this.belts = []; this.leds = new Map(); this.lamps = {};
    this.outLamps = new Map(); this.nodesByName = new Map(); this.buttons = new Map(); this.btnDefs = new Map(); this.displays3d = [];
    this.applyTheme();
    this._setupPicking();

    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(container);
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  applyTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    this.scene.background = new THREE.Color(dark ? 0x1b2229 : 0xe4e9ee);
    this.scene.fog = new THREE.Fog(this.scene.background, 12, 30);
    this.ground.material.color.set(dark ? 0x2a323b : 0xcfd5db);
    this.grid.material.opacity = dark ? 0.2 : 0.35;
  }

  async load() {
    const manifest = await loadManifest();
    const entry = manifest?.machines?.[this.machineId];
    this.manifest = entry || null;
    let root = null;
    if (entry?.file) {
      try {
        const gltf = await new GLTFLoader().loadAsync('assets/models/' + entry.file);
        root = gltf.scene;
      } catch (e) { console.info('[viewer] cannot load GLB, using placeholder:', e?.message || e); }
    }
    if (this.disposed) return;
    if (!root) { root = buildPlaceholder(this.machineId); this.isPlaceholder = true; }
    this.machine.add(root);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.bind(root, { ...(NODE_DEFS[this.machineId] || {}), ...(entry?.nodes || {}) });
    this.frame();
    this.setView('iso');
  }

  bind(root, defs) {
    // 1) cha–con (vd. cyl_2A_rod gắn trên slide_1A)
    for (const [name, d] of Object.entries(defs)) {
      if (!d.parent) continue;
      const o = root.getObjectByName(name), p = root.getObjectByName(d.parent);
      if (o && p && o.parent !== p) p.attach(o);
    }
    // 2) kính trong suốt
    root.traverse((o) => {
      let n = o; let glass = false;
      while (n && n !== root) { if (/^glass_/i.test(n.name)) { glass = true; break; } n = n.parent; }
      if (glass && o.isMesh) {
        o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.22; o.material.depthWrite = false; o.castShadow = false;
      }
    });
    // 3) node chuyển động, băng tải, cảm biến, đèn
    for (const [name, d] of Object.entries(defs)) {
      const o = root.getObjectByName(name);
      if (!o) continue;
      const type = d.type || (/^belt_/.test(name) ? 'belt' : /^sen_/.test(name) ? 'sensor' : 'static');
      this.nodesByName.set(name, o);
      // Cắt hình phía trên cao độ Z (FreeCAD mm): manifest dùng clipAboveZFC, placeholder cũ dùng clipZ.
      const clip = d.clipAboveZFC ?? d.clipZ;
      if (clip !== undefined && Number.isFinite(+clip)) this.clipAbove(o, +clip);
      if (d.role === 'display' || name === 'display') this.setupDisplay(o, d);
      if (type === 'translate' || type === 'rotate') {
        // follow/ratio: node quay theo node khác (vd. flywheel = pulley × 0.3053)
        this.bindings.push({ name, o, type, axis: axisToThree(d.axisFC || [1, 0, 0]), travel: +d.travel || 0, restP: o.position.clone(), restQ: o.quaternion.clone(),
          follow: d.follow || null, ratio: Number.isFinite(+d.ratio) ? +d.ratio : 1 });
      } else if (type === 'belt' || type === 'rollers') {
        this.setupBelt(name, o, d);
      } else if (name === 'pallet') {
        this.pallet = o;
      }
    }
    root.traverse((o) => {
      const m = /^sen_(.+)$/.exec(o.name);
      if (m && !this.leds.has(m[1])) this.setupSensor(m[1], o);
      const l = /^static_lamp_(green|amber|red)/.exec(o.name);
      if (l && !this.lamps[l[1]]) this.setupLamp(l[1], o, defs[o.name]?.signal);
      const q = /^out_(.+)$/.exec(o.name);
      if (q && !this.outLamps.has(o.name)) this.setupOutput(defs[o.name]?.tag || q[1], o, defs[o.name]?.color);
      const b = /^btn_(.+)$/.exec(o.name);
      if (b && !this.buttons.has(b[1])) { this.buttons.set(b[1], o); if (defs[o.name]) this.btnDefs.set(b[1], defs[o.name]); }
      if (o.name && !this.nodesByName.has(o.name)) this.nodesByName.set(o.name, o);
    });
    if (!this.leds.size) this.fallbackLeds(root);
  }

  setupBelt(name, o, d) {
    const axis = d.uvAxisFC || [1, 0, 0];
    o.traverse((c) => {
      if (!c.isMesh) return;
      const base = c.material?.color ? '#' + c.material.color.getHexString() : '#2e7d4f';
      const tex = stripeTexture(base); tex.repeat.set(1 / BELT_PERIOD, 1 / BELT_PERIOD);
      c.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const g = c.geometry;
      if (!g.attributes.uv) {
        const pos = g.attributes.position; const uv = new Float32Array(pos.count * 2);
        const ax = axisToThree(axis);
        const perp = new THREE.Vector3(-ax.z, 0, ax.x);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv[i * 2] = v.dot(ax); uv[i * 2 + 1] = v.dot(perp) + v.y; }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      this.belts.push({ name, tex });
    });
  }

  setupSensor(tag, o) {
    const m = new THREE.MeshStandardMaterial({ color: 0x3a424b, emissive: 0x000000, roughness: 0.4 });
    let any = false;
    o.traverse((c) => { if (c.isMesh) { c.material = m; c.castShadow = false; any = true; } });
    if (!any) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), m); o.add(s); }
    this.leds.set(tag, { m, on: null });
  }
  setupLamp(color, o, signal) {
    const hex = { green: 0x2fd15a, amber: 0xffb020, red: 0xff3b30 }[color];
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(0.35), emissive: 0x000000, transparent: true, opacity: 0.92 });
    o.traverse((c) => { if (c.isMesh) c.material = m; });
    this.lamps[color] = { m, hex, on: null, signal: signal || { green: 'H_Run', amber: 'H_Warn', red: 'H_Fault' }[color] };
  }
  /** Đèn/thiết bị đầu ra out_<TAG>: màu gốc = tắt (tối); bật = phát sáng cùng màu. */
  setupOutput(tag, o, color) {
    const mats = [];
    o.traverse((c) => {
      if (!c.isMesh) return;
      const src = Array.isArray(c.material) ? c.material[0] : c.material;
      const m = src ? src.clone() : new THREE.MeshStandardMaterial();
      if (!m.emissive) return;
      c.material = m; mats.push(m);
    });
    if (!mats.length) return;
    const lit = new THREE.Color(color || ('#' + mats[0].color.getHexString()));
    // màu gốc quá tối (đèn tắt) → dùng màu sáng hơn khi bật
    const hsl = {}; lit.getHSL(hsl); if (hsl.l < 0.45) lit.setHSL(hsl.h, Math.max(hsl.s, 0.7), 0.55);
    this.outLamps.set(o.name, { tag, mats, base: mats.map((m) => m.color.clone()), lit, on: null });
  }
  /** Ẩn phần hình học phía trên cao độ Z (mm FreeCAD) — dùng cho cửa cuốn. */
  clipAbove(o, zFC) {
    // Mặt phẳng theo toạ độ thế giới: giữ phần y ≤ zFC/1000 (máy đặt tại gốc, Z FreeCAD → Y three).
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), zFC / 1000);
    const clipMat = (m) => { const c = m.clone(); c.clippingPlanes = [plane]; c.clipShadows = true; return c; };
    o.traverse((c) => { if (c.isMesh && c.material) c.material = Array.isArray(c.material) ? c.material.map(clipMat) : clipMat(c.material); });
    this.clipPlanes = [...(this.clipPlanes || []), plane];
  }

  /** Bảng LED 3D: vẽ số 7 đoạn lên texture của primitive 'lcd' (UV 0..1, v hướng xuống), ẩn primitive 'seg' (số "8." tĩnh). */
  setupDisplay(o, d) {
    const faceName = d.faceMaterial || 'lcd', segName = d.segmentMaterial || 'seg';
    let face = null; const segs = [];
    o.traverse((c) => {
      if (!c.isMesh) return;
      const mn = (Array.isArray(c.material) ? c.material[0] : c.material)?.name || '';
      if (mn === faceName || c.name === faceName) face = face || c;
      else if (mn === segName || c.name === segName) segs.push(c);
    });
    if (!face || typeof document === 'undefined') return;
    const n = Math.max(1, Math.min(8, +d.digits || 4));
    const [fw, fh] = Array.isArray(d.faceSizeMM) ? d.faceSizeMM : [590, 160];
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.max(32, Math.round((512 * fh) / fw));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; // UV kiểu glTF (v hướng xuống)
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    face.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    segs.forEach((m) => { m.visible = false; });
    const D = { tag: d.tag || null, n, canvas, ctx, tex, last: undefined };
    this.displays3d.push(D);
    this.drawDisplay(D, null);
  }
  drawDisplay(D, value) {
    drawSeg(D.ctx, D.canvas.width, D.canvas.height, value, D.n);
    D.tex.needsUpdate = true; D.last = value;
  }

  /** Id nút để gọi m.press: luôn lấy từ tên node btn_<ID>; chỉ dùng trường manifest `button` khi <ID> không có trong def.buttons. */
  buttonId(sfx) {
    const hnd = this.btnHandler;
    if (!hnd?.has || hnd.has(sfx)) return sfx;
    const alt = this.btnDefs.get(sfx)?.button;
    return alt && hnd.has(alt) ? alt : sfx;
  }

  /* ---------- Bấm nút trên mô hình 3D (btn_<ID>) ---------- */
  /** handler: { press(id, down), kindOf(id) → 'momentary'|'latching'|'selector' } */
  setButtonHandler(handler) { this.btnHandler = handler; }
  _setupPicking() {
    const el = this.renderer.domElement;
    this._ray = new THREE.Raycaster(); this._ndc = new THREE.Vector2();
    let held = null;
    const pick = (e) => {
      if (!this.buttons.size || !this.btnHandler) return null;
      const r = el.getBoundingClientRect(); if (!r.width) return null;
      this._ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._ray.setFromCamera(this._ndc, this.camera);
      const hit = this._ray.intersectObject(this.machine, true)[0];
      for (let n = hit?.object; n && n !== this.machine; n = n.parent) { const m = /^btn_(.+)$/.exec(n.name || ''); if (m && this.buttons.has(m[1])) return m[1]; }
      return null;
    };
    const release = () => {
      if (!held) return;
      const id = held; held = null; this.controls.enabled = true;
      try { this.btnHandler?.press(id, false); } catch (err) { console.warn(err); }
    };
    // Bắt ở pha capture trên phần tử cha để OrbitControls không xoay camera khi bấm nút.
    this._onDown = (e) => {
      if (e.button !== 0 || e.target !== el) return;
      const sfx = pick(e); if (!sfx) return;
      e.stopPropagation(); e.preventDefault();
      const id = this.buttonId(sfx);
      const kind = this.btnHandler.kindOf?.(id) || this.btnDefs.get(sfx)?.kind || 'momentary';
      try {
        if (kind === 'momentary') { held = id; this.controls.enabled = false; this.btnHandler.press(id, true); }
        else { this.btnHandler.press(id, true); this.btnHandler.press(id, false); }
      } catch (err) { console.warn(err); }
    };
    this._onMove = (e) => {
      if (e.target !== el || e.buttons) return;
      const now = performance.now(); if (now - (this._lastPick || 0) < 50) return; this._lastPick = now;
      el.style.cursor = pick(e) ? 'pointer' : '';
    };
    this.container.addEventListener('pointerdown', this._onDown, true);
    this.container.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release); window.addEventListener('blur', release);
    this._offPick = () => { release(); this.container.removeEventListener('pointerdown', this._onDown, true); this.container.removeEventListener('pointermove', this._onMove); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', release); };
  }

  /** Placeholder không có node sen_: tạo hàng LED ở mép trước máy. */
  fallbackLeds(root) {
    const box = new THREE.Box3().setFromObject(root);
    const tags = this.inputTags.filter((t) => !/^(Start|Stop|Reset|EStop|AutoMan)$/.test(t));
    if (!tags.length || box.isEmpty()) return;
    const x0 = box.min.x + 0.05, x1 = box.max.x - 0.05;
    tags.forEach((tag, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10));
      s.position.set(tags.length > 1 ? x0 + ((x1 - x0) * i) / (tags.length - 1) : (x0 + x1) / 2, 0.86, box.max.z + 0.04);
      s.name = 'sen_' + tag; this.machine.add(s);
      this.setupSensor(tag, s);
    });
  }

  /* ---------- Chỉ vị trí thiết bị của một tag I/O ---------- */
  /** Làm nổi bật (khung vàng nhấp nháy, nhìn xuyên vỏ máy + nhãn) các node ứng với tag. Trả về số node tìm thấy. */
  highlight(tag, label = '') {
    this._clearHl();
    if (!tag) return 0;
    const has = Object.assign((n) => this.nodesByName.has(n), { names: () => [...this.nodesByName.keys()] });
    const names = nodesForTag(this.machineId, tag, has);
    if (!names.length) return 0;
    this._hl = names.map((n) => {
      const box = new THREE.Box3();
      const helper = new THREE.Box3Helper(box, new THREE.Color(0xffb020));
      helper.material.depthTest = false; helper.material.transparent = true; helper.renderOrder = 999;
      this.scene.add(helper);
      return { o: this.nodesByName.get(n), box, helper };
    });
    this._hlLabel = document.createElement('div');
    this._hlLabel.className = 'hl-label';
    this._hlLabel.textContent = label || tag;
    this.container.appendChild(this._hlLabel);
    this._updateHl();
    return names.length;
  }
  _clearHl() {
    for (const H of this._hl || []) { this.scene.remove(H.helper); H.helper.geometry.dispose(); H.helper.material.dispose(); }
    this._hl = null; this._hlLabel?.remove(); this._hlLabel = null;
  }
  _updateHl() {
    if (!this._hl) return;
    const a = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    const size = new THREE.Vector3(), top = new THREE.Vector3(-Infinity, -Infinity, -Infinity), all = new THREE.Box3();
    for (const H of this._hl) {
      H.box.setFromObject(H.o);
      if (H.box.isEmpty()) continue;
      H.box.getSize(size);
      H.box.expandByVector(new THREE.Vector3(Math.max(0, 0.05 - size.x) / 2, Math.max(0, 0.05 - size.y) / 2, Math.max(0, 0.05 - size.z) / 2)).expandByScalar(0.01);
      H.helper.material.opacity = a;
      all.union(H.box);
    }
    const L = this._hlLabel; if (!L) return;
    if (all.isEmpty()) { L.hidden = true; return; }
    all.getCenter(top); top.y = all.max.y;
    top.project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    L.hidden = top.z > 1;
    L.style.left = `${Math.max(4, Math.min(w - 4, ((top.x + 1) / 2) * w))}px`;
    L.style.top = `${Math.max(24, ((1 - top.y) / 2) * h)}px`;
  }

  frame() {
    const box = new THREE.Box3().setFromObject(this.machine);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1.5, 1));
    this.box = box;
    const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
    const R = Math.max(size.x, size.y, size.z) * 0.8 + 0.3;
    const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.1; sc.far = R * 6; sc.updateProjectionMatrix();
    this.sun.position.copy(c).add(new THREE.Vector3(R * 0.8, R * 2, R * 1.2)); this.sun.target.position.copy(c);
    this.ground.position.set(c.x, Math.min(0, box.min.y) - 0.002, c.z);
    this.grid.position.set(c.x, Math.min(0, box.min.y) + 0.001, c.z);
  }

  setView(name) {
    if (!this.box) return;
    const c = this.box.getCenter(new THREE.Vector3()); const size = this.box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y * 1.3, size.z) * 1.35 + 0.6;
    let pos;
    if (name === 'iso' && this.manifest?.camera?.pos) {
      pos = new THREE.Vector3(...this.manifest.camera.pos); c.set(...this.manifest.camera.target);
      if (this.manifest.camera.fov) { this.camera.fov = this.manifest.camera.fov; this.camera.updateProjectionMatrix(); }
    } else {
      pos = {
        iso: new THREE.Vector3(c.x + d * 0.55, c.y + d * 0.55, c.z + d * 0.85),
        front: new THREE.Vector3(c.x, c.y + d * 0.15, c.z + d),
        side: new THREE.Vector3(c.x + d, c.y + d * 0.2, c.z),
        top: new THREE.Vector3(c.x, c.y + d * 1.1, c.z + 0.001),
      }[name] || new THREE.Vector3(c.x + d, c.y + d, c.z + d);
    }
    this.camera.position.copy(pos); this.controls.target.copy(c); this.controls.update();
  }

  setSource(fn) { this.source = fn; }

  apply(v) {
    if (!v) return;
    const parts = v.parts || {};
    for (const b of this.bindings) {
      const val = b.follow && !(b.name in parts) ? (+parts[b.follow] || 0) * b.ratio : +parts[b.name] || 0;
      if (b.type === 'translate') b.o.position.copy(b.restP).addScaledVector(b.axis, (b.travel / 1000) * val);
      else b.o.quaternion.copy(b.restQ).premultiply(new THREE.Quaternion().setFromAxisAngle(b.axis, THREE.MathUtils.degToRad(b.travel * val)));
    }
    if (this.pallet && 'pallet_visible' in parts) this.pallet.visible = !!parts.pallet_visible;
    for (const k in parts) {
      if (!k.endsWith('_visible') || k === 'pallet_visible') continue;
      const o = this.nodesByName.get(k.slice(0, -8)); if (o) o.visible = !!parts[k];
    }
    const vo = v.outs || {};
    const outsQ = this.getOutputs?.() || {};
    for (const L of this.outLamps.values()) {
      const on = !!(L.tag in vo ? vo[L.tag] : outsQ[L.tag]);
      if (on === L.on) continue;
      L.on = on;
      L.mats.forEach((m, i) => { m.color.copy(on ? L.lit : L.base[i]); m.emissive.copy(on ? L.lit : new THREE.Color(0)); m.emissiveIntensity = on ? 1.5 : 0; });
    }
    for (const bt of this.belts) {
      let off = v.belts?.[bt.name];
      if (off === undefined && parts[bt.name] !== undefined) off = parts[bt.name] / 1000; // shim: mm
      if (off !== undefined) bt.tex.offset.x = -(off / BELT_PERIOD) % 1;
    }
    const leds = v.leds || {};
    for (const [tag, L] of this.leds) {
      const on = !!leds[tag];
      if (on !== L.on) { L.on = on; L.m.color.set(on ? 0x6dff8a : 0x3a424b); L.m.emissive.set(on ? 0x22c040 : 0x000000); L.m.emissiveIntensity = on ? 1.4 : 0; }
    }
    const outs = this.getOutputs?.() || {};
    for (const L of Object.values(this.lamps)) {
      const on = L.signal === 'H_Run' ? !!(v.lamps?.run ?? outs.H_Run) : L.signal === 'H_Fault' ? !!(v.lamps?.fault ?? outs.H_Fault) || !!v.crashed
        : L.signal in outs ? !!outs[L.signal] : !!v.crashed;
      if (on !== L.on) { L.on = on; L.m.emissive.set(on ? L.hex : 0x000000); L.m.emissiveIntensity = on ? 1.6 : 0; }
    }
    if (this.displays3d.length) {
      const ds = v.displays || [];
      this.displays3d.forEach((D, i) => {
        const src = ds.find((x) => D.tag && (x.id === D.tag || x.tag === D.tag)) || ds[i] || ds[0];
        const val = src ? src.value : null;
        if (val !== D.last) this.drawDisplay(D, val);
      });
    }
    this.items.update(v.items || []);
    this.fx.update(v.effects || []);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    if (!this.container.isConnected || !this.container.clientWidth) return;
    if (this.source) { try { this.apply(this.source()); } catch (e) { if (!this._warned) { console.warn('[viewer]', e); this._warned = true; } } }
    this.controls.update();
    this._updateHl();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this._offPick?.();
    this._clearHl();
    this.fx.dispose();
    this.controls.dispose();
    this.scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); } });
    this.displays3d.forEach((D) => D.tex.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
