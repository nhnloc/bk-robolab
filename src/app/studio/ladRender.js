// Vẽ một network LAD (cây Node) thành SVG. Thuần hiển thị: bố cục, dây, ký hiệu, toán hạng, giá trị monitor.
import { svg } from '../dom.js';
import { boxPins } from './ladSpec.js';
import { join } from './ladModel.js';

export const G = { CW: 96, RH: 80, Y0: 40, PAD: 16, LP: 70, BW: 92, RP: 70, PS: 22, RAIL: 8 };

const OPTIONAL_IN = new Set(['R', 'LD', 'CD']);
const trunc = (s, n = 15) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Kích thước node (px). */
export function measure(n, project, cache = new Map()) {
  if (cache.has(n)) return cache.get(n);
  let r;
  switch (n.t) {
    case 'series': {
      if (!n.items.length) { r = { w: G.CW * 0.6, h: G.RH }; break; }
      let w = 0, h = 0;
      for (const c of n.items) { const m = measure(c, project, cache); w += m.w; h = Math.max(h, m.h); }
      r = { w, h }; break;
    }
    case 'parallel': {
      let w = 0, h = 0;
      for (const b of n.branches) { const m = measure(b, project, cache); w = Math.max(w, m.w); h += m.h; }
      r = { w: w + 2 * G.PAD, h }; break;
    }
    case 'box': {
      const { left, right } = boxRows(n, project);
      const rows = Math.max(left.length, right.length);
      r = { w: G.LP + G.BW + G.RP, h: Math.max(G.RH, G.Y0 + (rows - 1) * G.PS + 34) }; break;
    }
    default: r = { w: G.CW, h: G.RH };
  }
  cache.set(n, r);
  return r;
}

export function boxRows(n, project) {
  const spec = boxPins(n, project);
  const left = [{ pin: spec.pin, power: true }, ...spec.ins.map((p) => ({ pin: p }))];
  const right = spec.outs[0] === spec.out
    ? spec.outs.map((p, i) => ({ pin: p, power: i === 0 }))
    : [{ pin: spec.out, power: true, noOp: true }, ...spec.outs.map((p) => ({ pin: p }))];
  return { left, right, spec };
}

/**
 * Vẽ rung vào phần tử <g>.
 * opts: { project, pf (map path→bool | null), read(op)→value|undefined, sel:Set(path), tags:Map(name→tag), byAddr:Map(addr→tag), stretchTo }
 * Trả về { w, h }.
 */
export function drawRung(g, rung, opts) {
  const cache = new Map();
  const size = measure(rung, opts.project, cache);
  const ctx = { ...opts, cache };
  draw(g, rung, G.RAIL, 8, '', true, ctx, true);
  return { w: Math.max(size.w + G.RAIL, opts.stretchTo || 0), h: size.h + 16 };
}

const pwr = (ctx, path) => (ctx.pf ? !!ctx.pf[path] : undefined);
const wcls = (p) => (p === undefined ? 'w' : p ? 'w on' : 'w off');

function wire(g, x1, y1, x2, y2, p) {
  if (x1 === x2 && y1 === y2) return;
  g.appendChild(svg('line', { x1, y1, x2, y2, class: wcls(p) }));
}

function text(g, x, y, str, cls, attrs = {}) {
  const el = svg('text', { x, y, class: cls, ...attrs });
  el.textContent = str;
  g.appendChild(el);
  return el;
}

function opLabel(ctx, op) {
  const s = String(op ?? '').trim();
  if (!s) return { name: '<??.?>', addr: '', empty: true };
  const m = /^"([^"]+)"$/.exec(s);
  if (m) { const t = ctx.tags.get(m[1]); return { name: s, addr: t ? t.address : '', unknown: !t && !ctx.blockNames?.has(m[1]) }; }
  if (/^%/.test(s)) { const t = ctx.byAddr.get(s.toUpperCase()); return { name: t ? `"${t.name}"` : s, addr: t ? s : '' }; }
  return { name: s, addr: '' };
}

