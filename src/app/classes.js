// Danh sách lớp: nguồn duy nhất là file tĩnh data/classes.json trong repo (không có server).
import { t } from './i18n.js';
// Giảng viên sửa bằng trang "Danh sách lớp" → tải file mới → thay data/classes.json → git push.

const URL_ = 'data/classes.json';
export const CLASS_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

let cache = null;

/** Chuẩn hóa nội dung file → [{id, name, term}] (bỏ dòng hỏng, bỏ trùng mã). */
export function normalizeClasses(json) {
  const arr = Array.isArray(json) ? json : Array.isArray(json?.classes) ? json.classes : null;
  if (!arr) throw new Error(t('cls.errShape'));
  const seen = new Set();
  const out = [];
  for (const c of arr) {
    const id = String(c?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(c.name ?? '').trim() || id, term: String(c.term ?? '').trim() });
  }
  return out;
}

/** Nạp data/classes.json (một lần mỗi phiên; force = nạp lại). Ném lỗi thân thiện nếu không có file. */
export function loadClasses({ force = false } = {}) {
  if (cache && !force) return cache;
  cache = (async () => {
    let res;
    try { res = await fetch(URL_, { cache: 'no-cache' }); } catch { throw new Error(t('cls.errOffline')); }
    if (!res.ok) throw new Error(res.status === 404 ? t('cls.err404') : t('cls.errHttp', { status: res.status }));
    let json;
    try { json = await res.json(); } catch { throw new Error(t('cls.errJson')); }
    return normalizeClasses(json);
  })();
  cache.catch(() => { cache = null; }); // lần sau thử lại
  return cache;
}

/** Như loadClasses nhưng không ném lỗi: trả [] khi lỗi. */
export async function loadClassesSafe() { try { return await loadClasses(); } catch { return []; } }

/** Chuỗi JSON để giảng viên tải xuống (định dạng giống file trong repo). */
export function classesToJson(list) {
  return JSON.stringify({ classes: list.map((c) => ({ id: c.id.trim(), name: c.name.trim(), term: (c.term || '').trim() })) }, null, 2) + '\n';
}
