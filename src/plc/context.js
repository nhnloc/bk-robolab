// Ngữ cảnh thực thi: vùng nhớ, tag, DB, instance (timer/counter/FB), phân giải toán hạng.
import { Area, coerce, defaultValue, parseAddress, parseConstant, addressFitsType } from './values.js';

export class PlcError extends Error {
  constructor(message, where = {}) { super(message); Object.assign(this, where); }
}

export const SYSTEM_FBS = ['TON', 'TOF', 'TP', 'TONR', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG'];

/* ---------- Biến có cấu trúc ---------- */
const T = Symbol('types');           // obj[T] = { field: type }
export const KIND = Symbol('kind');  // obj[KIND] = 'TON' | 'FB:Name' | 'Array' | 'Struct' | 'DB'

export function typeOf(obj, key) { return obj && obj[T] ? obj[T][key] : undefined; }

function parseArrayType(type) {
  const m = String(type).match(/^Array\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*of\s+(.+)$/i);
  return m ? { lo: +m[1], hi: +m[2], elem: m[3].trim() } : null;
}

/** Tạo giá trị khởi tạo cho một kiểu. fbLookup(name) → block FB nếu là kiểu FB. */
export function makeVar(type, fbLookup, init) {
  const arr = parseArrayType(type);
  if (arr) {
    const a = [];
    a[KIND] = 'Array'; a.lo = arr.lo; a.elem = arr.elem;
    for (let i = arr.lo; i <= arr.hi; i++) a.push(makeVar(arr.elem, fbLookup));
    return a;
  }
  const up = String(type).toUpperCase().replace(/^IEC_/, '');
  if (['TON', 'TOF', 'TP', 'TONR', 'TIMER'].includes(up)) {
    const k = up === 'TIMER' ? 'TON' : up;
    return struct(k, { IN: 'Bool', PT: 'Time', Q: 'Bool', ET: 'Time', R: 'Bool' }, { _run: false, _start: 0, _acc: 0, _prevIn: false });
  }
  if (['CTU', 'CTD', 'CTUD', 'COUNTER'].includes(up)) {
    const k = up === 'COUNTER' ? 'CTUD' : up;
    return struct(k, { CU: 'Bool', CD: 'Bool', R: 'Bool', LD: 'Bool', PV: 'Int', Q: 'Bool', QU: 'Bool', QD: 'Bool', CV: 'Int' }, { _pcu: false, _pcd: false });
  }
  if (up === 'R_TRIG' || up === 'F_TRIG') return struct(up, { CLK: 'Bool', Q: 'Bool' }, { _m: up === 'F_TRIG' });
  const fb = fbLookup && fbLookup(type);
  if (fb) return makeFbInstance(fb, fbLookup);
  const v = init !== undefined ? coerce(type, parseInit(type, init)) : defaultValue(type);
  return v;
}

function parseInit(type, init) {
  if (typeof init !== 'string') return init;
  const c = parseConstant(init);
  return c ? c.value : init;
}

function struct(kind, types, hidden) {
  const o = {};
  o[KIND] = kind; o[T] = types;
  for (const [k, t] of Object.entries(types)) o[k] = defaultValue(t);
  for (const [k, v] of Object.entries(hidden || {})) Object.defineProperty(o, k, { value: v, writable: true, enumerable: false });
  return o;
}

export function makeFbInstance(fb, fbLookup) {
  const o = {};
  o[KIND] = 'FB:' + fb.name; o[T] = {};
  const itf = fb.interface || {};
  for (const sec of ['Input', 'Output', 'InOut', 'Static']) {
    for (const v of itf[sec] || []) {
      o[T][v.name] = v.type;
      o[v.name] = makeVar(v.type, fbLookup, v.init);
    }
  }
  return o;
}

export function makeDb(db, fbLookup) {
  const o = {};
  o[KIND] = 'DB'; o[T] = {};
  for (const f of db.fields || []) { o[T][f.name] = f.type; o[f.name] = makeVar(f.type, fbLookup, f.init); }
  return o;
}

/* ---------- Thực thi khối hệ thống IEC ---------- */
export function execSystemFb(obj, now) {
  const k = obj[KIND];
  switch (k) {
    case 'TON': {
      if (obj.IN) {
        if (!obj._run) { obj._run = true; obj._start = now; }
        obj.ET = Math.min(now - obj._start, obj.PT);
        obj.Q = obj.ET >= obj.PT;
      } else { obj._run = false; obj.ET = 0; obj.Q = false; }
      break;
    }
    case 'TOF': {
      if (obj.IN) { obj._run = false; obj.ET = 0; obj.Q = true; }
      else if (obj.Q) {
        if (!obj._run) { obj._run = true; obj._start = now; }
        obj.ET = Math.min(now - obj._start, obj.PT);
        if (obj.ET >= obj.PT) { obj.Q = false; obj._run = false; }
      } else if (!obj._run) obj.ET = obj._prevIn ? 0 : obj.ET;
      break;
    }
    case 'TP': {
      const rising = obj.IN && !obj._prevIn;
      if (rising && !obj._run) { obj._run = true; obj._start = now; }
      if (obj._run) {
        obj.ET = Math.min(now - obj._start, obj.PT);
        obj.Q = obj.ET < obj.PT;
        if (!obj.Q && !obj.IN) { obj._run = false; obj.ET = 0; }
        if (!obj.Q && obj.IN) obj.ET = obj.PT;
      } else { obj.Q = false; obj.ET = 0; }
      break;
    }
    case 'TONR': {
      if (obj.R) { obj._acc = 0; obj.ET = 0; obj.Q = false; obj._run = false; break; }
      if (obj.IN) {
        if (!obj._run) { obj._run = true; obj._start = now - obj._acc; }
        obj._acc = Math.min(now - obj._start, obj.PT);
      } else obj._run = false;
      obj.ET = obj._acc; obj.Q = obj._acc >= obj.PT;
      break;
    }
    case 'CTU': case 'CTD': case 'CTUD': {
      const up = obj.CU && !obj._pcu, dn = obj.CD && !obj._pcd;
      obj._pcu = obj.CU; obj._pcd = obj.CD;
      if (k !== 'CTD' && obj.R) obj.CV = 0;
      else if (k !== 'CTU' && obj.LD) obj.CV = obj.PV;
      else {
        if (up && k !== 'CTD' && obj.CV < 32767) obj.CV++;
        if (dn && k !== 'CTU' && obj.CV > -32768) obj.CV--;
      }
      obj.QU = obj.CV >= obj.PV; obj.QD = obj.CV <= 0;
      obj.Q = k === 'CTD' ? obj.QD : obj.QU;
      break;
    }
    case 'R_TRIG': obj.Q = obj.CLK && !obj._m; obj._m = obj.CLK; break;
    case 'F_TRIG': obj.Q = !obj.CLK && obj._m; obj._m = obj.CLK; break;
    default: throw new PlcError('Không phải khối hệ thống: ' + k);
  }
  obj._prevIn = obj.IN;
}

/* ---------- Phân tích toán hạng ---------- */
/** Tách "DB".a.b[3].c  |  #x.Q  |  %I0.0  |  Tag (không ngoặc) → { root, rootKind, segs } */
export function parseOperandPath(text) {
  let s = String(text).trim();
  let root, rootKind, i = 0;
  if (s[0] === '"') {
    const j = s.indexOf('"', 1);
    if (j < 0) return null;
    root = s.slice(1, j); rootKind = 'global'; i = j + 1;
  } else if (s[0] === '#') {
    const m = s.slice(1).match(/^[A-Za-z_][\w]*/);
    if (!m) return null;
    root = m[0]; rootKind = 'local'; i = 1 + m[0].length;
  } else if (s[0] === '%') {
    return parseAddress(s) ? { rootKind: 'addr', root: s.toUpperCase(), segs: [] } : null;
  } else {
    const m = s.match(/^[A-Za-z_][\w]*/);
    if (!m) return null;
    root = m[0]; rootKind = 'global'; i = m[0].length;
  }
  const segs = [];
  while (i < s.length) {
    if (s[i] === '.') {
      const m = s.slice(i + 1).match(/^(?:"([^"]+)"|([A-Za-z_]\w*|%?X?\d+))/);
      if (!m) return null;
      segs.push({ f: m[1] || m[2] }); i += 1 + m[0].length;
    } else if (s[i] === '[') {
      const j = s.indexOf(']', i);
      if (j < 0) return null;
      segs.push({ idx: s.slice(i + 1, j).trim() }); i = j + 1;
    } else return null;
  }
  return { root, rootKind, segs };
}

export class Context {
  constructor(project) {
    this.project = project;
    this.I = new Area(); this.Q = new Area(); this.M = new Area(4096);
    this.now = 0;
    this.tags = new Map();
    this.blocks = new Map();
    this.globals = new Map();     // tên DB / instance DB toàn cục → object
    this.frame = null;            // khung biến cục bộ của FB/FC đang chạy
    this.fbLookup = (name) => {
      const b = this.blocks.get(String(name).replace(/"/g, ''));
      return b && b.type === 'FB' ? b : null;
    };
    for (const t of project.tags || []) this.tags.set(t.name, t);
    for (const b of project.blocks || []) this.blocks.set(b.name, b);
  }

  /** Khởi tạo DB toàn cục. Instance timer/FB toàn cục tạo tự động khi biên dịch gặp. */
  initData() {
    this.globals.clear();
    for (const b of this.project.blocks || []) if (b.type === 'DB') {
      if (b.instanceOf) {
        const fb = this.fbLookup(b.instanceOf) || null;
        this.globals.set(b.name, fb ? makeFbInstance(fb, this.fbLookup) : makeVar(b.instanceOf, this.fbLookup));
      } else this.globals.set(b.name, makeDb(b, this.fbLookup));
    }
  }

  /** Đảm bảo có instance DB toàn cục cho timer/counter/FB (giống "single instance" trong TIA). */
  ensureInstance(name, type) {
    const n = String(name).replace(/^"|"$/g, '');
    let o = this.globals.get(n);
    if (!o) {
      o = makeVar(type, this.fbLookup);
      if (typeof o !== 'object') throw new PlcError(`Kiểu instance không hợp lệ: ${type}`);
      this.globals.set(n, o);
    } else {
      const k = o[KIND];
      const want = SYSTEM_FBS.includes(type) ? type : 'FB:' + type;
      const compatible = k === want || (['TON', 'TOF', 'TP', 'TONR'].includes(k) && ['TON', 'TOF', 'TP', 'TONR'].includes(type))
        || (['CTU', 'CTD', 'CTUD'].includes(k) && ['CTU', 'CTD', 'CTUD'].includes(type));
      if (!compatible) throw new PlcError(`"${n}" đã được dùng cho kiểu ${k}, không dùng cho ${type} được`);
      if (k !== want && SYSTEM_FBS.includes(type)) o[KIND] = type;
    }
    return o;
  }

  /**
   * Biên dịch toán hạng thành accessor { get(), set(v), type, constant? }.
   * localTypes: { name: type } của khối đang biên dịch (để kiểm tra #x lúc biên dịch).
   * idxCompiler(text) → accessor cho chỉ số mảng (SCL truyền biểu thức).
   */
  operand(text, localTypes = null, idxCompiler = null) {
    if (text === undefined || text === null || String(text).trim() === '') throw new PlcError('Thiếu toán hạng');
    const raw = String(text).trim();
    const c = parseConstant(raw);
    if (c) return { get: () => c.value, set: () => { throw new PlcError(`Không ghi được vào hằng số ${raw}`); }, type: c.type, constant: true };
    const p = parseOperandPath(raw);
    if (!p) throw new PlcError(`Toán hạng không hợp lệ: ${raw}`);

    if (p.rootKind === 'addr') return this.addrAccessor(parseAddress(p.root), raw);

    let baseGet, baseType;
    if (p.rootKind === 'local') {
      if (localTypes && !(p.root in localTypes)) throw new PlcError(`Biến cục bộ #${p.root} chưa khai báo`);
      const name = p.root;
      baseType = localTypes ? localTypes[name] : undefined;
      if (p.segs.length === 0) {
        return {
          get: () => this.frame.vars[name],
          set: (v) => { const f = this.frame.vars; f[name] = coerce(f[T][name] || baseType, v); },
          type: baseType,
        };
      }
      baseGet = () => this.frame.vars[name];
    } else {
      const tag = this.tags.get(p.root);
      if (tag && p.segs.length === 0) {
        const a = parseAddress(tag.address);
        if (!a) throw new PlcError(`Tag "${tag.name}" có địa chỉ sai: ${tag.address}`);
        if (!addressFitsType(a, tag.type)) throw new PlcError(`Tag "${tag.name}": kiểu ${tag.type} không khớp địa chỉ ${tag.address}`);
        return this.addrAccessor({ ...a, type: tag.type }, raw);
      }
      if (tag) throw new PlcError(`Tag "${tag.name}" không có trường con`);
      const name = p.root;
      const blk = this.blocks.get(name);
      if (!this.globals.has(name) && !(blk && blk.type === 'DB')) throw new PlcError(`Không tìm thấy tag hoặc DB "${name}"`);
      if (p.segs.length === 0) return { get: () => this.globals.get(name), set: () => { throw new PlcError('Không gán trực tiếp DB'); }, type: 'DB' };
      baseGet = () => this.globals.get(name);
    }

    // Duyệt các đoạn .field / [idx]
    const segs = p.segs.map((s) => {
      if (s.f !== undefined) return { f: s.f };
      const idxText = s.idx;
      const acc = idxCompiler ? idxCompiler(idxText) : this.operand(idxText, localTypes);
      return { idx: acc };
    });
    const last = segs[segs.length - 1];
    const parentGet = () => {
      let o = baseGet();
      for (let i = 0; i < segs.length - 1; i++) o = step(o, segs[i], raw);
      return o;
    };
    // Bit truy cập kiểu .%X3 hoặc .X3 trên Word: hỗ trợ đơn giản
    const bitMatch = last.f && last.f.match(/^%?X(\d+)$/i);
    if (bitMatch) {
      const bit = +bitMatch[1];
      return {
        get: () => ((step(parentGet(), null, raw, true) >> bit) & 1) === 1,
        set: () => { throw new PlcError('Ghi bit trong word chưa hỗ trợ'); },
        type: 'Bool',
      };
    }
    return {
      get: () => step(parentGet(), last, raw),
      set: (v) => {
        const o = parentGet();
        if (last.f !== undefined) {
          if (!(last.f in o)) throw new PlcError(`Không có trường .${last.f} trong ${raw}`);
          const t = o[T] && o[T][last.f];
          o[last.f] = t ? coerce(t, v) : v;
        } else {
          const i = last.idx.get() - o.lo;
          if (i < 0 || i >= o.length) throw new PlcError(`Chỉ số mảng ngoài giới hạn: ${raw}`);
          o[i] = coerce(o.elem, v);
        }
      },
      get type() {
        try { const o = parentGet(); return last.f !== undefined ? (o[T] && o[T][last.f]) : o.elem; } catch { return undefined; }
      },
    };
  }

  addrAccessor(a, raw) {
    if (!a) throw new PlcError(`Địa chỉ không hợp lệ: ${raw}`);
    const area = this[a.area];
    const max = area.bytes.length - (a.type === 'Bool' ? 1 : 4);
    if (a.byte > max) throw new PlcError(`Địa chỉ vượt vùng nhớ: ${raw}`);
    if (a.type === 'Bool') return { get: () => area.getBit(a.byte, a.bit), set: (v) => area.setBit(a.byte, a.bit, !!v), type: 'Bool', addr: a };
    return { get: () => area.get(a.type, a.byte), set: (v) => area.set(a.type, a.byte, v), type: a.type, addr: a };
  }
}

function step(o, seg, raw, self) {
  if (self) return o;
  if (o == null || typeof o !== 'object') throw new PlcError(`Không truy cập được thành phần của ${raw}`);
  if (seg.f !== undefined) {
    if (!(seg.f in o)) throw new PlcError(`Không có trường .${seg.f} trong ${raw}`);
    return o[seg.f];
  }
  const i = seg.idx.get() - o.lo;
  if (i < 0 || i >= o.length) throw new PlcError(`Chỉ số mảng ngoài giới hạn: ${raw}`);
  return o[i];
}

/** Kiểu biến cục bộ của một khối (để kiểm tra lúc biên dịch). */
export function localTypesOf(block) {
  const itf = block.interface || {};
  const out = {};
  for (const sec of ['Input', 'Output', 'InOut', 'Static', 'Temp', 'Constant']) for (const v of itf[sec] || []) out[v.name] = v.type;
  if (block.type === 'FC' && itf.Return && itf.Return !== 'Void') out[block.name] = itf.Return;
  return out;
}

/** Tạo khung biến cho lần gọi: FB dùng instance (Static giữ lại), Temp tạo mới mỗi lần. */
export function makeFrame(block, instance, fbLookup) {
  const vars = instance || {};
  if (!instance) { vars[T] = {}; vars[KIND] = 'FC:' + block.name; }
  const itf = block.interface || {};
  const secs = instance ? ['Temp', 'Constant'] : ['Input', 'Output', 'InOut', 'Temp', 'Constant'];
  for (const sec of secs) for (const v of itf[sec] || []) {
    vars[T][v.name] = v.type;
    vars[v.name] = makeVar(v.type, fbLookup, sec === 'Constant' ? v.init : undefined);
  }
  if (block.type === 'FC' && itf.Return && itf.Return !== 'Void') { vars[T][block.name] = itf.Return; vars[block.name] = defaultValue(itf.Return); }
  return { block, vars };
}
