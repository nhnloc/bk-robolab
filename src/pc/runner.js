// Chạy chương trình "máy tính" của sinh viên (JavaScript) giao tiếp với robot ảo qua UDP (High-Speed Ethernet).
// Mã sinh viên là các hàm khai báo ở mức đầu; runner trả về các hàm đó để giao diện (nút bấm) và bộ chấm gọi.

export const PC_IP = '192.168.1.20';
export const FUNCS = {
  R10: ['buildFrame', 'setServo', 'readCartesian', 'readPulse', 'pulseToDeg', 'forwardKinematics', 'moveIncrement'],
  R11: ['buildFrame', 'detect', 'pixelToRobot', 'imageAngleToRobot', 'writePosition', 'setByte', 'readByte', 'cycle'],
};

/**
 * env: { cell, sleep(ms) → Promise, log(...args) }
 * Trả { api, error } — api: { tên hàm: function }, error: chuỗi lỗi biên dịch.
 */
export function compileUserCode(code, names, env) {
  const log = env.log || (() => {});
  const udp = {
    sent: 0,
    /** Gửi khung UDP; trả Promise<Uint8Array | null> (null = không có phản hồi). */
    async send(ip, port, bytes) {
      if (!(bytes instanceof Uint8Array)) {
        if (Array.isArray(bytes)) bytes = Uint8Array.from(bytes);
        else throw new Error('udp.send: dữ liệu phải là Uint8Array hoặc mảng byte');
      }
      udp.sent++;
      const r = env.cell.udpSend({ remoteIp: String(ip), remotePort: +port, type: 'UDP', code: 'BIN' }, bytes, PC_IP);
      await env.sleep(2);
      return r.delivered ? r.response : null;
    },
  };
  const camera = { capture: () => (env.cell.capture ? env.cell.capture() : null) };
  let fn;
  try {
    // Mã chạy trong cùng trang (phục vụ học tập), chỉ thấy các đối tượng được truyền vào.
    fn = new Function('udp', 'sleep', 'log', 'camera',
      `"use strict";\n${code}\n;return {${names.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ')}};`);
  } catch (e) { return { api: {}, error: `Lỗi cú pháp: ${e.message}`, udp }; }
  try {
    const api = fn(udp, env.sleep, log, camera);
    return { api, error: null, udp };
  } catch (e) { return { api: {}, error: `Lỗi khi chạy phần khai báo: ${e.message}`, udp }; }
}

/** Gọi hàm sinh viên an toàn (bắt lỗi, giới hạn thời gian thực khi chấm). */
export async function callSafe(fn, args = [], { name = 'hàm' } = {}) {
  if (typeof fn !== 'function') return { ok: false, error: `Chưa viết hàm ${name}()` };
  try { return { ok: true, value: await fn(...args) }; }
  catch (e) { return { ok: false, error: `${name}(): ${e?.message || e}` }; }
}
