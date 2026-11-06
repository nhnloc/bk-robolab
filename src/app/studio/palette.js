// Thư viện lệnh (phải): nhóm lệnh có thể thu gọn, tìm kiếm, kéo-thả hoặc bấm để chèn.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { ladIcon } from '../components/icons.js';
import { PALETTE } from './ladSpec.js';
import { LAD_MIME } from './ladEditor.js';

export function createPalette(ctx) {
  const el = h('aside.palette', { 'aria-label': t('pal.title') });
  const open = ctx.state.palOpen || (ctx.state.palOpen = { bit: true, timer: true, counter: true, cmp: false, move: false, math: false, conv: false, mp: true, prog: false });
  let q = '';
  const search = h('input.input.sm.pal-search', { type: 'search', placeholder: t('pal.search'), 'aria-label': t('pal.search'), oninput: (e) => { q = e.target.value.toLowerCase(); renderList(); } });
  const list = h('div.pal-list');

  function groups() {
    const calls = ctx.project.blocks.filter((b) => b.type === 'FC' || b.type === 'FB').map((b) => ({ key: 'call:' + b.name, label: b.name, name: `${t('pal.call')} ${b.type}${b.number}`, scl: b.type === 'FB' ? `"${b.name}_DB"();\n` : `"${b.name}"();\n` }));
    return PALETTE.map((g) => (g.id === 'prog' ? { ...g, items: calls } : g));
  }

  function renderList() {
    const doc = ctx.activeDoc();
    const mode = doc?.lang === 'SCL' ? 'scl' : doc?.lang === 'LAD' ? 'lad' : null;
    list.replaceChildren(...groups().map((g) => {
      const items = g.items.filter((it) => !q || it.label.toLowerCase().includes(q) || it.name.toLowerCase().includes(q));
      if (q && !items.length) return null;
      const isOpen = q ? true : open[g.id];
      return h('section.pal-group',
        h('button.pal-gh', { type: 'button', 'aria-expanded': String(!!isOpen), onclick: () => { open[g.id] = !open[g.id]; renderList(); } }, h('span', isOpen ? '▾' : '▸'), g.title, h('span.muted.small', ` (${g.items.length})`)),
        isOpen ? h('div.pal-items', items.length ? items.map((it) => {
          const disabled = !mode || ctx.readOnly || (mode === 'scl' && !it.scl);
          return h('button.pal-item', {
            type: 'button', draggable: String(mode === 'lad' && !ctx.readOnly), disabled,
            title: `${it.name}${it.kbd ? ' (' + it.kbd + ')' : ''}`,
            ondragstart: (e) => { e.dataTransfer.setData(LAD_MIME, it.key); e.dataTransfer.setData('text/plain', it.label); e.dataTransfer.effectAllowed = 'copy'; },
            onclick: () => ctx.paletteInsert(it),
          }, h('span.pi-ico', ladIcon(it.icon || it.key.replace(/^call:/, 'CALL'), 15)), h('span.pi-l', it.label), h('span.pi-n', it.name));
        }) : h('div.muted.small.pad', t('pal.noCalls'))) : null);
    }));
  }

  el.append(h('div.pane-title', t('pal.title')), h('div.pal-search-wrap', search), list,
    h('div.pal-foot.muted.small', t('pal.hint')));
  renderList();
  return { el, render: renderList };
}
