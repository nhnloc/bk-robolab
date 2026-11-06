// Phần 4: Robot – máy tính (Bài 4) và vision (Bài 5). Sinh viên viết chương trình máy tính bằng JavaScript.
import * as K from '../robot/kinematics.js';
import { VISION, PALETTE, robotToPixel, pixelToRobot } from '../sim/layout.js';
import { compileUserCode, callSafe, FUNCS } from '../pc/runner.js';
import { buildRequest } from '../robot/hse.js';

const R10_CODE = `// ============================================================
// Thư viện giao tiếp máy tính ↔ robot YRC1000micro (High-Speed Ethernet Server)
// Có sẵn:  udp.send(ip, port, bytes) → Promise<Uint8Array | null>  (khung phản hồi, null nếu không có)
//          sleep(ms), log(...)
// Giao diện "PC App" bên phải gọi các hàm dưới đây.
// ============================================================
const ROBOT_IP = '192.168.1.11';
const ROBOT_PORT = 10040;
let requestId = 0;

/** Tạo khung yêu cầu: header 32 byte (little-endian) + phần dữ liệu. Trả Uint8Array. */
function buildFrame(cmd, instance, attribute, service, data = []) {
  const frame = new Uint8Array(32 + data.length);
  const dv = new DataView(frame.buffer);
  // TODO: Identifier "YERC", Header size, Data size, Reserve 1, Processing division, ACK, Request ID,
  //       Block No, Reserve 2 "99999999", Command No, Instance, Attribute, Service, Padding
  // Gợi ý: dv.setUint32(0, 0x43524559, true);  dv.setUint16(4, 0x20, true); ...
  frame.set(data, 32);
  return frame;
}

/** Gửi khung, trả phần dữ liệu của phản hồi (hoặc ném lỗi nếu status ≠ 0). */
async function request(cmd, instance, attribute, service, data = []) {
  const res = await udp.send(ROBOT_IP, ROBOT_PORT, buildFrame(cmd, instance, attribute, service, data));
  if (!res) throw new Error('Robot không phản hồi');
  const dv = new DataView(res.buffer, res.byteOffset, res.byteLength);
  const status = res[25], added = dv.getUint16(28, true);
  if (status !== 0) throw new Error('Robot báo lỗi, added status = 0x' + added.toString(16));
  return res.slice(32);
}

/** Bật (on = true) / tắt servo — lệnh 0x83, instance 2, dữ liệu 1 = ON, 2 = OFF. */
async function setServo(on) {
  // TODO
}

/** Đọc vị trí Descartes (lệnh 0x75, instance 101) → [X, Y, Z (mm), Rx, Ry, Rz (độ)] */
async function readCartesian() {
  // TODO: dữ liệu trả về 13 số int32: kiểu, cấu hình, tool, user, ext, X, Y, Z (µm), Rx, Ry, Rz (0,0001°), …
}

/** Đọc vị trí khớp dạng xung (lệnh 0x75, instance 1) → [S, L, U, R, B, T] (xung) */
async function readPulse() {
  // TODO
}

/** Đổi xung → độ theo tỉ lệ của MotoMINI. */
function pulseToDeg(p) {
  // TODO: S 34816/30, L 102400/90, U 51200/90, R B T 10204/30 (xung/độ)
}

/** Động học thuận: góc khớp (độ) → [X, Y, Z] (mm) của TCP (dụng cụ Z = 50 mm). */
function forwardKinematics(q) {
  // TODO
}

/** Di chuyển thẳng tương đối dx, dy, dz (mm) với tốc độ v (mm/s) — lệnh 0x8A, instance 3. */
async function moveIncrement(dx, dy, dz, v = 20) {
  // TODO: dữ liệu 26 số int32: robot 1, station 0, phân loại tốc độ 1 (V), tốc độ (0,1 mm/s), hệ tọa độ 16 (BASE),
  //       X Y Z (µm), Rx Ry Rz (0,0001°), dự trữ, dự trữ, kiểu 0, kiểu mở rộng 0, tool 0, user 0, 9 số 0
}
`;

