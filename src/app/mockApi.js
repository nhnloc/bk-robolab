// API cục bộ (cùng hình dạng API server sau này). Không có server: dữ liệu lưu localStorage của trình duyệt này.
// register, loginStudent, loginTeacher, logout, getMe, listClasses, getClass, listLabs, getProject, saveProject,
// submit, getSubmission, getGradebook, updateSchedule, setFaults, getFaults, getUser
//
// Sinh viên tự đăng ký (Họ tên, Lớp, MSSV) — không mật khẩu (trang luyện tập). Lớp lấy từ data/classes.json.
// Giảng viên: một tài khoản duy nhất, CHỈ khi chạy trên máy (localhost), không bao giờ ở bản công khai.
import { storage } from './store.js';
import { PUBLIC_MODE } from './config.js';
import { loadTeacherConfig, verifyTeacherPassword } from './teacherAuth.js';
import { COURSE } from './course.js';
import { clone } from './dom.js';
import { t } from './i18n.js';
import { loadClassesSafe } from './classes.js';

const K = { db: 'bk.db.v3', session: 'bk.session', oldDb: 'bk.mock.db.v2', oldSession: 'bk.mock.session' };
const delay = (v, ms = 40) => new Promise((r) => setTimeout(() => r(v), ms));

export const MSSV_RE = /^\d{7,10}$/;
export const normName = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
export const normMssv = (s) => String(s ?? '').replace(/\s+/g, '').trim();
const studentId = (mssv) => 'sv' + mssv;
// Tên hiển thị theo ngôn ngữ hiện tại (role.teacher).
const TEACHER = { id: 'gv01', username: 'giangvien', get name() { return t('role.teacher'); }, role: 'teacher' };

function emptyDb() { return { version: 3, users: [], projects: {}, submissions: {}, faults: {}, schedules: {} }; }

/**
 * Chuyển dữ liệu demo cũ (bk.mock.db.v2: 16 SV giả, 2 lớp giả, bài nộp giả) sang dạng mới.
 * Giữ: project và bài nộp do người dùng thật tạo (bài nộp có project), đổi khóa về 'sv<MSSV>' để
 * khi đăng ký lại đúng MSSV thì bài làm cũ tự gắn lại. Bỏ: mọi tài khoản cũ, lớp giả, bài nộp giả, lịch giả.
 */
export function migrateV2(old) {
  const d = emptyDb();
  if (!old || typeof old !== 'object') return d;
  const idMap = {};
  for (const u of old.users || []) {
    if (u?.role !== 'student') continue;
    const ms = normMssv(u.mssv || u.username);
    if (MSSV_RE.test(ms)) idMap[u.id] = studentId(ms);
  }
  const rekey = (key) => { const [uid, lab] = String(key).split('|'); return idMap[uid] && lab ? `${idMap[uid]}|${lab}` : null; };
  for (const [k, v] of Object.entries(old.projects || {})) { const nk = rekey(k); if (nk && v?.project) d.projects[nk] = v; }
  for (const [k, v] of Object.entries(old.submissions || {})) {
    const nk = rekey(k);
    if (nk && v?.project) d.submissions[nk] = { ...v, userId: nk.split('|')[0] }; // bài nộp giả có project = null
  }
  d.migratedFrom = 2;
  return d;
}

let memo = null;
function db() {
  if (memo) return memo;
  let d = storage.get(K.db);
  if (!d || !Array.isArray(d.users)) {
    const old = storage.get(K.oldDb);
    d = old ? migrateV2(old) : emptyDb();
    storage.set(K.db, d);
    if (old) { storage.remove(K.oldDb); storage.remove(K.oldSession); }
  }
  for (const f of ['projects', 'submissions', 'faults', 'schedules']) if (!d[f] || typeof d[f] !== 'object') d[f] = {};
  memo = d;
  return d;
}
// Tab khác ghi dữ liệu → đọc lại.
try { window.addEventListener('storage', (e) => { if (e.key === K.db) memo = null; }); } catch { /* bỏ qua */ }
function save(d) { memo = d; storage.set(K.db, d); }

