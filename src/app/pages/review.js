// Giảng viên xem bài nộp của SV (chỉ đọc) hoặc lời giải tham khảo: pendant / MPE720 chỉ đọc + chạy thử trên trạm + chấm lại.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { trText } from '../loc.js';
import { api } from '../mockApi.js';
import { loadEngine } from '../engine.js';
import { icon } from '../components/icons.js';
import { split, toast } from '../components/ui.js';
import { getLab, createSession, starterFor } from '../labSession.js';
import { renderResult } from '../machine/resultsPanel.js';
import { createPendant } from '../robot/pendant.js';
import { createCellView } from '../robot/cellView.js';
import { createMpe } from '../mpe/mpe.js';
import { createPcApp } from '../pc/pcApp.js';

export async function reviewPage({ student, lab: labId, solution }) {
  const [eng, lab] = await Promise.all([loadEngine(), getLab(labId)]);
  if (!lab?.machineId) throw new Error(t('lab.notFound', { id: labId }));
  const raw = lab.raw || lab;
  const sess = createSession(eng, lab.machineId, { cellOpts: raw.cellOpts || {} });
  const { cell, robot } = sess;
  let project, sub = null, who = '';
  if (solution) {
    project = eng.solutionProject ? eng.solutionProject(lab) : null;
    if (!project) project = starterFor(eng, lab, cell.def);
    who = t('review.solution');
  } else {
    const u = await api.getUser(student);
    who = u ? `${u.name} (${u.mssv || u.username})` : student;
    sub = await api.getSubmission(labId, student);
    project = sub?.project || (await api.getProject(labId, student));
    if (!project) { project = starterFor(eng, lab, cell.def); who += ' — ' + t('review.noProject'); }
  }
  project = JSON.parse(JSON.stringify(project));
  project.robot ||= { jobs: [], pvars: {} };
  robot.loadProgram(project.robot);
  if (raw.setup?.scene) cell.setup?.(raw.setup.scene);
  const tools = raw.tools || ['pendant'];
  // Giảng viên được thao tác pendant (chạy thử) nhưng thay đổi không lưu vào bài của SV.
  const pendant = tools.includes('pendant') ? createPendant({ robot, cell, def: cell.def }) : null;
  const mpe = project.mc && cell.mc ? createMpe({ project, sess, readOnly: true }) : null;
  const pcApp = tools.includes('code') ? createPcApp({ project, sess, labId: lab.id }) : null;
  const res = mpe ? sess.loadMc(project.mc) : { ok: true, errors: [] };
  if (mpe) mpe.showCompile(res);
  const cv = createCellView({ cell });

  let regraded = null;
  const regrade = h('button.btn', { type: 'button', onclick: async () => {
    regrade.disabled = true;
    try { regraded = await eng.grade(lab, project, null, { live: raw.grading?.live ? project.evidence : null }); resBox.replaceChildren(renderResult(regraded, { title: t('review.regraded') })); } catch (e) { toast(trText(String(e.message || e)), 'err'); }
    regrade.disabled = false;
  } }, icon('check', { size: 14 }), t('review.regrade'));
  const resBox = h('div.review-res', sub ? renderResult(sub, { title: t('review.submitted') }) : h('p.muted.pad', solution ? t('review.solutionNote') : t('res.none')));
  const stText = h('span.cpu-state', cell.mc ? cell.mc.state : '');
  const toolbar = h('div.lab-toolbar',
    h('a.btn.ghost.sm', { href: '#/teacher', onclick: (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, icon('chevronL', { size: 14 }), t('common.back')),
    h('b', `${lab.id} · ${who}`), solution ? h('span.badge.warn', t('review.teacherOnly')) : h('span.badge', t('studio.readOnly')),
    cell.mc ? h('span.tb-sep') : null,
    cell.mc ? h('button.btn.run', { type: 'button', disabled: !res.ok, onclick: () => cell.mc.start() }, icon('play', { size: 14 }), 'RUN') : null,
    cell.mc ? h('button.btn.stopb', { type: 'button', onclick: () => cell.mc.stop() }, icon('stop', { size: 14 }), 'STOP') : null,
    cell.mc ? h('div.cpu-box', stText) : null,
    h('span.spacer'), regrade);
  const tick = setInterval(() => { mpe?.tick(); if (cell.mc) stText.textContent = cell.mc.state; }, 200);
  const tabsEl = h('div.rl-left',
    h('div.lab-tabs.rl-tabs', ...[pcApp ? ['c', 'PC App'] : null, pendant ? ['p', t('rl.pendant')] : null, mpe ? ['m', t('rl.mpe')] : null].filter(Boolean).map(([k, l], i) => h('button.rl-tab', { type: 'button', 'aria-selected': String(i === 0), onclick: (e) => { e.currentTarget.parentNode.querySelectorAll('.rl-tab').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); if (pp) pp.hidden = k !== 'p'; if (mp) mp.hidden = k !== 'm'; if (cp) cp.hidden = k !== 'c'; } }, l))));
  const cp = pcApp ? h('div.tab-pane.rl-pane', pcApp.el) : null;
  if (cp) tabsEl.append(cp);
  const pp = pendant ? h('div.tab-pane.rl-pane', { hidden: !!pcApp }, pendant.el) : null;
  const mp = mpe ? h('div.tab-pane.rl-pane', { hidden: !!pendant }, mpe.el) : null;
  if (pp) tabsEl.append(pp); if (mp) tabsEl.append(mp);
  const main = split({ dir: 'h', a: tabsEl, b: cv.el, ratio: 0.55, min: 300, key: 'review-main' });
  const el = h('div.lab-page.robo', toolbar, h('div.review-body', main, h('aside.review-side', resBox)));
  return {
    el,
    dispose() { clearInterval(tick); pcApp?.dispose(); pendant?.dispose(); mpe?.dispose(); cv.dispose(); sess.dispose(); },
  };
}
