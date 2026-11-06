// Động học robot MotoMINI (6 khớp S L U R B T) — tích các hàm mũ (product of exponentials).
// Hệ tọa độ robot (BASE): gốc = tâm mặt đáy đế, X ra phía trước, Y sang trái, Z lên. Đơn vị mm, độ.
// Mô hình 3D (FreeCAD) dựng ở tư thế 0 với đúng các trục/điểm dưới đây (docs/CONTRACT.md §3).

export const DEG = Math.PI / 180;

/** Thông số hình học (mm) ở tư thế 0: L-arm thẳng đứng, U-arm nằm ngang hướng +X, mặt bích hướng +X. */
export const GEOM = {
  baseH: 103,      // mặt đáy → trục L
  sOff: 20,        // lệch trục L so với trục S theo X
  lArm: 165,       // trục L → trục U
  uArm: 165,       // trục U → trục B
  flange: 40,      // trục B → mặt bích
};
const { baseH, sOff, lArm, uArm, flange } = GEOM;
const zU = baseH + lArm, xB = sOff + uArm;

/** Trục khớp ở tư thế 0: w = hướng trục (chiều dương theo quy tắc bàn tay phải), q = 1 điểm trên trục. */
export const JOINTS = [
  { name: 'S', w: [0, 0, 1], q: [0, 0, 0], min: -170, max: 170, vmax: 315, ppd: 34816 / 30 },
  { name: 'L', w: [0, 1, 0], q: [sOff, 0, baseH], min: -85, max: 90, vmax: 315, ppd: 102400 / 90 },
  { name: 'U', w: [0, -1, 0], q: [sOff, 0, zU], min: -50, max: 90, vmax: 420, ppd: 51200 / 90 },
  { name: 'R', w: [-1, 0, 0], q: [sOff, 0, zU], min: -140, max: 140, vmax: 600, ppd: 10204 / 30 },
  { name: 'B', w: [0, 1, 0], q: [xB, 0, zU], min: -30, max: 210, vmax: 600, ppd: 10204 / 30 },
  { name: 'T', w: [-1, 0, 0], q: [xB, 0, zU], min: -360, max: 360, vmax: 600, ppd: 10204 / 30 },
];
export const AXES = JOINTS.map((j) => j.name);

/** Khung mặt bích ở tư thế 0: x = +Z, y = −Y, z = +X (trục dụng cụ ra khỏi mặt bích). */
const M_FLANGE = fromCols([[0, 0, 1], [0, -1, 0], [1, 0, 0]], [xB + flange, 0, zU]);

