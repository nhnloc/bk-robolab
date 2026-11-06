// Cây project (trái): thiết bị, khối chương trình, tag PLC, bảng theo dõi.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { trText } from '../loc.js';
import { icon } from '../components/icons.js';
import { modal, confirmBox, toast } from '../components/ui.js';

export function createProjectTree(ctx) {
  const el = h('nav.ptree', { 'aria-label': t('tree.title') });
  const open = ctx.state.treeOpen || (ctx.state.treeOpen = { dev: true, blocks: true, tags: true, watch: true });

  function node(key, label, ic, children, extra) {
    const isOpen = open[key] !== false;
    return h('li', { role: 'treeitem', 'aria-expanded': String(isOpen) },
      h('div.tn.folder', { onclick: () => { open[key] = !isOpen; render(); } },
        h('span.caret', isOpen ? '▾' : '▸'), icon(ic, { size: 14 }), h('span.tl', label), extra || null),
      isOpen ? h('ul', { role: 'group' }, children) : null);
  }
  function leaf(label, ic, doc, opts = {}) {
    const active = ctx.isActive(doc);
    return h('li', { role: 'treeitem' },
      h('div.tn', { class: [active && 'active', opts.err && 'has-err'], tabindex: 0, onclick: () => ctx.open(doc), onkeydown: (e) => { if (e.key === 'Enter') ctx.open(doc); },
        ondblclick: opts.onRename || null, title: opts.title || label },
        h('span.caret', ''), icon(ic, { size: 14 }), h('span.tl', label), opts.badge ? h('span.tb', opts.badge) : null,
        opts.onDelete && !ctx.readOnly ? h('button.tn-del', { type: 'button', title: t('common.delete'), 'aria-label': t('common.delete') + ' ' + label, onclick: (e) => { e.stopPropagation(); opts.onDelete(); } }, '×') : null));
  }

  function render() {
    const p = ctx.project;
    const errBlocks = new Set((ctx.errors() || []).map((e) => e.block));
    const blocks = [...p.blocks].sort((a, b) => 'OBFCFBDB'.indexOf(a.type) - 'OBFCFBDB'.indexOf(b.type) || (a.number || 0) - (b.number || 0));
    const blockLeaves = blocks.map((b) => leaf(`${b.name} [${b.type}${b.number ?? ''}]`, b.type === 'DB' ? 'table' : 'block', { kind: 'block', name: b.name }, {
      badge: b.lang || (b.type === 'DB' ? 'DB' : ''), err: errBlocks.has(b.name),
      onDelete: b.type === 'OB' && b.number === 1 ? null : () => delBlock(b.name),
      onRename: ctx.readOnly ? null : () => renameBlock(b.name),
    }));
    el.replaceChildren(
      h('div.pane-title', t('tree.title')),
      h('ul.tree', { role: 'tree' },
        node('dev', trText(p.name) || 'Project', 'folder', [
          node('cpu', p.cpu === 'MP3300' ? 'MP3300 [CPU301]' : `PLC_1 [CPU ${p.cpu || '1214C'} DC/DC/DC]`, 'cpu', [
            leaf(t('tree.devconf'), 'grid', { kind: 'device' }),
            node('blocks', t('tree.blocks'), 'folder', [
              ctx.readOnly ? null : h('li', h('div.tn.add', { tabindex: 0, onclick: addBlock, onkeydown: (e) => { if (e.key === 'Enter') addBlock(); } }, h('span.caret', ''), icon('plus', { size: 14 }), h('span.tl', t('tree.addBlock')))),
              ...blockLeaves,
            ]),
            node('tags', t('tree.tags'), 'folder', [
              leaf(t('tree.tagTable'), 'table', { kind: 'tags' }, { badge: String(p.tags?.length || 0), err: errBlocks.has('PLC tags') }),
            ]),
            node('watch', t('tree.watch'), 'folder', [
              leaf(t('tree.watchTable'), 'watch', { kind: 'watch' }, { badge: String(p.watch?.length || 0) }),
            ]),
          ]),
        ]),
      ),
    );
  }

  async function addBlock() {
    const nameIn = h('input.input', { value: '', placeholder: 'FB_Cylinder' });
    const typeSel = h('select.select', ['FB', 'FC', 'DB', 'OB'].map((x) => h('option', { value: x }, `${x} — ${t('tree.bt' + x)}`)));
    const langSel = h('select.select', h('option', { value: 'LAD' }, 'LAD'), h('option', { value: 'SCL' }, 'SCL'));
    typeSel.addEventListener('change', () => { langSel.disabled = typeSel.value === 'DB'; });
    const ok = await modal({ title: t('tree.addBlock'), body: h('div',
      h('label.field', h('span', t('tree.blockType')), typeSel),
      h('label.field', h('span', t('tree.blockName')), nameIn),
      h('label.field', h('span', t('tree.blockLang')), langSel)),
      actions: [{ label: t('common.cancel'), value: false }, { label: t('common.add'), primary: true, value: true }] });
    if (!ok) return;
    const type = typeSel.value; const lang = langSel.value;
    let name = nameIn.value.trim().replace(/[^\p{L}\p{N}_]/gu, '_') || `${type === 'DB' ? 'Data' : type === 'FB' ? 'FB_Block' : type === 'FC' ? 'FC_Block' : 'OB_Block'}`;
    const p = ctx.project;
    if (p.blocks.some((b) => b.name === name)) { let k = 2; while (p.blocks.some((b) => b.name === `${name}_${k}`)) k++; name = `${name}_${k}`; }
    const nums = p.blocks.filter((b) => b.type === type).map((b) => b.number || 0);
    let number = type === 'OB' ? 123 : 1; while (nums.includes(number)) number++;
    const blk = { name, type, number };
    if (type === 'DB') blk.fields = [{ name: 'Count', type: 'Int', init: '0', comment: '' }];
    else if (lang === 'SCL') {
      blk.lang = 'SCL';
      blk.source = type === 'OB' ? '// OB\n' : `// ${name}\nIF #Start THEN\n  #Out := TRUE;\nEND_IF;\n`;
      if (type !== 'OB') blk.interface = { Input: [{ name: 'Start', type: 'Bool', init: '', comment: '' }], Output: [{ name: 'Out', type: 'Bool', init: '', comment: '' }], InOut: [], Static: [], Temp: [] };
    } else {
      blk.lang = 'LAD';
      blk.networks = [{ title: '', comment: '', rung: { t: 'series', items: [] } }];
      if (type !== 'OB') blk.interface = { Input: [], Output: [], InOut: [], Static: [], Temp: [] };
    }
    ctx.commit((pp) => { pp.blocks.push(blk); });
    ctx.open({ kind: 'block', name });
  }

  async function delBlock(name) {
    if (!(await confirmBox(t('tree.delBlock'), t('tree.delBlockMsg', { name }), t('common.delete')))) return;
    ctx.commit((p) => { p.blocks = p.blocks.filter((b) => b.name !== name); });
    ctx.closeDoc({ kind: 'block', name });
  }

  async function renameBlock(name) {
    const inp = h('input.input', { value: name });
    const ok = await modal({ title: t('tree.rename'), body: h('label.field', h('span', t('tree.blockName')), inp), actions: [{ label: t('common.cancel'), value: false }, { label: t('common.ok'), primary: true, value: true }] });
    const nn = inp.value.trim();
    if (!ok || !nn || nn === name) return;
    if (ctx.project.blocks.some((b) => b.name === nn)) { toast(t('tree.nameExists'), 'warn'); return; }
    ctx.commit((p) => {
      p.blocks.find((b) => b.name === name).name = nn;
      const walk = (n) => { if (!n) return; if (n.t === 'series') n.items.forEach(walk); else if (n.t === 'parallel') n.branches.forEach(walk); else if (n.t === 'box' && n.fn === 'CALL' && n.block === name) n.block = nn; };
      for (const b of p.blocks) for (const nw of b.networks || []) walk(nw.rung);
    });
    ctx.renameDoc(name, nn);
  }

  render();
  return { el, render };
}
