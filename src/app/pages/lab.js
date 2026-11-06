// Trang Lab robot: hướng dẫn | [Teach Pendant / MPE720 / Kết quả] | trạm 3D + Control Panel.
import { h, debounce } from '../dom.js';
import { t, fmtTime } from '../i18n.js';
import { trText } from '../loc.js';
import { api } from '../mockApi.js';
import { loadEngine } from '../engine.js';
import { icon } from '../components/icons.js';
import { split, toast, confirmBox } from '../components/ui.js';
import { storage } from '../store.js';
import { getLab, createSession, starterFor } from '../labSession.js';
import { createGuidePanel } from '../machine/guidePanel.js';
import { loadLectures, lectureFor, hasSeenLab, markSeenLab } from '../lectures.js';
import { createResultsPanel } from '../machine/resultsPanel.js';
import { createPendant } from '../robot/pendant.js';
import { createCellView } from '../robot/cellView.js';
import { createMpe } from '../mpe/mpe.js';
import { createPcApp } from '../pc/pcApp.js';
import { openDemo, demoIndex } from '../robot/demoPlayer.js';
import { PALETTE, PUCK, slotXY } from '../../sim/layout.js';

const errText = (e) => `${e.block || ''}${e.network !== undefined ? ` NW${+e.network + 1}` : ''}${e.line ? ` dòng ${e.line}` : ''}: ${trText(e.message)}`;

