// Đề cương học phần: 5 phần, các lab theo thứ tự (tuần, tên, chuẩn đầu ra, trạng thái, liên kết).
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { api } from '../mockApi.js';
import { PARTS, MACHINE_TITLES } from '../course.js';
import { PUBLIC_MODE } from '../config.js';
import { icon } from '../components/icons.js';
import { getLabs } from '../labSession.js';
import { loadCourseInfo, loadLectures, lectureFor } from '../lectures.js';
import { labMinutes } from './home.js';

const STATUS = { todo: ['', 'home.todo'], doing: ['warn', 'home.doing'], submitted: ['err', 'home.submitted'], passed: ['ok', 'home.passed'] };

export async function syllabusPage(_, { user }) {
  const isStudent = user.role === 'student';
  const [info, LECTURES, labs, mine] = await Promise.all([loadCourseInfo(), loadLectures(), getLabs(), isStudent ? api.listLabs(user.classId) : Promise.resolve([])]);
  const st = Object.fromEntries(mine.map((l) => [l.id, l]));
  // Như trang chủ: bản công khai chỉ hiện lab đã có máy mô phỏng.
  const list = labs.filter((l) => l.part && (!PUBLIC_MODE || l.machineId));
  const nLabs = list.filter((l) => l.machineId).length;

  const row = (l) => {
    const lec = lectureFor(LECTURES, l);
    const outcomes = lec?.outcomes?.length ? lec.outcomes : (l.objectives || []).map((x) => ({ code: '', text: x }));
    const s = st[l.id];
    const open = !!l.machineId && (!isStudent || s?.open !== false);
    const [cls, key] = STATUS[s?.status] || STATUS.todo;
    const mins = labMinutes(l, LECTURES);
    return h('li.syl-lab', { class: l.machineId ? '' : 'soon' },
      h('div.syl-week', h('span.muted.small', t('home.week')), h('b', String(s?.week ?? l.week ?? '—'))),
      h('div.syl-main',
        h('div.syl-title',
          h('span.lab-id', l.id), ' ',
          open && isStudent ? h('a', { href: '#/lab/' + l.id }, l.title) : h('span', l.title),
          lec ? h('span.badge.info.ml', { title: t('syl.hasLecture') }, icon('book', { size: 11 }), t('guide.lecture')) : null),
        h('div.syl-meta.muted.small',
          l.machineId ? MACHINE_TITLES[l.machineId] || l.machineId : t('home.soon'),
          mins ? ` · ${mins} ${t('guide.min')}` : '',
          lec?.quiz?.length ? ` · ${t('syl.quizN', { n: lec.quiz.length })}` : ''),
        outcomes.length ? h('ul.syl-outcomes', outcomes.map((o) => h('li', o.code ? h('span.oc-code', o.code) : null, o.text))) : null),
      h('div.syl-side',
        !l.machineId ? h('span.badge', t('home.soon'))
          : !isStudent ? null
            : s?.open === false ? h('span.badge', icon('lock', { size: 12 }), t('home.locked'))
              : h('span.badge', { class: cls }, t(key), s?.score != null ? ` · ${s.score}/${s.max}` : ''),
        open && isStudent ? h('a.btn.sm', { href: '#/lab/' + l.id }, t('syl.open'), icon('chevronR', { size: 13 })) : null));
  };

  const el = h('div.container.syllabus',
    h('div.syl-head',
      h('div.muted.small.syl-kicker', t('nav.syllabus')),
      h('h1', info.title),
      info.subtitle ? h('p.muted', info.subtitle) : null,
      h('p.small.muted', t('syl.summary', { parts: PARTS.filter((p) => list.some((l) => l.part === p.id)).length, labs: nLabs }))),
    ...PARTS.map((p) => {
      const items = list.filter((l) => l.part === p.id);
      if (!items.length) return null;
      return h('section.syl-part.card',
        h('div.card-h', h('h2', p.title), h('span.spacer'), h('span.muted.small', `${t('home.weeks')} ${p.weeks}`)),
        h('ol.syl-list', items.map(row)));
    }));
  return { el };
}
