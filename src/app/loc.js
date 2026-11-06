// Dịch nội dung (máy, lab, bài giảng, thông báo động của engine) lúc HIỂN THỊ — không sửa đối tượng của engine.
// Nguồn: src/i18n/loc.js (nhóm nội dung). Chưa có file / lỗi → trả nguyên đầu vào (tiếng Việt).
// Tiếng Việt là ngôn ngữ gốc của nội dung nên khi lang = 'vi' luôn trả nguyên đầu vào.
import { getLang } from './i18n.js';

let mod = null;
/** Promise nạp module dịch nội dung (main.js chờ trước lần vẽ đầu). */
export const locReady = import('../i18n/loc.js')
  .then((m) => { mod = m; })
  .catch((e) => { console.info('[loc] src/i18n/loc.js not available — content stays Vietnamese:', e?.message || e); });

const call = (fn, args, fallback) => {
  const lang = getLang();
  if (lang === 'vi' || typeof mod?.[fn] !== 'function') return fallback;
  try { return mod[fn](...args, lang) ?? fallback; } catch (e) { console.warn('[loc]', fn, e); return fallback; }
};

/** Máy (def) đã dịch: title, summary, mô tả I/O, nhãn nút, nhãn lỗi. */
export const trMachine = (def) => (def ? call('trMachine', [def], def) : def);
/** Lab (dạng engine) đã dịch: title, objectives, tasks, hints. */
export const trLab = (lab) => (lab ? call('trLab', [lab], lab) : lab);
/** Bài giảng đã dịch của 1 lab; null → dùng bản gốc. */
export const trLecture = (labId) => call('trLecture', [labId], null);
/** { title, subtitle } của học phần; null → dùng bản gốc. */
export const trCourseInfo = () => call('trCourseInfo', [], null);
/** Thông báo động (sự kiện/cảnh báo máy, tiêu chí chấm, lỗi biên dịch/chạy). */
export const trText = (msg) => (msg === null || msg === undefined || msg === '' ? msg : call('trText', [String(msg)], msg));
/** Có module dịch nội dung chưa (để ghi chú/kiểm thử). */
export const hasLoc = () => !!mod;
