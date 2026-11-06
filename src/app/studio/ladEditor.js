// Trình soạn LAD: danh sách network, chọn/chèn/xóa phần tử, nhánh song song, sửa toán hạng tại chỗ,
// kéo-thả từ palette, chép/dán network, monitor (dòng công suất + giá trị).
import { h, svg, clone } from '../dom.js';
import { t } from '../i18n.js';
import { icon, ladIcon } from '../components/icons.js';
import { drawRung, G } from './ladRender.js';
import { makeNode } from './ladSpec.js';
import * as M from './ladModel.js';
import { toast } from '../components/ui.js';

export const LAD_MIME = 'application/x-bk-lad';

export function createLadEditor(ctx, blockName) {
  const st = ctx.state;
  const block = () => ctx.project.blocks.find((b) => b.name === blockName);
  const sel = () => (st.sel && st.sel.block === blockName ? st.sel : null);
  const setSel = (s, render = true) => { st.sel = s ? { block: blockName, ...s } : null; if (render) renderAll(); ctx.onSelection?.(); };

  const scroll = h('div.lad-scroll', { tabindex: 0, 'aria-label': t('lad.editorArea') });
  const toolbar = buildToolbar();
  const el = h('div.lad-editor', toolbar, scroll);
  const netEls = [];
  let editing = null;

  scroll.addEventListener('keydown', onKey);
  scroll.addEventListener('mousedown', (e) => { if (e.target === scroll) setSel(null); });

  function tagMaps() {
    const tags = new Map(), byAddr = new Map();
    for (const tg of ctx.project.tags || []) { tags.set(tg.name, tg); if (tg.address) byAddr.set(String(tg.address).toUpperCase(), tg); }
    return { tags, byAddr, blockNames: new Set(ctx.project.blocks.map((b) => b.name)) };
  }

  /* ---------------- vẽ ---------------- */
  function renderAll() {
    const b = block(); if (!b) return;
    if (!Array.isArray(b.networks)) b.networks = [];
    const keepScroll = scroll.scrollTop;
    scroll.replaceChildren();
    netEls.length = 0;
    b.networks.forEach((nw, i) => { const ne = renderNetwork(nw, i); netEls.push(ne); scroll.appendChild(ne.el); });
    if (!ctx.readOnly) scroll.appendChild(h('button.btn.sm.add-net', { type: 'button', onclick: () => addNetwork(b.networks.length - 1) }, icon('plus', { size: 14 }), t('lad.addNetwork')));
    scroll.scrollTop = keepScroll;
    updateToolbar();
  }

  function renderNetwork(nw, i) {
    const s = sel();
    const isSel = s && s.net === i;
    const title = h('input.nw-title', { value: nw.title || '', placeholder: t('lad.netTitle'), disabled: ctx.readOnly, 'aria-label': t('lad.netTitle'),
      onchange: (e) => ctx.commit((p) => { netOf(p, i).title = e.target.value; }, { keepEditor: true }) });
    const comment = h('textarea.nw-comment', { rows: 1, value: nw.comment || '', placeholder: t('lad.netComment'), disabled: ctx.readOnly, 'aria-label': t('lad.netComment'),
      onchange: (e) => ctx.commit((p) => { netOf(p, i).comment = e.target.value; }, { keepEditor: true }) });
    const head = h('div.nw-head', { onmousedown: (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') setSel({ net: i, path: null }); } },
      h('button.nw-toggle', { type: 'button', 'aria-expanded': String(!nw._collapsed), title: t('lad.collapse'), onclick: () => { nw._collapsed = !nw._collapsed; renderAll(); } }, icon(nw._collapsed ? 'chevronR' : 'chevronD', { size: 12 })),
      h('span.nw-label', `${t('info.network')} ${i + 1}:`), title);
    const body = h('div.nw-body');
    const wrap = h('div.network', { class: [isSel && 'selected'], dataset: { net: i } }, head, nw._collapsed ? null : comment, nw._collapsed ? null : body);
    const ne = { el: wrap, body, i };
    if (!nw._collapsed) drawNetwork(ne, nw);
    // kéo thả
    body.addEventListener('dragover', (e) => { if (ctx.readOnly || !e.dataTransfer.types.includes(LAD_MIME)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; markDrop(body, e.target); });
    body.addEventListener('dragleave', () => markDrop(body, null));
    body.addEventListener('drop', (e) => {
      const key = e.dataTransfer.getData(LAD_MIME); markDrop(body, null);
      if (!key || ctx.readOnly) return; e.preventDefault();
      const tgt = e.target.closest?.('[data-path]');
      insertNode(key, { net: i, path: tgt ? tgt.dataset.path : null });
    });
    return ne;
  }

  function markDrop(body, target) {
    body.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
    const r = target?.closest?.('[data-path]');
    if (r) body.querySelector(`rect.hit[data-path="${r.dataset.path}"]`)?.classList.add('drop');
  }

  function drawNetwork(ne, nw) {
    nw.rung = M.normRoot(nw.rung);
    const s = sel();
    const selSet = new Set();
    if (s && s.net === ne.i && s.path !== null && s.path !== undefined) {
      selSet.add(s.path);
      if (s.end && M.parentPath(s.end) === M.parentPath(s.path)) {
        const a = M.lastIndex(s.path), b = M.lastIndex(s.end); const pp = M.parentPath(s.path);
        for (let k = Math.min(a, b); k <= Math.max(a, b); k++) selSet.add(M.join(pp, k));
      }
    }
    const plc = ctx.monitor ? ctx.getPlc() : null;
    let pf = null;
    if (plc && plc.state === 'RUN') { try { pf = plc.getPowerFlow(blockName, ne.i) || {}; } catch { pf = {}; } }
    const read = plc ? (op) => plc.read(op) : null;
    const g = svg('g');
    const avail = Math.max(560, (scroll.clientWidth || 800) - 40);
    const { w, h: hh } = drawRung(g, nw.rung, { project: ctx.project, pf, read, sel: selSet, ...tagMaps(), stretchTo: avail, emptyHint: ctx.readOnly ? '' : t('lad.emptyHint') });
    const W = Math.max(w + 24, avail + 16);
    const s2 = svg('svg', { class: 'lad-svg' + (pf ? ' monitor' : ''), width: W, height: hh, viewBox: `0 0 ${W} ${hh}`, role: 'img', 'aria-label': `${t('info.network')} ${ne.i + 1}` },
      svg('line', { x1: 4, y1: 2, x2: 4, y2: hh - 2, class: 'rail' + (pf ? ' on' : '') }), g);
    s2.addEventListener('mousedown', (e) => onSvgDown(e, ne.i));
    s2.addEventListener('dblclick', (e) => onSvgDbl(e, ne.i));
    ne.body.replaceChildren(s2);
  }

  /** Cập nhật monitor (vẽ lại SVG, giữ ô đang sửa). */
  function refreshMonitor() {
    const b = block(); if (!b) return;
    for (const ne of netEls) {
      if (editing && editing.net === ne.i) continue;
      const nw = b.networks[ne.i]; if (nw && !nw._collapsed) drawNetwork(ne, nw);
    }
  }

  /* ---------------- chuột ---------------- */
  function onSvgDown(e, net) {
    const tgt = e.target.closest('[data-path]');
    scroll.focus({ preventScroll: true });
    if (!tgt) { setSel({ net, path: null }); return; }
    const path = tgt.dataset.path;
    const s = sel();
    if (e.shiftKey && s && s.net === net && s.path) setSel({ net, path: s.path, end: path });
    else setSel({ net, path });
  }
  function onSvgDbl(e, net) {
    if (ctx.readOnly) return;
    const tgt = e.target.closest('[data-edit]') || e.target.closest('[data-path]');
    if (!tgt) return;
    const path = tgt.dataset.path;
    let field = tgt.dataset.edit;
    if (!field) { const n = M.getNode(block().networks[net].rung, path); field = n?.t === 'cmp' ? 'in1' : n?.t === 'box' ? null : n?.op !== undefined ? 'op' : null; }
    if (field) startEdit(net, path, field);
  }

  /* ---------------- sửa tại chỗ ---------------- */
  function getField(n, field) {
    if (field === 'op' || field === 'in1' || field === 'in2' || field === 'instance') return n[field] ?? '';
    if (field.startsWith('param:')) return n.params?.[field.slice(6)] ?? '';
    return '';
  }
  function setField(n, field, v) {
    if (field.startsWith('param:')) { n.params = n.params || {}; const k = field.slice(6); if (v === '') delete n.params[k]; else n.params[k] = v; }
    else n[field] = v;
  }
  function normOperand(v) {
    v = v.trim();
    if (!v) return v;
    // gõ tên tag không có ngoặc kép → tự thêm (giống TIA)
    const tags = ctx.project.tags || [];
    if (/^[A-Za-z_]\w*$/.test(v) && !/^(TRUE|FALSE)$/i.test(v) && tags.some((tg) => tg.name === v)) return `"${v}"`;
    if (/^%[iqm]/i.test(v)) return v.toUpperCase();
    if (/^\d\w*$/.test(v) && tags.some((tg) => tg.name === v)) return `"${v}"`;
    return v;
  }

  function startEdit(net, path, field) {
    const ne = netEls[net]; if (!ne) return;
    const nw = block().networks[net];
    const n = M.getNode(nw.rung, path); if (!n) return;
    const anchor = ne.body.querySelector(`[data-path="${path}"][data-edit="${field}"]`);
    const bodyRect = ne.body.getBoundingClientRect();
    let x = 20, y = 20, w = 130;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const anchorMode = anchor.getAttribute('text-anchor');
      w = Math.max(120, r.width + 30);
      x = anchorMode === 'end' ? r.right - bodyRect.left - w : anchorMode === 'start' ? r.left - bodyRect.left : r.left - bodyRect.left + r.width / 2 - w / 2;
      y = r.top - bodyRect.top - 4;
    }
    x += ne.body.scrollLeft;
    const input = h('input.inline-op', { value: getField(n, field), list: 'bk-taglist', spellcheck: 'false', autocomplete: 'off', 'aria-label': t('lad.operand'), style: { left: Math.max(0, x) + 'px', top: Math.max(0, y) + 'px', width: w + 'px' } });
    editing = { net, path, field };
    let done = false;
    const finish = (commit, move) => {
      if (done) return; done = true;
      const v = normOperand(input.value);
      input.remove(); editing = null;
      if (commit && v !== getField(n, field)) {
        ctx.commit((p) => { const nn = M.getNode(netOf(p, net).rung, path); if (nn) setField(nn, field, v); }, { pendingEdit: move ? nextEditable(net, path, field) : null });
      } else if (move) { const nx = nextEditable(net, path, field); if (nx) startEdit(nx.net, nx.path, nx.field); }
      else scroll.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true, false); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false, false); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, true); }
    });
    input.addEventListener('blur', () => finish(true, false));
    ne.body.appendChild(input);
    input.focus(); input.select();
  }

  function nextEditable(net, path, field) {
    const list = [];
    block().networks.forEach((nw, ni) => {
      for (const { path: p, node } of M.leaves(nw.rung)) {
        if (node.t === 'contact' && node.kind !== 'NOT') list.push({ net: ni, path: p, field: 'op' });
        else if (node.t === 'coil') list.push({ net: ni, path: p, field: 'op' });
        else if (node.t === 'cmp') { list.push({ net: ni, path: p, field: 'in1' }); list.push({ net: ni, path: p, field: 'in2' }); }
      }
    });
    const i = list.findIndex((x) => x.net === net && x.path === path && x.field === field);
    return i >= 0 ? list[i + 1] || null : null;
  }

  /* ---------------- thao tác ---------------- */
  const netOf = (p, i) => p.blocks.find((b) => b.name === blockName).networks[i];
  function curNet() { const s = sel(); return s ? s.net : (block().networks.length ? block().networks.length - 1 : -1); }

  function insertNode(key, at) {
    if (ctx.readOnly) return;
    const node = makeNode(key, ctx.project); if (!node) return;
    const s = at || sel() || { net: curNet(), path: null };
    let net = s.net;
    if (net < 0 || net === undefined) { addNetwork(-1); net = 0; }
    let newPath = null;
    ctx.commit((p) => {
      const nw = netOf(p, net);
      nw.rung = M.insertAfter(nw.rung, s.end || s.path, node);
      newPath = M.findPath(nw.rung, node);
    }, { sel: () => ({ block: blockName, net, path: newPath }), pendingEdit: () => (node.t === 'contact' && node.kind !== 'NOT') || node.t === 'coil' ? { net, path: newPath, field: 'op' } : node.t === 'cmp' ? { net, path: newPath, field: 'in1' } : null });
  }

  function openBranch() {
    const s = sel(); if (!s || !s.path || ctx.readOnly) { toast(t('lad.selectFirst'), 'warn'); return; }
    const node = makeNode('NO', ctx.project); let newPath = null;
    ctx.commit((p) => { const nw = netOf(p, s.net); nw.rung = M.wrapParallel(nw.rung, s.path, s.end, node); newPath = M.findPath(nw.rung, node); },
      { sel: () => ({ block: blockName, net: s.net, path: newPath }), pendingEdit: () => ({ net: s.net, path: newPath, field: 'op' }) });
  }

  function addBranch() {
    const s = sel(); if (!s || !s.path || ctx.readOnly) { toast(t('lad.selectFirst'), 'warn'); return; }
    const test = M.addBranch(clone(block().networks[s.net].rung), s.path, makeNode('NO'));
    if (!test) { openBranch(); return; }
    const node = makeNode('NO', ctx.project); let newPath = null;
    ctx.commit((p) => { const nw = netOf(p, s.net); nw.rung = M.addBranch(nw.rung, s.path, node) || nw.rung; newPath = M.findPath(nw.rung, node); },
      { sel: () => ({ block: blockName, net: s.net, path: newPath }), pendingEdit: () => ({ net: s.net, path: newPath, field: 'op' }) });
  }

  function del() {
    const s = sel(); if (!s || ctx.readOnly) return;
    if (s.path === null || s.path === undefined) { delNetwork(s.net); return; }
    const paths = [s.path];
    if (s.end && M.parentPath(s.end) === M.parentPath(s.path)) {
      const a = M.lastIndex(s.path), b = M.lastIndex(s.end), pp = M.parentPath(s.path);
      paths.length = 0; for (let k = Math.max(a, b); k >= Math.min(a, b); k--) paths.push(M.join(pp, k));
    }
    let nextSel = null;
    ctx.commit((p) => {
      const nw = netOf(p, s.net);
      const leaves = M.leaves(nw.rung).map((x) => x.path);
      const idx = leaves.indexOf(paths[paths.length - 1]);
      const prevNode = idx > 0 ? M.getNode(nw.rung, leaves[idx - 1]) : null;
      for (const pa of paths) nw.rung = M.removeAt(nw.rung, pa);
      nextSel = prevNode ? M.findPath(nw.rung, prevNode) : null;
    }, { sel: () => ({ block: blockName, net: s.net, path: nextSel }) });
  }

  function addNetwork(after) {
    if (ctx.readOnly) return;
    const i = (after ?? curNet()) + 1;
    ctx.commit((p) => { p.blocks.find((b) => b.name === blockName).networks.splice(i, 0, { title: '', comment: '', rung: { t: 'series', items: [] } }); },
      { sel: () => ({ block: blockName, net: i, path: null }), scrollTo: i });
  }
  function delNetwork(i) {
    if (ctx.readOnly || i === undefined || i < 0) return;
    ctx.commit((p) => { const nws = p.blocks.find((b) => b.name === blockName).networks; nws.splice(i, 1); if (!nws.length) nws.push({ title: '', comment: '', rung: { t: 'series', items: [] } }); },
      { sel: () => ({ block: blockName, net: Math.max(0, i - 1), path: null }) });
  }
  function moveNetwork(d) {
    const s = sel(); if (!s || ctx.readOnly) return;
    const nws = block().networks; const j = s.net + d;
    if (j < 0 || j >= nws.length) return;
    ctx.commit((p) => { const a = p.blocks.find((b) => b.name === blockName).networks; const [x] = a.splice(s.net, 1); a.splice(j, 0, x); },
      { sel: () => ({ block: blockName, net: j, path: null }), scrollTo: j });
  }
  function copyNetwork() {
    const s = sel(); if (!s) return;
    const nw = clone(block().networks[s.net]); delete nw._collapsed;
    ctx.clipboard.set({ kind: 'network', data: nw });
    toast(t('lad.copied', { n: s.net + 1 }), 'ok', 1600);
  }
  function pasteNetwork() {
    const c = ctx.clipboard.get(); if (!c || c.kind !== 'network' || ctx.readOnly) { toast(t('lad.clipEmpty'), 'warn'); return; }
    const i = curNet() + 1;
    ctx.commit((p) => { p.blocks.find((b) => b.name === blockName).networks.splice(i, 0, clone(c.data)); }, { sel: () => ({ block: blockName, net: i, path: null }), scrollTo: i });
  }

  /* ---------------- bàn phím ---------------- */
  function onKey(e) {
    if (editing) return;
    const k = e.key; const ctrl = e.ctrlKey || e.metaKey;
    const s = sel();
    if (ctrl && (k === 'c' || k === 'C')) { copyNetwork(); e.preventDefault(); return; }
    if (ctrl && (k === 'v' || k === 'V')) { pasteNetwork(); e.preventDefault(); return; }
    if (ctx.readOnly) return;
    if (k === 'Delete' || k === 'Backspace') { del(); e.preventDefault(); return; }
    if (e.shiftKey && k === 'F2') { insertNode('NO'); e.preventDefault(); return; }
    if (e.shiftKey && k === 'F3') { insertNode('NC'); e.preventDefault(); return; }
    if (e.shiftKey && k === 'F7') { insertNode('coil='); e.preventDefault(); return; }
    if (e.shiftKey && k === 'F8') { openBranch(); e.preventDefault(); return; }
    if (e.shiftKey && k === 'F9') { addBranch(); e.preventDefault(); return; }
    if (k === 'Enter' && s?.path) {
      const n = M.getNode(block().networks[s.net].rung, s.path);
      if (n) { const f = n.t === 'cmp' ? 'in1' : n.op !== undefined ? 'op' : n.instance !== undefined ? 'instance' : null; if (f) startEdit(s.net, s.path, f); }
      e.preventDefault(); return;
    }
    if ((k === 'ArrowRight' || k === 'ArrowLeft') && s) {
      const leaves = M.leaves(block().networks[s.net].rung).map((x) => x.path);
      const i = leaves.indexOf(s.path); const j = k === 'ArrowRight' ? i + 1 : i - 1;
      if (j >= 0 && j < leaves.length) setSel({ net: s.net, path: leaves[j] });
      else if (i < 0 && leaves.length) setSel({ net: s.net, path: leaves[0] });
      e.preventDefault(); return;
    }
    if ((k === 'ArrowDown' || k === 'ArrowUp') && s) {
      const j = s.net + (k === 'ArrowDown' ? 1 : -1);
      if (j >= 0 && j < block().networks.length) { setSel({ net: j, path: null }); netEls[j]?.el.scrollIntoView({ block: 'nearest' }); }
      e.preventDefault();
    }
  }

  /* ---------------- thanh công cụ ---------------- */
  function buildToolbar() {
    const b = (ic, title, fn, lad = false) => h('button.btn.ghost.sm.tb', { type: 'button', title, 'aria-label': title, onclick: fn, dataset: { edit: '1' } }, lad ? ladIcon(ic, 16) : icon(ic, { size: 15 }));
    return h('div.lad-toolbar', { role: 'toolbar', 'aria-label': t('lad.toolbar') },
      b('plus', t('lad.addNetwork'), () => addNetwork()),
      b('trash', t('lad.delNetwork'), () => delNetwork(sel()?.net ?? -1)),
      b('up', t('lad.netUp'), () => moveNetwork(-1)),
      b('down', t('lad.netDown'), () => moveNetwork(1)),
      h('span.tb-sep'),
      b('NO', t('lad.insNO') + ' (Shift+F2)', () => insertNode('NO'), true),
      b('NC', t('lad.insNC') + ' (Shift+F3)', () => insertNode('NC'), true),
      b('=', t('lad.insCoil') + ' (Shift+F7)', () => insertNode('coil='), true),
      b('TON', t('lad.insBox'), () => insertNode('TON'), true),
      b('branch', t('lad.openBranch') + ' (Shift+F8)', openBranch, true),
      b('addbranch', t('lad.addBranch') + ' (Shift+F9)', addBranch, true),
      b('close', t('lad.delete') + ' (Del)', del),
      h('span.tb-sep'),
      b('copy', t('lad.copyNet') + ' (Ctrl+C)', copyNetwork),
      b('paste', t('lad.pasteNet') + ' (Ctrl+V)', pasteNetwork),
      h('span.tb-sep'),
      b('undo', t('common.undo') + ' (Ctrl+Z)', () => ctx.undo()),
      b('redo', t('common.redo') + ' (Ctrl+Y)', () => ctx.redo()),
    );
  }
  function updateToolbar() {
    toolbar.querySelectorAll('[data-edit]').forEach((x) => { x.disabled = ctx.readOnly && !/copy/i.test(x.title); });
  }

  renderAll();
  // sau khi gắn vào DOM: sửa ô chờ / cuộn tới network
  let disposed = false;
  setTimeout(() => {
    if (disposed || !el.isConnected) return;
    if (st.scrollTo !== undefined && st.scrollTo !== null) { netEls[st.scrollTo]?.el.scrollIntoView({ block: 'nearest' }); st.scrollTo = null; }
    if (st.pendingEdit) { const pe = st.pendingEdit; st.pendingEdit = null; if (pe.net !== undefined && pe.path) startEdit(pe.net, pe.path, pe.field); }
    else if (sel()) scroll.focus({ preventScroll: true });
    // vẽ lại với chiều rộng thật để cuộn dây căn phải
    if (scroll.clientWidth) renderAllKeepEdit();
  }, 0);
  function renderAllKeepEdit() { if (!editing) { const b = block(); if (!b) return; for (const ne of netEls) { const nw = b.networks[ne.i]; if (nw && !nw._collapsed) drawNetwork(ne, nw); } } }

  const ro = new ResizeObserver(() => renderAllKeepEdit());
  ro.observe(scroll);

  return {
    el,
    refreshMonitor,
    insert: (key) => insertNode(key),
    getSelectedNode() { const s = sel(); if (!s || !s.path) return null; const nw = block()?.networks[s.net]; return nw ? { net: s.net, path: s.path, node: M.getNode(nw.rung, s.path) } : null; },
    focus: () => scroll.focus({ preventScroll: true }),
    dispose: () => { disposed = true; ro.disconnect(); },
  };
}

export { G };
