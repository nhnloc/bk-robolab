// Lớp học (giảng viên): Lịch lab (mở/khóa, tuần, hạn nộp) · Sổ điểm (CSV) · Cài lỗi (xem trước trực tiếp) · Sinh viên.
import { h, downloadText } from '../dom.js';
import { t, fmtDateTime } from '../i18n.js';
import { trMachine } from '../loc.js';
import { api } from '../mockApi.js';
import { icon } from '../components/icons.js';
import { tabBar, toast } from '../components/ui.js';
import { MACHINE_TITLES } from '../course.js';
import { createCellView } from '../robot/cellView.js';
import { localNote } from './teacher.js';
import { loadEngine } from '../engine.js';
import { getLabs, createSession, starterFor } from '../labSession.js';

export async function classPage({ id }, { carry } = {}) {
  const [cls, labs, eng] = await Promise.all([api.getClass(id), getLabs(), loadEngine()]);
  // Đổi ngôn ngữ: giữ tab, và ở tab Cài lỗi giữ phiên xem trước đang chạy (SV, lab, lỗi đang bật/đã chọn).
  const keep = carry?.cls?.id === id ? carry.cls : null;
  if (keep) carry.taken = true;
  let tab = keep?.tab || 'grades';
  let detachFault = null; // tab Cài lỗi: tách phiên xem trước để giữ khi đổi ngôn ngữ
  const host = h('div.class-body');
  let cleanup = null;
  const bar = tabBar([
    { id: 'grades', label: t('cls.grades'), icon: 'table' },
    { id: 'schedule', label: t('cls.schedule'), icon: 'lock' },
    { id: 'faults', label: t('cls.faults'), icon: 'fault' },
    { id: 'students', label: t('cls.students'), icon: 'user' },
  ], tab, (x) => { tab = x; render(); });

  async function render() {
    cleanup?.(); cleanup = null; detachFault = null;
    host.replaceChildren(h('div.muted.pad', t('common.loading')));
    if (tab === 'grades') host.replaceChildren(await gradebook());
    else if (tab === 'schedule') host.replaceChildren(await schedule());
    else if (tab === 'faults') { const r = await faultsTab(); host.replaceChildren(r.el); cleanup = r.dispose; detachFault = r.detach; }
    else host.replaceChildren(studentsTab());
  }

  /* ---------- Sổ điểm ---------- */
  async function gradebook() {
    const gb = await api.getGradebook(id);
    if (!gb.students.length) return h('div.card', h('div.empty', t('cls.noStudents')));
    const cols = gb.labs.filter((l) => gb.schedule[l.id]?.open);
    const avg = (sid) => { const g = Object.values(gb.grades[sid] || {}); return g.length ? Math.round(g.reduce((a, x) => a + (x.score / x.max) * 10, 0) / g.length * 10) / 10 : null; };
    const exportCsv = () => {
      const head = [t('cls.csvMssv'), t('cls.name'), ...cols.map((l) => l.id), t('cls.csvAvg')];
      const rows = gb.students.map((s) => [s.mssv || s.username, s.name, ...cols.map((l) => gb.grades[s.id]?.[l.id]?.score ?? ''), avg(s.id) ?? '']);
      const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      downloadText(`${t('cls.csvFile')}_${id}.csv`, csv);
    };
    return h('div.card',
      h('div.card-h', h('b', t('cls.grades')), h('span.muted.small', t('cls.gradesHint')), h('span.spacer'), h('button.btn.sm', { type: 'button', onclick: exportCsv }, icon('csv', { size: 14 }), t('cls.exportCsv'))),
      h('div.gb-wrap', h('table.table.gb',
        h('thead', h('tr', h('th.sticky-col', t('cls.student')), ...cols.map((l) => h('th.num', { title: l.title }, l.id)), h('th.num', t('cls.avg')))),
        h('tbody', gb.students.map((s) => h('tr',
          h('td.sticky-col', h('div', s.name), h('div.muted.small.mono', s.mssv || s.username)),
          ...cols.map((l) => {
            const g = gb.grades[s.id]?.[l.id];
            if (!g) return h('td.num.muted', '—');
            const lab = labs.find((x) => x.id === l.id);
            const cell = h('span.grade', { class: g.passed ? 'ok' : 'err' }, String(g.score));
            return h('td.num', lab?.machineId ? h('a', { href: `#/teacher/review/${encodeURIComponent(s.id)}/${l.id}`, title: t('cls.viewSub') }, cell) : cell);
          }),
          h('td.num', h('b', avg(s.id) ?? '—'))))))));
  }

  /* ---------- Lịch lab ---------- */
  async function schedule() {
    const gb = await api.getGradebook(id);
    const sch = gb.schedule;
    return h('div.card',
      h('div.card-h', h('b', t('cls.schedule')), h('span.muted.small', t('cls.scheduleHint'))),
      h('div.gb-wrap', h('table.table',
        h('thead', h('tr', h('th', t('common.lab')), h('th', t('teacher.labTitle')), h('th', t('cls.part')), h('th', t('cls.open')), h('th', t('teacher.week')), h('th', t('cls.due')))),
        h('tbody', labs.map((l) => {
          const s = sch[l.id] || {};
          const upd = (patch) => api.updateSchedule(id, l.id, patch).then(() => toast(t('cls.savedSchedule', { id: l.id }), 'ok', 1200));
          return h('tr', { class: l.machineId ? '' : 'muted' },
            h('td.mono', l.id), h('td', l.title, l.machineId ? h('span.badge.info.ml', MACHINE_TITLES[l.machineId]) : h('span.badge.ml', t('home.soon'))),
            h('td', String(l.part)),
            h('td', h('label.switch', h('input', { type: 'checkbox', checked: !!s.open, onchange: (e) => upd({ open: e.target.checked }), 'aria-label': t('cls.open') + ' ' + l.id }), h('span.slider'))),
            h('td', h('input.input.sm', { type: 'number', min: 1, max: 15, value: s.week ?? l.week, style: { width: '64px' }, onchange: (e) => upd({ week: +e.target.value }), 'aria-label': t('teacher.week') })),
            h('td', h('input.input.sm', { type: 'date', value: s.due || '', onchange: (e) => upd({ due: e.target.value }), 'aria-label': t('cls.due') })));
        })))));
  }

  /* ---------- Cài lỗi ---------- */
  async function faultsTab() {
    if (!cls.students.length) return { el: h('div.card', h('div.empty', t('cls.noStudents'))), dispose: () => {} };
    const mlabs = labs.filter((l) => l.machineId);
    const fk = keep?.fault;
    if (keep) keep.fault = null; // chỉ dùng lại một lần
    let sid = fk?.sid || cls.students[0]?.id, lid = fk?.lid || mlabs.find((l) => l.machineId)?.id;
    const stuSel = h('select.select', { 'aria-label': t('cls.student'), onchange: (e) => { sid = e.target.value; build(); } }, cls.students.map((s) => h('option', { value: s.id, selected: s.id === sid }, `${s.mssv || s.username} — ${s.name}`)));
    const labSel = h('select.select', { 'aria-label': t('common.lab'), onchange: (e) => { lid = e.target.value; build(); } }, mlabs.map((l) => h('option', { value: l.id, selected: l.id === lid }, `${l.id} — ${l.title}`)));
    const area = h('div.fault-area');
    let sess = null, mv = null, faultState = null;
    const stopAll = () => { mv?.dispose(); sess?.dispose(); mv = null; sess = null; faultState = null; };
    async function build(reuse) {
      if (reuse) { mv?.dispose(); mv = null; } else stopAll();
      const lab = mlabs.find((l) => l.id === lid);
      const assigned = reuse ? reuse.assigned : new Set(await api.getFaults(lid, sid));
      sess = reuse ? reuse.sess : createSession(eng, lab.machineId);
      const sub = await api.getSubmission(lid, sid);
      let res = reuse?.res;
      if (!reuse) {
        const proj = JSON.parse(JSON.stringify(sub?.project || (await api.getProject(lid, sid)) || starterFor(eng, lab, sess.m.def)));
        sess.robot.loadProgram(proj.robot || { jobs: [], pvars: {} });
        res = proj.mc && sess.mc ? sess.loadMc(proj.mc) : { ok: true, errors: [] };
      }
      const src = sub?.project ? t('cls.srcSubmitted') : t('cls.srcStarter');
      const live = reuse ? reuse.live : new Set();
      const ioForced = reuse?.ioForced || new Map();
      faultState = { sid, lid, sess, assigned, live, res, ioForced };
      const faults = trMachine(sess.m.def).faults || [];
      const list = h('div.fault-list', faults.map((f) => {
        const lbl = f.label || f.title || f.id;
        return h('div.fault-row',
          h('label.switch.sm', { title: t('cls.liveTip') }, h('input', { type: 'checkbox', checked: live.has(f.id), onchange: (e) => { sess.m.setFault(f.id, e.target.checked); if (e.target.checked) live.add(f.id); else live.delete(f.id); } }), h('span.slider')),
          h('span.grow', lbl),
          h('label.small.row', h('input', { type: 'checkbox', checked: assigned.has(f.id), onchange: (e) => { if (e.target.checked) assigned.add(f.id); else assigned.delete(f.id); } }), t('cls.assign')));
      }));
      mv = createCellView({ cell: sess.cell });
      const runBtn = h('button.btn.primary.sm', { type: 'button', disabled: !res.ok, onclick: () => { sess.mc?.start(); } }, icon('play', { size: 13 }), 'RUN');
      const stopBtn = h('button.btn.sm', { type: 'button', onclick: () => sess.mc?.stop() }, icon('stop', { size: 13 }), 'STOP');
      area.replaceChildren(
        h('div.fault-side.card',
          h('div.card-h', h('b', t('cls.faultList')), h('span.spacer'), h('span.muted.small', `${t('cls.live')} / ${t('cls.assign')}`)),
          h('div.card-b',
            h('p.small.muted', t('cls.faultHelp')),
            list,
            h('div.row.mt', h('button.btn.primary', { type: 'button', onclick: async () => { await api.setFaults(sid, lid, [...assigned]); toast(t('cls.faultsSaved', { n: assigned.size }), 'ok'); } }, icon('save', { size: 14 }), t('cls.saveFaults'))))),
        h('div.fault-preview.card',
          h('div.card-h', h('b', t('cls.preview')), h('span.badge', src), res.ok ? null : h('span.badge.err', t('cls.compileFail')), h('span.spacer'), runBtn, stopBtn),
          mv.el));
    }
    const el = h('div', h('div.row.wrap.fault-pick', h('label.row', h('span.small.muted', t('cls.student')), stuSel), h('label.row', h('span.small.muted', t('common.lab')), labSel)), area);
    await build(fk && fk.sess ? fk : null);
    const detach = () => { const f = faultState; mv?.dispose(); mv = null; sess = null; faultState = null; return f; };
    return { el, dispose: stopAll, detach };
  }

  /* ---------- Sinh viên ---------- */
  function studentsTab() {
    if (!cls.students.length) return h('div.card', h('div.empty', t('cls.noStudents')));
    return h('div.card', h('table.table',
      h('thead', h('tr', h('th', '#'), h('th', t('cls.csvMssv')), h('th', t('cls.name')), h('th', t('cls.registered')))),
      h('tbody', cls.students.map((s, i) => h('tr', h('td', String(i + 1)), h('td.mono', s.mssv || s.username), h('td', s.name), h('td.muted.small', s.createdAt ? fmtDateTime(s.createdAt) : '—'))))));
  }

  const el = h('div.container.wide',
    h('div.home-head', h('div', h('a.small', { href: '#/teacher' }, '← ' + t('nav.classes')), h('h1', cls.name), h('p.muted', [cls.id, cls.term, t('teacher.students', { n: cls.students.length })].filter(Boolean).join(' · ')))),
    localNote(), bar, host);
  render();
  return {
    el,
    dispose(o) {
      if (o?.relang) {
        const fault = detachFault?.() || null; // phiên xem trước đi theo carry, không dừng
        cleanup?.();
        return { cls: { id, tab, fault }, release: () => fault?.sess?.dispose() };
      }
      cleanup?.();
    },
  };
}
