// Hiệu ứng minh họa sự cố: tia lửa điện, khói, hơi xả, động cơ nóng đỏ, chớp cảnh báo khi va chạm / CB nhảy.
// Dữ liệu từ m.getVisual().effects: [{ id, type, at, intensity, age }]
import * as THREE from 'three';

function softDot(color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color); grd.addColorStop(0.4, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const MAX = 600;
const KIND = {
  spark: { rate: 320, life: [0.25, 0.7], speed: [1.2, 3.2], up: 0.6, gravity: -6, grow: 0, size: 0.05, color: [1, 0.75, 0.15], color2: [1, 0.25, 0.0], blend: THREE.NormalBlending, opacity: 1 },
  smoke: { rate: 40, life: [2.5, 4.5], speed: [0.05, 0.18], up: 0.35, gravity: 0.05, grow: 0.22, size: 0.16, color: [0.32, 0.32, 0.34], color2: [0.55, 0.55, 0.58], blend: THREE.NormalBlending, opacity: 0.55 },
  steam: { rate: 90, life: [0.6, 1.2], speed: [0.6, 1.4], up: 1.6, gravity: 0.3, grow: 0.18, size: 0.05, color: [0.95, 0.97, 1], color2: [0.85, 0.9, 0.95], blend: THREE.NormalBlending, opacity: 0.6 },
};

class ParticleField {
  constructor(scene, kind) {
    this.k = KIND[kind];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.sz = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.vel = new Float32Array(MAX * 3); this.age = new Float32Array(MAX); this.life = new Float32Array(MAX).fill(0);
    const mat = new THREE.PointsMaterial({ size: this.k.size, map: softDot(), vertexColors: true, transparent: true, opacity: this.k.opacity, depthWrite: false, blending: this.k.blend, sizeAttenuation: true });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 10;
    scene.add(this.points);
    this.next = 0; this.alive = 0;
  }
  emit(origin, n, intensity) {
    const k = this.k, r = (a) => a[0] + Math.random() * (a[1] - a[0]);
    for (let j = 0; j < n; j++) {
      const i = this.next; this.next = (this.next + 1) % MAX;
      this.pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.03; this.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.03; this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.03;
      const th = Math.random() * Math.PI * 2, s = r(k.speed) * (0.5 + 0.5 * intensity);
      this.vel[i * 3] = Math.cos(th) * s * (k === KIND.spark ? 1 : 0.4); this.vel[i * 3 + 1] = k.up * (0.6 + Math.random() * 0.8) + (k === KIND.spark ? Math.random() * s : 0); this.vel[i * 3 + 2] = Math.sin(th) * s * (k === KIND.spark ? 1 : 0.4);
      this.age[i] = 0; this.life[i] = r(k.life);
    }
  }
  step(dt) {
    const k = this.k; let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.age[i] += dt;
      const f = this.age[i] / this.life[i];
      if (f >= 1) { this.life[i] = 0; this.pos[i * 3 + 1] = -999; continue; }
      alive++;
      this.vel[i * 3 + 1] += k.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const fade = 1 - f;
      for (let c = 0; c < 3; c++) this.col[i * 3 + c] = (k.color[c] * (1 - f) + k.color2[c] * f) * (k === KIND.spark ? 0.6 + 0.4 * fade : 1);
    }
    // khói lớn dần: dùng kích thước trung bình theo thời gian (PointsMaterial không có size theo hạt)
    if (k.grow) this.points.material.size = k.size * (1 + k.grow * 6);
    this.points.material.opacity = k.opacity;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.alive = alive;
  }
  dispose() { this.points.parent?.remove(this.points); this.points.geometry.dispose(); this.points.material.map?.dispose(); this.points.material.dispose(); }
}

