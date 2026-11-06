// Trình soạn DB toàn cục: trường (tên, kiểu, giá trị đầu) + giá trị monitor.
import { h, fmtValue } from '../dom.js';
import { t } from '../i18n.js';
import { grid } from './grid.js';
import { DATA_TYPES } from './ladSpec.js';

export function createDbEditor(ctx, blockName) {
  const el = h('div.doc-pane');
  const mon = [];
  const blk = (p) => p.blocks.find((b) => b.name === blockName);
  function render() {
    const b = blk(ctx.project); b.fields = b.fields || [];
    mon.length = 0;
    const cols = [
      { key: 'name', label: t('itf.name'), width: '26%', placeholder: t('tags.addNew') },
      { key: 'type', label: t('itf.type'), type: 'select', options: DATA_TYPES, width: '16%' },
      { key: 'init', label: t('db.init'), mono: true, width: '16%' },
      { key: 'comment', label: t('itf.comment') },
    ];
    if (ctx.monitor) cols.push({ key: '_v', label: t('tags.monitor'), width: '14%', render: (row) => { const s = h('span.mono.monv'); mon.push([s, `"${blockName}".${row.name}`]); return s; } });
    el.replaceChildren(
      h('div.doc-head', h('h3', `${b.name} [DB${b.number ?? ''}]`), h('span.muted.small', t('db.hint', { name: b.name }))),
      grid({ columns: cols, rows: b.fields, readOnly: ctx.readOnly,
        onChange: (i, k, v) => ctx.commit((p) => { blk(p).fields[i][k] = v; }),
        onDelete: (i) => ctx.commit((p) => { blk(p).fields.splice(i, 1); }),
        onAdd: (row) => ctx.commit((p) => { const f = blk(p).fields; f.push({ name: row.name || 'Field' + (f.length + 1), type: row.type || 'Int', init: row.init || '', comment: row.comment || '' }); }) }),
    );
    refreshMonitor();
  }
  function refreshMonitor() {
    const plc = ctx.monitor ? ctx.getPlc() : null;
    for (const [c, op] of mon) { let v; try { v = plc?.read(op); } catch { v = undefined; } c.textContent = fmtValue(v); c.classList.toggle('t', v === true); }
  }
  render();
  return { el, refreshMonitor };
}
