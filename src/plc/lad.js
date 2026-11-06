// Biên dịch mạng LAD (cây series/parallel) thành hàm thực thi có ghi lại dòng công suất.
import { PlcError, execSystemFb, makeVar, KIND, SYSTEM_FBS } from './context.js';
import { coerce } from './values.js';

/** Đặc tả chân của các box. pin: chân nhận công suất; out: chân xuất công suất. */
export const BOX_SPECS = {
  TON:  { pin: 'IN', inputs: ['PT'], outputs: ['Q', 'ET'], out: 'Q', instance: true },
  TOF:  { pin: 'IN', inputs: ['PT'], outputs: ['Q', 'ET'], out: 'Q', instance: true },
  TP:   { pin: 'IN', inputs: ['PT'], outputs: ['Q', 'ET'], out: 'Q', instance: true },
  TONR: { pin: 'IN', inputs: ['R', 'PT'], outputs: ['Q', 'ET'], out: 'Q', instance: true },
  CTU:  { pin: 'CU', inputs: ['R', 'PV'], outputs: ['Q', 'CV'], out: 'Q', instance: true },
  CTD:  { pin: 'CD', inputs: ['LD', 'PV'], outputs: ['Q', 'CV'], out: 'Q', instance: true },
  CTUD: { pin: 'CU', inputs: ['CD', 'R', 'LD', 'PV'], outputs: ['QU', 'QD', 'CV'], out: 'QU', instance: true },
  R_TRIG: { pin: 'CLK', inputs: [], outputs: ['Q'], out: 'Q', instance: 'optional' },
  F_TRIG: { pin: 'CLK', inputs: [], outputs: ['Q'], out: 'Q', instance: 'optional' },
  SR:   { pin: 'S', inputs: ['R1'], outputs: ['Q'], out: 'Q', bit: true },
  RS:   { pin: 'R', inputs: ['S1'], outputs: ['Q'], out: 'Q', bit: true },
  MOVE: { pin: 'EN', inputs: ['IN'], outputs: ['OUT1', 'OUT'], out: 'ENO' },
  ADD:  { pin: 'EN', inputs: ['IN1', 'IN2'], outputs: ['OUT'], out: 'ENO', op: (a, b) => a + b },
  SUB:  { pin: 'EN', inputs: ['IN1', 'IN2'], outputs: ['OUT'], out: 'ENO', op: (a, b) => a - b },
  MUL:  { pin: 'EN', inputs: ['IN1', 'IN2'], outputs: ['OUT'], out: 'ENO', op: (a, b) => a * b },
  DIV:  { pin: 'EN', inputs: ['IN1', 'IN2'], outputs: ['OUT'], out: 'ENO', op: (a, b) => a / b, div: true },
  MOD:  { pin: 'EN', inputs: ['IN1', 'IN2'], outputs: ['OUT'], out: 'ENO', op: (a, b) => a % b, div: true },
  SHL:  { pin: 'EN', inputs: ['IN', 'N'], outputs: ['OUT'], out: 'ENO', op: (a, n) => a << n },
  SHR:  { pin: 'EN', inputs: ['IN', 'N'], outputs: ['OUT'], out: 'ENO', op: (a, n) => a >>> n },
  INC:  { pin: 'EN', inputs: [], outputs: [], inout: 'IN_OUT', out: 'ENO' },
  DEC:  { pin: 'EN', inputs: [], outputs: [], inout: 'IN_OUT', out: 'ENO' },
  NORM_X:  { pin: 'EN', inputs: ['MIN', 'VALUE', 'MAX'], outputs: ['OUT'], out: 'ENO' },
  SCALE_X: { pin: 'EN', inputs: ['MIN', 'VALUE', 'MAX'], outputs: ['OUT'], out: 'ENO' },
  LIMIT:   { pin: 'EN', inputs: ['MN', 'IN', 'MX'], outputs: ['OUT'], out: 'ENO' },
  CALL:    { pin: 'EN', out: 'ENO' },
};

const CMP = {
  '==': (a, b) => a === b, '<>': (a, b) => a !== b, '>': (a, b) => a > b,
  '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b,
};

/**
 * @param net   { rung: Node }
 * @param ctx   Context
 * @param env   { localTypes, block, callBlock(name, instanceAcc, params, en) }
 * @returns     (flows) => void   — flows: object path→bool được điền mỗi lần chạy
 */
