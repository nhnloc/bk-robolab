// Bảng interface của FC/FB: Input / Output / InOut / Static / Temp.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { grid } from './grid.js';
import { DATA_TYPES } from './ladSpec.js';

export function createInterfaceTable(ctx, blockName) {
  const block = () => ctx.project.blocks.find((b) => b.name === blockName);
  const b = block();
  const sections = b.type === 'FB' ? ['Input', 'Output', 'InOut', 'Static', 'Temp'] : ['Input', 'Output', 'InOut', 'Temp'];
  const open = ctx.state.itfOpen ?? (ctx.state.itfOpen = {});
  const isOpen = open[blockName] ?? true;
  const body = h('div.itf-body');
  const head = h('button.itf-head', { type: 'button', 'aria-expanded': String(isOpen), onclick: () => { open[blockName] = !(open[blockName] ?? true); el.replaceWith(createInterfaceTable(ctx, blockName).el); } },
    h('span', isOpen ? '▾' : '▸'), h('b', t('itf.title')), h('span.muted.small', ` — ${b.name} [${b.type}${b.number ?? ''}]`));
  const el = h('div.itf', head, isOpen ? body : null);
  if (isOpen) {
    b.interface = b.interface || {};
    for (const s of sections) {
      const rows = b.interface[s] || [];
      body.appendChild(h('div.itf-sec', h('div.itf-sec-h', s),
        grid({
          columns: [
            { key: 'name', label: t('itf.name'), width: '24%', placeholder: t('tags.addNew') },
            { key: 'type', label: t('itf.type'), type: 'select', options: DATA_TYPES, width: '16%' },
            { key: 'init', label: t('itf.init'), mono: true, width: '14%' },
            { key: 'comment', label: t('itf.comment') },
          ],
          rows, readOnly: ctx.readOnly,
          onChange: (i, k, v) => ctx.commit((p) => { blk(p).interface[s][i][k] = v; }),
          onDelete: (i) => ctx.commit((p) => { blk(p).interface[s].splice(i, 1); }),
          onAdd: (row) => ctx.commit((p) => { const it = blk(p).interface; (it[s] ||= []).push({ name: row.name || 'var' + ((it[s] || []).length + 1), type: row.type || 'Bool', init: row.init || '', comment: row.comment || '' }); }),
        })));
    }
  }
  function blk(p) { const x = p.blocks.find((bb) => bb.name === blockName); x.interface = x.interface || {}; return x; }
  return { el };
}
