// Bản dịch nội dung học (máy, bài lab, bài giảng, thông báo động) sang tiếng Anh.
// Tiếng Việt trong src/sim, src/labs, src/plc là bản gốc; dữ liệu tiếng Anh nằm ở src/i18n/en/*.
// Mọi hàm trả về bản gốc khi lang === 'vi' và dự phòng về tiếng Việt theo từng trường khi thiếu bản dịch.
import { PANEL_EN, CYL_FAULTS_EN, MACHINES_EN } from './en/machines.js';
import { LABS_EN } from './en/labs.js';
import { COURSE_INFO_EN, LECTURES_EN } from './en/lectures.js';
import { EXACT, PATTERNS } from './en/messages.js';
import { LECTURES, COURSE_INFO } from '../labs/lectures.js';
import { MACHINES } from '../sim/index.js';
import { LABS } from '../labs/index.js';

const isVi = (lang) => !lang || lang === 'vi';
const pick = (en, vi) => (typeof en === 'string' && en !== '' ? en : vi);

/* ---------------- Máy ---------------- */

function faultLabel(m, f) {
  const own = m?.faults?.[f.id] ?? PANEL_EN.faults[f.id];
  if (own) return own;
  const c = /^cyl_(\w+)_(stuck|slow|b1|b2|leak)$/.exec(f.id);
  if (c && CYL_FAULTS_EN[c[2]]) return CYL_FAULTS_EN[c[2]](c[1]);
  return trText(f.label, 'en');
}

/** Bản sao sâu của def máy với title, summary, mô tả I/O, nhãn nút, nhãn lỗi theo `lang`. */
export function trMachine(def, lang) {
  if (isVi(lang) || !def) return def;
  const m = MACHINES_EN[def.id];
  const out = structuredCloneSafe(def);
  out.title = pick(m?.title, def.title);
  out.summary = pick(m?.summary, def.summary);
  const io = (x) => ({ ...x, desc: pick(m?.io?.[x.tag] ?? PANEL_EN.io[x.tag] ?? trText(x.desc, 'en'), x.desc) });
  if (def.ioMap) out.ioMap = { ...out.ioMap, inputs: (def.ioMap.inputs || []).map(io), outputs: (def.ioMap.outputs || []).map(io) };
  if (def.buttons) out.buttons = def.buttons.map((b) => ({ ...b, label: pick(m?.buttons?.[b.id] ?? PANEL_EN.buttons[b.id] ?? trText(b.label, 'en'), b.label) }));
  if (def.faults) out.faults = def.faults.map((f) => ({ ...f, label: pick(faultLabel(m, f), f.label) }));
  return out;
}

function structuredCloneSafe(o) {
  if (Array.isArray(o)) return o.map(structuredCloneSafe);
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = structuredCloneSafe(v); return r; }
  return o;
}

/* ---------------- Bài lab ---------------- */

/** Bản sao của một phần tử LABS với title, objectives, tasks, hints theo `lang`. */
export function trLab(lab, lang) {
  if (isVi(lang) || !lab) return lab;
  const e = LABS_EN[lab.id] || {};
  const arr = (k) => (lab[k] || []).map((s, i) => pick(e[k]?.[i], trText(s, 'en')));
  return { ...lab, title: pick(e.title, lab.title), objectives: arr('objectives'), tasks: arr('tasks'), hints: arr('hints') };
}

/* ---------------- Bài giảng ---------------- */

/** Bài giảng của lab theo `lang` (dự phòng tiếng Việt từng trường). undefined nếu lab không có bài giảng. */
export function trLecture(labId, lang) {
  const vi = LECTURES[labId];
  if (isVi(lang) || !vi) return vi;
  const e = LECTURES_EN[labId] || {};
  return {
    ...vi,
    outcomes: (vi.outcomes || []).map((o, i) => ({ ...o, text: pick(e.outcomes?.[i], o.text) })),
    sections: (vi.sections || []).map((s, i) => ({ ...s, title: pick(e.sections?.[i]?.title, s.title), body: pick(e.sections?.[i]?.body, s.body) })),
    quiz: vi.quiz ? vi.quiz.map((q, i) => {
      const x = e.quiz?.[i] || {};
      return { ...q, q: pick(x.q, q.q), options: q.options.map((o, k) => pick(x.options?.[k], o)), explain: pick(x.explain, q.explain) };
    }) : vi.quiz,
  };
}

/** Thông tin khóa học (title, subtitle) theo `lang`. */
export function trCourseInfo(lang) {
  if (isVi(lang)) return COURSE_INFO;
  return { ...COURSE_INFO, title: pick(COURSE_INFO_EN.title, COURSE_INFO.title), subtitle: pick(COURSE_INFO_EN.subtitle, COURSE_INFO.subtitle) };
}