function monVal(ctx, op) {
  if (!ctx.read || !op) return undefined;
  const s = String(op).trim();
  if (!s || /^(T#|TRUE$|FALSE$|16#|2#|[-+]?\d)/i.test(s)) return undefined;
  try { return ctx.read(s); } catch { return undefined; }
}
const fmt = (v) => (typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v === undefined || v === null ? '' : String(v).slice(0, 12));

/** Vẽ toán hạng (2 dòng: địa chỉ + tên) căn giữa tại cx. */
function operand(g, ctx, cx, y, op, path, field, anchor = 'middle') {
  const L = opLabel(ctx, op);
  if (L.addr) text(g, cx, y - 13, L.addr, 'opa', { 'text-anchor': anchor });
  const t = text(g, cx, y, trunc(L.name, anchor === 'middle' ? 15 : 11), 'opd' + (L.empty ? ' empty' : L.unknown ? ' unknown' : ''), { 'text-anchor': anchor, 'data-path': path, 'data-edit': field });
  if (L.name.length > 15) t.appendChild(svg('title', null, L.name));
  return t;
}

function valueTag(g, ctx, x, y, op, anchor = 'middle') {
  const v = monVal(ctx, op);
  if (v === undefined) return;
  text(g, x, y, fmt(v), 'mv' + (v === true ? ' t' : ''), { 'text-anchor': anchor });
}

function hit(g, x, y, w, h, path, ctx) {
  g.appendChild(svg('rect', { x: x + 2, y: y + 2, width: w - 4, height: h - 4, rx: 3, class: 'hit' + (ctx.sel?.has(path) ? ' sel' : ''), 'data-path': path }));
}

function draw(g, n, x, y, path, pin, ctx, isRoot = false) {
  const { w, h } = ctx.cache.get(n) || measure(n, ctx.project, ctx.cache);
  const yc = y + G.Y0;
  const pinP = ctx.pf ? pin : undefined;
  switch (n.t) {
    case 'series': {
      if (!n.items.length) {
        wire(g, x, yc, x + w, yc, pinP);
        if (isRoot) text(g, x + 12, yc - 10, ctx.emptyHint || '', 'hint');
        return;
      }
      let cx = x, p = pin;
      let tail = n.items.length;
      if (isRoot && ctx.stretchTo) {
        while (tail > 0 && n.items[tail - 1].t === 'coil') tail--;
        if (tail === n.items.length || tail === 0) tail = -1;
      }
      let tailW = 0;
      if (tail > 0) for (let i = tail; i < n.items.length; i++) tailW += ctx.cache.get(n.items[i]).w;
      n.items.forEach((c, i) => {
        if (i === tail) {
          const target = ctx.stretchTo - tailW - 4;
          if (target > cx) { wire(g, cx, yc, target, yc, ctx.pf ? p : undefined); cx = target; }
        }
        const cp = join(path, i);
        draw(g, c, cx, y, cp, p, ctx);
        p = ctx.pf ? !!ctx.pf[cp] : true;
        cx += ctx.cache.get(c).w;
      });
      return;
    }
    case 'parallel': {
      const xl = x + G.PAD / 2, xr = x + w - G.PAD / 2;
      const out = pwr(ctx, path);
      wire(g, x, yc, xl, yc, pinP);
      let by = y, lastY = yc;
      n.branches.forEach((b, i) => {
        const bp = join(path, i);
        const bm = ctx.cache.get(b);
        const byc = by + G.Y0;
        wire(g, xl, byc, x + G.PAD, byc, pinP);
        draw(g, b, x + G.PAD, by, bp, pin, ctx);
        const bo = pwr(ctx, bp);
        wire(g, x + G.PAD + bm.w, byc, xr, byc, bo);
        lastY = byc; by += bm.h;
      });
      wire(g, xl, yc, xl, lastY, pinP);
      wire(g, xr, yc, xr, lastY, out);
      wire(g, xr, yc, x + w, yc, out);
      return;
    }
    case 'contact': {
      const cx = x + w / 2; const out = pwr(ctx, path);
      hit(g, x, y, w, G.RH, path, ctx);
      if (n.kind === 'NOT') {
        wire(g, x, yc, cx - 15, yc, pinP); wire(g, cx + 15, yc, x + w, yc, out);
        g.appendChild(svg('rect', { x: cx - 15, y: yc - 10, width: 30, height: 20, class: 'sym ' + wcls(out) }));
        text(g, cx, yc + 4, 'NOT', 'symt');
        return;
      }
      wire(g, x, yc, cx - 9, yc, pinP); wire(g, cx + 9, yc, x + w, yc, out);
      g.appendChild(svg('path', { d: `M${cx - 9} ${yc - 13}v26M${cx + 9} ${yc - 13}v26`, class: 'sym ' + wcls(out) }));
      if (n.kind === 'NC') g.appendChild(svg('path', { d: `M${cx - 6} ${yc + 10}L${cx + 6} ${yc - 10}`, class: 'sym ' + wcls(out) }));
      if (n.kind === 'P' || n.kind === 'N') text(g, cx, yc + 4, n.kind, 'symt');
      operand(g, ctx, cx, yc - 20, n.op, path, 'op');
      valueTag(g, ctx, cx, yc + 28, n.op);
      if ((n.kind === 'P' || n.kind === 'N') && n.mem) text(g, cx, yc + 28, n.mem, 'opa', { 'text-anchor': 'middle' });
      return;
    }
    case 'coil': {
      const cx = x + w / 2; const out = pwr(ctx, path);
      hit(g, x, y, w, G.RH, path, ctx);
      wire(g, x, yc, cx - 11, yc, pinP); wire(g, cx + 11, yc, x + w, yc, out);
      g.appendChild(svg('path', { d: `M${cx - 6} ${yc - 12}q-8 12 0 24M${cx + 6} ${yc - 12}q8 12 0 24`, class: 'sym ' + wcls(out) }));
      if (n.kind !== '=') text(g, cx, yc + 4, n.kind, 'symt');
      operand(g, ctx, cx, yc - 20, n.op, path, 'op');
      valueTag(g, ctx, cx, yc + 28, n.op);
      return;
    }
    case 'cmp': {
      const cx = x + w / 2; const out = pwr(ctx, path);
      hit(g, x, y, w, G.RH, path, ctx);
      wire(g, x, yc, cx - 20, yc, pinP); wire(g, cx + 20, yc, x + w, yc, out);
      g.appendChild(svg('rect', { x: cx - 20, y: yc - 13, width: 40, height: 26, rx: 2, class: 'sym box ' + wcls(out) }));
      text(g, cx, yc - 1, n.op === '==' ? '==' : n.op, 'symt');
      text(g, cx, yc + 10, n.type || 'Int', 'symt small');
      operand(g, ctx, cx, yc - 20, n.in1, path, 'in1');
      operand(g, ctx, cx, yc + 30, n.in2, path, 'in2');
      const v1 = monVal(ctx, n.in1), v2 = monVal(ctx, n.in2);
      if (v1 !== undefined || v2 !== undefined) {
        const tt = svg('title', null, `IN1 = ${fmt(v1)}  IN2 = ${fmt(v2)}`);
        g.lastChild.appendChild(tt);
      }
      return;
    }
    case 'box': {
      const out = pwr(ctx, path);
      const { left, right, spec } = boxRows(n, ctx.project);
      const bx = x + G.LP, bw = G.BW;
      const rows = Math.max(left.length, right.length);
      const top = yc - 24, bottom = yc + (rows - 1) * G.PS + 12;
      hit(g, x, y, w, h, path, ctx);
      wire(g, x, yc, bx, yc, pinP);
      g.appendChild(svg('rect', { x: bx, y: top, width: bw, height: bottom - top, rx: 2, class: 'sym box ' + wcls(ctx.pf ? out : undefined) }));
      text(g, bx + bw / 2, top + 13, n.fn === 'CALL' ? trunc(String(n.block || 'CALL'), 12) : n.fn, 'boxt');
      // instance / bit toán hạng phía trên
      if (spec.inst || spec.bit || n.instance) {
        operand(g, ctx, bx + bw / 2, top - 4, n.instance, path, 'instance');
      }
      left.forEach((r, k) => {
        const py = yc + k * G.PS;
        text(g, bx + 4, py + 4, r.pin, 'pin');
        if (k === 0) return;
        wire(g, bx - 10, py, bx, py, undefined);
        const v = n.params?.[r.pin];
        const opt = OPTIONAL_IN.has(r.pin) || n.fn === 'CALL';
        const L = opLabel(ctx, v);
        const t = text(g, bx - 12, py + 4, v ? trunc(L.name, 11) : opt ? '…' : '<???>', 'opd' + (!v && !opt ? ' empty' : !v ? ' opt' : L.unknown ? ' unknown' : ''), { 'text-anchor': 'end', 'data-path': path, 'data-edit': 'param:' + r.pin });
        if (v && L.name.length > 11) t.appendChild(svg('title', null, L.name));
        const mv = monVal(ctx, v); if (mv !== undefined) text(g, bx - 12, py - 7, fmt(mv), 'mv' + (mv === true ? ' t' : ''), { 'text-anchor': 'end' });
      });
      right.forEach((r, k) => {
        const py = yc + k * G.PS;
        text(g, bx + bw - 4, py + 4, r.pin, 'pin', { 'text-anchor': 'end' });
        if (k === 0) wire(g, bx + bw, yc, x + w, yc, out);
        else wire(g, bx + bw, py, bx + bw + 10, py, undefined);
        if (r.noOp) return;
        const v = n.params?.[r.pin];
        const L = opLabel(ctx, v);
        const ty = k === 0 ? py - 6 : py + 4;
        const t = text(g, bx + bw + 12, ty, v ? trunc(L.name, 11) : '…', 'opd' + (!v ? ' opt' : L.unknown ? ' unknown' : ''), { 'text-anchor': 'start', 'data-path': path, 'data-edit': 'param:' + r.pin });
        if (v && L.name.length > 11) t.appendChild(svg('title', null, L.name));
        let mv = monVal(ctx, v);
        if (mv === undefined && n.instance && ctx.read) mv = monVal(ctx, String(n.instance) + '.' + r.pin);
        if (mv !== undefined) text(g, bx + bw + 12, k === 0 ? py + 13 : py - 7, fmt(mv), 'mv' + (mv === true ? ' t' : ''), { 'text-anchor': 'start' });
      });
      return;
    }
    default:
      wire(g, x, yc, x + w, yc, pinP);
  }
}
