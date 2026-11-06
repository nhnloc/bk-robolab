// Bảng lưới sửa được (dùng cho bảng tag, interface, DB, watch table) — phong cách bảng kỹ thuật.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from '../components/icons.js';

/**
 * grid({ columns:[{key,label,type,options,validate,width,mono,render,placeholder,list}], rows, readOnly,
 *        onChange(i,key,val), onDelete(i), onAdd(row), addLabel, rowClass(row) })
 */
export function grid(o) {
  const { columns, rows, readOnly } = o;
  const thead = h('thead', h('tr', h('th.rn', '#'), columns.map((c) => h('th', { style: c.width ? { width: c.width } : null }, c.label)), readOnly ? null : h('th.act', '')));
  const tbody = h('tbody');
  const cell = (c, row, i, isNew) => {
    if (c.render) return h('td', { class: c.cls }, c.render(row, i));
    const val = row[c.key] ?? '';
    if (c.type === 'readonly' || readOnly) return h('td', { class: [c.mono && 'mono', c.cls] }, String(val));
    const msg = !isNew && c.validate ? c.validate(val, row, i) : null;
    let input;
    if (c.type === 'select') {
      const opts = typeof c.options === 'function' ? c.options(row) : c.options;
      input = h('select.cell', { 'aria-label': c.label, onchange: (e) => commit(e.target.value) },
        opts.map((v) => h('option', { value: v, selected: v === val }, v)), !opts.includes(val) && val ? h('option', { value: val, selected: true }, val) : null);
    } else if (c.type === 'check') {
      input = h('input', { type: 'checkbox', 'aria-label': c.label, checked: !!val, onchange: (e) => commit(e.target.checked) });
    } else {
      input = h('input.cell', { value: String(val), class: [c.mono && 'mono', msg && 'invalid'], placeholder: isNew ? c.placeholder || '' : '', list: c.list || null, spellcheck: 'false', 'aria-label': c.label, title: msg || '',
        onchange: (e) => commit(e.target.value.trim()),
        onkeydown: (e) => { if (e.key === 'Enter') { e.target.blur(); } } });
    }
    function commit(v) {
      if (isNew) { if (v === '' || v === false) return; o.onAdd?.({ [c.key]: v }); }
      else o.onChange?.(i, c.key, v);
    }
    return h('td', { class: c.cls }, input, msg ? h('span.cell-err', { role: 'img', 'aria-label': msg, title: msg }, '!') : null);
  };
  rows.forEach((row, i) => {
    tbody.appendChild(h('tr', { class: o.rowClass?.(row, i) }, h('td.rn', String(i + 1)), columns.map((c) => cell(c, row, i, false)),
      readOnly ? null : h('td.act', h('button.btn.ghost.sm.icon', { type: 'button', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: () => o.onDelete?.(i) }, icon('trash', { size: 13 })))));
  });
  if (!readOnly && o.onAdd) {
    tbody.appendChild(h('tr.new', h('td.rn', '+'), columns.map((c) => (c.type === 'readonly' || c.render ? h('td') : cell({ ...c, validate: null }, {}, -1, true))), h('td.act')));
  }
  return h('div.grid-wrap', h('table.grid', thead, tbody));
}