/* ------------------------------------------------------------ đại số 4×4 (mảng 16, hàng-trước) */
export function fromCols(cols, p) {
  // cols: [x,y,z] là các cột của R
  const [x, y, z] = cols;
  return [x[0], y[0], z[0], p[0], x[1], y[1], z[1], p[1], x[2], y[2], z[2], p[2], 0, 0, 0, 1];
}
export function mul(a, b) {
  const r = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + a[i * 4 + 3] * b[12 + j];
  }
  return r;
}
export const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function inv(T) {
  // nghịch đảo phép biến đổi cứng
  const R = [[T[0], T[1], T[2]], [T[4], T[5], T[6]], [T[8], T[9], T[10]]];
  const p = [T[3], T[7], T[11]];
  const q = [0, 1, 2].map((i) => -(R[0][i] * p[0] + R[1][i] * p[1] + R[2][i] * p[2]));
  return [R[0][0], R[1][0], R[2][0], q[0], R[0][1], R[1][1], R[2][1], q[1], R[0][2], R[1][2], R[2][2], q[2], 0, 0, 0, 1];
}
export const pos = (T) => [T[3], T[7], T[11]];
export const col = (T, c) => [T[c], T[4 + c], T[8 + c]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/** Quay quanh trục w (đơn vị) đi qua điểm q một góc th (rad). */
function screw(w, q, th) {
  const c = Math.cos(th), s = Math.sin(th), v = 1 - c;
  const [x, y, z] = w;
  const R = [
    [c + x * x * v, x * y * v - z * s, x * z * v + y * s],
    [y * x * v + z * s, c + y * y * v, y * z * v - x * s],
    [z * x * v - y * s, z * y * v + x * s, c + z * z * v],
  ];
  // p = (I - R) q
  const p = [0, 1, 2].map((i) => q[i] - (R[i][0] * q[0] + R[i][1] * q[1] + R[i][2] * q[2]));
  return [R[0][0], R[0][1], R[0][2], p[0], R[1][0], R[1][1], R[1][2], p[1], R[2][0], R[2][1], R[2][2], p[2], 0, 0, 0, 1];
}

/** Ma trận quay Rz·Ry·Rx (độ) — quy ước góc Rx, Ry, Rz của Yaskawa. */
export function rpyToR(rx, ry, rz) {
  const [a, b, c] = [rx * DEG, ry * DEG, rz * DEG];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
    [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
    [-sb, cb * sa, cb * ca],
  ];
}
export function rToRpy(T) {
  const r20 = T[8], r21 = T[9], r22 = T[10], r10 = T[4], r00 = T[0];
  let rx, ry, rz;
  if (Math.abs(r20) < 0.999999) {
    ry = Math.asin(-r20);
    rx = Math.atan2(r21, r22);
    rz = Math.atan2(r10, r00);
  } else { // khóa gimbal
    ry = r20 < 0 ? Math.PI / 2 : -Math.PI / 2;
    rz = 0;
    rx = Math.atan2(-T[6] * Math.sign(-r20 || 1), T[5]);
  }
  return [rx / DEG, ry / DEG, rz / DEG];
}
/** Tư thế [x,y,z,rx,ry,rz] → ma trận 4×4. */
export function poseToT(p) {
  const R = rpyToR(p[3], p[4], p[5]);
  return [R[0][0], R[0][1], R[0][2], p[0], R[1][0], R[1][1], R[1][2], p[1], R[2][0], R[2][1], R[2][2], p[2], 0, 0, 0, 1];
}
export function tToPose(T) { return [T[3], T[7], T[11], ...rToRpy(T)]; }

/* ------------------------------------------------------------ dụng cụ */
/** Dụng cụ (tool file): offset từ mặt bích theo khung mặt bích (mm, độ). */
export function toolT(tool) {
  if (!tool) return ident();
  return poseToT([tool.x || 0, tool.y || 0, tool.z || 0, tool.rx || 0, tool.ry || 0, tool.rz || 0]);
}

/* ------------------------------------------------------------ động học thuận */
/** FK: góc khớp (độ) → T của TCP trong BASE. Trả thêm khung từng khớp nếu cần. */
export function fk(q, tool = null, frames = null) {
  let T = ident();
  for (let i = 0; i < 6; i++) {
    T = mul(T, screw(JOINTS[i].w, JOINTS[i].q, q[i] * DEG));
    if (frames) frames.push(T.slice());
  }
  return mul(mul(T, M_FLANGE), toolT(tool));
}
export const fkPose = (q, tool) => tToPose(fk(q, tool));

/** Jacobian hình học 6×6 (hàng: vx vy vz wx wy wz) tại q cho TCP. */
export function jacobian(q, tool) {
  const frames = [];
  const T = fk(q, tool, frames);
  const p = pos(T);
  const J = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (let i = 0; i < 6; i++) {
    const Ti = i === 0 ? ident() : frames[i - 1];
    // trục và điểm của khớp i trong BASE = biến đổi trục tư thế 0 bằng các khớp trước nó
    const w0 = JOINTS[i].w, q0 = JOINTS[i].q;
    const w = [Ti[0] * w0[0] + Ti[1] * w0[1] + Ti[2] * w0[2], Ti[4] * w0[0] + Ti[5] * w0[1] + Ti[6] * w0[2], Ti[8] * w0[0] + Ti[9] * w0[1] + Ti[10] * w0[2]];
    const qq = [Ti[0] * q0[0] + Ti[1] * q0[1] + Ti[2] * q0[2] + Ti[3], Ti[4] * q0[0] + Ti[5] * q0[1] + Ti[6] * q0[2] + Ti[7], Ti[8] * q0[0] + Ti[9] * q0[1] + Ti[10] * q0[2] + Ti[11]];
    const v = cross(w, sub(p, qq));
    for (let k = 0; k < 3; k++) { J[k][i] = v[k]; J[3 + k][i] = w[k]; }
  }
  return { J, T };
}

/** Sai lệch tư thế (mm, rad) giữa T hiện tại và đích. */
function poseErr(T, Td) {
  const e = sub(pos(Td), pos(T));
  // sai lệch hướng: 0.5 Σ (r_i × rd_i)
  let w = [0, 0, 0];
  for (let c = 0; c < 3; c++) { const r = col(T, c), rd = col(Td, c); const x = cross(r, rd); w = [w[0] + x[0] / 2, w[1] + x[1] / 2, w[2] + x[2] / 2]; }
  return [...e, ...w];
}

function solve6(A, b) {
  // Gauss có chọn trụ
  const n = 6; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

export const inLimits = (q, slack = 1e-6) => q.every((v, i) => v >= JOINTS[i].min - slack && v <= JOINTS[i].max + slack);
export const limitViolation = (q) => q.findIndex((v, i) => v < JOINTS[i].min - 1e-6 || v > JOINTS[i].max + 1e-6);
const clampJ = (q) => q.map((v, i) => Math.min(JOINTS[i].max, Math.max(JOINTS[i].min, v)));

/**
 * IK số (bình phương tối thiểu tắt dần) từ q0. Trả { q, ok, err } — ok khi sai số < 0.01 mm / 0.01°.
 * Khớp T và R được phép quay qua lại nhiều vòng trong giới hạn: chọn nghiệm gần q0 nhất.
 */
export function ik(Td, q0, tool = null, { iters = 80, tolP = 0.01, tolR = 0.01 * DEG } = {}) {
  const tryFrom = (seed) => {
    let q = seed.slice();
    for (let it = 0; it < iters; it++) {
      const { J, T } = jacobian(q, tool);
      const e = poseErr(T, Td);
      const ep = Math.hypot(e[0], e[1], e[2]), er = Math.hypot(e[3], e[4], e[5]);
      if (ep < tolP && er < tolR) return { q, ok: true, err: [ep, er / DEG] };
      // đổi đơn vị: hàng hướng nhân 100 mm để cân bằng
      const S = 100;
      const Jw = J.map((r, i) => (i < 3 ? r : r.map((v) => v * S)));
      const ew = e.map((v, i) => (i < 3 ? v : v * S));
      const lam = 0.5 + Math.min(50, ep + er * S) * 0.05;
      // (JᵀJ + λ²I) dq = Jᵀ e
      const A = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => { let s = 0; for (let k = 0; k < 6; k++) s += Jw[k][i] * Jw[k][j]; return s + (i === j ? lam * lam : 0); }));
      const g = Array.from({ length: 6 }, (_, i) => { let s = 0; for (let k = 0; k < 6; k++) s += Jw[k][i] * ew[k]; return s; });
      const dq = solve6(A, g);
      if (!dq) break;
      let maxStep = Math.max(...dq.map(Math.abs)) / DEG;
      const sc = maxStep > 20 ? 20 / maxStep : 1;
      q = clampJ(q.map((v, i) => v + (dq[i] / DEG) * sc));
    }
    const T = fk(q, tool); const e = poseErr(T, Td);
    return { q, ok: false, err: [Math.hypot(e[0], e[1], e[2]), Math.hypot(e[3], e[4], e[5]) / DEG] };
  };
  let best = tryFrom(q0);
  if (best.ok) return best;
  // thử thêm vài điểm xuất phát (tay khuỷu trên, cổ tay úp xuống)
  const seeds = [[0, 0, 0, 0, 90, 0], [0, 20, -20, 0, 90, 0], [0, -20, 20, 0, 60, 0]];
  for (const s of seeds) {
    const s2 = s.slice(); s2[0] = Math.atan2(Td[7], Td[3]) / DEG; s2[5] = q0[5];
    const r = tryFrom(clampJ(s2));
    if (r.ok) return r;
    if (r.err[0] + r.err[1] < best.err[0] + best.err[1]) best = r;
  }
  return best;
}

/* ------------------------------------------------------------ xung encoder */
export const degToPulse = (q) => q.map((v, i) => Math.round(v * JOINTS[i].ppd));
export const pulseToDeg = (p) => p.map((v, i) => v / JOINTS[i].ppd);

/** Khung tọa độ người dùng (user frame) xác định bằng 3 điểm ORG, XX, XY (mm, BASE). */
export function userFrameT(uf) {
  if (!uf) return ident();
  const o = uf.org, x = sub(uf.xx, o), y0 = sub(uf.xy, o);
  const nx = norm(x); if (nx < 1e-6) return ident();
  const ex = x.map((v) => v / nx);
  const z = cross(ex, y0); const nz = norm(z); if (nz < 1e-6) return ident();
  const ez = z.map((v) => v / nz);
  const ey = cross(ez, ex);
  return fromCols([ex, ey, ez], o);
}

export { cross, sub, dot };
