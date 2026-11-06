// Bảng I/O trực tiếp: LED cho mọi đầu vào/ra trong ioMap. Bấm vào đầu vào (khi lab cho phép) để cưỡng bức mô phỏng:
// lần 1 = ép 1, lần 2 = ép 0, lần 3 = bỏ ép.
import { h, fmtValue } from '../dom.js';
import { t } from '../i18n.js';
import { machineIo } from '../engine.js';
import { ioValue } from './ioState.js';

export function createIoPanel({ m, getPlc, allowOverride = false, onForce, forced = new Map(), onLocate }) {
  const { inputs, outputs } = machineIo(m.def);
  const cells = [];
  const row = (io) => {
    const led = h('span.led', { class: io.dir === 'Q' ? 'out' : 'in' });
    const val = h('span.io-val.mono');
    const canForce = allowOverride && io.dir === 'I' && io.type === 'Bool';
    const fb = h('span.io-f', { hidden: true }, 'F');
    const el = h(canForce ? 'button.io-row' : 'div.io-row', { type: canForce ? 'button' : null, title: `${io.addr} ${io.tag} — ${io.desc || ''}${canForce ? '\n' + t('io.forceTip') : onLocate ? '\n' + t('mv.locateTip') : ''}`,
      onclick: canForce ? () => cycleForce(io) : onLocate ? () => onLocate(io, 'pin') : null,
      onmouseenter: onLocate ? () => onLocate(io, 'hover') : null, onmouseleave: onLocate ? () => onLocate(null, 'hover') : null,
      onfocusin: onLocate ? () => onLocate(io, 'hover') : null, onfocusout: onLocate ? () => onLocate(null, 'hover') : null,
      tabindex: !canForce && onLocate ? 0 : null },
      led, h('span.io-addr.mono', io.addr), h('span.io-tag', io.tag), io.type !== 'Bool' ? val : null, fb, h('span.io-desc', io.desc || ''));
    cells.push({ io, led, val, fb, el });
    return el;
  };
  function cycleForce(io) {
    const plc = getPlc(); if (!plc) return;
    const cur = forced.get(io.addr);
    try {
      if (cur === undefined) { plc.force(io.addr, true); forced.set(io.addr, true); }
      else if (cur === true) { plc.force(io.addr, false); forced.set(io.addr, false); }
      else { plc.unforce(io.addr); forced.delete(io.addr); }
    } catch (e) { console.warn(e); }
    onForce?.(io, forced.get(io.addr));
    refresh();
  }
  const el = h('section.io-panel', { 'aria-label': t('io.title') },
    h('div.io-head', h('b', t('io.title')), allowOverride ? h('span.muted.small', t('io.overrideOn')) : h('span.muted.small', t('io.overrideOff'))),
    h('div.io-cols',
      h('div.io-col', h('div.io-col-h', t('io.inputs')), ...inputs.map(row)),
      h('div.io-col', h('div.io-col-h', t('io.outputs')), ...outputs.map(row))));
  /** Đánh dấu dòng đang được chỉ vị trí trên mô hình. */
  function mark(addr) { for (const c of cells) c.el.classList.toggle('located', c.io.addr === addr); }
  function refresh() {
    const plc = getPlc();
    for (const c of cells) {
      let v = ioValue(c.io, m, plc);
      if (forced.has(c.io.addr)) v = forced.get(c.io.addr);
      const on = typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : false;
      c.led.classList.toggle('on', on);
      if (c.io.type !== 'Bool') c.val.textContent = fmtValue(v);
      c.fb.hidden = !forced.has(c.io.addr);
      c.el.classList.toggle('forced', forced.has(c.io.addr));
    }
  }
  refresh();
  return { el, refresh, mark, clearForces() { const plc = getPlc(); for (const a of forced.keys()) { try { plc?.unforce(a); } catch { /* bỏ qua */ } } forced.clear(); refresh(); } };
}
