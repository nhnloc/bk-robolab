// Khởi động ứng dụng: thanh trên, router, phân quyền theo vai trò.
import { h, $ } from './dom.js';
import { PUBLIC_MODE } from './config.js';
import { router } from './router.js';
import { settings, applyTheme } from './store.js';
import { t, setLang, getLang } from './i18n.js';
import { api } from './mockApi.js';
import { icon } from './components/icons.js';
import { loadEngine } from './engine.js';
import { loadClassesSafe } from './classes.js';
import { syllabusPage } from './pages/syllabus.js';
import { classListPage } from './pages/classList.js';
import { loginPage } from './pages/login.js';
import { homePage } from './pages/home.js';
import { labPage } from './pages/lab.js';
import { teacherPage } from './pages/teacher.js';
import { classPage } from './pages/teacherClass.js';
import { reviewPage } from './pages/review.js';
import { locReady } from './loc.js';

applyTheme();
setLang(settings.lang);
const root = $('#app');
let current = null;
let renderToken = 0;
let relangPending = false;

/** Đổi ngôn ngữ: vẽ lại trang hiện tại. Trang có PLC/máy đang chạy giữ nguyên phiên qua "carry" (xem show()). */
function switchLang() {
  settings.lang = getLang() === 'vi' ? 'en' : 'vi';
  setLang(settings.lang);
  relangPending = true;
  router.resolve();
}

function topbar(user, active) {
  const nav = user?.role === 'teacher'
    ? [['#/teacher', t('nav.classes'), 'teacher'], ['#/teacher/classes', t('nav.classList'), 'classlist'], ['#/syllabus', t('nav.syllabus'), 'syllabus']]
    : user ? [['#/home', t('nav.home'), 'home'], ['#/syllabus', t('nav.syllabus'), 'syllabus']] : [];
  const engBadge = h('span.badge.eng-badge', { hidden: true });
  loadEngine().then((e) => { engBadge.hidden = false; engBadge.textContent = e.isFake ? t('app.engineFake') : t('app.engineReal'); engBadge.className = 'badge eng-badge ' + (e.isFake ? 'warn' : 'ok'); engBadge.title = e.isFake ? t('app.engineFakeTip') : ''; });
  return h('header.topbar',
    h('a.brand', { href: user ? (user.role === 'teacher' ? '#/teacher' : '#/home') : '#/login', 'aria-label': 'BK-RoboLab' },
      h('span.brand-logo', icon('bolt', { size: 18 })), 'BK-RoboLab', h('small', t('app.tagline'))),
    h('nav.topnav', nav.map(([href, label, key]) => h('a', { href, class: active === key ? 'active' : '' }, label))),
    h('span.spacer'),
    h('span.hide-narrow', engBadge),
    h('button.btn.ghost.sm', { type: 'button', title: t('app.lang'), 'aria-label': t('app.lang'), onclick: switchLang }, getLang() === 'vi' ? 'EN' : 'VI'),
    h('button.btn.ghost.icon', { type: 'button', title: t('app.theme'), 'aria-label': t('app.theme'), onclick: () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; window.dispatchEvent(new Event('bk-theme')); render(); } }, icon(settings.theme === 'dark' ? 'sun' : 'moon')),
    user ? userChip(user) : null,
    user ? h('button.btn.ghost.sm.switch-acc', { type: 'button', title: t('app.logoutTip'), onclick: async () => { await disposeCurrent(); await api.logout(); router.go('/login'); } }, icon('logout', { size: 15 }), h('span.hide-mid', t('app.logout'))) : null);
  function render() { const nb = topbar(user, active); root.querySelector('.topbar')?.replaceWith(nb); }
}
function userChip(user) {
  if (user.role === 'teacher') return h('div.user-chip', h('span.avatar', t('teacher.avatar')), h('span.hide-narrow', h('div', user.name), h('span.role-badge', t('role.teacher'))));
  const clsName = h('span', user.className || user.classId || '');
  // Tên lớp mới nhất từ data/classes.json (giảng viên có thể đã đổi tên).
  loadClassesSafe().then((list) => { const c = list.find((x) => x.id === user.classId); if (c) { clsName.textContent = c.name; chip.title = `${user.name} · ${user.mssv} · ${c.name}`; } });
  const chip = h('div.user-chip', { title: `${user.name} · ${user.mssv} · ${user.className || user.classId}` },
    h('span.avatar', initials(user.name)),
    h('span.hide-narrow.user-meta', h('div.user-name', user.name), h('div.user-sub', h('span.mono', user.mssv), ' · ', clsName)));
  return chip;
}
/** Đóng trang hiện tại (lưu nốt bài đang soạn) trước khi đăng xuất. */
async function disposeCurrent() {
  try { current?.dispose?.(); } catch (e) { console.warn(e); }
  current = null;
  await new Promise((r) => setTimeout(r, 30)); // để lệnh lưu cuối kịp ghi
}
const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(-2).map((x) => x[0]).join('').toUpperCase();