/* ---------------- Thông báo động ---------------- */

const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Biên dịch bảng mẫu: '{0}', '{1}'… trong mẫu tiếng Việt là tham số; mẫu cụ thể (nhiều chữ cố định) thử trước.
const COMPILED = PATTERNS.map(([vi, en], order) => {
  const idx = [];
  const src = vi.split(/(\{\d\})/).map((p) => {
    const m = /^\{(\d)\}$/.exec(p);
    if (m) { idx.push(+m[1]); return '([\\s\\S]+?)'; }
    return esc(p);
  }).join('');
  return { re: new RegExp('^' + src + '$'), idx, en, weight: vi.replace(/\{\d\}/g, '').length, order };
}).sort((a, b) => b.weight - a.weight || a.order - b.order);

const EXACT_MAP = new Map(Object.entries(EXACT));
// Nhãn tĩnh của máy/bài lab cũng có thể xuất hiện trong thông báo (vd. "Giảng viên bật lỗi: <nhãn lỗi>",
// chú thích tag = mô tả I/O, tên project "<id> — <tên bài>"): bổ sung vào bảng tra một lần, khi cần.
let staticDone = false;
function addStatic() {
  staticDone = true;
  const put = (vi, en) => { if (vi && en && vi !== en && !EXACT_MAP.has(vi)) EXACT_MAP.set(vi, en); };
  for (const def of Object.values(MACHINES)) {
    const en = trMachine(def, 'en');
    put(def.title, en.title); put(def.summary, en.summary);
    for (const k of ['inputs', 'outputs']) def.ioMap[k].forEach((io, i) => put(io.desc, en.ioMap[k][i].desc));
    def.buttons.forEach((b, i) => put(b.label, en.buttons[i].label));
    def.faults.forEach((f, i) => put(f.label, en.faults[i].label));
  }
  for (const lab of LABS) {
    const en = trLab(lab, 'en');
    put(lab.title, en.title);
    for (const k of ['objectives', 'tasks', 'hints']) lab[k].forEach((s, i) => put(s, en[k][i]));
    if (lab.grading?.sampleLabel) put(lab.grading.sampleLabel, LABS_EN[lab.id]?.sampleLabel);
  }
}

function trLine(s, depth = 0) {
  if (!s || depth > 6) return s;
  const lead = s.match(/^\s*/)[0], trail = s.slice(lead.length).match(/\s*$/)[0];
  const core = s.slice(lead.length, s.length - trail.length);
  if (!core) return s;
  if (!staticDone && VI_CHARS.test(core)) addStatic();
  const hit = EXACT_MAP.get(core);
  if (hit !== undefined) return lead + hit + trail;
  if (!VI_CHARS.test(core)) return s;
  for (const p of COMPILED) {
    const m = p.re.exec(core);
    if (!m) continue;
    const args = [];
    p.idx.forEach((k, j) => { args[k] = trLine(m[j + 1], depth + 1); });
    const en = typeof p.en === 'function' ? p.en(...args) : p.en.replace(/\{(\d)\}/g, (_, k) => args[+k] ?? '');
    return lead + en + trail;
  }
  // "<khối/vị trí>: <thông báo>" — tiền tố không có tiếng Việt (vd. "Main NW2", "PLC tags").
  const c = /^([^:]*?): ([\s\S]+)$/.exec(core);
  if (c && !VI_CHARS.test(c[1])) {
    const rest = trLine(c[2], depth + 1);
    if (rest !== c[2]) return lead + c[1] + ': ' + rest + trail;
  }
  // "<a> — <b>" (vd. tên project "L01 — <tên bài>"): nhận khi dịch hết được cả hai vế.
  const d = core.indexOf(' — ');
  if (d > 0) {
    const r = trLine(core.slice(0, d), depth + 1) + ' — ' + trLine(core.slice(d + 3), depth + 1);
    if (!VI_CHARS.test(r)) return lead + r + trail;
  }
  return s;
}

/**
 * Dịch một thông báo động tiếng Việt (nhật ký máy, chấm bài, lỗi PLC) sang `lang`.
 * Nhiều dòng được dịch từng dòng. Không khớp mẫu nào → trả nguyên chuỗi.
 */
export function trText(msg, lang) {
  if (isVi(lang) || typeof msg !== 'string' || !msg) return msg;
  return msg.includes('\n') ? msg.split('\n').map((l) => trLine(l)).join('\n') : trLine(msg);
}
