// Trợ giúp DOM nhỏ gọn: h('div.cls#id', props, ...children), svg(...), Emitter.

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(el, props, isSvg) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class' || k === 'className') {
      const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      if (isSvg) el.setAttribute('class', (el.getAttribute('class') ? el.getAttribute('class') + ' ' : '') + cls);
      else el.className = (el.className ? el.className + ' ' : '') + cls;
    } else if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else Object.assign(el.style, v);
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'ref' && typeof v === 'function') {
      v(el);
    } else if (!isSvg && (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'innerHTML' || k === 'textContent' || k === 'hidden' || k === 'indeterminate')) {
      el[k] = v;
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/** Tạo phần tử HTML. tag dạng 'div.a.b#id'. props có thể bỏ qua. */
export function h(tag, props, ...children) {
  if (props instanceof Node || Array.isArray(props) || typeof props !== 'object' || props === null) {
    if (props !== undefined && props !== null) children.unshift(props);
    props = null;
  }
  const m = /^([a-zA-Z0-9-]*)((?:[.#][\w-]+)*)$/.exec(tag);
  const name = (m && m[1]) || 'div';
  const el = document.createElement(name);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
    }
  }
  applyProps(el, props, false);
  appendChildren(el, children);
  return el;
}

/** Tạo phần tử SVG. */
export function svg(tag, props, ...children) {
  if (props instanceof Node || Array.isArray(props) || typeof props !== 'object' || props === null) {
    if (props !== undefined && props !== null) children.unshift(props);
    props = null;
  }
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props, true);
  appendChildren(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function replace(el, ...children) { clear(el); appendChildren(el, children); return el; }

export class Emitter {
  constructor() { this._l = new Map(); }
  on(ev, cb) { if (!this._l.has(ev)) this._l.set(ev, new Set()); this._l.get(ev).add(cb); return () => this.off(ev, cb); }
  off(ev, cb) { this._l.get(ev)?.delete(cb); }
  emit(ev, data) { for (const cb of [...(this._l.get(ev) || [])]) { try { cb(data); } catch (e) { console.warn('[emit]', ev, e); } } }
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);

/** Định dạng giá trị đọc từ PLC cho hiển thị monitor. */
export function fmtValue(v) {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  if (typeof v === 'object') {
    try { return JSON.stringify(v).slice(0, 40); } catch { return '[obj]'; }
  }
  return String(v);
}

/** Tải một file văn bản (CSV…) về máy người dùng. */
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
