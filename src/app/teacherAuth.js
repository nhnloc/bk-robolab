// Đăng nhập giảng viên trên bản web: kiểm tra mật khẩu bằng PBKDF2 với data/teacher.json.
// Lưu ý: trang tĩnh không có server nên đây là khóa nhẹ — bản web không chứa lời giải hay dữ liệu bí mật.
import { t } from './i18n.js';

let cfgP = null;
export function loadTeacherConfig() {
  if (!cfgP) cfgP = fetch('data/teacher.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cfgP;
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function verifyTeacherPassword(password) {
  const cfg = await loadTeacherConfig();
  if (!cfg || !cfg.hash || !cfg.salt) throw new Error(t('api.teacherNoPass'));
  if (!globalThis.crypto?.subtle) throw new Error(t('api.noCrypto'));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(cfg.salt), iterations: cfg.iterations || 200000 }, key, 256);
  return hex(bits) === cfg.hash;
}
