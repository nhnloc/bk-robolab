// Bài giảng theo lab: nạp src/labs/lectures.js (do nhóm nội dung soạn) nếu có, nếu chưa có → {}.
// Dạng: LECTURES[labId] = { outcomes:[{code,text}], durationMin, sections:[{title, body}], quiz?:[{q, options, answer, explain}] }
import { storage } from './store.js';

import { courseTitle } from './course.js';
import { trLecture, trCourseInfo } from './loc.js';

let modP = null;
const loadMod = () => (modP ||= import('../labs/lectures.js')
  .catch((e) => { console.info('[lectures] src/labs/lectures.js not available →', e?.message || e); return {}; }));

/** LECTURES (hoặc {} nếu chưa có file / sai dạng). */
export async function loadLectures() {
  const m = await loadMod();
  const L = m?.LECTURES;
  return L && typeof L === 'object' ? L : {};
}

/** Tên học phần: COURSE_INFO của nhóm nội dung (đã dịch theo ngôn ngữ), dự phòng course.title (i18n). */
export async function loadCourseInfo() {
  const m = await loadMod();
  const tr = trCourseInfo();
  const ci = (tr && typeof tr === 'object' ? tr : null) || m?.COURSE_INFO || {};
  return { title: String(ci.title || courseTitle()), subtitle: ci.subtitle ? String(ci.subtitle) : '' };
}

/** Bài giảng của 1 lab (thử id khóa học rồi id của engine). Trả null nếu không có hoặc sai dạng. */
export function lectureFor(LECTURES, lab) {
  const orig = LECTURES?.[lab?.id] ? lab.id : lab?.engineId && LECTURES?.[lab.engineId] ? lab.engineId : null;
  // Bản dịch theo ngôn ngữ hiện tại (src/i18n/loc.js), dự phòng bản gốc.
  const lec = (orig && trLecture(orig)) || (orig ? LECTURES[orig] : null);
  if (!lec || typeof lec !== 'object') return null;
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    durationMin: Number.isFinite(+lec.durationMin) && +lec.durationMin > 0 ? +lec.durationMin : null,
    outcomes: arr(lec.outcomes).map((o) => (typeof o === 'string' ? { code: '', text: o } : { code: String(o?.code ?? ''), text: String(o?.text ?? '') })).filter((o) => o.text),
    sections: arr(lec.sections).map((s) => ({ title: String(s?.title ?? ''), body: String(s?.body ?? '') })).filter((s) => s.title || s.body),
    quiz: arr(lec.quiz).filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => ({ q: String(q.q), options: q.options.map(String), answer: Number.isInteger(q.answer) ? q.answer : -1, explain: q.explain ? String(q.explain) : '' })),
  };
}

/* ---------- Trạng thái theo sinh viên (localStorage) ---------- */
const seenKey = (uid) => `bk.lecture.seen.${uid}`;
export function hasSeenLab(uid, labId) { return (storage.get(seenKey(uid), []) || []).includes(labId); }
export function markSeenLab(uid, labId) {
  const s = storage.get(seenKey(uid), []) || [];
  if (!s.includes(labId)) storage.set(seenKey(uid), [...s, labId]);
}
const quizKey = (uid, labId) => `bk.quiz.${uid}.${labId}`;
export function getQuiz(uid, labId) { return storage.get(quizKey(uid, labId), {}) || {}; }
export function setQuiz(uid, labId, answers) { storage.set(quizKey(uid, labId), answers); }
