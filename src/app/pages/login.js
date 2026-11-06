// Đăng ký / Đăng nhập sinh viên (không mật khẩu — trang luyện tập). Giảng viên: chỉ khi chạy trên máy.
import { h } from '../dom.js';
import { PUBLIC_MODE } from '../config.js';
import { loadTeacherConfig } from '../teacherAuth.js';
import { t } from '../i18n.js';
import { api, MSSV_RE, normMssv, normName } from '../mockApi.js';
import { loadClasses } from '../classes.js';
import { router } from '../router.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/ui.js';

export async function loginPage(_, { carry } = {}) {
  // Đổi ngôn ngữ: giữ chữ đã nhập và tab đang chọn.
  const keep = carry?.login || null;
  if (keep) carry.taken = true;
  let mode = keep?.mode || (api.localStudentCount() ? 'login' : 'register');

  /* ---------- Đăng ký ---------- */
  const rName = h('input.input#rg-name', { autocomplete: 'name', maxlength: 80, placeholder: t('reg.namePh'), required: true, value: keep?.name || '' });
  const rClass = h('select.select#rg-class', { required: true, disabled: true }, h('option', { value: '' }, t('common.loading')));
  const rMssv = h('input.input#rg-mssv', { inputmode: 'numeric', autocomplete: 'off', maxlength: 14, placeholder: '2210123', required: true, value: keep?.mssv || '' });
  const rClassMsg = h('div.small.field-msg');
  const rErr = h('div.err-text.small', { role: 'alert' });
  const rBtn = h('button.btn.primary.wide', { type: 'submit' }, t('reg.submit'));
  const fieldErr = (input, msg) => { input.classList.toggle('invalid', !!msg); input.setAttribute('aria-invalid', String(!!msg)); };

  async function fillClasses() {
    rClass.disabled = true; rClassMsg.replaceChildren();
    try {
      const list = await loadClasses({ force: true });
      if (!list.length) throw new Error(t('reg.noClasses'));
      rClass.replaceChildren(h('option', { value: '' }, t('reg.pickClass')), ...list.map((c) => h('option', { value: c.id }, c.term ? `${c.name} (${c.term})` : c.name)));
      if (list.length === 1) rClass.value = list[0].id;
      if (keep?.classId && list.some((c) => c.id === keep.classId)) rClass.value = keep.classId;
      rClass.disabled = false; rBtn.disabled = false;
    } catch (e) {
      rClass.replaceChildren(h('option', { value: '' }, '—'));
      rBtn.disabled = true;
      rClassMsg.replaceChildren(h('span.err-text', icon('warn', { size: 13 }), ' ', e.message, ' '),
        h('button.btn.ghost.sm', { type: 'button', onclick: fillClasses }, icon('reset', { size: 12 }), t('reg.retry')));
    }
  }

  const regForm = h('form.login-form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); rErr.textContent = '';
    const nm = normName(rName.value), ms = normMssv(rMssv.value);
    fieldErr(rName, nm.length < 2); fieldErr(rClass, !rClass.value); fieldErr(rMssv, !MSSV_RE.test(ms));
    if (nm.length < 2) { rErr.textContent = t('reg.errName'); rName.focus(); return; }
    if (!rClass.value) { rErr.textContent = t('reg.errClass'); rClass.focus(); return; }
    if (!MSSV_RE.test(ms)) { rErr.textContent = t('reg.errMssv'); rMssv.focus(); return; }
    rBtn.disabled = true;
    try {
      const { restored } = await api.register({ name: nm, classId: rClass.value, mssv: ms });
      if (restored) toast(t('reg.restored'), 'ok', 4000);
      router.go('/home');
    } catch (ex) { rErr.textContent = ex.message; } finally { rBtn.disabled = false; }
  } },
    h('label.field', { for: 'rg-name' }, h('span', t('reg.name')), rName),
    h('label.field', { for: 'rg-class' }, h('span', t('reg.class')), rClass, rClassMsg),
    h('label.field', { for: 'rg-mssv' }, h('span', t('reg.mssv')), rMssv, h('small.muted', t('reg.mssvHint'))),
    rErr, rBtn);
  rMssv.addEventListener('input', () => fieldErr(rMssv, false));
  rName.addEventListener('input', () => fieldErr(rName, false));
  rClass.addEventListener('change', () => fieldErr(rClass, false));

  /* ---------- Đăng nhập ---------- */
  const lMssv = h('input.input#lg-mssv', { inputmode: 'numeric', autocomplete: 'username', maxlength: 14, placeholder: '2210123', required: true, value: keep?.lmssv || '' });
  const lErr = h('div.err-text.small', { role: 'alert' });
  const lBtn = h('button.btn.primary.wide', { type: 'submit' }, t('login.submit'));
  const loginForm = h('form.login-form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); lErr.textContent = ''; lBtn.disabled = true;
    try { await api.loginStudent({ mssv: lMssv.value }); router.go('/home'); }
    catch (ex) { lErr.textContent = ex.message; fieldErr(lMssv, true); }
    finally { lBtn.disabled = false; }
  } },
    h('label.field', { for: 'lg-mssv' }, h('span', t('reg.mssv')), lMssv),
    lErr, lBtn);
  lMssv.addEventListener('input', () => fieldErr(lMssv, false));

  /* ---------- Chuyển tab ---------- */
  const seg = h('div.seg.seg-full', { role: 'tablist', 'aria-label': t('login.title') },
    ...[['register', t('reg.tab')], ['login', t('login.tab')]].map(([id, l]) => h('button.seg-btn', { type: 'button', role: 'tab', dataset: { id }, onclick: () => setMode(id) }, l)));
  function setMode(m) {
    mode = m;
    seg.querySelectorAll('.seg-btn').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.id === m)); b.setAttribute('aria-pressed', String(b.dataset.id === m)); });
    regForm.hidden = m !== 'register'; loginForm.hidden = m !== 'login';
    setTimeout(() => (m === 'register' ? rName : lMssv).focus(), 0);
  }
  setMode(mode);
  fillClasses();

  // Đăng nhập giảng viên: ô mật khẩu (ẩn dưới liên kết để không làm rối trang sinh viên)
  const tErr = h('div.err-text.small', { role: 'alert' });
  const tPass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: t('login.teacherPass'), 'aria-label': t('login.teacherPass') });
  const tSubmit = async (e) => {
    e?.preventDefault();
    tErr.textContent = '';
    try { await api.loginTeacher(tPass.value); router.go('/teacher'); } catch (x) { tErr.textContent = x.message || String(x); }
  };
  const tForm = h('form.teacher-form', { onsubmit: tSubmit, hidden: true },
    h('div.teacher-row', tPass, h('button.btn.sm.primary', { type: 'submit' }, icon('user', { size: 13 }), t('login.submit'))), tErr);
  const tToggle = h('button.btn.sm.ghost', { type: 'button', onclick: async () => {
    if (!PUBLIC_MODE && !(await loadTeacherConfig())) { try { await api.loginTeacher(); router.go('/teacher'); } catch (x) { tErr.textContent = x.message; tForm.hidden = false; } return; }
    tForm.hidden = !tForm.hidden; if (!tForm.hidden) tPass.focus();
  } }, icon('user', { size: 13 }), t('login.forTeacher'));
  const teacherBox = h('div.teacher-entry', h('div.teacher-head', tToggle), tForm);

  const el = h('div.login-page',
    h('div.login-hero',
      h('div.hero-mark', icon('bolt', { size: 40 })),
      h('h1', 'BK-RoboLab'),
      h('p', t('login.hero')),
      h('ul.hero-list', [t('login.f1'), t('login.f2'), t('login.f3'), t('login.f4')].map((x) => h('li', icon('check', { size: 15 }), x))),
      h('p.small.hero-legal', t('app.legal'))),
    h('div.login-card.card', h('div.card-b',
      h('h2', t('login.title')),
      seg, regForm, loginForm,
      h('p.muted.small.demo', icon('info', { size: 14 }), h('span', t('login.note'))),
      teacherBox)));
  return {
    el,
    dispose: (o) => (o?.relang ? { login: { mode, name: rName.value, classId: rClass.value, mssv: rMssv.value, lmssv: lMssv.value } } : undefined),
  };
}
