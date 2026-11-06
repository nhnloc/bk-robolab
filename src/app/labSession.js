// Phiên mô phỏng: 1 máy + 1 PLC nối bus I/O. Dùng ở trang Lab, trang xem bài và trang cài lỗi.
import { loadEngine, mergeCourse, defaultProject, normLab } from './engine.js';
import { clone } from './dom.js';
import { COURSE } from './course.js';
import { trLab } from './loc.js';

let labsCache = null;
const courseIds = new Set(COURSE.map((c) => c.id));
/** Lab đã dịch theo ngôn ngữ hiện tại (chỉ các trường hiển thị; lab.raw giữ nguyên bản gốc cho engine/chấm). */
function localize(l) {
  const c = courseIds.has(l.id) ? COURSE.find((x) => x.id === l.id) : null;
  if (!l.raw) return c ? { ...l, title: c.title } : l;
  const tr = trLab(l.raw);
  const n = tr && tr !== l.raw ? normLab(tr) : null;
  return {
    ...l,
    title: c ? c.title : n?.title || l.title,
    ...(n ? { summary: n.summary, objectives: n.objectives, steps: n.steps, hints: n.hints } : {}),
  };
}
/** Danh sách lab (khung khóa học + engine), dịch lúc gọi — mỗi trang gọi lại khi vẽ. */
export async function getLabs() {
  const eng = await loadEngine();
  if (!labsCache) labsCache = mergeCourse(eng.LABS, eng.MACHINES);
  return labsCache.map(localize);
}
export async function getLab(id) { return (await getLabs()).find((l) => l.id === id) || null; }

/** Project khởi đầu cho lab (prev: project các lab trước để kế thừa chương trình). */
export function starterFor(eng, lab, def, prev = {}) {
  try { if (eng.starterProject && lab.raw) return eng.starterProject(lab, prev); } catch (e) { console.warn(e); }
  if (lab.starter) return clone(lab.starter);
  return defaultProject(lab.machineId, def, `${lab.id} — ${lab.title}`);
}

/** Phiên mô phỏng: 1 trạm (robot + MC) + đồng hồ. */
export function createSession(eng, machineId, { faults = [], cellOpts = {} } = {}) {
  const cell = eng.createMachine(machineId, cellOpts);
  for (const f of faults) { try { cell.setFault(f, true); } catch { /* bỏ qua */ } }
  const rt = new eng.CellRuntime(cell);
  let loadedMc = null;
  return {
    cell, rt, m: cell, robot: cell.robot, mc: cell.mc,
    /** Nạp chương trình MC (ladder + motion + cấu hình). */
    loadMc(mc) {
      if (!cell.mc || !mc) return { ok: true, errors: [] };
      const res = cell.mc.load(mc);
      if (res.ok) loadedMc = JSON.stringify(mc);
      return res;
    },
    isMcLoaded(mc) { return loadedMc !== null && loadedMc === JSON.stringify(mc); },
    dispose() { try { cell.mc?.stop(); } catch { /* bỏ qua */ } rt.dispose(); },
  };
}
