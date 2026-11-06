// Ngôn ngữ INFORM (tập con dùng trong phòng thí nghiệm MotoMINI / YRC1000micro).
// Mỗi dòng job là một chuỗi văn bản; parseLine() → lệnh đã phân tích, ném InformError nếu sai cú pháp.

export class InformError extends Error {
  constructor(msg, line) { super(msg); this.line = line; }
}

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const VARRE = /^(B|I|D|R)(\d{1,3})$/i;
const POSRE = /^(P|C)(\d{1,5})$/i;
export const VAR_LIMIT = { B: 100, I: 100, D: 100, R: 100, P: 128 };
export const IO_MAX = 24;

/** Danh sách lệnh cho bảng INFORM LIST (nhóm → lệnh → mẫu). */
export const INFORM_LIST = [
  { group: 'MOTION', items: [
    ['MOVJ', 'MOVJ P000 VJ=10.00', 'Di chuyển nội suy khớp'],
    ['MOVL', 'MOVL P000 V=50.0', 'Di chuyển thẳng'],
    ['SPEED', 'SPEED VJ=10.00', 'Đặt tốc độ mặc định'],
  ] },
  { group: 'IN/OUT', items: [
    ['DOUT', 'DOUT OT#(1) ON', 'Bật/tắt ngõ ra'],
    ['PULSE', 'PULSE OT#(5) T=1.00', 'Xuất xung ra ngõ ra'],
    ['DIN', 'DIN B000 IN#(1)', 'Đọc ngõ vào vào biến'],
    ['WAIT', 'WAIT IN#(1)=ON', 'Chờ ngõ vào'],
  ] },
  { group: 'CONTROL', items: [
    ['JUMP', 'JUMP *LABEL', 'Nhảy tới nhãn / job'],
    ['*', '*LABEL', 'Nhãn'],
    ['CALL', 'CALL JOB:NAME', 'Gọi job con'],
    ['RET', 'RET', 'Trở về job gọi'],
    ['END', 'END', 'Kết thúc job'],
    ['NOP', 'NOP', 'Không làm gì'],
    ['TIMER', 'TIMER T=1.00', 'Chờ thời gian (s)'],
    ['IF', 'IF (IN#(1)=ON) THEN', 'Khối điều kiện'],
    ['ELSEIF', 'ELSEIF (IN#(2)=ON) THEN', ''],
    ['ELSE', 'ELSE', ''],
    ['ENDIF', 'ENDIF', ''],
    ['PAUSE', 'PAUSE', 'Tạm dừng chương trình'],
    ["'", "'chú thích", 'Chú thích'],
  ] },
  { group: 'ARITH', items: [
    ['SET', 'SET B000 1', 'Gán'],
    ['ADD', 'ADD I000 1', 'Cộng'],
    ['SUB', 'SUB I000 1', 'Trừ'],
    ['MUL', 'MUL I000 2', 'Nhân'],
    ['DIV', 'DIV I000 2', 'Chia'],
    ['INC', 'INC B000', 'Tăng 1'],
    ['DEC', 'DEC B000', 'Giảm 1'],
    ['AND', 'AND B000 B001', 'AND bit'],
    ['OR', 'OR B000 B001', 'OR bit'],
  ] },
  { group: 'SHIFT', items: [
    ['SFTON', 'SFTON P010 BF', 'Bật dịch chuyển (offset theo BASE)'],
    ['SFTOF', 'SFTOF', 'Tắt dịch chuyển'],
  ] },
];

/* ------------------------------------------------------------ toán hạng */
function parseIo(s) {
  const m = /^(IN|OT|IG|OG)#\((\d+)\)$/i.exec(s.replace(/\s+/g, ''));
  if (!m) return null;
  const n = +m[2];
  if (n < 1 || n > IO_MAX) throw new InformError(`Số hiệu ${m[1].toUpperCase()}#(${n}) ngoài dải 1..${IO_MAX}`);
  return { k: 'io', kind: m[1].toUpperCase(), n };
}
function parseVar(s) {
  const m = VARRE.exec(s);
  if (!m) return null;
  const t = m[1].toUpperCase(), n = +m[2];
  if (n >= VAR_LIMIT[t]) throw new InformError(`Biến ${t}${String(n).padStart(3, '0')} ngoài dải (tối đa ${VAR_LIMIT[t] - 1})`);
  return { k: 'var', t, n };
}
function parsePos(s) {
  const m = POSRE.exec(s);
  if (!m) return null;
  const t = m[1].toUpperCase(), n = +m[2];
  if (t === 'P' && n >= VAR_LIMIT.P) throw new InformError(`Biến vị trí P${String(n).padStart(3, '0')} ngoài dải (P000..P127)`);
  return { k: 'pos', t, n };
}
/** Giá trị: hằng số, ON/OFF, biến B/I/D/R, IN#/OT#. */
function parseValue(s) {
  s = s.trim();
  if (/^ON$/i.test(s)) return { k: 'const', v: 1 };
  if (/^OFF$/i.test(s)) return { k: 'const', v: 0 };
  if (new RegExp('^' + NUM + '$').test(s)) return { k: 'const', v: parseFloat(s) };
  return parseVar(s) || parseIo(s) || (() => { throw new InformError(`Toán hạng không hợp lệ: "${s}"`); })();
}