async function show(pageFn, params, { role, active, full } = {}) {
  const token = ++renderToken;
  const user = await api.getMe();
  if (role && !user) { router.go('/login', { replace: true }); return; }
  if (role && role !== 'any' && user.role !== role) { router.go(user.role === 'teacher' ? '/teacher' : '/home', { replace: true }); return; }
  // Đổi ngôn ngữ: trang cũ trả "carry" (phiên PLC/máy, trạng thái soạn thảo…) để trang mới dùng lại.
  const relang = relangPending; relangPending = false;
  let carry = null;
  const scroll = relang ? [root.querySelector('main.page')?.scrollTop || 0, window.scrollY] : null;
  try { carry = current?.dispose?.(relang ? { relang: true } : undefined) || null; } catch (e) { console.warn(e); }
  if (carry && typeof carry !== 'object') carry = null;
  if (carry) carry.path = router.path;
  current = null;
  const page = h('main.page', { class: full ? 'full' : '' });
  root.replaceChildren(topbar(user, active), page);
  try {
    const res = await pageFn(params, { user, page, carry });
    if (token !== renderToken) { res?.dispose?.(); return; }
    current = res;
    if (res?.el) page.replaceChildren(res.el);
    if (scroll) { page.scrollTop = scroll[0]; window.scrollTo(0, scroll[1]); }
  } catch (e) {
    console.error(e);
    page.replaceChildren(h('div.container', h('div.card', h('div.card-b', h('h2', t('app.error')), h('p.err-text', String(e.message || e)), h('a', { href: '#/' }, t('app.backHome'))))));
  } finally {
    // Trang mới không nhận carry (vd. lỗi) → giải phóng phiên cũ.
    if (carry && !carry.taken) { try { carry.release?.(); } catch (e) { console.warn(e); } }
  }
}

const teacherGuard = (fn) => async (p) => { const u = await api.getMe(); return u && u.role === 'teacher' ? fn(p) : router.go(u ? '/home' : '/login', { replace: true }); };
router
  .add('/', async () => { const u = await api.getMe(); router.go(!u ? '/login' : u.role === 'teacher' ? '/teacher' : '/home', { replace: true }); })
  .add('/login', (p) => show(loginPage, p, {}))
  .add('/home', (p) => show(homePage, p, { role: 'student', active: 'home' }))
  .add('/lab/:id', (p) => show(labPage, p, { role: 'student', active: 'home', full: true }))
  .add('/syllabus', (p) => show(syllabusPage, p, { role: 'any', active: 'syllabus' }))
  .add('/teacher/classes', teacherGuard((p) => show(classListPage, p, { role: 'teacher', active: 'classlist' })))
  .add('/teacher', teacherGuard((p) => show(teacherPage, p, { role: 'teacher', active: 'teacher' })))
  .add('/teacher/class/:id', teacherGuard((p) => show(classPage, p, { role: 'teacher', active: 'teacher' })))
  .add('/teacher/review/:student/:lab', teacherGuard((p) => show(reviewPage, p, { role: 'teacher', active: 'teacher', full: true })))
  .add('/teacher/solution/:lab', teacherGuard((p) => show(reviewPage, { ...p, solution: true }, { role: 'teacher', active: 'teacher', full: true })));
router.on('notfound', () => router.go('/', { replace: true }));
await locReady;
router.resolve();
loadEngine();
