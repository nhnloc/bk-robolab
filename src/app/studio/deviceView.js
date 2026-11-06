// Cấu hình thiết bị (chỉ xem): CPU ảo + module mở rộng suy ra từ địa chỉ I/O đang dùng.
import { h, svg } from '../dom.js';
import { t } from '../i18n.js';

export function createDeviceView(ctx) {
  const p = ctx.project;
  const addrs = (p.tags || []).map((x) => String(x.address || '').toUpperCase());
  const needDI = addrs.some((a) => /^%I[2-9]\./.test(a));
  const needDQ = addrs.some((a) => /^%Q[2-9]\./.test(a));
  const mods = [
    { slot: 1, name: `CPU ${p.cpu || '1214C'} DC/DC/DC`, io: 'DI 14 (%I0.0–%I1.5) · DQ 10 (%Q0.0–%Q1.1) · AI 2 (%IW64, %IW66)', cpu: true },
    needDI ? { slot: 2, name: 'SM 1221 DI 16', io: '%I2.0–%I3.7' } : null,
    needDQ ? { slot: 3, name: 'SM 1222 DQ 16', io: '%Q2.0–%Q3.7' } : null,
  ].filter(Boolean);
  const rack = svg('svg', { viewBox: `0 0 ${80 + mods.length * 110} 150`, class: 'rack', role: 'img', 'aria-label': t('dev.rack') },
    svg('rect', { x: 0, y: 128, width: 80 + mods.length * 110, height: 10, class: 'rail-din' }),
    ...mods.map((m, i) => svg('g', { transform: `translate(${20 + i * 110},10)` },
      svg('rect', { width: m.cpu ? 100 : 60, height: 120, rx: 3, class: m.cpu ? 'mod cpu' : 'mod' }),
      svg('rect', { x: 8, y: 10, width: m.cpu ? 84 : 44, height: 10, class: 'mod-term' }),
      svg('rect', { x: 8, y: 100, width: m.cpu ? 84 : 44, height: 10, class: 'mod-term' }),
      svg('text', { x: m.cpu ? 50 : 30, y: 62, 'text-anchor': 'middle', class: 'mod-t' }, m.cpu ? 'CPU' : 'SM'),
      svg('text', { x: m.cpu ? 50 : 30, y: 78, 'text-anchor': 'middle', class: 'mod-s' }, m.cpu ? (p.cpu || '1214C') : m.name.split(' ')[1]),
      m.cpu ? svg('circle', { cx: 16, cy: 36, r: 4, class: 'mod-led' }) : null)));
  const el = h('div.doc-pane',
    h('div.doc-head', h('h3', t('tree.devconf')), h('span.muted.small', t('dev.note'))),
    h('div.dev-rack', rack),
    h('table.table', h('thead', h('tr', h('th', t('dev.slot')), h('th', t('dev.module')), h('th', t('dev.addr')))),
      h('tbody', mods.map((m) => h('tr', h('td', String(m.slot)), h('td', m.name), h('td.mono', m.io))))),
    h('p.muted.small.pad', t('dev.cycle')));
  return { el };
}
