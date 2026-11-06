// Ô hướng dẫn bài lab (trái), 2 tab:
//  • Bài giảng: chuẩn đầu ra "Sau bài này bạn có thể…", các mục bài giảng (Markdown rút gọn), câu hỏi nhanh.
//  • Nhiệm vụ: mục tiêu, bảng I/O (từ def.ioMap), yêu cầu, gợi ý, quy trình.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { machineIo, machineTitle } from '../engine.js';
import { icon } from '../components/icons.js';
import { renderMd, mdInline } from '../components/md.js';
import { getQuiz, setQuiz } from '../lectures.js';
import { trMachine } from '../loc.js';

/** Các bước "Quy trình" theo đúng công cụ của bài (bài robot) hoặc mặc định. */
function howto(lab) {
  const tools = lab.raw?.tools || lab.tools;
  if (!tools) return [t('guide.h1'), t('guide.h2'), t('guide.h3'), t('guide.h4')];
  const out = [];
  if (tools.includes('code')) out.push(t('guide.hCode'));
  if (tools.includes('pendant')) out.push(t('guide.hPendant'), t('guide.hKeys'));
  if (tools.includes('mpe')) out.push(t('guide.h2'));
  out.push(t('guide.h3'), t('guide.h4'));
  return out;
}

export function createGuidePanel({ lab, def, lecture, userId, initialTab = 'task', onCollapse, onTab, onWide, onLocate }) {
  let { inputs, outputs } = machineIo(def);
  if (def?.robotIo) {
    const rio = (l) => (l || []).map((x) => ({ addr: x.tag, tag: 'robot', desc: x.desc }));
    inputs = [...rio(def.robotIo.inputs), ...inputs]; outputs = [...rio(def.robotIo.outputs), ...outputs];
  }
  const summary = lab.summary || trMachine(def)?.summary || '';
  const ioTable = (rows) => h('table.io-table', h('thead', h('tr', h('th', t('guide.addr')), h('th', t('guide.tag')), h('th', t('guide.desc')))),
    h('tbody', rows.map((r) => h('tr', onLocate ? { tabindex: 0, title: t('mv.locateTip'),
      onmouseenter: () => onLocate(r.tag, 'hover'), onmouseleave: () => onLocate(null, 'hover'),
      onclick: () => onLocate(r.tag, 'pin'), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLocate(r.tag, 'pin'); } } } : null,
      h('td.mono', r.addr), h('td.mono', r.tag), h('td', r.desc || '')))));
  const stars = '★'.repeat(lab.level || 1) + '☆'.repeat(Math.max(0, 4 - (lab.level || 1)));
  const mins = lab.raw?.durationMin || lab.durationMin;

  /* ---------- Nhiệm vụ ---------- */
  const taskPane = h('div.guide-body.guide-task', { role: 'tabpanel' },
    h('div.guide-meta', h('span.badge.info', machineTitle(lab.machineId, def)), h('span.badge', { title: t('home.level') }, stars), mins ? h('span.badge', `${mins} ${t('guide.min')}`) : null),
    summary ? h('p.muted', summary) : null,
    lab.objectives?.length ? h('section', h('h3', t('guide.objectives')), h('ul', lab.objectives.map((o) => h('li', o)))) : null,
    lab.steps?.length ? h('section', h('h3', t('guide.steps')), h('ol.steps', lab.steps.map((s) => h('li', s.title ? h('b', s.title + ' ') : null, s.text)))) : null,
    h('section', h('h3', t('guide.io')),
      h('details', { open: true }, h('summary', `${t('io.inputs')} (${inputs.length})`), ioTable(inputs)),
      h('details', { open: true }, h('summary', `${t('io.outputs')} (${outputs.length})`), ioTable(outputs))),
    lab.hints?.length ? h('section', h('details', h('summary', t('guide.hints')), h('ul', lab.hints.map((x) => h('li', x))))) : null,
    h('section.guide-tips', h('h3', t('guide.howto')), h('ol', howto(lab).map((x) => h('li', x)))));

  /* ---------- Bài giảng ---------- */
  const lecPane = h('div.guide-body.guide-lecture', { role: 'tabpanel' });
  if (!lecture) {
    lecPane.append(h('div.lec-empty', icon('book', { size: 28 }), h('p', t('lec.none')), h('button.btn.sm', { type: 'button', onclick: () => setTab('task') }, t('lec.toTask'))));
  } else {
    const article = h('article.lecture');
    if (lecture.outcomes.length) {
      article.append(h('section.lec-outcomes',
        h('h3', t('lec.outcomes')),
        h('ul', lecture.outcomes.map((o) => h('li', o.code ? h('span.oc-code', o.code) : null, h('span', ...mdInline(o.text)))))));
    }
    const toc = lecture.sections.length > 2 ? h('nav.lec-toc', { 'aria-label': t('lec.toc') }, h('b.small', t('lec.toc')),
      h('ul', lecture.sections.map((s, i) => h('li', h('a', { href: '#', onclick: (e) => { e.preventDefault(); article.querySelector(`[data-sec="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, s.title || `#${i + 1}`))))) : null;
    if (toc) article.append(toc);
    lecture.sections.forEach((s, i) => article.append(h('section.lec-sec', { dataset: { sec: String(i) } }, s.title ? h('h2.lec-h', ...mdInline(s.title)) : null, renderMd(s.body))));
    if (lecture.quiz.length) article.append(createQuiz(lecture.quiz, userId, lab.id));
    article.append(h('div.lec-next', h('button.btn.primary', { type: 'button', onclick: () => { onWide?.(false); setTab('task'); } }, t('lec.goTask'), icon('chevronR', { size: 14 }))));
    lecPane.append(
      h('div.guide-meta', lecture.durationMin ? h('span.badge', icon('book', { size: 11 }), `${t('lec.read')} ~${lecture.durationMin} ${t('guide.min')}`) : null,
        lecture.quiz.length ? h('span.badge', t('syl.quizN', { n: lecture.quiz.length })) : null),
      article);
  }

  /* ---------- Khung + tab ---------- */
  let tab = initialTab === 'lecture' ? 'lecture' : 'task';
  const tabBtns = [['lecture', t('guide.lecture'), 'book'], ['task', t('guide.task'), 'check']].map(([id, label, ic]) =>
    h('button.gtab', { type: 'button', role: 'tab', dataset: { id }, onclick: () => setTab(id) }, icon(ic, { size: 13 }), label));
  const wideBtn = h('button.btn.ghost.sm.icon.wide-btn', { type: 'button', title: t('lec.wide'), 'aria-label': t('lec.wide'), onclick: () => onWide?.() }, icon('maximize', { size: 14 }));
  function setTab(id) {
    tab = id;
    tabBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
    lecPane.hidden = id !== 'lecture'; taskPane.hidden = id !== 'task';
    wideBtn.hidden = id !== 'lecture' || !lecture;
    el.dataset.tab = id;
    onTab?.(id);
  }
  const el = h('aside.guide', { 'aria-label': t('guide.title') },
    h('div.guide-head', h('div', h('div.guide-id', lab.id + (lab.week ? ` · ${t('home.week')} ${lab.week}` : '')), h('h2', lab.title)),
      wideBtn,
      h('button.btn.ghost.sm.icon', { type: 'button', title: t('guide.collapse'), 'aria-label': t('guide.collapse'), onclick: onCollapse }, '«')),
    h('div.gtabs', { role: 'tablist' }, tabBtns),
    lecPane, taskPane);
  setTab(tab);
  return { el, setTab, get tab() { return tab; } };
}

/** Câu hỏi nhanh: chọn đáp án → phản hồi ngay; lưu theo SV + lab. */
function createQuiz(quiz, userId, labId) {
  let ans = getQuiz(userId, labId);
  const score = h('span.quiz-score');
  const list = h('ol.quiz-list');
  const box = h('section.quiz', h('div.quiz-head', h('h2.lec-h', t('lec.quiz')), h('span.spacer'), score,
    h('button.btn.ghost.sm', { type: 'button', onclick: () => { ans = {}; setQuiz(userId, labId, ans); render(); } }, icon('reset', { size: 12 }), t('lec.quizReset'))),
  h('p.small.muted', t('lec.quizHint')), list);
  function render() {
    let done = 0, right = 0;
    list.replaceChildren(...quiz.map((q, qi) => {
      const picked = Number.isInteger(ans[qi]) ? ans[qi] : null;
      if (picked !== null) { done++; if (picked === q.answer) right++; }
      const name = `q_${labId}_${qi}`;
      return h('li.quiz-q', { class: picked === null ? '' : picked === q.answer ? 'right' : 'wrong' },
        h('div.quiz-text', ...mdInline(q.q)),
        h('div.quiz-opts', { role: 'radiogroup' }, q.options.map((o, oi) => {
          const cls = picked === null ? '' : oi === q.answer ? 'correct' : oi === picked ? 'picked-wrong' : 'dim';
          return h('label.quiz-opt', { class: cls },
            h('input', { type: 'radio', name, value: String(oi), checked: picked === oi, disabled: picked !== null, onchange: () => { ans = { ...ans, [qi]: oi }; setQuiz(userId, labId, ans); render(); } }),
            h('span', ...mdInline(o)),
            picked !== null && oi === q.answer ? icon('check', { size: 14, cls: 'ok-text' }) : picked === oi ? icon('close', { size: 14, cls: 'err-text' }) : null);
        })),
        picked === null ? null : h('div.quiz-fb', { role: 'status' },
          h('b', { class: picked === q.answer ? 'ok-text' : 'err-text' }, picked === q.answer ? t('lec.right') : t('lec.wrong')),
          q.explain ? h('span', ' ', ...mdInline(q.explain)) : null));
    }));
    score.replaceChildren(done ? h('span.badge', { class: right === quiz.length ? 'ok' : done === quiz.length ? 'warn' : '' }, t('lec.score', { r: right, n: quiz.length })) : '');
  }
  render();
  return box;
}