const R11_CODE = `
// ============================================================
// Bài 5 — Vision: camera.capture() → { width, height, data } (ảnh xám, data[v * width + u], 0 = đen)
// Robot đang chạy job VISION (PLAY): chờ B000 = 1 → gắp vật tại P010 → đặt vào đồ gá → B000 = 0.
// ============================================================

/** Tìm vật (blob lớn nhất màu tối) → { u, v, angle } — tâm (pixel) và góc trục dài (độ, từ trục u về trục v). */
function detect(img) {
  // TODO: ngưỡng hóa, tách các vùng liên thông, bỏ 3 điểm mốc nhỏ, tính mômen bậc 0, 1, 2
}

/** Pixel (u, v) → tọa độ robot [x, y] (mm). Dùng 3 điểm mốc đã biết tọa độ robot để hiệu chuẩn. */
function pixelToRobot(u, v) {
  // TODO
}

/** Góc trên ảnh (độ) → góc quay Rz của robot (độ) */
function imageAngleToRobot(a) {
  // TODO
}

/** Ghi biến vị trí Pn dạng BASE (lệnh 0x7F) */
async function writePosition(n, pose) {
  // TODO: 13 số int32: kiểu 16 (BASE), 0, 0, 0, 0, X Y Z (µm), Rx Ry Rz (0,0001°), 0, 0
}
/** Ghi / đọc biến byte Bn (lệnh 0x7A, attribute 1, service 0x10 / 0x0E) */
async function setByte(n, value) {
  // TODO
}
async function readByte(n) {
  // TODO
}

/** Một chu trình: chụp → tìm vật → đổi tọa độ → gửi P010 → B000 = 1 → chờ B000 = 0. */
async function cycle() {
  // TODO
}
`;

const VISION_JOB = [
  'NOP', "'Job do robot chạy (PLAY): chờ B000 = 1, gắp ở P010, đặt vào đồ gá P011", 'SET B000 0', 'MOVJ P001 VJ=30.00',
  '*WAIT', 'TIMER T=0.05', 'JUMP *WAIT IF B000=0',
  'SFTON P012', 'MOVJ P010 VJ=30.00', 'SFTOF', 'MOVL P010 V=60.0', 'DOUT OT#(1) ON', 'TIMER T=0.20',
  'SFTON P012', 'MOVL P010 V=100.0', 'SFTOF',
  'MOVJ P013 VJ=30.00', 'MOVL P011 V=60.0', 'DOUT OT#(1) OFF', 'TIMER T=0.20', 'MOVL P013 V=100.0',
  'MOVJ P001 VJ=30.00', 'SET B000 0', 'JUMP *WAIT', 'END',
];
const top = PALETTE.top + VISION.bar[2];
const VISION_PVARS = {
  P001: { type: 'BASE', p: [200, 0, 150, 180, 0, 0] },
  P011: { type: 'BASE', p: [VISION.fixture[0], VISION.fixture[1], top, 180, 0, VISION.fixture[2]] },
  P012: { type: 'BASE', p: [0, 0, 50, 0, 0, 0] },
  P013: { type: 'BASE', p: [VISION.fixture[0], VISION.fixture[1], top + 60, 180, 0, VISION.fixture[2]] },
};

/* ------------------------------------------------------------------ chấm */
function makeCode(c, names) {
  const logs = [];
  const r = compileUserCode(c.project.pc?.code || '', names, { cell: c.cell, sleep: (ms) => c.run(Math.max(1, ms | 0)), log: (...a) => logs.push(a.join(' ')) });
  return { ...r, logs };
}
const close = (a, b, tol) => Array.isArray(a) && a.length >= b.length && b.every((x, i) => Number.isFinite(+a[i]) && Math.abs(+a[i] - x) <= tol);
const angClose = (a, b, tol) => Array.isArray(a) && b.every((x, i) => Math.abs(((((+a[i] - x) % 360) + 540) % 360) - 180) <= tol);
const angDiff180 = (a, b) => Math.abs(((((a - b) % 180) + 270) % 180) - 90);

