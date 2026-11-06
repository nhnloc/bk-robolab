// High-Speed Ethernet Server (UDP 10040) của bộ điều khiển robot ảo — mã hóa / giải mã khung và xử lý lệnh.
// Khung: header 32 byte + phần dữ liệu (tối đa 479 byte), little-endian. Theo tài liệu "YRC1000micro Ethernet Function".
import * as K from './kinematics.js';

export const HSE_PORT = 10040;
export const ID_YERC = 0x43524559;          // "YERC" đọc dạng L little-endian
export const RESERVE2 = '99999999';

export const CMD = {
  ALARM_READ: 0x70, STATUS_READ: 0x72, POS_READ: 0x75, IO_RW: 0x78,
  VAR_B: 0x7A, VAR_I: 0x7B, VAR_D: 0x7C, VAR_R: 0x7D, VAR_P: 0x7F,
  ALARM_RESET: 0x82, HOLD_SERVO: 0x83, CYCLE_SWITCH: 0x84, JOB_START: 0x86, JOB_SELECT: 0x87,
  MOVE_CART: 0x8A, MOVE_PULSE: 0x8B,
};
export const SVC = { GET_ALL: 0x01, SET_ALL: 0x02, GET_SINGLE: 0x0E, SET_SINGLE: 0x10 };

/** Mã trạng thái bổ sung (bản mô phỏng). */
export const ADDED = {
  0x0000: 'OK',
  0x1010: 'Lệnh (command no) không xác định',
  0x1011: 'Instance không hợp lệ',
  0x1012: 'Attribute không hợp lệ',
  0x1013: 'Service không hợp lệ',
  0x1014: 'Kích thước dữ liệu không đúng',
  0x1015: 'Giá trị dữ liệu không hợp lệ',
  0x2010: 'Robot đang chạy chương trình',
  0x2060: 'Chưa ở chế độ REMOTE (chìa khóa trên pendant)',
  0x2070: 'Servo chưa bật',
  0x2080: 'Đang có báo động / dừng khẩn',
  0x2090: 'Không có job',
  0x20A0: 'Điểm đích ngoài vùng làm việc',
  0xA000: 'Header sai (định danh, kích thước, dự trữ)',
};

/* ------------------------------------------------------------ tạo khung */
/** Tạo khung yêu cầu. data: Uint8Array | number[]. */
export function buildRequest({ cmd, instance = 0, attribute = 0, service = 0, data = [], requestId = 0, division = 1, blockNo = 0 }) {
  const d = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const b = new Uint8Array(32 + d.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, ID_YERC, true);
  v.setUint16(4, 32, true);
  v.setUint16(6, d.length, true);
  b[8] = 3; b[9] = division; b[10] = 0; b[11] = requestId & 255;
  v.setUint32(12, blockNo, true);
  for (let i = 0; i < 8; i++) b[16 + i] = RESERVE2.charCodeAt(i);
  v.setUint16(24, cmd, true);
  v.setUint16(26, instance, true);
  b[28] = attribute; b[29] = service;
  b.set(d, 32);
  return b;
}

/** Giải mã khung yêu cầu → object, hoặc { error } nếu header sai. */
export function parseRequest(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  if (b.length < 32) return { error: 'Khung ngắn hơn 32 byte header', bytes: b };
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const f = {
    identifier: v.getUint32(0, true), headerSize: v.getUint16(4, true), dataSize: v.getUint16(6, true),
    reserve1: b[8], division: b[9], ack: b[10], requestId: b[11], blockNo: v.getUint32(12, true),
    reserve2: String.fromCharCode(...b.slice(16, 24)),
    cmd: v.getUint16(24, true), instance: v.getUint16(26, true), attribute: b[28], service: b[29], padding: v.getUint16(30, true),
    data: b.slice(32), bytes: b,
  };
  const errs = [];
  if (f.identifier !== ID_YERC) errs.push(`Định danh 0x${hex(f.identifier, 8)} ≠ 0x43524559 ("YERC")`);
  if (f.headerSize !== 32) errs.push(`Header size = ${f.headerSize} ≠ 0x20`);
  if (f.reserve1 !== 3) errs.push(`Reserve 1 = ${f.reserve1} ≠ 3`);
  if (f.division !== 1) errs.push(`Processing division = ${f.division} ≠ 1 (điều khiển robot)`);
  if (f.reserve2 !== RESERVE2) errs.push('Reserve 2 ≠ "99999999" (0x3939393939393939)');
  if (f.dataSize !== b.length - 32) errs.push(`Data size = ${f.dataSize} nhưng phần dữ liệu thực có ${b.length - 32} byte`);
  if (errs.length) f.error = errs.join('; ');
  return f;
}

