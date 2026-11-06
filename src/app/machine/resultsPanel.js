// Tab "Kết quả chấm": điểm, bảng tiêu chí, nút chấm thử / nộp bài.
import { h } from '../dom.js';
import { t, fmtDateTime } from '../i18n.js';
import { trText } from '../loc.js';
import { icon } from '../components/icons.js';

export function renderResult(res, { title } = {}) {
  if (!res) return h('div.muted.pad', t('res.none'));
  const pct = res.max ? Math.round((res.score / res.max) * 100) : 0;
  return h('div.result',
    h('div.result-head',
      h('div.score-ring', { class: res.passed ? 'ok' : 'err', style: { '--p': pct } }, h('b', String(res.score)), h('span', '/' + res.max)),
      h('div', h('h3', title || t('res.title')), h('div', res.passed ? h('span.badge.ok', t('res.passed')) : h('span.badge.err', t('res.failed'))),
        res.at ? h('div.muted.small', t('res.at', { time: fmtDateTime(res.at) })) : null)),
    h('table.table.res-table', h('thead', h('tr', h('th', ''), h('th', t('res.criterion')), h('th.num', t('res.points')), h('th', t('res.detail')))),
      h('tbody', (res.criteria || []).map((c) => h('tr', h('td', icon(c.ok ? 'check' : 'close', { size: 15, cls: c.ok ? 'ok-text' : 'err-text' })), h('td', trText(c.title)), h('td.num', `${c.points}/${c.max}`), h('td.small.pre', trText(c.message) || ''))))),
    res.stats ? h('details.small', h('summary', t('res.stats')), h('pre.mono.small', JSON.stringify(res.stats, null, 2))) : null);
}

export function createResultsPanel({ onGrade, onSubmit, canSubmit = true }) {
  const body = h('div.res-body');
  const prog = h('div.res-prog', { hidden: true }, h('div.bar'), h('span.small'));
  const btnTry = h('button.btn', { type: 'button', onclick: () => onGrade() }, icon('check', { size: 15 }), t('res.try'));
  const btnSubmit = h('button.btn.primary', { type: 'button', onclick: () => onSubmit(), disabled: !canSubmit }, icon('send', { size: 15 }), t('lab.submit'));
  const el = h('div.results-panel', h('div.res-toolbar', btnTry, btnSubmit, h('span.muted.small', t('res.note')), prog), body);
  let last = null;
  body.append(renderResult(null));
  return {
    el,
    setBusy(b, frac) {
      btnTry.disabled = b; btnSubmit.disabled = b || !canSubmit; prog.hidden = !b;
      if (b) { prog.querySelector('.bar').style.setProperty('--w', Math.round((frac || 0) * 100) + '%'); prog.querySelector('span').textContent = t('res.grading', { p: Math.round((frac || 0) * 100) }); }
    },
    /** note: { key, cls } — ghi chú dưới kết quả (khóa i18n), giữ lại để vẽ lại khi đổi ngôn ngữ. */
    show(res, note) { last = { res, note }; body.replaceChildren(renderResult(res), note?.key ? h('p.small', { class: note.cls || 'muted' }, t(note.key)) : ''); },
    get state() { return last; },
  };
}