export const PART4 = [
  {
    id: 'R10', part: 4, week: 10, cellId: 'vision', level: 3, durationMin: 180, tools: ['pendant', 'code'],
    title: 'Giao tiếp robot – máy tính (High-Speed Ethernet)',
    objectives: ['Hiểu giao thức High-Speed Ethernet Server (UDP 10040) của YRC1000micro', 'Tự viết thư viện tạo khung lệnh / đọc phản hồi', 'Đọc vị trí robot dạng Descartes và xung, đổi xung → độ', 'Tính động học thuận và kiểm chứng với vị trí đọc từ robot'],
    tasks: [
      'Bản gốc dùng Qt C++; trong phòng ảo viết bằng JavaScript ở tab "PC App". Giao diện (Connect, Servo, đọc vị trí, jog) đã có sẵn và gọi các hàm của bạn.',
      'Đặt robot sang chế độ REMOTE trên pendant (lệnh bật servo / di chuyển chỉ nhận ở REMOTE).',
      'Yêu cầu 2.0 — buildFrame(): tạo header 32 byte đúng chuẩn (xem Bài giảng), phần dữ liệu nối sau.',
      'Yêu cầu 2.1 — setServo(on): bật / tắt servo (lệnh 0x83).',
      'Yêu cầu 2.2, 2.3 — moveIncrement(dx, dy, dz, v): di chuyển thẳng tương đối theo hệ BASE (lệnh 0x8A, instance 3); các nút X±, Y±, Z± của PC App dùng hàm này.',
      'Yêu cầu 2.4 — readCartesian(): đọc vị trí TCP (lệnh 0x75, instance 101).',
      'Yêu cầu 2.5 — readPulse() + pulseToDeg(): đọc góc khớp dạng xung rồi đổi sang độ.',
      'Yêu cầu 2.6 — forwardKinematics(q): tính tọa độ TCP từ góc khớp; so sánh với readCartesian() (sai lệch < 0,5 mm).',
    ],
    hints: [
      'Thông số hình học MotoMINI ở tư thế 0 (mọi khớp = 0): trục S thẳng đứng qua gốc; trục L ở (20, 0, 169) theo +Y; trục U ở (20, 0, 334) theo −Y; trục R dọc cánh tay theo −X; trục B ở (185, 0, 334) theo +Y; trục T theo −X; mặt bích x = 225; TCP cách mặt bích 50 mm → (275, 0, 334).',
      'Có thể tính động học thuận bằng nhân ma trận quay quanh từng trục (tích hàm mũ) hoặc lập bảng DH — chỉ cần đúng vị trí TCP.',
      'Số âm trong int32: DataView.setInt32(offset, value, true) tự xử lý bù 2.',
      'Mở tab Giám sát / Nhật ký của PC App để xem khung gửi và nhận dạng hex.',
    ],
    setup: { scene: 'vision' },
    starter: { code: R10_CODE },
    grading: {
      scenario: async (c) => {
        const { api, error } = makeCode(c, FUNCS.R10);
        c.add('code', 'Mã JavaScript chạy được', 5, !error, error || '');
        if (error) return;
        const r = c.robot;
        // buildFrame
        const fr = await callSafe(api.buildFrame, [0x83, 2, 1, 0x10, [1, 0, 0, 0]], { name: 'buildFrame' });
        const ref = buildRequest({ cmd: 0x83, instance: 2, attribute: 1, service: 0x10, data: [1, 0, 0, 0] });
        let frOk = fr.ok && fr.value && fr.value.length === 36, diff = '';
        if (frOk) for (let i = 0; i < 36; i++) if (i !== 11 && fr.value[i] !== ref[i]) { frOk = false; diff = `byte ${i}: 0x${(fr.value[i] ?? 0).toString(16)} ≠ 0x${ref[i].toString(16)}`; break; }
        c.add('frame', 'buildFrame(): header 32 byte đúng (lệnh bật servo)', 15, frOk, fr.ok ? (fr.value?.length !== 36 ? `Độ dài ${fr.value?.length} byte ≠ 36` : diff) : fr.error);
        // servo
        r.setMode('REMOTE');
        const s1 = await callSafe(api.setServo, [true], { name: 'setServo' }); await c.run(200);
        const on = r.servo;
        const s2 = await callSafe(api.setServo, [false], { name: 'setServo' }); await c.run(200);
        c.add('servo', 'setServo(true / false) bật và tắt servo robot', 15, on && !r.servo, [s1.error, s2.error].filter(Boolean).join(' ') || (!on ? 'Servo không bật' : r.servo ? 'Servo không tắt' : ''));
        // đọc vị trí
        r.servoOn();
        r.q = [23.5, 18.25, -12.75, 10.5, 72.125, -31.5];
        const rc = await callSafe(api.readCartesian, [], { name: 'readCartesian' });
        const pose = r.pose();
        c.add('cart', 'readCartesian() trả đúng X, Y, Z, Rx, Ry, Rz', 15, rc.ok && Array.isArray(rc.value) && close(rc.value.slice(0, 3), pose.slice(0, 3), 0.01) && angClose(rc.value.slice(3), pose.slice(3), 0.01), rc.ok ? `Nhận ${JSON.stringify(rc.value)} · đúng ${pose.map((x) => +x.toFixed(3)).join(', ')}` : rc.error);
        const rp = await callSafe(api.readPulse, [], { name: 'readPulse' });
        c.add('pulse', 'readPulse() trả đúng xung 6 khớp', 10, rp.ok && close(rp.value, K.degToPulse(r.q), 0.5), rp.ok ? '' : rp.error);
        const pd = await callSafe(api.pulseToDeg, [K.degToPulse([10, 20, 30, 40, 50, 60])], { name: 'pulseToDeg' });
        c.add('deg', 'pulseToDeg() đổi xung → độ', 10, pd.ok && close(pd.value, K.pulseToDeg(K.degToPulse([10, 20, 30, 40, 50, 60])), 0.001), pd.ok ? '' : pd.error);
        // động học thuận
        const sets = [[0, 0, 0, 0, 0, 0], [30, 20, -10, 0, 70, 0], [-45, 35, 25, 40, 60, -90], [100, -30, 60, -120, 150, 200], [12, 5, 5, 80, -20, 33]];
        let worst = 0, fkErr = '';
        for (const q of sets) {
          const res = await callSafe(api.forwardKinematics, [q.slice()], { name: 'forwardKinematics' });
          if (!res.ok || !Array.isArray(res.value)) { worst = Infinity; fkErr = res.error || 'Không trả mảng [X, Y, Z]'; break; }
          const p = K.pos(K.fk(q, { z: 50 }));
          const e = Math.hypot(...p.map((x, i) => x - res.value[i]));
          if (e > worst) { worst = e; fkErr = `q = [${q.join(', ')}]: sai ${e.toFixed(2)} mm`; }
        }
        c.add('fk', 'forwardKinematics(): sai lệch TCP < 0,5 mm (5 tư thế)', 15, worst < 0.5, worst < 0.5 ? `Sai lớn nhất ${worst.toFixed(3)} mm` : fkErr);
        // di chuyển tương đối
        r.q = [0, 30, 0, 0, 60, 0];
        const p0 = r.pose();
        const mv = await callSafe(api.moveIncrement, [10, -5, 8, 20], { name: 'moveIncrement' });
        await c.run(3000);
        const p1 = r.pose();
        const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        c.add('move', 'moveIncrement(10, −5, 8): TCP dịch đúng (±0,5 mm), giữ hướng', 15, mv.ok && close(d, [10, -5, 8], 0.5) && angClose(p1.slice(3), p0.slice(3), 0.2), mv.ok ? `Dịch ${d.map((x) => x.toFixed(2)).join(', ')} mm` : mv.error);
      },
    },
  },
  {
    id: 'R11', part: 4, week: 11, cellId: 'vision', level: 4, durationMin: 180, tools: ['pendant', 'code'], inherit: ['R10'],
    title: 'Kết hợp vision và robot',
    objectives: ['Xử lý ảnh cơ bản: ngưỡng, vùng liên thông, mômen ảnh → tâm và góc vật', 'Hiệu chuẩn camera – robot bằng điểm mốc (biến đổi affine)', 'Gửi vị trí cho robot qua Ethernet (biến P, biến B) và đồng bộ với job robot', 'Gắp vật đặt ngẫu nhiên và bù góc nghiêng khi đặt vào đồ gá'],
    tasks: [
      'Robot: job VISION có sẵn (đọc trong pendant). Chạy ở PLAY: chờ B000 = 1 → gắp ở P010 → đặt vào đồ gá (P011, góc 0°) → B000 = 0. Các điểm P001, P011, P012, P013 đã dạy sẵn.',
      'Camera 320 × 240 nhìn thẳng xuống vùng gắp. Ba điểm mốc đen (Ø8 mm) có tọa độ robot: M1 (160, 30), M2 (290, 30), M3 (160, 190) mm. Vật: thanh thép 50 × 20 × 15 mm, màu tối.',
      'detect(img): tìm vật (bỏ qua 3 điểm mốc nhỏ), trả tâm (u, v) và góc trục dài trên ảnh (độ, từ trục u về trục v). Sai lệch cho phép: 1,5 px và 2°.',
      'pixelToRobot(u, v): đổi sang tọa độ robot (mm) — tìm tâm 3 điểm mốc trên ảnh, giải biến đổi affine. Sai lệch < 1,5 mm.',
      'imageAngleToRobot(a): đổi góc ảnh sang góc Rz của robot (trục ảnh không trùng trục robot!).',
      'writePosition, setByte, readByte: ghi P010 dạng BASE [x, y, z = 25, 180, 0, Rz], bật B000, chờ robot làm xong (B000 về 0).',
      'cycle(): chụp → tìm → đổi tọa độ → gửi → chờ. Thử với nút "Đặt vật ngẫu nhiên" trên Control Panel.',
    ],
    hints: [
      'Ngưỡng ~100 tách vật (≈ 55) khỏi nền pallet (≈ 205). Điểm mốc chỉ ~130 pixel, vật ~2500 pixel.',
      'Mômen trung tâm: μ20, μ02, μ11 → góc = ½·atan2(2μ11, μ20 − μ02).',
      'Góc thanh có chu kỳ 180°: đưa Rz về khoảng (−90°, 90°] để khớp T không xoay quá xa.',
      'Thanh dày 15 mm, mặt pallet z = 10 → điểm gắp z = 25 mm.',
    ],
    setup: { scene: 'vision' },
    starter: { code: R10_CODE + R11_CODE, codeAppend: R11_CODE, master: 'VISION', jobs: [{ name: 'VISION', lines: VISION_JOB }], pvars: VISION_PVARS },
    grading: {
      scenario: async (c) => {
        const { api, error } = makeCode(c, FUNCS.R11);
        c.add('code', 'Mã JavaScript chạy được', 5, !error, error || '');
        if (error) return;
        const cell = c.cell;
        // detect
        let detBad = '', detOk = true;
        for (const pose of [[210, 80, 30], [250, 140, -60], [230, 100, 88], [260, 75, -5]]) {
          cell.items = []; cell.setup('vision', pose);
          const tr = cell.truth();
          const d = await callSafe(api.detect, [cell.capture()], { name: 'detect' });
          const v = d.value || {};
          const ok = d.ok && Math.hypot(v.u - tr.u, v.v - tr.v) <= 1.5 && angDiff180(v.angle, tr.angle) <= 2;
          if (!ok) { detOk = false; detBad = d.ok ? `Vật thật (u ${tr.u.toFixed(1)}, v ${tr.v.toFixed(1)}, ${tr.angle.toFixed(1)}°) — nhận ${JSON.stringify(v)}` : d.error; break; }
        }
        c.add('detect', 'detect(): tâm (±1,5 px) và góc (±2°) của vật trên 4 ảnh', 20, detOk, detBad);
        // hiệu chuẩn
        let calWorst = 0, calErr = '';
        for (const [x, y] of [...VISION.markers, [230, 110], [200, 150], [280, 70]]) {
          const [u, v] = robotToPixel(x, y);
          const r = await callSafe(api.pixelToRobot, [u, v], { name: 'pixelToRobot' });
          if (!r.ok || !Array.isArray(r.value)) { calWorst = Infinity; calErr = r.error || 'Không trả [x, y]'; break; }
          const e = Math.hypot(r.value[0] - x, r.value[1] - y);
          if (e > calWorst) { calWorst = e; calErr = `Điểm (${x}, ${y}) → (${(+r.value[0]).toFixed(1)}, ${(+r.value[1]).toFixed(1)})`; }
        }
        c.add('calib', 'pixelToRobot(): sai lệch < 1,5 mm', 15, calWorst < 1.5, calWorst < 1.5 ? `Sai lớn nhất ${calWorst.toFixed(2)} mm` : calErr);
        let angOk = true, angErr = '';
        for (const a of [0, 35, -70, 89]) {
          cell.items = []; cell.setup('vision', [230, 110, a]);
          const r = await callSafe(api.imageAngleToRobot, [cell.truth().angle], { name: 'imageAngleToRobot' });
          if (!r.ok || angDiff180(r.value, a) > 2) { angOk = false; angErr = r.ok ? `Vật ${a}° → ${(+r.value).toFixed(1)}°` : r.error; break; }
        }
        c.add('angle', 'imageAngleToRobot(): góc ảnh → Rz robot (±2°)', 10, angOk, angErr);
        // chu trình thật
        cell.items = [];
        const r = c.robot;
        r.setMode('PLAY'); r.servoOnReady(); r.selectJob('VISION'); const started = r.start();
        await c.run(2000);
        let done = 0, why = '';
        for (const pose of [[205, 85, 40], [255, 135, -72], [228, 120, 10]]) {
          cell.items = []; cell.setup('vision', pose);
          const res = await callSafe(api.cycle, [], { name: 'cycle' });
          await c.run(1500);
          if (cell.inFixture()) done++;
          else { why = res.ok ? `Vật (${pose.join(', ')}) nằm ở (${cell.part.x.toFixed(1)}, ${cell.part.y.toFixed(1)}, ${(cell.part.rotZ || 0).toFixed(1)}°)` : res.error; if (r.alarms[0]) why += ` · ALARM ${r.alarms[0].code} ${r.alarms[0].detail}`; }
        }
        c.add('cycle', `cycle(): gắp và đặt đúng đồ gá (±3 mm, ±3°) — ${done}/3 lần`, 40, started && done === 3, why);
        c.add('safe', 'Không va chạm', 10, done > 0 && cell.stats.crashes === 0, cell.events.filter((e) => e.level === 'error').slice(-1)[0]?.message || '');
      },
    },
  },
];
export { pixelToRobot as _pixelToRobot };
