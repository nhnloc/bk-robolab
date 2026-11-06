// Trang giảng viên: danh sách lớp + danh mục lab có máy mô phỏng (xem lời giải tham khảo).
import { h } from '../dom.js';
import { PUBLIC_MODE } from '../config.js';
import { t } from '../i18n.js';
import { api } from '../mockApi.js';
import { icon } from '../components/icons.js';
import { getLabs } from '../labSession.js';
import { MACHINE_TITLES } from '../course.js';

/** Ghi chú trung thực: không có server, dữ liệu SV nằm trên trình duyệt của từng SV. */
export function localNote() {
  return h('div.note-box', icon('info', { size: 16 }), h('div', h('b', t('teacher.localTitle')), ' ', t('teacher.localNote')));
}

export async function teacherPage(_, { user }) {
  const [classes, labs] = await Promise.all([api.listClasses(), getLabs()]);
  const machineLabs = labs.filter((l) => l.machineId);
  const el = h('div.container',
    h('div.home-head', h('div', h('h1', t('teacher.hello', { name: user.name })), h('p.muted', t('teacher.sub')))),
    h('div.row.section-row', h('h2.section-h', t('teacher.classes')), h('span.spacer'), h('a.btn.sm', { href: '#/teacher/classes' }, icon('table', { size: 14 }), t('nav.classList'))),
    localNote(),
    classes.length ? null : h('div.card', h('div.empty', t('teacher.noClasses'))),
    h('div.class-grid', classes.map((c) => h('a.card.class-card', { href: '#/teacher/class/' + encodeURIComponent(c.id) },
      h('div.card-b', h('div.row', icon('user', { size: 18 }), h('b', c.name)), h('div.muted.small', [c.id, c.term].filter(Boolean).join(' · '), c.inFile === false ? h('span.badge.warn.ml', t('teacher.notInFile')) : null),
        h('div.row.class-stats', h('span.badge.info', t('teacher.students', { n: c.studentCount })), h('span.spacer'), h('span.link-more', t('teacher.open'), icon('chevronR', { size: 14 }))))))),
    h('h2.section-h', t('teacher.labs')),
    h('div.card', h('table.table',
      h('thead', h('tr', h('th', t('common.lab')), h('th', t('teacher.labTitle')), h('th', t('teacher.machine')), h('th', t('teacher.week')), h('th', ''))),
      h('tbody', machineLabs.map((l) => h('tr', h('td.mono', l.id), h('td', l.title), h('td', MACHINE_TITLES[l.machineId] || l.machineId), h('td', String(l.week ?? '')),
        h('td', PUBLIC_MODE ? h('span.muted.small', t('teacher.solutionLocal')) : h('a.btn.sm', { href: `#/teacher/solution/${l.id}`, title: t('teacher.solutionTip') }, icon('eye', { size: 14 }), t('teacher.solution')))))))),
  );
  return { el };
}