export function buildResponse(req, { status = 0, added = 0, data = [] } = {}) {
  const d = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const b = new Uint8Array(32 + d.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, ID_YERC, true);
  v.setUint16(4, 32, true); v.setUint16(6, d.length, true);
  b[8] = 3; b[9] = 1; b[10] = 1; b[11] = req?.requestId ?? 0;
  v.setUint32(12, 0x80000000, true);
  for (let i = 0; i < 8; i++) b[16 + i] = RESERVE2.charCodeAt(i);
  b[24] = ((req?.service ?? 0) + 0x80) & 255;
  b[25] = status; b[26] = added ? 2 : 0;
  v.setUint16(28, added, true);
  b.set(d, 32);
  return b;
}
export function parseResponse(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { requestId: b[11], service: b[24], status: b[25], added: v.getUint16(28, true), dataSize: v.getUint16(6, true), data: b.slice(32) };
}

export const hex = (n, w = 2) => (n >>> 0).toString(16).toUpperCase().padStart(w, '0');
export const hexDump = (b) => Array.from(b, (x) => hex(x)).join(' ');

/* ------------------------------------------------------------ máy chủ */
const i32 = (arr) => { const b = new Uint8Array(arr.length * 4); const v = new DataView(b.buffer); arr.forEach((x, i) => v.setInt32(i * 4, Math.round(x), true)); return b; };

/**
 * Xử lý một khung yêu cầu trên bộ điều khiển rc (RobotController). Trả { response, req, info }.
 * info: mô tả ngắn để hiện ở màn hình giám sát mạng.
 */