export function compileNetwork(net, ctx, env) {
  if (!net.rung) return () => {};
  const hidden = new Map();   // trạng thái ẩn theo path (sườn không có bit nhớ, R_TRIG không instance)
  const op = (text) => ctx.operand(text, env.localTypes);

  function build(node, path) {
    if (!node || typeof node !== 'object') throw new PlcError('Phần tử LAD rỗng', { path });
    const at = (msg) => new PlcError(msg, { path });
    switch (node.t) {
      case 'series': {
        const items = (node.items || []).map((n, i) => build(n, path === '' ? String(i) : path + '.' + i));
        return (p, f) => { for (const it of items) p = it(p, f); f[path] = p; return p; };
      }
      case 'parallel': {
        const br = (node.branches || []).map((n, i) => build(n, path === '' ? String(i) : path + '.' + i));
        if (br.length === 0) throw at('Nhánh song song rỗng');
        return (p, f) => { let o = false; for (const b of br) o = b(p, f) || o; f[path] = o; return o; };
      }
      case 'contact': {
        if (node.kind === 'NOT') return (p, f) => (f[path] = !p);
        const a = wrap(() => op(node.op), at);
        if (a.type && a.type !== 'Bool') throw at(`Tiếp điểm cần toán hạng Bool: ${node.op}`);
        if (node.kind === 'NO' || !node.kind) return (p, f) => (f[path] = p && !!a.get());
        if (node.kind === 'NC') return (p, f) => (f[path] = p && !a.get());
        if (node.kind === 'P' || node.kind === 'N') {
          const mem = node.mem ? wrap(() => op(node.mem), at) : null;
          const rising = node.kind === 'P';
          return (p, f) => {
            const v = !!a.get();
            const prev = mem ? !!mem.get() : !!hidden.get(path);
            if (mem) mem.set(v); else hidden.set(path, v);
            return (f[path] = p && (rising ? v && !prev : !v && prev));
          };
        }
        throw at('Loại tiếp điểm không hợp lệ: ' + node.kind);
      }
      case 'coil': {
        const a = wrap(() => op(node.op), at);
        if (a.constant) throw at('Cuộn dây không ghi vào hằng số');
        switch (node.kind || '=') {
          case '=': return (p, f) => { a.set(p); return (f[path] = p); };
          case '/': return (p, f) => { a.set(!p); return (f[path] = p); };
          case 'S': return (p, f) => { if (p) a.set(true); return (f[path] = p); };
          case 'R': return (p, f) => { if (p) a.set(false); return (f[path] = p); };
          case 'P': case 'N': {
            const rising = node.kind === 'P';
            return (p, f) => {
              const prev = !!hidden.get(path); hidden.set(path, p);
              a.set(rising ? p && !prev : !p && prev);
              return (f[path] = p);
            };
          }
        }
        throw at('Loại cuộn dây không hợp lệ: ' + node.kind);
      }
      case 'cmp': {
        const fn = CMP[node.op];
        if (!fn) throw at('Phép so sánh không hợp lệ: ' + node.op);
        const a = wrap(() => op(node.in1), at), b = wrap(() => op(node.in2), at);
        return (p, f) => (f[path] = p && fn(a.get(), b.get()));
      }
      case 'box': return buildBox(node, path, at);
      default: throw at('Phần tử LAD không rõ: ' + node.t);
    }
  }

  function buildBox(node, path, at) {
    // Lệnh mở rộng do bộ điều khiển cung cấp (MP3300: MSEE, MSG_SNDE…)
    const ext = ctx.ext && ctx.ext[node.fn];
    if (ext) return wrap(() => ext({ node, params: node.params || {}, path, at, op, ctx }), at);
    const spec = BOX_SPECS[node.fn];
    if (!spec) throw at('Lệnh không hỗ trợ: ' + node.fn);
    const params = node.params || {};
    const P = (name, required = true) => {
      if (params[name] === undefined || params[name] === '') {
        if (required) throw at(`${node.fn}: thiếu tham số ${name}`);
        return null;
      }
      return wrap(() => op(params[name]), at);
    };

    if (node.fn === 'CALL') {
      const target = String(node.block || '').replace(/"/g, '');
      const blk = ctx.blocks.get(target);
      if (!blk || (blk.type !== 'FB' && blk.type !== 'FC')) throw at(`Không tìm thấy khối FB/FC "${target}"`);
      let inst = null;
      if (blk.type === 'FB') {
        if (!node.instance) throw at(`Gọi FB "${target}" cần instance DB`);
        inst = wrap(() => instanceAccessor(node.instance, target), at);
      }
      const call = env.callBlock(blk, inst, params, at);
      return (p, f) => { if (p) call(); return (f[path] = p); };
    }

    if (spec.instance || spec.bit) {
      let inst;
      if (spec.bit) {
        const bit = wrap(() => op(node.instance || params.OPERAND), at);
        const s2 = spec.inputs.map((n) => P(n));
        const setDominant = node.fn === 'RS';
        return (p, f) => {
          const other = !!s2[0].get();
          // SR: R1 ưu tiên; RS: S1 ưu tiên
          let q = !!bit.get();
          if (setDominant) { if (p) q = false; if (other) q = true; }
          else { if (p) q = true; if (other) q = false; }
          bit.set(q);
          const qOut = params.Q ? op(params.Q) : null; if (qOut) qOut.set(q);
          return (f[path] = q);
        };
      }
      if (node.instance) inst = wrap(() => instanceAccessor(node.instance, node.fn), at);
      else if (spec.instance === 'optional') { const o = makeVar(node.fn); inst = { get: () => o }; }
      else throw at(`${node.fn}: cần instance (vd. "IEC_Timer_0_DB")`);
      const ins = spec.inputs.map((n) => [n, P(n, false)]);
      const outs = spec.outputs.map((n) => [n, P(n, false)]);
      if (['TON', 'TOF', 'TP', 'TONR'].includes(node.fn) && !params.PT) throw at(`${node.fn}: thiếu PT`);
      if (['CTU', 'CTD', 'CTUD'].includes(node.fn) && !params.PV) throw at(`${node.fn}: thiếu PV`);
      return (p, f) => {
        const o = inst.get();
        if (o[KIND] !== node.fn) o[KIND] = node.fn;
        o[spec.pin] = p;
        for (const [n, a] of ins) if (a) o[n] = coerce(n === 'PT' ? 'Time' : n === 'PV' ? 'Int' : 'Bool', a.get());
        execSystemFb(o, ctx.now);
        for (const [n, a] of outs) if (a) a.set(o[n]);
        return (f[path] = !!o[spec.out]);
      };
    }

    // Box có EN/ENO
    if (node.fn === 'INC' || node.fn === 'DEC') {
      const a = P('IN_OUT'); const d = node.fn === 'INC' ? 1 : -1;
      return (p, f) => { if (p) a.set(a.get() + d); return (f[path] = p); };
    }
    if (node.fn === 'MOVE') {
      const src = P('IN');
      const dsts = Object.keys(params).filter((k) => /^OUT\d*$/.test(k)).map((k) => P(k));
      if (!dsts.length) throw at('MOVE: thiếu OUT1');
      return (p, f) => { if (p) { const v = src.get(); for (const d of dsts) d.set(v); } return (f[path] = p); };
    }
    if (node.fn === 'NORM_X' || node.fn === 'SCALE_X' || node.fn === 'LIMIT') {
      const [a, b, c] = spec.inputs.map((n) => P(n)); const out = P('OUT');
      return (p, f) => {
        if (!p) return (f[path] = false);
        const x = a.get(), y = b.get(), z = c.get();
        let r;
        if (node.fn === 'NORM_X') r = z === x ? 0 : (y - x) / (z - x);
        else if (node.fn === 'SCALE_X') r = y * (z - x) + x;
        else r = Math.min(Math.max(y, x), z);
        out.set(r);
        return (f[path] = true);
      };
    }
    const [a, b] = spec.inputs.map((n) => P(n)); const out = P('OUT');
    return (p, f) => {
      if (!p) return (f[path] = false);
      const x = a.get(), y = b.get();
      if (spec.div && y === 0) { return (f[path] = false); } // chia 0: ENO = 0
      out.set(spec.op(x, y));
      return (f[path] = true);
    };
  }

  function instanceAccessor(text, type) {
    const t = String(text).trim();
    if (t.startsWith('#')) {
      const a = op(t);
      return { get: () => a.get() };
    }
    const o = ctx.ensureInstance(t, type);
    return { get: () => o };
  }

  const root = build(net.rung, '');
  return (flows) => { root(true, flows); };
}

function wrap(fn, at) {
  try { return fn(); } catch (e) { throw e instanceof PlcError && e.path !== undefined ? e : at(e.message); }
}

export { SYSTEM_FBS };
