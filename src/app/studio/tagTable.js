// Bảng tag PLC: tên, kiểu, địa chỉ (kiểm tra hợp lệ), chú thích, giá trị monitor.
import { h, fmtValue } from '../dom.js';
import { t } from '../i18n.js';
import { grid } from './grid.js';
import { validateAddress, TAG_NAME_RE } from './addr.js';

const TYPES = ['Bool', 'Byte', 'Word', 'DWord', 'Int', 'UInt', 'DInt', 'Real', 'Time'];

export function createTagTable(ctx) {
  const el = h('div.doc-pane');
  const monCells = [];
  function render() {
    const tags = ctx.project.tags || (ctx.project.tags = []);
    const names = new Map(); tags.forEach((tg) => names.set(tg.name, (names.get(tg.name) || 0) + 1));
    const addrs = new Map(); tags.forEach((tg) => { const a = String(tg.address || '').toUpperCase(); addrs.set(a, (addrs.get(a) || 0) + 1); });
    monCells.length = 0;
    const cols = [
      { key: 'name', label: t('tags.name'), width: '22%', placeholder: t('tags.addNew'),
        validate: (v) => (!v ? t('tags.errName') : !TAG_NAME_RE.test(v) ? t('tags.errNameChars') : names.get(v) > 1 ? t('tags.errDup') : null) },
      { key: 'type', label: t('tags.type'), type: 'select', options: TYPES, width: '11%' },
      { key: 'address', label: t('tags.address'), mono: true, width: '13%', placeholder: '%I0.0',
        validate: (v, row) => validateAddress(v, row.type) || (addrs.get(String(v).toUpperCase()) > 1 ? t('tags.warnDupAddr') : null) },
      { key: 'comment', label: t('tags.comment') },
    ];
    if (ctx.monitor) cols.push({ key: '_v', label: t('tags.monitor'), width: '12%', render: (row) => { const s = h('span.mono.monv'); monCells.push([s, `"${row.name}"`]); return s; } });
    el.replaceChildren(
      h('div.doc-head', h('h3', t('tags.title')), h('span.muted.small', t('tags.count', { n: tags.length })), h('span.spacer'),
        h('span.muted.small', t('tags.hint'))),
      grid({
        columns: cols, rows: tags, readOnly: ctx.readOnly,
        onChange: (i, k, v) => ctx.commit((p) => {
          const old = p.tags[i].name; p.tags[i][k] = k === 'address' ? v.toUpperCase() : v;
          if (k === 'name' && old && v && old !== v) renameEverywhere(p, old, v);
        }, { keepEditor: false }),
        onDelete: (i) => ctx.commit((p) => { p.tags.splice(i, 1); }),
        onAdd: (row) => ctx.commit((p) => {
          const n = { name: '', type: 'Bool', address: '', comment: '', ...row };
          if (n.address) n.address = n.address.toUpperCase();
          if (!n.name) n.name = 'Tag_' + (p.tags.length + 1);
          if (!n.address) n.address = nextFree(p.tags);
          p.tags.push(n);
        }),
      }),
    );
    refreshMonitor();
  }
  function refreshMonitor() {
    const plc = ctx.monitor ? ctx.getPlc() : null;
    for (const [cell, op] of monCells) { let v; try { v = plc?.read(op); } catch { v = undefined; } cell.textContent = fmtValue(v); cell.classList.toggle('t', v === true); }
  }
  render();
  return { el, refreshMonitor };
}

function nextFree(tags) {
  const used = new Set(tags.map((x) => String(x.address).toUpperCase()));
  for (let b = 10; b < 100; b++) for (let i = 0; i < 8; i++) if (!used.has(`%M${b}.${i}`)) return `%M${b}.${i}`;
  return '%M0.0';
}

/** Đổi tên tag → cập nhật toán hạng trong mọi network LAD và watch table. */
export function renameEverywhere(p, oldName, newName) {
  const from = `"${oldName}"`, to = `"${newName}"`;
  const fix = (v) => (typeof v === 'string' && v === from ? to : v);
  const walk = (n) => {
    if (!n) return;
    if (n.t === 'series') n.items.forEach(walk);
    else if (n.t === 'parallel') n.branches.forEach(walk);
    else {
      for (const k of ['op', 'in1', 'in2', 'instance', 'mem']) if (k in n) n[k] = fix(n[k]);
      if (n.params) for (const k of Object.keys(n.params)) n.params[k] = fix(n.params[k]);
    }
  };
  for (const b of p.blocks || []) for (const nw of b.networks || []) walk(nw.rung);
  for (const w of p.watch || []) w.op = fix(w.op);
}