export class EffectsLayer {
  /** @param findNode (name) => THREE.Object3D | null */
  constructor(scene, container, findNode) {
    this.scene = scene; this.container = container; this.findNode = findNode;
    this.fields = { spark: new ParticleField(scene, 'spark'), smoke: new ParticleField(scene, 'smoke'), steam: new ParticleField(scene, 'steam') };
    this.heated = new Map();   // mesh → { orig emissive, orig intensity }
    this.seenFlash = new Set();
    this.overlay = document.createElement('div');
    this.overlay.className = 'fx-overlay';
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0', transition: 'opacity 120ms', background: 'radial-gradient(ellipse at center, rgba(255,40,20,0) 40%, rgba(255,40,20,0.55) 100%)', zIndex: '3' });
    this.bolt = document.createElement('div');
    Object.assign(this.bolt.style, { position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', fontSize: '40px', lineHeight: '1', filter: 'drop-shadow(0 0 8px rgba(255,200,0,.9))', opacity: '0', transition: 'opacity 120ms' });
    this.bolt.textContent = '⚡';
    this.bolt.setAttribute('aria-hidden', 'true');
    this.overlay.appendChild(this.bolt);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(this.overlay);
    this._tmp = new THREE.Vector3();
    this._last = performance.now();
    this._t = 0;
  }

  originOf(at) {
    const o = at ? this.findNode(at) : null;
    if (o) {
      const box = new THREE.Box3().setFromObject(o);
      if (!box.isEmpty()) return box.getCenter(this._tmp.clone());
      return o.getWorldPosition(this._tmp.clone());
    }
    // không có node: lấy tâm cảnh phía trên mặt sàn
    return new THREE.Vector3(0.8, 1.2, 0);
  }

  update(effects = []) {
    const now = performance.now(); const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now; this._t += dt;
    let flash = 0, bolt = 0;
    const heatTargets = new Map();
    for (const e of effects) {
      if (this.fields[e.type] && e.age < 1) {
        const f = this.fields[e.type];
        const n = Math.max(1, Math.round(f.k.rate * dt * (e.intensity ?? 1) * (e.type === 'spark' ? (1 - e.age) * 1.5 : 1)));
        f.emit(this.originOf(e.at), n, e.intensity ?? 1);
      } else if (e.type === 'heat') heatTargets.set(e.at, e.intensity ?? 1);
      else if (e.type === 'impact') flash = Math.max(flash, 1 - e.age);
      else if (e.type === 'breaker') { bolt = Math.max(bolt, e.age < 0.6 ? 1 : 0); flash = Math.max(flash, (1 - e.age) * 0.8); }
    }
    for (const f of Object.values(this.fields)) f.step(dt);
    this.applyHeat(heatTargets);
    // chớp đỏ nhấp nháy
    const blink = flash > 0 ? (0.55 + 0.45 * Math.sin(this._t * 18)) * flash : 0;
    this.overlay.style.opacity = String(blink.toFixed(3));
    this.bolt.style.opacity = bolt ? '1' : '0';
  }

  applyHeat(targets) {
    const want = new Map();
    for (const [at, k] of targets) {
      const o = at && this.findNode(at);
      // vùng nóng: phần thân động cơ quanh node (node cha gần nhất có mesh)
      const root = o ? (o.parent && o.parent.type !== 'Scene' ? o : o) : null;
      root?.traverse((m) => { if (m.isMesh && m.material && 'emissive' in m.material) want.set(m, k); });
    }
    for (const [m, st] of this.heated) if (!want.has(m)) { m.material.emissive.copy(st.e); m.material.emissiveIntensity = st.i; this.heated.delete(m); }
    for (const [m, k] of want) {
      if (!this.heated.has(m)) { m.material = m.material.clone(); this.heated.set(m, { e: m.material.emissive.clone(), i: m.material.emissiveIntensity ?? 1 }); }
      const pulse = 0.75 + 0.25 * Math.sin(this._t * 6);
      m.material.emissive.setRGB(1, 0.18, 0.02);
      m.material.emissiveIntensity = 1.4 * k * pulse;
    }
  }

  dispose() {
    for (const f of Object.values(this.fields)) f.dispose();
    for (const [m, st] of this.heated) { m.material.emissive.copy(st.e); m.material.emissiveIntensity = st.i; }
    this.heated.clear();
    this.overlay.remove();
  }
}
