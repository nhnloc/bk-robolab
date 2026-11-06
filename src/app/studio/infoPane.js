// Ô dưới: Thuộc tính | Thông tin (kết quả biên dịch) | Chẩn đoán (lỗi khi chạy, sự kiện CPU).
import { h } from '../dom.js';
import { t, fmtTime } from '../i18n.js';
import { trText } from '../loc.js';
import { tabBar } from '../components/ui.js';
import { icon } from '../components/icons.js';

/** keep: getState() trước đó (vẽ lại khi đổi ngôn ngữ). Dòng chẩn đoán: text là chuỗi hoặc hàm () => chuỗi (dịch lúc vẽ). */
export function createInfoPane(ctx, keep) {
  let active = keep?.active || 'props';
  const body = h('div.info-body');
  const counts = { info: h('span.cnt'), diag: h('span.cnt') };
  const bar = tabBar([
    { id: 'props', label: t('info.props') },
    { id: 'info', label: t('info.compile') },
    { id: 'diag', label: t('info.diag') },
  ], active, (id) => { active = id; render(); }, 'info-tabs');
  bar.querySelector('[data-id="info"]').append(counts.info);
  bar.querySelector('[data-id="diag"]').append(counts.diag);
  const el = h('section.info-pane', bar, body);
  let compile = keep?.compile || null; const diag = keep ? [...keep.diag] : []; let propsEl = h('div.muted.pad', t('props.none'));
  const txt = (d) => (typeof d.text === 'function' ? d.text() : d.text);
  function setCounts() {
    const ne = compile?.errors.length || 0;
    counts.info.textContent = ne ? String(ne) : ''; counts.info.className = 'cnt' + (ne ? ' err' : '');
    const nerr = diag.filter((d) => d.kind === 'err').length;
    counts.diag.textContent = nerr ? String(nerr) : ''; counts.diag.className = 'cnt' + (nerr ? ' err' : '');
  }

  function render() {
    bar.setActive(active);
    if (active === 'props') body.replaceChildren(propsEl);
    else if (active === 'info') {
      if (!compile) { body.replaceChildren(h('div.muted.pad', t('info.notCompiled'))); return; }
      const rows = compile.errors.map((e) => h('tr.msg-err', { tabindex: 0, onclick: () => ctx.gotoError(e), onkeydown: (ev) => { if (ev.key === 'Enter') ctx.gotoError(e); } },
        h('td', icon('fault', { size: 14, cls: 'err-text' })), h('td', e.block || '—'), h('td', e.network !== undefined && e.network !== null ? `${t('info.network')} ${+e.network + 1}` : e.line ? `${t('info.line')} ${e.line}` : ''), h('td', trText(e.message))));
      body.replaceChildren(
        h('div.compile-sum', { class: compile.ok ? 'ok' : 'err' }, icon(compile.ok ? 'check' : 'warn', { size: 15 }),
          compile.ok ? t('info.compileOk', { time: fmtTime(compile.at) }) : t('info.compileErr', { n: compile.errors.length, time: fmtTime(compile.at) })),
        rows.length ? h('table.table.msg-table', h('thead', h('tr', h('th', ''), h('th', t('info.block')), h('th', t('info.where')), h('th', t('info.message')))), h('tbody', rows)) : '');
    } else {
      body.replaceChildren(diag.length
        ? h('table.table.msg-table', h('thead', h('tr', h('th', t('info.time')), h('th', t('info.event')))), h('tbody', diag.slice().reverse().map((d) => h('tr', { class: d.kind === 'err' ? 'msg-err' : '' }, h('td.mono', fmtTime(d.at)), h('td', txt(d))))))
        : h('div.muted.pad', t('info.noDiag')));
    }
  }
  setCounts();
  render();
  return {
    el,
    getState: () => ({ active, compile, diag: [...diag] }),
    setCompile(res) {
      compile = { ...res, errors: res.errors || [], at: Date.now() };
      setCounts();
      active = 'info'; render();
    },
    addDiag(text, kind = 'info') {
      diag.push({ text, kind, at: Date.now() });
      if (diag.length > 200) diag.shift();
      setCounts();
      if (active === 'diag') render();
    },
    showDiag() { active = 'diag'; render(); },
    setProps(node) { propsEl = node; if (active === 'props') render(); },
    get errors() { return compile?.errors || []; },
  };
}