export function handleRequest(rc, bytes) {
  const req = parseRequest(bytes);
  const R = (o, info) => ({ response: buildResponse(req, o), req, info, ok: !o.status });
  if (req.error) return R({ status: 0x1F, added: 0xA000 }, 'Header sai: ' + req.error);
  const v = new DataView(req.data.buffer, req.data.byteOffset, req.data.byteLength);
  const needData = (n) => req.data.length >= n;
  const remoteOnly = () => {
    if (rc.mode !== 'REMOTE') return 0x2060;
    if (rc.estopped || rc.hasAlarm) return 0x2080;
    return 0;
  };
  switch (req.cmd) {
    case CMD.STATUS_READ: {
      const s = rc.status();
      const d1 = (rc.cycle === 'STEP' ? 1 : 0) | (rc.cycle === 'CYCLE' ? 2 : 0) | (rc.cycle === 'AUTO' ? 4 : 0) | (s.running ? 8 : 0) | (s.mode === 'TEACH' ? 32 : 0) | (s.mode === 'PLAY' ? 64 : 0) | (s.mode === 'REMOTE' ? 128 : 0);
      const d2 = (s.hold ? 2 : 0) | (rc.exec?.held && !s.running ? 8 : 0) | (s.alarm ? 16 : 0) | (s.servo ? 64 : 0);
      if (req.instance !== 1) return R({ status: 0x08, added: 0x1011 }, 'Status: instance phải = 1');
      const data = req.service === SVC.GET_SINGLE ? i32([req.attribute === 2 ? d2 : d1]) : i32([d1, d2]);
      return R({ data }, `Đọc trạng thái: data1=0x${hex(d1)} data2=0x${hex(d2)}`);
    }
    case CMD.ALARM_READ: {
      const a = rc.alarms[req.instance - 1];
      const data = new Uint8Array(60); const dv = new DataView(data.buffer);
      if (a) { dv.setUint32(0, a.code, true); const txt = (a.text || '').slice(0, 32); for (let i = 0; i < txt.length; i++) data[28 + i] = txt.charCodeAt(i) & 127; }
      return R({ data }, a ? `Đọc báo động ${a.code}` : 'Không có báo động');
    }
    case CMD.POS_READ: {
      if (req.instance === 1) {
        const p = K.degToPulse(rc.q);
        return R({ data: i32([0, 0, 0, 0, 0, ...p, 0, 0]) }, `Đọc vị trí (xung): ${p.join(', ')}`);
      }
      if (req.instance === 101) {
        const ps = rc.pose();
        const data = i32([16, 0, 0, 0, 0, ps[0] * 1000, ps[1] * 1000, ps[2] * 1000, ps[3] * 10000, ps[4] * 10000, ps[5] * 10000, 0, 0]);
        return R({ data }, `Đọc vị trí (BASE): ${ps.map((x) => x.toFixed(2)).join(', ')}`);
      }
      return R({ status: 0x08, added: 0x1011 }, 'Đọc vị trí: instance 1 (xung) hoặc 101 (Descartes)');
    }
    case CMD.IO_RW: {
      // instance 1..3: IN#1-8 / 9-16 / 17-24; 1001..1003: OT#
      const out = req.instance >= 1001;
      const g = out ? req.instance - 1000 : req.instance;
      if (g < 1 || g > 3) return R({ status: 0x08, added: 0x1011 }, 'IO: instance 1..3 (IN#) hoặc 1001..1003 (OT#)');
      if (req.service === SVC.SET_SINGLE) return R({ status: 0x08, added: 0x1013 }, 'IO: bản mô phỏng chỉ cho đọc');
      const arr = out ? rc.OT : rc.IN;
      let byte = 0; for (let i = 0; i < 8; i++) if (arr[(g - 1) * 8 + i + 1]) byte |= 1 << i;
      return R({ data: [byte, 0, 0, 0] }, `Đọc ${out ? 'OT' : 'IN'}#${(g - 1) * 8 + 1}-${g * 8} = 0x${hex(byte)}`);
    }
    case CMD.VAR_B: case CMD.VAR_I: case CMD.VAR_D: case CMD.VAR_R: {
      const t = { [CMD.VAR_B]: 'B', [CMD.VAR_I]: 'I', [CMD.VAR_D]: 'D', [CMD.VAR_R]: 'R' }[req.cmd];
      const n = req.instance;
      if (n >= 100) return R({ status: 0x08, added: 0x1011 }, `Biến ${t}: instance 0..99`);
      if (req.service === SVC.SET_SINGLE || req.service === SVC.SET_ALL) {
        const size = { B: 1, I: 2, D: 4, R: 4 }[t];
        if (!needData(size)) return R({ status: 0x08, added: 0x1014 }, 'Thiếu dữ liệu');
        const val = t === 'B' ? req.data[0] : t === 'I' ? v.getInt16(0, true) : t === 'D' ? v.getInt32(0, true) : v.getFloat32(0, true);
        rc.setVar({ t, n }, val);
        return R({}, `Ghi ${t}${String(n).padStart(3, '0')} = ${val}`);
      }
      const val = rc.vars[t][n];
      const data = new Uint8Array(4); const dv = new DataView(data.buffer);
      if (t === 'B') data[0] = val; else if (t === 'I') dv.setInt16(0, val, true); else if (t === 'D') dv.setInt32(0, val, true); else dv.setFloat32(0, val, true);
      return R({ data }, `Đọc ${t}${String(n).padStart(3, '0')} = ${val}`);
    }
    case CMD.VAR_P: {
      const n = req.instance;
      if (n > 127) return R({ status: 0x08, added: 0x1011 }, 'Biến P: instance 0..127');
      const nm = 'P' + String(n).padStart(3, '0');
      if (req.service === SVC.SET_ALL || req.service === SVC.SET_SINGLE) {
        if (!needData(52)) return R({ status: 0x08, added: 0x1014 }, 'Biến P: cần 52 byte (kiểu, cấu hình, tool, user, …, 8 trục)');
        const g = (i) => v.getInt32(i * 4, true);
        const type = g(0);
        if (type === 0) rc.setP(n, { type: 'PULSE', q: K.pulseToDeg([g(5), g(6), g(7), g(8), g(9), g(10)]) });
        else if (type === 16) rc.setP(n, { type: 'BASE', p: [g(5) / 1000, g(6) / 1000, g(7) / 1000, g(8) / 10000, g(9) / 10000, g(10) / 10000] });
        else return R({ status: 0x08, added: 0x1015 }, 'Kiểu dữ liệu: 0 (xung) hoặc 16 (BASE)');
        const pv = rc.getP(n);
        return R({}, `Ghi ${nm} = ${(pv.type === 'BASE' ? pv.p : pv.q).map((x) => x.toFixed(1)).join(', ')}`);
      }
      const pv = rc.getP(n);
      if (!pv) return R({ data: i32(new Array(13).fill(0)) }, `${nm} chưa có dữ liệu`);
      const data = pv.type === 'BASE'
        ? i32([16, 0, 0, 0, 0, pv.p[0] * 1000, pv.p[1] * 1000, pv.p[2] * 1000, pv.p[3] * 10000, pv.p[4] * 10000, pv.p[5] * 10000, 0, 0])
        : i32([0, 0, 0, 0, 0, ...K.degToPulse(pv.q), 0, 0]);
      return R({ data }, `Đọc ${nm}`);
    }
    case CMD.ALARM_RESET: {
      if (req.instance !== 1 && req.instance !== 2) return R({ status: 0x08, added: 0x1011 }, 'Reset báo động: instance 1');
      rc.resetAlarm();
      return R({}, 'Reset báo động');
    }
    case CMD.HOLD_SERVO: {
      if (!needData(4)) return R({ status: 0x08, added: 0x1014 }, 'Thiếu 4 byte dữ liệu (1 = ON, 2 = OFF)');
      const val = v.getInt32(0, true);
      if (val !== 1 && val !== 2) return R({ status: 0x08, added: 0x1015 }, `Dữ liệu = ${val}: phải là 1 (ON) hoặc 2 (OFF)`);
      if (req.instance === 2) {
        const e = remoteOnly(); if (e) return R({ status: 0x08, added: e }, ADDED[e]);
        if (val === 1) { rc.servoOn(); rc.emit('state'); return R({}, 'SERVO ON'); }
        rc.servoOff(); rc.emit('state'); return R({}, 'SERVO OFF');
      }
      if (req.instance === 1) { rc.hold(val === 1); return R({}, val === 1 ? 'HOLD ON' : 'HOLD OFF'); }
      if (req.instance === 3) return R({}, 'HLOCK (bỏ qua trong bản mô phỏng)');
      return R({ status: 0x08, added: 0x1011 }, 'Instance: 1 HOLD, 2 SERVO, 3 HLOCK');
    }
    case CMD.CYCLE_SWITCH: {
      if (!needData(4)) return R({ status: 0x08, added: 0x1014 }, 'Thiếu dữ liệu');
      const val = v.getInt32(0, true);
      const c = { 1: 'STEP', 2: 'CYCLE', 3: 'AUTO' }[val];
      if (!c) return R({ status: 0x08, added: 0x1015 }, '1 STEP, 2 CYCLE, 3 AUTO');
      rc.cycle = c; rc.emit('state');
      return R({}, 'Chế độ chu kỳ: ' + c);
    }
    case CMD.JOB_SELECT: {
      const e = remoteOnly(); if (e) return R({ status: 0x08, added: e }, ADDED[e]);
      const name = String.fromCharCode(...req.data.slice(0, 32)).replace(/\0.*$/s, '').trim();
      if (!rc.selectJob(name)) return R({ status: 0x08, added: 0x2090 }, `Không có job "${name}"`);
      return R({}, `Chọn job ${name}`);
    }
    case CMD.JOB_START: {
      const e = remoteOnly(); if (e) return R({ status: 0x08, added: e }, ADDED[e]);
      if (!needData(4) || v.getInt32(0, true) !== 1) return R({ status: 0x08, added: 0x1015 }, 'Dữ liệu phải = 1');
      if (!rc.servo) return R({ status: 0x08, added: 0x2070 }, ADDED[0x2070]);
      if (rc.busy) return R({ status: 0x08, added: 0x2010 }, ADDED[0x2010]);
      if (!rc.start(true)) return R({ status: 0x08, added: 0x2090 }, 'Không chạy được job');
      return R({}, `START job ${rc.cursor.job}`);
    }
    case CMD.MOVE_CART: case CMD.MOVE_PULSE: {
      const e = remoteOnly(); if (e) return R({ status: 0x08, added: e }, ADDED[e]);
      if (!rc.servo) return R({ status: 0x08, added: 0x2070 }, ADDED[0x2070]);
      if (rc.busy || rc.motion) return R({ status: 0x08, added: 0x2010 }, ADDED[0x2010]);
      const cart = req.cmd === CMD.MOVE_CART;
      if (!needData(cart ? 52 : 56)) return R({ status: 0x08, added: 0x1014 }, 'Thiếu dữ liệu lệnh di chuyển');
      const g = (i) => v.getInt32(i * 4, true);
      const spdCls = g(2), spd = g(3);
      let q1, info;
      if (cart) {
        const coord = g(4);
        let p = [g(5) / 1000, g(6) / 1000, g(7) / 1000, g(8) / 10000, g(9) / 10000, g(10) / 10000];
        if (req.instance === 3) { const cur = rc.pose(); p = cur.map((x, i) => x + p[i]); }
        if (coord !== 16 && coord !== 17) return R({ status: 0x08, added: 0x1015 }, 'Hệ tọa độ: 16 (BASE) hoặc 17 (ROBOT)');
        const r = K.ik(K.poseToT(p), rc.q, rc.tool);
        if (!r.ok) return R({ status: 0x08, added: 0x20A0 }, ADDED[0x20A0]);
        q1 = r.q; info = `MOVE ${req.instance === 1 ? 'J' : 'L'} tới ${p.map((x) => x.toFixed(1)).join(', ')}`;
      } else {
        q1 = K.pulseToDeg([g(4), g(5), g(6), g(7), g(8), g(9)]);
        info = `MOVE xung ${[g(4), g(5), g(6), g(7), g(8), g(9)].join(', ')}`;
      }
      if (K.limitViolation(q1) >= 0) return R({ status: 0x08, added: 0x20A0 }, 'Vượt giới hạn khớp');
      const linear = req.instance >= 2;
      const tags = linear ? { V: spdCls === 1 ? spd / 10 : 100 } : { VJ: spdCls === 0 ? spd / 100 : 10 };
      rc.beginMotion(linear ? 'MOVL' : 'MOVJ', q1, tags, null, { manual: true, remote: true });
      return R({}, info);
    }
    default:
      return R({ status: 0x08, added: 0x1010 }, `Lệnh 0x${hex(req.cmd)} không hỗ trợ`);
  }
}

