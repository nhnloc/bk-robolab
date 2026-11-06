// Trình soạn ladder (tab Ladder của MPE720 ảo): cây project | trình soạn (tab tài liệu) | thư viện lệnh,
// ô Thuộc tính/Thông tin/Chẩn đoán ở dưới. Quản lý undo/redo, clipboard, monitor.
import { h, clone } from '../dom.js';
import { t } from '../i18n.js';
import { icon } from '../components/icons.js';
import { split } from '../components/ui.js';
import { storage } from '../store.js';
import { createProjectTree } from './projectTree.js';
import { createPalette } from './palette.js';
import { createInfoPane } from './infoPane.js';
import { createLadEditor } from './ladEditor.js';
import { renderLadProps } from './ladProps.js';
import { createSclEditor } from './sclEditor.js';
import { createInterfaceTable } from './interfaceTable.js';
import { createTagTable } from './tagTable.js';
import { createDbEditor } from './dbEditor.js';
import { createWatchTable } from './watchTable.js';
import { createDeviceView } from './deviceView.js';

const MAX_UNDO = 120;

/** initialState: kết quả getState() của Studio trước (vẽ lại khi đổi ngôn ngữ — giữ tab, undo/redo, chọn, giám sát, ô Thông tin). */
export function createStudio({ project, readOnly = false, getPlc = () => null, onChange = () => {}, machineIo = null, initialState = null }) {
  const ist = initialState;
  let proj = project;
  let monitor = !!ist?.monitor;
  const undoStack = ist ? [...ist.undo] : [], redoStack = ist ? [...ist.redo] : [];
  const state = { sel: ist?.sel ?? null };
  let docs = ist?.docs?.length ? ist.docs.map((d) => ({ ...d })) : [{ kind: 'block', name: (proj.blocks.find((b) => b.type === 'OB') || proj.blocks[0])?.name }];
  let activeIdx = ist ? Math.min(ist.activeIdx || 0, docs.length - 1) : 0;
  let editor = null;
  let lastErrors = ist?.errors || [];

  const clipboard = {
    get() { return storage.get('bk.clipboard'); },
    set(v) { storage.set('bk.clipboard', v); },
  };

  const ctx = {
    get project() { return proj; },
    readOnly, state, getPlc, clipboard, machineIo,
    get monitor() { return monitor; },
    commit(fn, opts = {}) {
      if (readOnly) return;
      undoStack.push(JSON.stringify(proj)); if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack.length = 0;
      fn(proj);
      if (opts.sel !== undefined) state.sel = typeof opts.sel === 'function' ? opts.sel() : opts.sel;
      if (opts.pendingEdit !== undefined) state.pendingEdit = typeof opts.pendingEdit === 'function' ? opts.pendingEdit() : opts.pendingEdit;
      if (opts.scrollTo !== undefined) state.scrollTo = opts.scrollTo;
      afterChange(!opts.keepEditor);
    },
    undo() { if (readOnly || !undoStack.length) return; redoStack.push(JSON.stringify(proj)); proj = JSON.parse(undoStack.pop()); fixDocs(); afterChange(true); },
    redo() { if (readOnly || !redoStack.length) return; undoStack.push(JSON.stringify(proj)); proj = JSON.parse(redoStack.pop()); fixDocs(); afterChange(true); },
    open(doc) {
      let i = docs.findIndex((d) => sameDoc(d, doc));
      if (i < 0) { docs.push(doc); i = docs.length - 1; }
      activeIdx = i; renderDocTabs(); renderEditor(); tree.render(); palette.render();
    },
    closeDoc(doc) {
      const i = docs.findIndex((d) => sameDoc(d, doc)); if (i < 0) return;
      docs.splice(i, 1);
      if (!docs.length) docs.push({ kind: 'tags' });
      activeIdx = Math.min(activeIdx, docs.length - 1);
      renderDocTabs(); renderEditor(); tree.render();
    },
    renameDoc(a, b) { for (const d of docs) if (d.kind === 'block' && d.name === a) d.name = b; if (state.sel?.block === a) state.sel.block = b; renderDocTabs(); renderEditor(); },
    isActive(doc) { return sameDoc(docs[activeIdx], doc); },
    activeDoc() { const d = docs[activeIdx]; if (d?.kind !== 'block') return d; const b = proj.blocks.find((x) => x.name === d.name); return { ...d, lang: b?.lang, type: b?.type }; },
    errors: () => lastErrors,
    errorsFor: (name) => lastErrors.filter((e) => e.block === name),
    onSelection() { updateProps(); },
    paletteInsert(item) {
      if (readOnly || !editor) return;
      if (editor.insert && ctx.activeDoc()?.lang === 'LAD') editor.insert(item.key);
      else if (editor.insertText && item.scl) editor.insertText(item.scl);
    },
    gotoError(e) {
      if (e.block === 'PLC tags') { ctx.open({ kind: 'tags' }); return; }
      if (!proj.blocks.some((b) => b.name === e.block)) return;
      if (e.network !== undefined && e.network !== null) { state.sel = { block: e.block, net: +e.network, path: e.path ?? null }; state.scrollTo = +e.network; }
      ctx.open({ kind: 'block', name: e.block });
    },
  };

  const sameDoc = (a, b) => a && b && a.kind === b.kind && (a.kind !== 'block' || a.name === b.name);
  function fixDocs() {
    docs = docs.filter((d) => d.kind !== 'block' || proj.blocks.some((b) => b.name === d.name));
    if (!docs.length) docs.push({ kind: 'block', name: proj.blocks[0]?.name });
    activeIdx = Math.min(activeIdx, docs.length - 1);
  }

  /* ---------------- bố cục ---------------- */
  const tree = createProjectTree(ctx);
  const palette = createPalette(ctx);
  const info = createInfoPane(ctx, ist?.info);
  const docTabs = h('div.doc-tabs', { role: 'tablist', 'aria-label': t('studio.openDocs') });
  const editorHost = h('div.editor-host');
  const center = h('div.studio-center', docTabs, editorHost);
  const vsplit = split({ dir: 'v', a: center, b: info.el, ratio: 0.74, min: 90, key: 'studio-v' });
  const leftToggle = h('button.side-toggle', { type: 'button', title: t('studio.toggleTree'), 'aria-label': t('studio.toggleTree'), onclick: () => toggleSide('tree') }, icon('chevronL', { size: 12 }));
  const rightToggle = h('button.side-toggle.r', { type: 'button', title: t('studio.togglePal'), 'aria-label': t('studio.togglePal'), onclick: () => toggleSide('pal') }, icon('chevronR', { size: 12 }));
  const side = storage.get('bk.studio.side', { tree: true, pal: true });
  const body = h('div.studio-body', h('div.studio-left', tree.el), leftToggle, h('div.studio-mid', vsplit), rightToggle, h('div.studio-right', palette.el));
  const datalist = h('datalist#bk-taglist');
  const el = h('div.studio', { class: readOnly ? 'ro' : '' },
    h('div.narrow-note.only-narrow', icon('info', { size: 18 }), t('studio.narrow')),
    body, datalist);
  applySide();

  function toggleSide(k) { side[k] = !side[k]; storage.set('bk.studio.side', side); applySide(); }
  function applySide() {
    body.classList.toggle('no-tree', !side.tree); body.classList.toggle('no-pal', !side.pal);
    leftToggle.replaceChildren(icon(side.tree ? 'chevronL' : 'chevronR', { size: 12 }));
    rightToggle.replaceChildren(icon(side.pal ? 'chevronR' : 'chevronL', { size: 12 }));
  }

  el.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { ctx.undo(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) { ctx.redo(); e.preventDefault(); }
  });

  function updateDatalist() {
    const opts = [];
    for (const tg of proj.tags || []) opts.push(h('option', { value: `"${tg.name}"` }, `${tg.address} ${tg.type}${tg.comment ? ' — ' + tg.comment : ''}`));
    for (const b of proj.blocks) if (b.type === 'DB') for (const f of b.fields || []) opts.push(h('option', { value: `"${b.name}".${f.name}` }, f.type));
    datalist.replaceChildren(...opts);
  }

  function docLabel(d) {
    if (d.kind === 'tags') return t('tree.tagTable');
    if (d.kind === 'watch') return t('tree.watchTable');
    if (d.kind === 'device') return t('tree.devconf');
    const b = proj.blocks.find((x) => x.name === d.name);
    return b ? `${b.name} [${b.type}${b.number ?? ''}]` : d.name;
  }
  function renderDocTabs() {
    docTabs.replaceChildren(...docs.map((d, i) => h('div.doc-tab', { role: 'tab', 'aria-selected': String(i === activeIdx), tabindex: 0, onclick: () => { activeIdx = i; renderDocTabs(); renderEditor(); tree.render(); palette.render(); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.click(); } },
      h('span', docLabel(d)),
      docs.length > 1 ? h('button.doc-x', { type: 'button', 'aria-label': t('common.close'), title: t('common.close'), onclick: (e) => { e.stopPropagation(); ctx.closeDoc(d); } }, '×') : null)));
  }

  function renderEditor() {
    editor?.dispose?.();
    editor = null;
    const d = docs[activeIdx];
    let node;
    if (d.kind === 'tags') { editor = createTagTable(ctx); node = editor.el; }
    else if (d.kind === 'watch') { editor = createWatchTable(ctx); node = editor.el; }
    else if (d.kind === 'device') { editor = createDeviceView(ctx); node = editor.el; }
    else {
      const b = proj.blocks.find((x) => x.name === d.name);
      if (!b) node = h('div.muted.pad', t('studio.noBlock'));
      else if (b.type === 'DB') { editor = createDbEditor(ctx, b.name); node = editor.el; }
      else {
        const head = h('div.block-head', h('b', b.name), h('span.badge', `${b.type}${b.number ?? ''}`), h('span.badge.info', b.lang || 'LAD'),
          readOnly ? h('span.badge.warn', t('studio.readOnly')) : null, h('span.spacer'),
          monitor ? h('span.badge.ok', icon('eye', { size: 12 }), t('studio.monitoring')) : null);
        const itf = b.type === 'FB' || b.type === 'FC' ? createInterfaceTable(ctx, b.name).el : null;
        editor = b.lang === 'SCL' ? createSclEditor(ctx, b.name) : createLadEditor(ctx, b.name);
        node = h('div.block-editor', { class: b.lang === 'SCL' ? 'is-scl' : 'is-lad' }, head, itf, editor.el);
      }
    }
    editorHost.replaceChildren(node);
    updateProps();
  }

  function updateProps() {
    const d = ctx.activeDoc();
    if (d?.kind === 'block' && d.lang !== 'SCL' && editor?.getSelectedNode) info.setProps(renderLadProps(ctx, editor.getSelectedNode()));
    else info.setProps(h('div.muted.pad', t('props.none')));
  }

  function afterChange(rerender) {
    updateDatalist();
    if (rerender) renderEditor(); else updateProps();
    renderDocTabs(); tree.render(); palette.render();
    onChange(proj);
  }

  if (ist) fixDocs();
  renderDocTabs(); renderEditor(); updateDatalist();

  return {
    el,
    ctx,
    get project() { return proj; },
    setProject(p) { proj = p; undoStack.length = 0; redoStack.length = 0; fixDocs(); renderDocTabs(); renderEditor(); tree.render(); palette.render(); updateDatalist(); },
    setMonitor(on) { monitor = !!on; renderEditor(); },
    tick() { if (monitor) editor?.refreshMonitor?.(); },
    showCompile(res) { lastErrors = res.errors || []; info.setCompile(res); tree.render(); if (editor && docs[activeIdx]?.kind === 'block') renderEditor(); },
    diag(text, kind) { info.addDiag(text, kind); },
    showDiag() { info.showDiag(); },
    flush() { editor?.flush?.(); },
    /** Trạng thái giao diện để tạo lại Studio (đổi ngôn ngữ) mà không mất tab, undo/redo, kết quả biên dịch. */
    getState() { editor?.flush?.(); return { docs: docs.map((d) => ({ ...d })), activeIdx, undo: [...undoStack], redo: [...redoStack], sel: state.sel, monitor, errors: lastErrors, info: info.getState() }; },
    dispose() { editor?.dispose?.(); },
  };
}
