// Thành phần giao diện dùng chung: toast, modal, tabs, splitter, nút có icon.
import { h } from '../dom.js';
import { icon } from './icons.js';
import { t } from '../i18n.js';
import { storage } from '../store.js';

let toastBox = null;
export function toast(msg, kind = 'info', ms = 3200) {
  if (!toastBox) { toastBox = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
  const el = h('div.toast', { class: kind }, msg);
  toastBox.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** modal({title, body, actions:[{label, primary, danger, onClick→(close)=>…}]}) → Promise<value|null> */
export function modal({ title, body, actions, width, cls }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const close = (val = null) => { back.remove(); document.removeEventListener('keydown', onKey, true); prevFocus?.focus?.(); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    const acts = (actions || [{ label: t('common.close'), primary: true, value: true }]).map((a) =>
      h('button.btn', { class: [a.primary && 'primary', a.danger && 'danger'], type: 'button', onclick: async () => {
        if (a.onClick) { const r = await a.onClick(close); if (r === false) return; }
        close(a.value !== undefined ? a.value : true);
      } }, a.label));
    const box = h('div.modal', { class: cls || null, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: width ? { width: `min(${width}px, 100%)` } : null },
      h('div.modal-h', title), h('div.modal-b', body), h('div.modal-f', acts));
    const back = h('div.modal-back', { onmousedown: (e) => { if (e.target === back) close(null); } }, box);
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    const first = box.querySelector('input, select, textarea') || box.querySelector('.modal-f .primary');
    setTimeout(() => first?.focus(), 0);
  });
}

export function confirmBox(title, message, okLabel) {
  return modal({ title, body: h('p', message), actions: [
    { label: t('common.cancel'), value: false },
    { label: okLabel || t('common.ok'), primary: true, value: true },
  ] });
}

/** Thanh tab: tabs([{id,label,icon}], active, onSelect) */
export function tabBar(items, active, onSelect, cls = '') {
  const bar = h('div.tabs', { role: 'tablist', class: cls });
  const btns = items.map((it) => h('button.tab', {
    role: 'tab', type: 'button', 'aria-selected': String(it.id === active), dataset: { id: it.id },
    onclick: () => { setActive(it.id); onSelect(it.id); },
  }, it.icon ? icon(it.icon, { size: 14 }) : null, it.label));
  bar.append(...btns);
  function setActive(id) { btns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id))); }
  bar.setActive = setActive;
  return bar;
}

/**
 * Splitter 2 ngăn có thể kéo; lưu tỉ lệ vào storage.
 * split({dir:'h'|'v', a, b, ratio:0.5, min:120, key})
 */
export function split({ dir = 'h', a, b, ratio = 0.5, min = 120, key, onResize }) {
  const saved = key ? storage.get('bk.split.' + key) : null;
  let r = typeof saved === 'number' ? saved : ratio;
  const pa = h('div.pane', a), pb = h('div.pane', b);
  const gutter = h('div.gutter', { role: 'separator', tabindex: 0, 'aria-orientation': dir === 'h' ? 'vertical' : 'horizontal', 'aria-label': t('common.resize') });
  const el = h('div.split', { class: dir }, pa, gutter, pb);
  const apply = () => {
    pa.style.flex = `0 0 calc(${(r * 100).toFixed(2)}% - 3px)`;
    pb.style.flex = '1 1 0';
    onResize?.(r);
  };
  apply();
  let collapsed = null;
  const setRatio = (nr, save = true) => {
    const size = dir === 'h' ? el.clientWidth : el.clientHeight;
    const mn = size > 0 ? Math.min(0.45, min / size) : 0.1;
    r = Math.max(mn, Math.min(1 - mn, nr));
    apply();
    if (save && key) storage.set('bk.split.' + key, r);
  };
  gutter.addEventListener('pointerdown', (e) => {
    e.preventDefault(); gutter.setPointerCapture(e.pointerId); gutter.classList.add('drag');
    const rect = el.getBoundingClientRect();
    const move = (ev) => setRatio(dir === 'h' ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height);
    const up = () => { gutter.classList.remove('drag'); gutter.removeEventListener('pointermove', move); gutter.removeEventListener('pointerup', up); };
    gutter.addEventListener('pointermove', move); gutter.addEventListener('pointerup', up);
  });
  gutter.addEventListener('keydown', (e) => {
    const dec = dir === 'h' ? 'ArrowLeft' : 'ArrowUp', inc = dir === 'h' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === dec) { setRatio(r - 0.03); e.preventDefault(); }
    if (e.key === inc) { setRatio(r + 0.03); e.preventDefault(); }
  });
  /** Hiển thị chỉ 1 ngăn ('a' | 'b') hoặc cả hai (null). */
  el.solo = (which) => {
    collapsed = which;
    pa.hidden = which === 'b'; pb.hidden = which === 'a'; gutter.hidden = !!which;
    if (which === 'a') pa.style.flex = '1 1 0'; else apply();
    onResize?.(r);
  };
  el.getSolo = () => collapsed;
  el.setRatio = setRatio;
  return el;
}

export function iconBtn(name, title, onClick, { cls = 'ghost', size = 16, text, disabled } = {}) {
  return h('button.btn', { class: [cls, !text && 'icon'], type: 'button', title, 'aria-label': title, onclick: onClick, disabled }, icon(name, { size }), text || null);
}

export function emptyState(msg) { return h('div.empty', msg); }
