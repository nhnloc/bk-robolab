// Kiểu dữ liệu, hằng số, vùng nhớ tiến trình (process image) cho soft-PLC.

export const TYPE_SIZE = { Bool: 0, Byte: 1, Char: 1, Word: 2, Int: 2, UInt: 2, DWord: 4, DInt: 4, UDInt: 4, Real: 4, Time: 4 };
const INT_RANGE = {
  Byte: [0, 255], Char: [0, 255], Word: [0, 65535], UInt: [0, 65535], Int: [-32768, 32767],
  DWord: [0, 4294967295], UDInt: [0, 4294967295], DInt: [-2147483648, 2147483647], Time: [-2147483648, 2147483647],
};

/** Ép giá trị JS về kiểu PLC (tràn số quấn vòng như CPU thật). */
export function coerce(type, v) {
  if (type === 'Bool') return !!v;
  if (typeof v === 'boolean') v = v ? 1 : 0;
  if (type === 'Real' || type === 'LReal') return Math.fround(Number(v) || 0);
  if (type === 'String') return String(v ?? '');
  const r = INT_RANGE[type];
  if (!r) return v;
  let n = Math.trunc(Number(v) || 0);
  const span = r[1] - r[0] + 1;
  if (n < r[0] || n > r[1]) n = ((((n - r[0]) % span) + span) % span) + r[0];
  return n;
}

export function defaultValue(type) {
  if (type === 'Bool') return false;
  if (type === 'String') return '';
  return 0;
}