export async function labPage({ id }, { user }) {
  const [eng, lab, labsMeta, LECTURES] = await Promise.all([loadEngine(), getLab(id), api.listLabs(user.classId), loadLectures()]);
  if (!lab || !lab.machineId) throw new Error(t('lab.notFound', { id }));
  const meta = labsMeta.find((l) => l.id === id);
  if (meta && !meta.open) throw new Error(t('lab.locked'));
  const raw = lab.raw || lab;
  const tools = raw.tools || ['pendant'];

  const sess = createSession(eng, lab.machineId, { faults: await api.getFaults(id), cellOpts: raw.cellOpts || {} });
  const { cell, robot } = sess;
  const def = cell.def;
  const saved = await api.getProject(id);
  let project = saved;
  if (!project) {
    const prev = {};
    for (const pid of raw.inherit || []) { const p = await api.getProject(pid); if (p) prev[pid] = p; }
    project = starterFor(eng, lab, def, prev);
    api.saveProject(id, project);
    if (Object.keys(prev).length) toast(`Đã kế thừa chương trình từ ${Object.keys(prev)[0]}`, 'info', 3500);
  }
  project.robot ||= { jobs: [], pvars: {}, master: null };
  project.evidence ||= {};
  robot.loadProgram(project.robot);
  if (raw.setup?.scene) cell.setup?.(raw.setup.scene);
  const disposers = [];

  /* ---------- lưu ---------- */
  const saveState = h('span.save-state.muted.small');
  let resetting = false;
  const autosave = debounce(() => { if (resetting) return; api.saveProject(id, project).then(() => { saveState.textContent = t('lab.saved', { time: fmtTime() }); }).catch((e) => console.warn(e)); }, 800);
  const changed = () => { saveState.textContent = t('lab.saving'); autosave(); };
  disposers.push(() => autosave.flush?.());

  /* ---------- công cụ ---------- */
  const pendant = tools.includes('pendant') ? createPendant({ robot, cell, def, onChange: changed }) : null;
  const mpe = tools.includes('mpe') && project.mc ? createMpe({ project, sess, onChange: changed }) : null;
  const pcApp = tools.includes('code') ? createPcApp({ project, sess, labId: lab.id, onChange: changed }) : null;
  if (pcApp) disposers.push(() => pcApp.dispose());
  if (pendant) disposers.push(() => pendant.dispose());
  if (mpe) disposers.push(() => mpe.dispose());

  const extra = [];
  if (cell.mc) {
    extra.push({ label: 'Lấy vật ở vị trí gắp', title: 'Giả làm robot nhấc vật ở cuối băng tải đi', run: () => { const it = cell.items.filter((x) => x.on === 'conveyor').sort((a, b) => b.x - a.x)[0]; if (it) cell.items = cell.items.filter((x) => x !== it); } });
    extra.push({ label: 'Giả lập robot đặt vật', title: 'Đặt 1 vật lên khe mâm phía robot và phát xung OT#3 (DI_12) 150 ms', run: () => {
      const k = cell.robotSlot(); const [x, y] = slotXY(k, cell.mc.axes.A1.phys);
      if (!cell.items.some((it) => it.on === 'rotary' && it.slot === k)) cell.puck(x, y, 40, { on: 'rotary', slot: k, label: 'R' });
      robot.OT[3] = true; setTimeout(() => { robot.OT[3] = false; }, 150);
    } });
  }
  const cv = createCellView({ cell, extraActions: extra });
  disposers.push(() => cv.dispose());

  /* ---------- thanh công cụ ---------- */
  const stLed = h('span.cpu-led'), stText = h('span.cpu-state', 'STOP');
  const btnRun = h('button.btn.run', { type: 'button', onclick: () => run() }, icon('play', { size: 14 }), 'RUN');
  const btnStop = h('button.btn.stopb', { type: 'button', onclick: () => stop() }, icon('stop', { size: 14 }), 'STOP');
  const btnMon = h('button.btn', { type: 'button', 'aria-pressed': 'false', title: t('lab.monitorTip'), onclick: () => setMonitor(!monitor) }, icon('eye', { size: 15 }), h('span.hide-mid', t('lab.monitor')));
  const mcTools = mpe ? [
    h('span.tb-sep'), h('b.small', 'MP3300'),
    h('button.btn', { type: 'button', onclick: () => compile(), title: 'Biên dịch ladder + motion (F7)' }, icon('compile', { size: 15 }), h('span.hide-mid', t('lab.compile'))),
    h('button.btn', { type: 'button', onclick: () => download(), title: 'Nạp chương trình + cấu hình xuống MP3300 (Ctrl+L)' }, icon('download', { size: 15 }), h('span.hide-mid', t('lab.download'))),
    h('div.cpu-box', stLed, stText), btnRun, btnStop, btnMon,
  ] : [];
  const btnDemo = h('button.btn.demo-btn', { type: 'button', disabled: true, title: 'Chưa có bản chạy thử mẫu', onclick: () => openDemo(lab.id).catch((e) => toast(e.message, 'err')) }, icon('film', { size: 15 }), h('span.hide-mid', 'Chạy thử mẫu'));
  demoIndex().then((idx) => { if (idx[lab.id]) { btnDemo.disabled = false; btnDemo.title = 'Xem trạm chạy theo lời giải mẫu (không có code) trước khi tự lập trình'; } });
  const sceneSel = raw.setup?.scenes?.length > 1 ? h('label.small.scene-sel', t('rl.scene') + ' ',
    h('select.input.sm', { onchange: (e) => { cell.setup(e.target.value); toast('Đã đặt lại vật trên pallet', 'info', 1500); } },
      raw.setup.scenes.map((s) => h('option', { value: s, selected: s === raw.setup.scene }, t('rl.scene' + s))))) : null;
  const toolbar = h('div.lab-toolbar', { role: 'toolbar' },
    h('a.btn.ghost.sm', { href: '#/home', title: t('nav.home') }, icon('chevronL', { size: 14 }), h('span.lab-tb-id', lab.id)),
    ...mcTools,
    sceneSel ? h('span.tb-sep') : null, sceneSel,
    h('span.tb-sep'), btnDemo,
    h('span.spacer'), saveState,
    h('button.btn.ghost', { type: 'button', title: t('rl.resetCellTip'), onclick: resetCell }, icon('reset', { size: 15 }), h('span.hide-lg', t('rl.resetCell'))),
    h('button.btn.ghost', { type: 'button', title: 'Bỏ toàn bộ chương trình đã làm của bài này, nạp lại bản khởi đầu', onclick: restoreStarter }, icon('undo', { size: 15 }), h('span.hide-lg', 'Làm lại từ đầu')),
    h('button.btn', { type: 'button', onclick: () => grade(false) }, icon('check', { size: 15 }), h('span.hide-mid', t('rl.check'))),
    h('button.btn.primary', { type: 'button', onclick: () => submit() }, icon('send', { size: 15 }), t('lab.submit')));

  async function restoreStarter() {
    if (!(await confirmBox('Làm lại từ đầu', `Xóa mọi job, điểm P, ladder, motion, mã PC đã làm ở ${lab.id} và nạp lại bản khởi đầu? Không hoàn tác được (bài đã nộp vẫn giữ nguyên).`, 'Làm lại'))) return;
    resetting = true; autosave.cancel();
    const prev = {};
    for (const pid of raw.inherit || []) { const p = await api.getProject(pid); if (p) prev[pid] = p; }
    await api.saveProject(id, starterFor(eng, lab, def, prev));
    location.reload();
  }
  function resetCell() {
    const wasRun = cell.mc?.state === 'RUN';
    cell.reset();
    robot.loadProgram(project.robot);
    if (raw.setup?.scene) cell.setup?.(sceneSel?.querySelector('select').value || raw.setup.scene);
    if (wasRun) { sess.loadMc(project.mc); cell.mc.start(); }
    pendant?.render();
    toast(t('lab.machineReset'), 'info', 1500);
  }

  /* ---------- MP3300 ---------- */
  let monitor = false;
  function setMonitor(on) { monitor = on; btnMon.setAttribute('aria-pressed', String(on)); btnMon.classList.toggle('on', on); mpe?.setMonitor(on); }
  function updateState() {
    if (!cell.mc) return;
    const s = cell.mc.state;
    stText.textContent = s; stLed.className = 'cpu-led ' + (s === 'RUN' ? 'run' : 'stop');
    btnRun.disabled = s === 'RUN'; btnStop.disabled = s !== 'RUN';
  }
  function compile() {
    mpe.flush();
    let res; try { res = cell.mc.compile(project.mc); } catch (e) { res = { ok: false, errors: [{ block: '—', message: String(e.message || e) }] }; }
    mpe.showCompile(res);
    toast(res.ok ? t('lab.compileOk') : t('lab.compileErrN', { n: res.errors.length }), res.ok ? 'ok' : 'err', 2200);
    return res;
  }
  function download() {
    mpe.flush();
    const wasRun = cell.mc.state === 'RUN';
    let res; try { res = sess.loadMc(project.mc); } catch (e) { res = { ok: false, errors: [{ block: '—', message: String(e.message || e) }] }; }
    mpe.showCompile(res);
    if (res.ok) { mpe.diag(() => t('lab.diagLoaded')); toast(wasRun ? t('lab.loadedStopped') : t('lab.loaded'), 'ok', 2200); }
    else toast(t('lab.compileErrN', { n: res.errors.length }), 'err');
    updateState();
    return res.ok;
  }
  function run() {
    mpe.flush();
    if (!sess.isMcLoaded(project.mc)) { if (!download()) return; }
    cell.mc.start(); mpe.diag(() => t('lab.diagRun')); updateState();
  }
  function stop() { cell.mc.stop(); mpe.diag(() => t('lab.diagStop')); updateState(); }
  if (cell.mc) {
    const off = cell.mc.on('error', (e) => { mpe.diag(() => t('lab.diagError') + ' ' + errText(e), 'err'); toast(t('lab.runtimeErr') + ' ' + trText(e.message), 'err', 5000); updateState(); });
    disposers.push(off);
  }
  updateState();

  /* ---------- bằng chứng vận hành bằng tay (R01) ---------- */
  const ev = project.evidence;
  const at = (label, name, lvl) => cell.items.some((it) => it.label === String(label) && !it.held && Math.hypot(it.x - PALETTE.cells[name][0], it.y - PALETTE.cells[name][1]) <= 8 && Math.abs(it.z - (PALETTE.top + lvl * PUCK.h)) < 1.5);
  function trackEvidence() {
    if (!raw.grading?.live) return;
    let ch = false;
    const coords = new Set(ev.coords || []);
    for (const c of robot.stats.coordsUsed) if (!coords.has(c)) { coords.add(c); ch = true; }
    ev.coords = [...coords];
    const set = (k, v) => { if (v && !ev[k]) { ev[k] = true; ch = true; toast(`✓ ${{ servo: 'Bật servo', home: 'Về Home', a12: 'A1→B, A2→C', a123: 'Xếp chồng A1, A2, A3 ở B' }[k]}`, 'ok', 2500); } };
    set('servo', robot.stats.servoOnCount > 0 && robot.mode === 'TEACH');
    set('home', robot.stats.jogTime > 2000 && robot.q.every((v) => Math.abs(v) < 0.5));
    if (cell.scene === 'A12') set('a12', at(1, 'B', 0) && at(2, 'C', 0));
    if (cell.scene === 'A123') set('a123', at(1, 'B', 0) && at(2, 'B', 1) && at(3, 'B', 2));
    if (ch) changed();
  }

  const tick = setInterval(() => { mpe?.tick(); trackEvidence(); if (cell.mc && cell.mc.state !== stText.textContent) updateState(); }, 150);
  disposers.push(() => clearInterval(tick));

  /* ---------- bố cục ---------- */
  const results = createResultsPanel({ onGrade: () => grade(false), onSubmit: () => submit() });
  const tabsDef = [pcApp ? ['pc', 'PC App', pcApp.el] : null, pendant ? ['pendant', t('rl.pendant'), pendant.el] : null, mpe ? ['mpe', t('rl.mpe'), mpe.el] : null, ['res', t('rl.result'), results.el]].filter(Boolean);
  const tabBtns = h('div.lab-tabs.rl-tabs', { role: 'tablist' }, ...tabsDef.map(([tid, label]) => h('button.rl-tab', { type: 'button', role: 'tab', dataset: { id: tid }, onclick: () => showTab(tid) }, label)));
  const panes = Object.fromEntries(tabsDef.map(([tid, , node]) => [tid, h('div.tab-pane.rl-pane', { hidden: true }, node)]));
  function showTab(tid) {
    tabBtns.querySelectorAll('.rl-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === tid)));
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== tid;
    storage.set('bk.rl.tab.' + id, tid);
  }
  const left = h('div.rl-left', tabBtns, ...Object.values(panes));
  const work = split({ dir: 'h', a: left, b: cv.el, ratio: tools.includes('mpe') || tools.includes('code') ? 0.58 : 0.5, min: 320, key: 'rl-main' });

  const lecture = lectureFor(LECTURES, lab);
  const firstVisit = !!lecture && !hasSeenLab(user.id, lab.id);
  markSeenLab(user.id, lab.id);
  let body = null;
  const guide = createGuidePanel({
    lab, def, lecture, userId: user.id, initialTab: firstVisit ? 'lecture' : 'task',
    onCollapse: () => toggleGuide(false),
    onTab: (tb) => { body?.classList.toggle('lecture-tab', tb === 'lecture'); if (tb !== 'lecture') setReading(false); },
    onWide: (on) => setReading(on ?? !body.classList.contains('reading')),
  });
  const guideRail = h('button.guide-rail', { type: 'button', title: t('guide.expand'), onclick: () => toggleGuide(true) }, icon('book', { size: 16 }), h('span', t('guide.title')));
  body = h('div.lab-body', guide.el, guideRail, h('div.lab-main', work));
  body.classList.toggle('lecture-tab', guide.tab === 'lecture');
  function toggleGuide(open) { body.classList.toggle('guide-closed', !open); storage.set('bk.lab.guide', open); if (!open) setReading(false); }
  function setReading(on) { if (!body) return; body.classList.toggle('reading', !!on); guide.el.querySelector('.wide-btn')?.setAttribute('aria-pressed', String(!!on)); }
  toggleGuide(firstVisit || storage.get('bk.lab.guide', window.innerWidth >= 1500));
  showTab(storage.get('bk.rl.tab.' + id, tabsDef[0][0]) in panes ? storage.get('bk.rl.tab.' + id, tabsDef[0][0]) : tabsDef[0][0]);

  /* ---------- chấm / nộp ---------- */
  const prevSub = await api.getSubmission(id);
  if (prevSub) results.show(prevSub, { key: 'res.prevSubmission' });
  let grading = false;
  async function grade(doSubmit) {
    if (grading) return null;
    grading = true; mpe?.flush();
    showTab('res'); results.setBusy(true, 0);
    try {
      const res = await eng.grade(lab, project, (f) => results.setBusy(true, f), { live: raw.grading?.live ? ev : null });
      if (!res) { results.show(null, { key: 'res.noGrader' }); return null; }
      if (doSubmit) {
        const sub = await api.submit(id, project, res);
        results.show(sub, { key: 'res.submitted', cls: 'ok-text' });
        toast(t('res.submittedToast', { s: res.score, m: res.max }), 'ok', 4000);
      } else results.show(res, { key: 'res.tryNote' });
      return res;
    } catch (e) { console.error(e); toast(t('res.gradeErr') + ' ' + trText(String(e.message || e)), 'err'); return null; }
    finally { grading = false; results.setBusy(false); }
  }
  async function submit() {
    if (!(await confirmBox(t('lab.submitTitle'), t('lab.submitMsg'), t('lab.submit')))) return;
    await grade(true);
  }

  const onKey = (e) => {
    if (e.key === 'Escape' && body.classList.contains('reading')) { setReading(false); return; }
    if (!mpe) return;
    if (e.key === 'F7') { e.preventDefault(); compile(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); download(); }
  };
  window.addEventListener('keydown', onKey);
  disposers.push(() => window.removeEventListener('keydown', onKey));

  const el = h('div.lab-page.robo', toolbar, body);
  window.__bk = { cell, robot, mc: cell.mc, project, lab, sess };
  return {
    el,
    dispose() {
      disposers.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
      api.saveProject(id, project);
      if (window.__bk?.cell === cell) delete window.__bk;
      sess.dispose();
    },
  };
}