function me() {
  const s = storage.get(K.session);
  if (!s) return null;
  if (s.userId === TEACHER.id) return PUBLIC_MODE && !s.verified ? null : { ...TEACHER };
  return db().users.find((u) => u.id === s.userId && u.role === 'student') || null;
}
function need() { const u = me(); if (!u) throw new Error(t('api.needLogin')); return u; }
function needTeacher() { const u = need(); if (u.role !== 'teacher') throw new Error(t('api.forbidden')); return u; }
const students = (d) => d.users.filter((u) => u.role === 'student');
const hasData = (d, uid) => Object.keys(d.projects).some((k) => k.startsWith(uid + '|')) || Object.keys(d.submissions).some((k) => k.startsWith(uid + '|'));

/** Lịch lab của 1 lớp: mặc định mở mọi lab có máy; giảng viên chỉnh trên máy mình (chỉ áp dụng trình duyệt này). */
function scheduleOf(d, classId) {
  const over = d.schedules[classId] || {};
  const out = {};
  for (const c of COURSE) out[c.id] = { open: !!c.machineId, week: c.week, due: '', ...(over[c.id] || {}) };
  return out;
}

export const api = {
  /** Đăng ký sinh viên → đăng nhập luôn. Trả { user, restored } (restored: có bài làm cũ của MSSV này). */
  async register({ name, classId, mssv }) {
    const nm = normName(name), ms = normMssv(mssv), cid = String(classId || '').trim();
    if (nm.length < 2) throw new Error(t('reg.errName'));
    if (nm.length > 80) throw new Error(t('api.nameLong'));
    if (!cid) throw new Error(t('reg.errClass'));
    if (!MSSV_RE.test(ms)) throw new Error(t('reg.errMssv'));
    const classes = await loadClassesSafe();
    const cls = classes.find((c) => c.id === cid);
    if (!cls) throw new Error(t('api.classUnknown'));
    const d = db();
    if (d.users.some((u) => u.mssv === ms)) throw new Error(t('api.mssvTaken', { mssv: ms }));
    const u = { id: studentId(ms), username: ms, mssv: ms, name: nm, role: 'student', classId: cls.id, className: cls.name, createdAt: Date.now() };
    d.users.push(u);
    save(d);
    storage.set(K.session, { userId: u.id });
    return delay({ user: clone(u), restored: hasData(d, u.id) });
  },
  async loginStudent({ mssv }) {
    const ms = normMssv(mssv);
    if (!MSSV_RE.test(ms)) throw new Error(t('reg.errMssv'));
    const u = students(db()).find((x) => x.mssv === ms);
    if (!u) throw new Error(t('api.mssvUnknown', { mssv: ms }));
    storage.set(K.session, { userId: u.id });
    return delay({ user: clone(u) });
  },
  /** Trên máy (localhost): vào thẳng nếu chưa đặt mật khẩu. Trên web: bắt buộc mật khẩu (data/teacher.json). */
  async loginTeacher(password) {
    const cfg = await loadTeacherConfig();
    if (PUBLIC_MODE || cfg) {
      if (!password) throw new Error(t('api.teacherPassNeed'));
      if (!(await verifyTeacherPassword(password))) throw new Error(t('api.teacherPassBad'));
    }
    storage.set(K.session, { userId: TEACHER.id, verified: true });
    return delay({ user: { ...TEACHER } });
  },
  async logout() { storage.remove(K.session); return delay(true, 10); },
  async getMe() { return delay(clone(me()), 5); },
  /** Số tài khoản SV đã đăng ký trên trình duyệt này (để chọn tab mặc định ở trang đăng nhập). */
  localStudentCount() { return students(db()).length; },

  async listClasses() {
    const u = need(); const d = db();
    const file = await loadClassesSafe();
    if (u.role !== 'teacher') {
      const c = file.find((x) => x.id === u.classId);
      return delay([c ? { ...c } : { id: u.classId, name: u.className || u.classId, term: '' }]);
    }
    // Giảng viên: lớp trong file + lớp "mồ côi" (SV đã đăng ký với mã lớp không còn trong file).
    const list = file.map((c) => ({ ...c, inFile: true }));
    for (const s of students(d)) if (s.classId && !list.some((c) => c.id === s.classId)) list.push({ id: s.classId, name: s.className || s.classId, term: '', inFile: false });
    return delay(list.map((c) => ({ ...c, studentCount: students(d).filter((s) => s.classId === c.id).length })));
  },
  async getClass(id) {
    needTeacher(); const d = db();
    const file = await loadClassesSafe();
    const st = students(d).filter((s) => s.classId === id);
    const c = file.find((x) => x.id === id) || (st.length ? { id, name: st[0].className || id, term: '' } : null);
    if (!c) throw new Error(t('api.classNotFound'));
    st.sort((a, b) => a.mssv.localeCompare(b.mssv));
    return delay({ ...c, schedule: scheduleOf(d, id), students: clone(st) });
  },
  /** Danh sách lab + lịch + trạng thái của người dùng hiện tại. */
  async listLabs(classId) {
    const u = need(); const d = db();
    const sch = scheduleOf(d, classId || u.classId || '');
    return delay(COURSE.map((l) => {
      const sub = d.submissions[`${u.id}|${l.id}`];
      const proj = d.projects[`${u.id}|${l.id}`];
      const status = sub ? (sub.passed ? 'passed' : 'submitted') : proj ? 'doing' : 'todo';
      return { ...l, ...sch[l.id], status, score: sub?.score ?? null, max: sub?.max ?? null };
    }));
  },
  async getProject(labId, userId) {
    const u = need(); const d = db();
    const uid = userId && u.role === 'teacher' ? userId : u.id;
    return delay(clone(d.projects[`${uid}|${labId}`]?.project || null), 10);
  },
  async saveProject(labId, project) {
    const u = need(); const d = db();
    d.projects[`${u.id}|${labId}`] = { project: clone(project), at: Date.now() };
    save(d); return delay({ ok: true, at: Date.now() }, 10);
  },
  async submit(labId, project, result) {
    const u = need(); const d = db();
    const sub = { userId: u.id, labId, project: clone(project), at: Date.now(), score: result?.score ?? 0, max: result?.max ?? 100, passed: !!result?.passed, criteria: clone(result?.criteria || []) };
    d.submissions[`${u.id}|${labId}`] = sub; save(d);
    return delay(clone(sub), 150);
  },
  async getSubmission(labId, userId) {
    const u = need(); const d = db();
    const uid = userId && u.role === 'teacher' ? userId : u.id;
    return delay(clone(d.submissions[`${uid}|${labId}`] || null), 10);
  },
  async getGradebook(classId) {
    needTeacher(); const d = db();
    const st = students(d).filter((s) => s.classId === classId).sort((a, b) => a.mssv.localeCompare(b.mssv));
    const grades = {};
    for (const s of st) {
      grades[s.id] = {};
      for (const l of COURSE) { const sub = d.submissions[`${s.id}|${l.id}`]; if (sub) grades[s.id][l.id] = { score: sub.score, max: sub.max, passed: sub.passed, at: sub.at }; }
    }
    return delay({ classId, students: clone(st), labs: COURSE.map((l) => ({ id: l.id, title: l.title, part: l.part })), grades: clone(grades), schedule: scheduleOf(d, classId) });
  },
  async updateSchedule(classId, labId, patch) {
    needTeacher(); const d = db();
    const s = (d.schedules[classId] ||= {});
    s[labId] = { ...(s[labId] || {}), ...patch }; save(d);
    return delay(clone(scheduleOf(d, classId)[labId]), 10);
  },
  /** Giảng viên gán lỗi cho 1 SV / 1 lab (chỉ có tác dụng trên trình duyệt này). */
  async setFaults(studentId_, labId, faultIds) {
    needTeacher();
    const d = db(); d.faults[`${studentId_}|${labId}`] = [...faultIds]; save(d);
    return delay(true, 10);
  },
  async getFaults(labId, userId) {
    const u = need(); const d = db();
    const uid = userId && u.role === 'teacher' ? userId : u.id;
    return delay(clone(d.faults[`${uid}|${labId}`] || []), 5);
  },
  async getUser(id) { need(); return delay(clone(db().users.find((u) => u.id === id) || null), 5); },
};