/** Phân tích hằng số kiểu TIA: TRUE, 12, -3, 1.5, T#2s, T#1m30s500ms, 16#047F, 2#1010, INT#5 */
export function parseConstant(text) {
  if (text == null) return undefined;
  const s = String(text).trim();
  if (/^true$/i.test(s)) return { type: 'Bool', value: true };
  if (/^false$/i.test(s)) return { type: 'Bool', value: false };
  let m = s.match(/^(?:T|TIME)#(-)?(.+)$/i);
  if (m) {
    const ms = parseDuration(m[2]);
    if (ms == null) return undefined;
    return { type: 'Time', value: m[1] ? -ms : ms };
  }
  m = s.match(/^(?:(?:W|DW|B|WORD|DWORD|BYTE)#)?16#([0-9a-f_]+)$/i);
  if (m) return { type: 'Word', value: parseInt(m[1].replace(/_/g, ''), 16) };
  m = s.match(/^(?:(?:W|DW|B|WORD|DWORD|BYTE)#)?2#([01_]+)$/i);
  if (m) return { type: 'Word', value: parseInt(m[1].replace(/_/g, ''), 2) };
  m = s.match(/^(INT|DINT|UINT|UDINT|SINT|USINT|REAL|LREAL)#(.+)$/i);
  if (m) {
    const inner = parseConstant(m[2]);
    if (!inner) return undefined;
    const t = { INT: 'Int', DINT: 'DInt', UINT: 'UInt', UDINT: 'UDInt', SINT: 'Int', USINT: 'Byte', REAL: 'Real', LREAL: 'Real' }[m[1].toUpperCase()];
    return { type: t, value: coerce(t, inner.value) };
  }
  if (/^[+-]?\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return { type: Math.abs(n) > 32767 ? 'DInt' : 'Int', value: n };
  }
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)(e[+-]?\d+)?$/i.test(s)) return { type: 'Real', value: parseFloat(s) };
  m = s.match(/^'(.*)'$/);
  if (m) return { type: 'String', value: m[1] };
  return undefined;
}

export function parseDuration(s) {
  const re = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/gi;
  let total = 0, any = false, consumed = '';
  let m;
  while ((m = re.exec(s))) {
    any = true; consumed += m[0];
    const n = parseFloat(m[1]);
    total += n * { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
  }
  if (!any || consumed.replace(/_/g, '').length !== s.replace(/_/g, '').length) return null;
  return Math.round(total);
}

export function formatValue(type, v) {
  if (v === undefined) return '?';
  if (type === 'Bool') return v ? 'TRUE' : 'FALSE';
  if (type === 'Time') {
    let ms = v, out = 'T#';
    if (ms < 0) { out += '-'; ms = -ms; }
    if (ms === 0) return out + '0ms';
    const parts = [[86400000, 'd'], [3600000, 'h'], [60000, 'm'], [1000, 's'], [1, 'ms']];
    for (const [k, u] of parts) if (ms >= k) { out += Math.floor(ms / k) + u; ms %= k; }
    return out;
  }
  if (type === 'Real') return Number.isInteger(v) ? v.toFixed(1) : String(+v.toPrecision(7));
  if (type === 'Word' || type === 'DWord' || type === 'Byte') return '16#' + (v >>> 0).toString(16).toUpperCase().padStart(TYPE_SIZE[type] * 2, '0');
  return String(v);
}

/** Vùng nhớ I/Q/M theo byte, truy cập word/dword big-endian như S7. */
export class Area {
  constructor(size = 1024) { this.bytes = new Uint8Array(size); this.view = new DataView(this.bytes.buffer); }
  getBit(b, i) { return (this.bytes[b] >> i & 1) === 1; }
  setBit(b, i, v) { if (v) this.bytes[b] |= 1 << i; else this.bytes[b] &= ~(1 << i); }
  get(type, b) {
    const d = this.view;
    switch (type) {
      case 'Byte': case 'Char': return d.getUint8(b);
      case 'Word': case 'UInt': return d.getUint16(b);
      case 'Int': return d.getInt16(b);
      case 'DWord': case 'UDInt': return d.getUint32(b);
      case 'DInt': case 'Time': return d.getInt32(b);
      case 'Real': return d.getFloat32(b);
    }
    throw new Error('Kiểu không hỗ trợ: ' + type);
  }
  set(type, b, v) {
    const d = this.view; v = coerce(type, v);
    switch (type) {
      case 'Byte': case 'Char': return d.setUint8(b, v);
      case 'Word': case 'UInt': return d.setUint16(b, v);
      case 'Int': return d.setInt16(b, v);
      case 'DWord': case 'UDInt': return d.setUint32(b, v);
      case 'DInt': case 'Time': return d.setInt32(b, v);
      case 'Real': return d.setFloat32(b, v);
    }
    throw new Error('Kiểu không hỗ trợ: ' + type);
  }
  clear() { this.bytes.fill(0); }
}

const SIZE_LETTER = { X: 'Bool', B: 'Byte', W: 'Word', D: 'DWord' };

/** %I0.0, %IW64, %QD4, %M10.3, %MW20 → { area:'I'|'Q'|'M', type, byte, bit } */
export function parseAddress(s) {
  const m = String(s).trim().toUpperCase().match(/^%?([IQM])([BWDX]?)(\d+)(?:\.(\d))?$/);
  if (!m) return null;
  const [, area, size, byte, bit] = m;
  if (bit !== undefined) {
    if (size && size !== 'X') return null;
    if (+bit > 7) return null;
    return { area, type: 'Bool', byte: +byte, bit: +bit };
  }
  if (!size || size === 'X') return null;
  return { area, type: SIZE_LETTER[size], byte: +byte };
}

export function formatAddress(a) {
  if (a.type === 'Bool') return `%${a.area}${a.byte}.${a.bit}`;
  const L = { Byte: 'B', Char: 'B', Word: 'W', Int: 'W', UInt: 'W', DWord: 'D', DInt: 'D', UDInt: 'D', Real: 'D', Time: 'D' }[a.type];
  return `%${a.area}${L}${a.byte}`;
}

/** Tag có kiểu khai báo khác kiểu thô của địa chỉ (vd. Int tại %MW10) — kiểm tra kích thước khớp. */
export function addressFitsType(addr, type) {
  if (type === 'Bool') return addr.type === 'Bool';
  if (addr.type === 'Bool') return false;
  return TYPE_SIZE[addr.type] === TYPE_SIZE[type];
}