/** Điều kiện: "IN#(1)=ON", "B001<>2", nối bằng AND / OR, có thể bọc ngoặc. */
export function parseCond(text) {
  let s = text.trim();
  while (s.startsWith('(') && matchParen(s) === s.length - 1) s = s.slice(1, -1).trim();
  // tách theo OR rồi AND ở mức ngoài cùng
  for (const opr of ['OR', 'AND']) {
    const parts = splitTop(s, opr);
    if (parts.length > 1) return { k: opr.toLowerCase(), items: parts.map(parseCond) };
  }
  const m = /^(.+?)\s*(<>|>=|<=|=|>|<)\s*(.+)$/.exec(s);
  if (!m) throw new InformError(`Điều kiện không hợp lệ: "${text.trim()}"`);
  return { k: 'cmp', op: m[2], a: parseValue(m[1]), b: parseValue(m[3]) };
}
function matchParen(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0) return i; } }
  return -1;
}
function splitTop(s, word) {
  const out = []; let d = 0, last = 0;
  const re = new RegExp(`\\s${word}\\s`, 'iy');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') d++; else if (s[i] === ')') d--;
    else if (d === 0) { re.lastIndex = i; if (re.test(s)) { out.push(s.slice(last, i)); last = i + word.length + 2; i = last - 1; } }
  }
  if (!out.length) return [s];
  out.push(s.slice(last));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Tách đuôi " IF <cond>" (lệnh có điều kiện). */
function splitIf(rest) {
  const m = /^(.*?)\s+IF\s+(.+)$/i.exec(rest);
  return m ? [m[1].trim(), parseCond(m[2])] : [rest.trim(), null];
}
function tagNum(tags, key, rest, { min = 0, max = Infinity, req = false } = {}) {
  const m = new RegExp(`(?:^|\\s)${key}=(${NUM})(?=\\s|$)`, 'i').exec(rest);
  if (!m) { if (req) throw new InformError(`Thiếu ${key}=`); return undefined; }
  const v = parseFloat(m[1]);
  if (!(v >= min && v <= max)) throw new InformError(`${key}=${m[1]} ngoài dải ${min}..${max}`);
  tags[key] = v;
  return v;
}