/** Mô tả các trường header cho bảng giải thích / màn hình giám sát. */
export function describeFrame(bytes) {
  const f = parseRequest(bytes);
  if (f.bytes.length < 32) return [];
  return [
    ['Identifier (L)', 0, 4, '0x' + hex(f.identifier, 8)],
    ['Header size (W)', 4, 2, '0x' + hex(f.headerSize, 4)],
    ['Data size (W)', 6, 2, '0x' + hex(f.dataSize, 4)],
    ['Reserve 1 (B)', 8, 1, '0x' + hex(f.reserve1)],
    ['Processing division (B)', 9, 1, '0x' + hex(f.division)],
    ['ACK (B)', 10, 1, '0x' + hex(f.ack)],
    ['Request ID (B)', 11, 1, '0x' + hex(f.requestId)],
    ['Block No (L)', 12, 4, '0x' + hex(f.blockNo, 8)],
    ['Reserve 2 (8B)', 16, 8, '"' + f.reserve2 + '"'],
    ['Command No (W)', 24, 2, '0x' + hex(f.cmd, 4)],
    ['Instance (W)', 26, 2, '0x' + hex(f.instance, 4)],
    ['Attribute (B)', 28, 1, '0x' + hex(f.attribute)],
    ['Service (B)', 29, 1, '0x' + hex(f.service)],
    ['Padding (W)', 30, 2, '0x' + hex(f.padding, 4)],
  ];
}
