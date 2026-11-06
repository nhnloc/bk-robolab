// Bảng theo dõi (watch table): toán hạng, định dạng hiển thị, giá trị, ghi (modify), cưỡng bức (force).
import { h, fmtValue } from '../dom.js';
import { t } from '../i18n.js';
import { trText } from '../loc.js';
import { toast } from '../components/ui.js';
import { parseLiteral } from './literal.js';

const FORMATS = ['Auto', 'Bool', 'Dec', 'Hex', 'Bin'];

function fmt(v, f) {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'number' && Number.isInteger(v)) {
    if (f === 'Hex') return '16#' + (v >>> 0).toString(16).toUpperCase().padStart(4, '0');
    if (f === 'Bin') return '2#' + (v >>> 0).toString(2).padStart(16, '0');
  }
  if (f === 'Bool') return v ? 'TRUE' : 'FALSE';
  return fmtValue(v);
}

export function createWatchTable(ctx) {
  const el = h('div.doc-pane');
  const vals = [];
  const forced = ctx.state.forced || (ctx.state.forced = new Map());
  function render() {
    const rows = ctx.project.watch || (ctx.project.watch = []);
    vals.length = 0;
    const tbody = h('tbody');
    rows.forEach((w, i) => {
      const val = h('td.mono.monv');
      vals.push([val, w]);
      const mod = h('input.cell.mono', { value: w.modify ?? '', placeholder: 'TRUE / 12 / T#2s', 'aria-label': t('watch.modifyValue'), spellcheck: 'false',
        onchange: (e) => ctx.commit((p) => { p.watch[i].modify = e.target.value.trim(); }, { keepEditor: true }) });
      const plc = () => ctx.getPlc();
      const doWrite = () => { const v = parseLiteral(mod.value); if (v === undefined) { toast(t('watch.badValue'), 'warn'); return; } try { plc()?.write(w.op, v); toast(t('watch.written', { op: w.op }), 'ok', 1400); } catch (err) { toast(trText(String(err.message || err)), 'err'); } };
      const doForce = () => { const v = parseLiteral(mod.value); if (v === undefined) { toast(t('watch.badValue'), 'warn'); return; } try { plc()?.force(w.op, v); forced.set(w.op, v); render(); } catch (err) { toast(trText(String(err.message || err)), 'err'); } };
      const doUnforce = () => { try { plc()?.unforce(w.op); } catch { /* bỏ qua */ } forced.delete(w.op); render(); };
      tbody.appendChild(h('tr', { class: forced.has(w.op) ? 'forced' : '' },
        h('td.rn', String(i + 1)),
        h('td', ctx.readOnly ? h('span.mono', w.op) : h('input.cell.mono', { value: w.op, list: 'bk-taglist', 'aria-label': t('watch.operand'), spellcheck: 'false', onchange: (e) => ctx.commit((p) => { p.watch[i].op = e.target.value.trim(); }) })),
        h('td', h('select.cell', { 'aria-label': t('watch.format'), onchange: (e) => ctx.commit((p) => { p.watch[i].format = e.target.value; }, { keepEditor: false }) }, FORMATS.map((f) => h('option', { selected: (w.format || 'Auto') === f }, f)))),
        val,
        h('td', mod),
        h('td.wt-act',
          h('button.btn.sm', { type: 'button', onclick: doWrite, title: t('watch.writeTip') }, t('watch.write')),
          h('button.btn.sm', { type: 'button', class: forced.has(w.op) ? 'on' : '', onclick: doForce, title: t('watch.forceTip') }, 'F'),
          forced.has(w.op) ? h('button.btn.sm', { type: 'button', onclick: doUnforce, title: t('watch.unforce') }, t('watch.unforceShort')) : null,
          ctx.readOnly ? null : h('button.btn.ghost.sm', { type: 'button', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: () => ctx.commit((p) => { p.watch.splice(i, 1); }) }, '×')),
      ));
    });
    if (!ctx.readOnly) {
      tbody.appendChild(h('tr.new', h('td.rn', '+'), h('td', h('input.cell.mono', { placeholder: t('watch.addOp'), list: 'bk-taglist', 'aria-label': t('watch.addOp'),
        onchange: (e) => { const v = e.target.value.trim(); if (v) ctx.commit((p) => { (p.watch ||= []).push({ op: v }); }); } })), h('td'), h('td'), h('td'), h('td')));
    }
    el.replaceChildren(
      h('div.doc-head', h('h3', t('watch.title')), h('span.muted.small', ctx.monitor ? t('watch.live') : t('watch.monOff')), h('span.spacer'),
        forced.size ? h('span.badge.warn', t('watch.forcedCount', { n: forced.size })) : null),
      h('div.grid-wrap', h('table.grid',
        h('thead', h('tr', h('th.rn', '#'), h('th', { style: { width: '26%' } }, t('watch.operand')), h('th', { style: { width: '10%' } }, t('watch.format')), h('th', { style: { width: '14%' } }, t('watch.value')), h('th', { style: { width: '18%' } }, t('watch.modifyValue')), h('th', t('watch.actions')))),
        tbody)),
    );
    refreshMonitor();
  }
  function refreshMonitor() {
    const plc = ctx.getPlc();
    for (const [c, w] of vals) { let v; try { v = plc?.read(w.op); } catch { v = undefined; } c.textContent = ctx.monitor ? fmt(v, w.format) : '—'; c.classList.toggle('t', ctx.monitor && v === true); }
  }
  render();
  return { el, refreshMonitor };
}