/* ------------------------------------------------------------ dòng lệnh */
export function parseLine(raw) {
  const text = String(raw ?? '').replace(/\s+$/, '');
  const s = text.trim();
  if (!s) return { op: 'NOP', raw: text, blank: true };
  if (s.startsWith("'")) return { op: 'COMMENT', text: s.slice(1), raw: text };
  if (s.startsWith('*')) {
    const name = s.slice(1).trim();
    if (!/^[A-Z0-9_-]{1,8}$/i.test(name)) throw new InformError('Tên nhãn: 1–8 ký tự chữ/số (vd. *LB1)');
    return { op: 'LABEL', name: name.toUpperCase(), raw: text };
  }
  const m = /^([A-Z]+)\b\s*(.*)$/i.exec(s);
  if (!m) throw new InformError(`Lệnh không hợp lệ: "${s}"`);
  const op = m[1].toUpperCase();
  const rest = m[2].trim();
  const L = { op, raw: text };
  switch (op) {
    case 'NOP': case 'END': case 'ELSE': case 'ENDIF': case 'SFTOF':
      if (rest) throw new InformError(`${op} không có tham số`);
      return L;
    case 'MOVJ': case 'MOVL': case 'MOVC': case 'MOVS': {
      if (op === 'MOVC' || op === 'MOVS') throw new InformError(`${op} chưa hỗ trợ trong bản mô phỏng — dùng MOVJ / MOVL`);
      const [body, until] = (() => { const u = /^(.*?)\s+UNTIL\s+(.+)$/i.exec(rest); return u ? [u[1], parseCond(u[2])] : [rest, null]; })();
      const parts = body.split(/\s+/);
      const target = parsePos(parts[0] || '');
      if (!target) throw new InformError(`${op}: thiếu điểm đích (vd. ${op} P001 ...)`);
      L.target = target; L.until = until; L.tags = {};
      const tagStr = parts.slice(1).join(' ');
      if (op === 'MOVJ') tagNum(L.tags, 'VJ', tagStr, { min: 0.01, max: 100 });
      else tagNum(L.tags, 'V', tagStr, { min: 0.1, max: 1500 });
      tagNum(L.tags, 'PL', tagStr, { min: 0, max: 8 });
      const known = tagStr.replace(new RegExp(`\\b(VJ|V|PL)=${NUM}`, 'gi'), '').trim();
      if (known) throw new InformError(`${op}: tham số không hợp lệ "${known}"`);
      if (op === 'MOVJ' && L.tags.VJ === undefined && /\bV=/i.test(tagStr)) throw new InformError('MOVJ dùng VJ= (phần trăm), không dùng V=');
      return L;
    }
    case 'SPEED': {
      L.tags = {};
      tagNum(L.tags, 'VJ', rest, { min: 0.01, max: 100 }); tagNum(L.tags, 'V', rest, { min: 0.1, max: 1500 });
      if (!Object.keys(L.tags).length) throw new InformError('SPEED VJ=… hoặc SPEED V=…');
      return L;
    }
    case 'DOUT': {
      const mm = /^(OT#\(\s*\d+\s*\))\s+(.+)$/i.exec(rest);
      if (!mm) throw new InformError('Cú pháp: DOUT OT#(n) ON|OFF|Bxxx');
      L.io = parseIo(mm[1]); const [v, cond] = splitIf(mm[2]); L.value = parseValue(v); L.cond = cond;
      return L;
    }
    case 'PULSE': {
      const mm = /^(OT#\(\s*\d+\s*\))\s*(.*)$/i.exec(rest);
      if (!mm) throw new InformError('Cú pháp: PULSE OT#(n) T=0.50');
      L.io = parseIo(mm[1]); L.tags = {};
      L.t = tagNum(L.tags, 'T', mm[2], { min: 0.01, max: 655.35 }) ?? 0.3;
      return L;
    }
    case 'DIN': {
      const mm = /^(\S+)\s+(IN#\(\s*\d+\s*\)|OT#\(\s*\d+\s*\))$/i.exec(rest);
      if (!mm) throw new InformError('Cú pháp: DIN B000 IN#(n)');
      L.dst = parseVar(mm[1]); if (!L.dst || L.dst.t !== 'B') throw new InformError('DIN: biến đích phải là Bxxx');
      L.io = parseIo(mm[2]);
      return L;
    }
    case 'WAIT': {
      L.tags = {};
      const t = /\s+T=(\S+)\s*$/i.exec(rest);
      let c = rest;
      if (t) { L.timeout = parseFloat(t[1]); if (!(L.timeout > 0)) throw new InformError('WAIT T= phải > 0'); c = rest.slice(0, t.index); }
      L.cond = parseCond(c);
      if (L.cond.k !== 'cmp' || L.cond.a.k !== 'io') throw new InformError('Cú pháp: WAIT IN#(n)=ON|OFF|Bxxx [T=giây]');
      return L;
    }
    case 'JUMP': case 'CALL': {
      const [tgt, cond] = splitIf(rest);
      L.cond = cond;
      if (tgt.startsWith('*')) { if (op === 'CALL') throw new InformError('CALL chỉ gọi JOB:tên'); L.label = tgt.slice(1).trim().toUpperCase(); return L; }
      const j = /^JOB:\s*([A-Z0-9_-]{1,32})$/i.exec(tgt);
      if (!j) throw new InformError(`Cú pháp: ${op} JOB:TÊN${op === 'JUMP' ? ' hoặc JUMP *NHÃN' : ''}`);
      L.job = j[1].toUpperCase();
      return L;
    }
    case 'RET': case 'PAUSE': {
      if (rest) { const m2 = /^IF\s+(.+)$/i.exec(rest); if (!m2) throw new InformError(`Cú pháp: ${op} [IF điều kiện]`); L.cond = parseCond(m2[1]); }
      return L;
    }
    case 'TIMER': {
      L.tags = {}; L.t = tagNum(L.tags, 'T', rest, { min: 0.01, max: 655.35, req: true });
      return L;
    }
    case 'IF': case 'ELSEIF': {
      const mm = /^(.+)\s+THEN$/i.exec(rest);
      if (!mm) throw new InformError(`Cú pháp: ${op} (điều kiện) THEN`);
      L.cond = parseCond(mm[1]);
      return L;
    }
    case 'SET': case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'AND': case 'OR': case 'XOR': {
      const mm = /^(\S+)\s+(\S+)$/.exec(rest);
      if (!mm) throw new InformError(`Cú pháp: ${op} <biến> <giá trị>`);
      const pa = parsePos(mm[1]);
      if (pa) {
        if (pa.t !== 'P') throw new InformError('Chỉ dùng biến P');
        if (!['SET', 'ADD', 'SUB'].includes(op)) throw new InformError(`${op} không dùng cho biến vị trí`);
        const pb = parsePos(mm[2]); if (!pb || pb.t !== 'P') throw new InformError(`${op} P..: giá trị phải là biến P`);
        L.dst = pa; L.src = pb; L.posOp = true; return L;
      }
      L.dst = parseVar(mm[1]); if (!L.dst) throw new InformError(`${op}: biến đích không hợp lệ "${mm[1]}"`);
      L.src = parseValue(mm[2]);
      if (['AND', 'OR', 'XOR'].includes(op) && L.dst.t !== 'B') throw new InformError(`${op} chỉ dùng cho biến B`);
      return L;
    }
    case 'INC': case 'DEC': case 'NOT': {
      L.dst = parseVar(rest); if (!L.dst) throw new InformError(`${op} <biến B/I/D>`);
      return L;
    }
    case 'SFTON': {
      const mm = /^(P\d{1,3})(?:\s+(BF|RF))?$/i.exec(rest);
      if (!mm) throw new InformError('Cú pháp: SFTON Pxxx [BF]');
      L.src = parsePos(mm[1]);
      return L;
    }
    default:
      throw new InformError(`Lệnh "${op}" không có trong tập lệnh mô phỏng`);
  }
}

/** Biên dịch cả job: kiểm tra cú pháp, nhãn, khối IF. Trả { lines, labels, errors:[{line, message}] }. */
export function compileJob(job) {
  const errors = [];
  const lines = [];
  const labels = {};
  const stack = [];
  (job.lines || []).forEach((raw, i) => {
    let L;
    try { L = parseLine(raw); } catch (e) { errors.push({ line: i, message: e.message }); L = { op: 'NOP', raw, bad: true }; }
    L.idx = i;
    lines.push(L);
    if (L.op === 'LABEL') { if (labels[L.name] !== undefined) errors.push({ line: i, message: `Nhãn *${L.name} bị trùng` }); labels[L.name] = i; }
    if (L.op === 'IF') stack.push({ if: i, branches: [i] });
    else if (L.op === 'ELSEIF' || L.op === 'ELSE') { const top = stack[stack.length - 1]; if (!top) errors.push({ line: i, message: `${L.op} không có IF tương ứng` }); else top.branches.push(i); }
    else if (L.op === 'ENDIF') {
      const top = stack.pop();
      if (!top) errors.push({ line: i, message: 'ENDIF không có IF tương ứng' });
      else { const br = [...top.branches, i]; for (let k = 0; k < br.length - 1; k++) { lines[br[k]].next = br[k + 1]; lines[br[k]].endif = i; } }
    }
  });
  for (const s of stack) errors.push({ line: s.if, message: 'IF thiếu ENDIF' });
  for (const L of lines) if (L.op === 'JUMP' && L.label && labels[L.label] === undefined) errors.push({ line: L.idx, message: `Không có nhãn *${L.label}` });
  return { lines, labels, errors };
}

/** Kiểm tra tham chiếu giữa các job (CALL/JUMP JOB:) và biến vị trí đã dạy. */
export function checkProgram(jobs, pvars = {}) {
  const errors = [];
  const names = new Set(jobs.map((j) => j.name.toUpperCase()));
  for (const j of jobs) {
    const c = compileJob(j);
    for (const e of c.errors) errors.push({ job: j.name, ...e });
    for (const L of c.lines) {
      if ((L.op === 'CALL' || L.op === 'JUMP') && L.job && !names.has(L.job)) errors.push({ job: j.name, line: L.idx, message: `Không có job ${L.job}` });
      if (L.target?.t === 'P' && !pvars[pName(L.target.n)]) errors.push({ job: j.name, line: L.idx, warn: true, message: `${pName(L.target.n)} chưa được dạy điểm` });
      if (L.target?.t === 'C' && !(j.pos || {})[cName(L.target.n)]) errors.push({ job: j.name, line: L.idx, message: `${cName(L.target.n)} không có dữ liệu vị trí` });
    }
  }
  return errors;
}

export const pName = (n) => 'P' + String(n).padStart(3, '0');
export const cName = (n) => 'C' + String(n).padStart(5, '0');
export const vName = (t, n) => t + String(n).padStart(3, '0');
/** Định dạng số kiểu pendant: 10 → "10.00". */
export const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
