// Trình soạn SCL: textarea + lớp tô màu cú pháp + số dòng + đánh dấu dòng lỗi.
import { h, esc, debounce } from '../dom.js';
import { t } from '../i18n.js';
import { SCL_KEYWORDS } from './ladSpec.js';

const KW = new Set(SCL_KEYWORDS);
const TOKEN = /(\/\/[^\n]*|\(\*[\s\S]*?\*\)|\{[\s\S]*?\})|('(?:[^'\n]|'')*')|("[^"\n]*")|(#\w+)|(%[IQM][BWD]?\d+(?:\.\d)?)|(\b(?:T|TIME|S5T)#[\w.]+|\b16#[0-9A-Fa-f_]+|\b2#[01_]+|\b\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

export function highlightScl(src) {
  let out = '', last = 0;
  src.replace(TOKEN, (m, cmt, str, tag, loc, addr, num, word, idx) => {
    out += esc(src.slice(last, idx));
    if (cmt) out += `<span class="c">${esc(m)}</span>`;
    else if (str) out += `<span class="s">${esc(m)}</span>`;
    else if (tag) out += `<span class="g">${esc(m)}</span>`;
    else if (loc) out += `<span class="l">${esc(m)}</span>`;
    else if (addr) out += `<span class="a">${esc(m)}</span>`;
    else if (num) out += `<span class="n">${esc(m)}</span>`;
    else if (word && KW.has(word.toUpperCase())) out += `<span class="k">${esc(m)}</span>`;
    else if (word && /^(TON|TOF|TP|CTU|CTD|R_TRIG|F_TRIG|NORM_X|SCALE_X|MOVE|LIMIT|ABS|SQRT|MIN|MAX|SHL|SHR)$/.test(word)) out += `<span class="f">${esc(m)}</span>`;
    else out += esc(m);
    last = idx + m.length;
    return m;
  });
  return out + esc(src.slice(last)) + '\n';
}

export function createSclEditor(ctx, blockName) {
  const block = () => ctx.project.blocks.find((b) => b.name === blockName);
  const b = block();
  const errLines = new Set((ctx.errorsFor?.(blockName) || []).map((e) => e.line).filter(Boolean));
  const gutter = h('div.scl-gutter', { 'aria-hidden': 'true' });
  const pre = h('pre.scl-hl', { 'aria-hidden': 'true' });
  const ta = h('textarea.scl-ta', { spellcheck: 'false', wrap: 'off', readOnly: ctx.readOnly, 'aria-label': t('scl.source'), value: b.source || '' });
  ta.readOnly = !!ctx.readOnly;
  const area = h('div.scl-area', pre, ta);
  const el = h('div.scl', gutter, area);

  let dirty = false;
  const save = debounce((v) => { if (!dirty) return; dirty = false; ctx.commit((p) => { p.blocks.find((x) => x.name === blockName).source = v; }, { keepEditor: true }); }, 600);
  function paint() {
    const v = ta.value;
    pre.innerHTML = highlightScl(v);
    const n = v.split('\n').length;
    let s = '';
    for (let i = 1; i <= n; i++) s += `<div class="${errLines.has(i) ? 'err' : ''}">${i}</div>`;
    gutter.innerHTML = s;
    sync();
  }
  function sync() { pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; gutter.style.transform = `translateY(${-ta.scrollTop}px)`; }
  ta.addEventListener('input', () => { dirty = true; paint(); save(ta.value); });
  ta.addEventListener('scroll', sync);
  ta.addEventListener('blur', () => save.flush(ta.value));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !ctx.readOnly) {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: z } = ta;
      ta.setRangeText('  ', a, z, 'end'); dirty = true; paint(); save(ta.value);
    } else if (e.key === 'Enter' && !ctx.readOnly) {
      // giữ thụt dòng
      const a = ta.selectionStart; const line = ta.value.slice(0, a).split('\n').pop();
      const ind = /^\s*/.exec(line)[0] + (/\b(THEN|DO|ELSE|OF|REPEAT)\s*$/i.test(line) ? '  ' : '');
      e.preventDefault(); ta.setRangeText('\n' + ind, a, ta.selectionEnd, 'end'); dirty = true; paint(); save(ta.value);
    }
    e.stopPropagation();
  });
  paint();
  return {
    el,
    insertText(txt) { if (ctx.readOnly) return; ta.focus(); ta.setRangeText(txt, ta.selectionStart, ta.selectionEnd, 'end'); dirty = true; paint(); save(ta.value); },
    flush: () => save.flush(ta.value),
    focus: () => ta.focus(),
    refreshMonitor() {},
    dispose() { save.cancel(); if (dirty) { dirty = false; const v = ta.value; ctx.commit((p) => { const bb = p.blocks.find((x) => x.name === blockName); if (bb) bb.source = v; }, { keepEditor: true }); } },
  };
}
