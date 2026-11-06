// Giảng viên (chỉ trên máy): soạn danh sách lớp → tải xuống classes.json → thay data/classes.json trong repo → git push.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { api } from '../mockApi.js';
import { storage } from '../store.js';
import { icon } from '../components/icons.js';
import { toast, confirmBox } from '../components/ui.js';
import { loadClasses, classesToJson, CLASS_ID_RE } from '../classes.js';

const DRAFT = 'bk.classes.draft';

function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export async function classListPage(_, { carry } = {}) {
  let fileList = [], fileErr = '';
  try { fileList = await loadClasses({ force: true }); } catch (e) { fileErr = e.message; }
  const counts = Object.fromEntries((await api.listClasses()).map((c) => [c.id, c.studentCount]));
  const draft = storage.get(DRAFT);
  let rows = (Array.isArray(draft) ? draft : fileList).map((c) => ({ ...c, _orig: fileList.some((f) => f.id === c.id) ? c.id : null }));
  // Đổi ngôn ngữ: giữ nguyên các dòng đang soạn (kể cả dòng chưa hợp lệ) và ghi chú bản nháp như trước.
  const keep = carry?.classList || null;
  if (keep) { carry.taken = true; rows = keep.rows; }
  const showDraftNote = keep ? keep.showDraftNote : Array.isArray(draft);

  const tbody = h('tbody');
  const preview = h('pre.json-preview.mono');
  const status = h('div.small');
  const dlBtn = h('button.btn.primary', { type: 'button', onclick: download }, icon('download', { size: 15 }), t('cl.download'));

  function validate() {
    const errs = [];
    const ids = new Map();
    rows.forEach((r, i) => {
      const id = r.id.trim();
      r._err = {};
      if (!id) r._err.id = t('cl.errIdEmpty');
      else if (!CLASS_ID_RE.test(id)) r._err.id = t('cl.errIdChars');
      else if (ids.has(id)) r._err.id = t('cl.errIdDup');
      ids.set(id, i);
      if (!r.name.trim()) r._err.name = t('cl.errName');
      if (r._err.id || r._err.name) errs.push(i);
    });
    if (!rows.length) errs.push(-1);
    return errs;
  }
  function changed() {
    const a = classesToJson(rows), b = classesToJson(fileList);
    return a !== b;
  }
  function persist() {
    if (changed()) storage.set(DRAFT, rows.map(({ id, name, term }) => ({ id, name, term })));
    else storage.remove(DRAFT);
  }
  function refresh() {
    const errs = validate();
    rows.forEach((r, i) => {
      const tr = tbody.children[i]; if (!tr) return;
      const [idIn, nameIn] = tr.querySelectorAll('input');
      idIn.classList.toggle('invalid', !!r._err.id); idIn.title = r._err.id || '';
      nameIn.classList.toggle('invalid', !!r._err.name); nameIn.title = r._err.name || '';
      tr.querySelector('.row-err').textContent = r._err.id || r._err.name || '';
      const warn = tr.querySelector('.row-warn');
      warn.hidden = !(r._orig && r.id.trim() !== r._orig && counts[r._orig]);
    });
    preview.textContent = classesToJson(rows);
    dlBtn.disabled = errs.length > 0;
    const dirty = changed();
    status.replaceChildren(errs.includes(-1) ? h('span.err-text', t('cl.errEmpty'))
      : errs.length ? h('span.err-text', icon('warn', { size: 13 }), ' ', t('cl.errFix'))
        : dirty ? h('span.warn-text', icon('info', { size: 13 }), ' ', t('cl.dirty')) : h('span.ok-text', icon('check', { size: 13 }), ' ', t('cl.same')));
    persist();
  }
  function rowEl(r) {
    const del = h('button.btn.ghost.sm.icon', { type: 'button', title: t('common.delete'), 'aria-label': t('common.delete'), onclick: async () => {
      const n = counts[r._orig || r.id] || 0;
      if (n && !(await confirmBox(t('cl.delTitle'), t('cl.delMsg', { n }), t('common.delete')))) return;
      const i = rows.indexOf(r); rows.splice(i, 1); tbody.children[i].remove(); refresh();
    } }, icon('trash', { size: 14 }));
    const inp = (key, ph, extra = {}) => h('input.input.sm', { value: r[key], placeholder: ph, 'aria-label': ph, ...extra, oninput: (e) => { r[key] = e.target.value; refresh(); } });
    return h('tr',
      h('td', inp('id', t('cl.id'), { class: 'mono', maxlength: 40, spellcheck: 'false' }), h('div.small.warn-text.row-warn', { hidden: true }, t('cl.idRenameWarn'))),
      h('td', inp('name', t('cl.name'), { maxlength: 120 })),
      h('td', inp('term', t('cl.term'), { maxlength: 40 })),
      h('td.num.muted', String(counts[r._orig || r.id] || 0)),
      h('td', del),
      h('td.small.err-text.row-err'));
  }
  function renderRows() { tbody.replaceChildren(...rows.map(rowEl)); refresh(); }
  function add() {
    rows.push({ id: '', name: '', term: rows[rows.length - 1]?.term || '', _orig: null });
    tbody.append(rowEl(rows[rows.length - 1])); refresh();
    tbody.lastElementChild?.querySelector('input')?.focus();
  }
  async function resetToFile() {
    if (changed() && !(await confirmBox(t('cl.resetTitle'), t('cl.resetMsg'), t('cl.reset')))) return;
    storage.remove(DRAFT);
    rows = fileList.map((c) => ({ ...c, _orig: c.id }));
    renderRows();
  }
  function download() {
    if (validate().length) { refresh(); return; }
    downloadJson('classes.json', classesToJson(rows));
    toast(t('cl.downloaded'), 'ok', 4000);
  }

  const el = h('div.container',
    h('div.home-head', h('div', h('h1', t('nav.classList')), h('p.muted', t('cl.sub')))),
    fileErr ? h('div.note-box.err', icon('warn', { size: 16 }), h('div', fileErr, ' ', t('cl.fileErrHint'))) : null,
    showDraftNote ? h('div.note-box', icon('info', { size: 16 }), h('div', t('cl.draftLoaded'))) : null,
    h('div.cl-grid',
      h('div.card',
        h('div.card-h', h('b', t('cl.edit')), h('span.spacer'),
          h('button.btn.sm', { type: 'button', onclick: resetToFile, title: t('cl.resetTip') }, icon('reset', { size: 13 }), t('cl.reset')),
          h('button.btn.sm', { type: 'button', onclick: add }, icon('plus', { size: 13 }), t('cl.add'))),
        h('div.gb-wrap', h('table.table.cl-table',
          h('thead', h('tr', h('th', t('cl.id')), h('th', t('cl.name')), h('th', t('cl.term')), h('th.num', { title: t('cl.countTip') }, t('cl.count')), h('th', ''), h('th', ''))),
          tbody)),
        h('div.card-b', h('p.small.muted', t('cl.idHelp')), status)),
      h('div.card',
        h('div.card-h', h('b', t('cl.preview')), h('span.muted.small.mono', 'data/classes.json')),
        h('div.card-b',
          preview,
          h('div.row.mt', dlBtn),
          h('ol.cl-steps.small',
            h('li', t('cl.s1')),
            h('li', t('cl.s2pre'), ' ', h('code', 'data/classes.json'), ' ', t('cl.s2post')),
            h('li', t('cl.s3'), ' ', h('code', `git add data/classes.json && git commit -m "${t('cl.commitMsg')}" && git push`)),
            h('li', t('cl.s4')))))));
  renderRows();
  return { el, dispose: (o) => (o?.relang ? { classList: { rows, showDraftNote } } : undefined) };
}
