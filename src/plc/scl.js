// SCL (Structured Control Language, tập con IEC 61131-3 ST kiểu Siemens): tokenizer, parser, biên dịch thành closure.
import { PlcError, execSystemFb, KIND, SYSTEM_FBS } from './context.js';
import { coerce, parseConstant } from './values.js';

const KW = new Set(['IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'CASE', 'OF', 'END_CASE', 'FOR', 'TO', 'BY', 'DO', 'END_FOR',
  'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT', 'EXIT', 'CONTINUE', 'RETURN', 'AND', 'OR', 'XOR', 'NOT', 'MOD', 'TRUE', 'FALSE']);

/* ---------- Tokenizer ---------- */
export function tokenize(src) {
  const toks = [];
  let i = 0, line = 1;
  const push = (t, v, extra) => toks.push({ t, v, line, ...extra });
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('(*', i)) { const j = src.indexOf('*)', i + 2); const end = j < 0 ? src.length : j + 2; line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
    if (src.startsWith('/*', i)) { const j = src.indexOf('*/', i + 2); const end = j < 0 ? src.length : j + 2; line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
    // Hằng có tiền tố kiểu: T#2s, TIME#1m, 16#FF, W#16#FF, 2#1010, INT#5, REAL#1.5
    let m = src.slice(i).match(/^(?:T|TIME|LT)#-?[0-9][0-9A-Za-z_.]*/i)
      || src.slice(i).match(/^(?:[A-Za-z]+#)?(?:16#[0-9A-Fa-f_]+|2#[01_]+)/)
      || src.slice(i).match(/^(?:INT|DINT|REAL|LREAL|UINT|UDINT|SINT|USINT)#[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/i);
    if (m) {
      const c2 = parseConstant(m[0]);
      if (!c2) throw new PlcError(`Hằng không hợp lệ: ${m[0]}`, { line });
      push('num', c2.value, { ctype: c2.type, raw: m[0] }); i += m[0].length; continue;
    }
    m = src.slice(i).match(/^\d+\.\d+(?:[eE][+-]?\d+)?|^\d+[eE][+-]?\d+/);
    if (m) { push('num', parseFloat(m[0]), { ctype: 'Real', raw: m[0] }); i += m[0].length; continue; }
    m = src.slice(i).match(/^\d+/);
    if (m) { push('num', parseInt(m[0], 10), { ctype: 'DInt', raw: m[0] }); i += m[0].length; continue; }
    if (c === '"') { const j = src.indexOf('"', i + 1); if (j < 0) throw new PlcError('Thiếu dấu " đóng', { line }); push('gname', src.slice(i + 1, j)); i = j + 1; continue; }
    if (c === "'") { const j = src.indexOf("'", i + 1); if (j < 0) throw new PlcError("Thiếu dấu ' đóng", { line }); push('str', src.slice(i + 1, j)); i = j + 1; continue; }
    if (c === '#') { m = src.slice(i + 1).match(/^[A-Za-z_]\w*/); if (!m) throw new PlcError('Sau # phải là tên biến', { line }); push('lname', m[0]); i += 1 + m[0].length; continue; }
    if (c === '%') { m = src.slice(i).match(/^%[IQM][BWDX]?\d+(?:\.\d)?/i); if (!m) throw new PlcError('Địa chỉ không hợp lệ', { line }); push('addr', m[0].toUpperCase()); i += m[0].length; continue; }
    m = src.slice(i).match(/^[A-Za-z_]\w*/);
    if (m) { const up = m[0].toUpperCase(); if (KW.has(up)) push('kw', up); else push('id', m[0]); i += m[0].length; continue; }
    const ops = [':=', '=>', '<=', '>=', '<>', '**', '..', '+', '-', '*', '/', '=', '<', '>', '(', ')', '[', ']', ',', ';', ':', '.', '&'];
    const o = ops.find((s) => src.startsWith(s, i));
    if (o) { push('op', o); i += o.length; continue; }
    throw new PlcError(`Ký tự không hợp lệ: '${c}'`, { line });
  }
  push('eof', null);
  return toks;
}

/* ---------- Parser → AST ---------- */
export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (o = 0) => toks[p + o];
  const err = (msg, t = peek()) => new PlcError(msg, { line: t.line });
  const isOp = (v) => peek().t === 'op' && peek().v === v;
  const isKw = (v) => peek().t === 'kw' && peek().v === v;
  const eatOp = (v) => { if (!isOp(v)) throw err(`Thiếu '${v}' (gặp '${peek().v ?? 'hết file'}')`); return toks[p++]; };
  const eatKw = (v) => { if (!isKw(v)) throw err(`Thiếu ${v} (gặp '${peek().v ?? 'hết file'}')`); return toks[p++]; };

  function stmts(...enders) {
    const out = [];
    while (!(peek().t === 'eof' || (peek().t === 'kw' && enders.includes(peek().v)))) {
      if (isOp(';')) { p++; continue; }
      out.push(stmt());
    }
    return out;
  }

  function stmt() {
    const t = peek();
    if (t.t === 'kw') {
      switch (t.v) {
        case 'IF': {
          p++; const arms = []; let cond = expr(); eatKw('THEN'); arms.push({ cond, body: stmts('ELSIF', 'ELSE', 'END_IF') });
          let els = null;
          while (isKw('ELSIF')) { p++; cond = expr(); eatKw('THEN'); arms.push({ cond, body: stmts('ELSIF', 'ELSE', 'END_IF') }); }
          if (isKw('ELSE')) { p++; els = stmts('END_IF'); }
          eatKw('END_IF'); semi();
          return { k: 'if', arms, els, line: t.line };
        }
        case 'CASE': {
          p++; const sel = expr(); eatKw('OF');
          const cases = []; let els = null;
          while (!isKw('END_CASE') && !isKw('ELSE')) {
            const labels = [];
            do {
              if (isOp(',')) p++;
              const a = expr();
              if (isOp('..')) { p++; labels.push({ lo: a, hi: expr() }); } else labels.push({ lo: a, hi: a });
            } while (isOp(','));
            eatOp(':');
            cases.push({ labels, body: caseBody() });
          }
          if (isKw('ELSE')) { p++; if (isOp(':')) p++; els = stmts('END_CASE'); }
          eatKw('END_CASE'); semi();
          return { k: 'case', sel, cases, els, line: t.line };
        }
        case 'FOR': {
          p++; const v = ref(); eatOp(':='); const from = expr(); eatKw('TO'); const to = expr();
          let by = null; if (isKw('BY')) { p++; by = expr(); }
          eatKw('DO'); const body = stmts('END_FOR'); eatKw('END_FOR'); semi();
          return { k: 'for', v, from, to, by, body, line: t.line };
        }
        case 'WHILE': { p++; const cond = expr(); eatKw('DO'); const body = stmts('END_WHILE'); eatKw('END_WHILE'); semi(); return { k: 'while', cond, body, line: t.line }; }
        case 'REPEAT': { p++; const body = stmts('UNTIL'); eatKw('UNTIL'); const cond = expr(); eatKw('END_REPEAT'); semi(); return { k: 'repeat', cond, body, line: t.line }; }
        case 'EXIT': p++; semi(); return { k: 'exit', line: t.line };
        case 'CONTINUE': p++; semi(); return { k: 'continue', line: t.line };
        case 'RETURN': p++; semi(); return { k: 'return', line: t.line };
      }
      throw err(`Không mong đợi từ khóa ${t.v}`);
    }
    const target = ref();
    if (isOp(':=')) { p++; const e = expr(); semi(true); return { k: 'assign', target, e, line: t.line }; }
    if (isOp('(')) { const args = callArgs(); semi(true); return { k: 'call', target, args, line: t.line }; }
    throw err(`Thiếu ':=' sau ${t.v}`);
  }

  // Thân một nhánh CASE: các lệnh cho đến khi gặp nhãn mới (biểu thức hằng theo sau bởi ':' hoặc ',' hoặc '..'), ELSE hoặc END_CASE
  function caseBody() {
    const out = [];
    for (;;) {
      if (isKw('END_CASE') || isKw('ELSE') || peek().t === 'eof') break;
      if (isOp(';')) { p++; continue; }
      if (looksLikeLabel()) break;
      out.push(stmt());
    }
    return out;
  }
  function looksLikeLabel() {
    let q = p;
    if (toks[q].t === 'op' && toks[q].v === '-') q++;
    const t = toks[q];
    if (!(t.t === 'num' || t.t === 'gname' || (t.t === 'lname' && toks[q + 1].t === 'op' && toks[q + 1].v !== ':=' && toks[q + 1].v !== '(' && toks[q + 1].v !== '[' && toks[q + 1].v !== '.'))) return false;
    const n = toks[q + 1];
    return n.t === 'op' && (n.v === ':' || n.v === ',' || n.v === '..');
  }

  function semi(required) { if (isOp(';')) p++; else if (required && !(peek().t === 'kw' || peek().t === 'eof')) throw err("Thiếu ';'"); }

  function callArgs() {
    eatOp('(');
    const args = [];
    if (!isOp(')')) {
      do {
        if (isOp(',')) p++;
        if ((peek().t === 'id' || peek().t === 'lname') && peek(1).t === 'op' && (peek(1).v === ':=' || peek(1).v === '=>')) {
          const name = toks[p++].v; const dir = toks[p++].v;
          if (dir === '=>') args.push({ name, out: ref() }); else args.push({ name, e: expr() });
        } else args.push({ e: expr() });
      } while (isOp(','));
    }
    eatOp(')');
    return args;
  }

  function ref() {
    const t = toks[p];
    let node;
    if (t.t === 'lname') { p++; node = { k: 'ref', scope: 'local', name: t.v, segs: [], line: t.line }; }
    else if (t.t === 'gname' || t.t === 'id') { p++; node = { k: 'ref', scope: 'global', name: t.v, segs: [], line: t.line, bare: t.t === 'id' }; }
    else if (t.t === 'addr') { p++; return { k: 'ref', scope: 'addr', name: t.v, segs: [], line: t.line }; }
    else throw err(`Mong đợi tên biến, gặp '${t.v ?? 'hết file'}'`);
    for (;;) {
      if (isOp('.')) {
        p++; const f = toks[p];
        if (f.t === 'id' || f.t === 'gname' || f.t === 'kw') { p++; node.segs.push({ f: f.v }); }
        else if (f.t === 'op' && f.v === '%') { throw err('Truy cập bit .%X chưa hỗ trợ trong SCL'); }
        else throw err('Thiếu tên trường sau dấu chấm');
      } else if (isOp('[')) { p++; const e = expr(); eatOp(']'); node.segs.push({ idx: e }); }
      else break;
    }
    return node;
  }

  // Thứ tự ưu tiên: OR < XOR < AND/& < so sánh < +,- < *,/,MOD < ** < đơn ngôi
  function expr() { return bin(0); }
  const LEVELS = [['OR'], ['XOR'], ['AND', '&'], ['=', '<>', '<', '>', '<=', '>='], ['+', '-'], ['*', '/', 'MOD'], ['**']];
  function bin(lv) {
    if (lv >= LEVELS.length) return unary();
    let a = bin(lv + 1);
    for (;;) {
      const t = peek();
      const v = t.t === 'kw' || t.t === 'op' ? t.v : null;
      if (v && LEVELS[lv].includes(v)) { p++; const b = bin(lv + 1); a = { k: 'bin', op: v === '&' ? 'AND' : v, a, b, line: t.line }; }
      else return a;
    }
  }
  function unary() {
    const t = peek();
    if (t.t === 'kw' && t.v === 'NOT') { p++; return { k: 'un', op: 'NOT', a: unary() }; }
    if (t.t === 'op' && t.v === '-') { p++; return { k: 'un', op: '-', a: unary() }; }
    if (t.t === 'op' && t.v === '+') { p++; return unary(); }
    return primary();
  }
  function primary() {
    const t = peek();
    if (t.t === 'num') { p++; return { k: 'const', v: t.v, type: t.ctype }; }
    if (t.t === 'str') { p++; return { k: 'const', v: t.v, type: 'String' }; }
    if (t.t === 'kw' && (t.v === 'TRUE' || t.v === 'FALSE')) { p++; return { k: 'const', v: t.v === 'TRUE', type: 'Bool' }; }
    if (t.t === 'op' && t.v === '(') { p++; const e = expr(); eatOp(')'); return e; }
    if (t.t === 'id' && peek(1).t === 'op' && peek(1).v === '(') { p++; return { k: 'fn', name: t.v.toUpperCase(), rawName: t.v, args: callArgs(), line: t.line }; }
    if (t.t === 'gname' && peek(1).t === 'op' && peek(1).v === '(') { p++; return { k: 'fn', name: t.v, rawName: t.v, args: callArgs(), line: t.line, user: true }; }
    return ref();
  }

  const body = stmts();
  if (peek().t !== 'eof') throw err(`Không mong đợi '${peek().v}'`);
  return body;
}

/* ---------- Biên dịch AST → closure ---------- */
const BREAK = Symbol('exit'), CONT = Symbol('continue'), RET = Symbol('return');
const LOOP_LIMIT = 100000;

const CONVERT = /^([A-Z]+)_TO_([A-Z]+)$/;
const BUILTINS = {
  ABS: (a) => Math.abs(a), SQRT: (a) => Math.sqrt(a), SQR: (a) => a * a, EXP: (a) => Math.exp(a), LN: (a) => Math.log(a),
  SIN: Math.sin, COS: Math.cos, TAN: Math.tan, TRUNC: (a) => Math.trunc(a), ROUND: (a) => Math.round(a),
  CEIL: Math.ceil, FLOOR: Math.floor,
  MIN: (...a) => Math.min(...a), MAX: (...a) => Math.max(...a),
  LIMIT: (mn, x, mx) => Math.min(Math.max(x, mn), mx), SEL: (g, a, b) => (g ? b : a),
  NORM_X: (mn, v, mx) => (mx === mn ? 0 : (v - mn) / (mx - mn)), SCALE_X: (mn, v, mx) => v * (mx - mn) + mn,
  SHL: (a, n) => a << n, SHR: (a, n) => a >>> n, ROL: (a, n) => ((a << n) | (a >>> (16 - n))) & 0xffff, ROR: (a, n) => ((a >>> n) | (a << (16 - n))) & 0xffff,
};
const NAMED_ORDER = { LIMIT: ['MN', 'IN', 'MX'], NORM_X: ['MIN', 'VALUE', 'MAX'], SCALE_X: ['MIN', 'VALUE', 'MAX'], SEL: ['G', 'IN0', 'IN1'], SHL: ['IN', 'N'], SHR: ['IN', 'N'], ROL: ['IN', 'N'], ROR: ['IN', 'N'], MIN: ['IN1', 'IN2', 'IN3', 'IN4'], MAX: ['IN1', 'IN2', 'IN3', 'IN4'] };

const TYPE_NAME = { BOOL: 'Bool', BYTE: 'Byte', WORD: 'Word', DWORD: 'DWord', INT: 'Int', UINT: 'UInt', DINT: 'DInt', UDINT: 'UDInt', SINT: 'Int', USINT: 'Byte', REAL: 'Real', LREAL: 'Real', TIME: 'Time', CHAR: 'Char' };

/**
 * env: { localTypes, callBlock(blk, instAcc, params, at) → fn, blockName }
 * Trả về hàm run() thực thi khối.
 */
export function compileScl(source, ctx, env) {
  let ast;
  try { ast = parse(source || ''); } catch (e) { throw e; }
  const lt = env.localTypes;
  let lineNow = 0;

  const at = (line) => (msg) => new PlcError(msg, { line });

  function refAcc(r) {
    const segText = r.segs.map((s) => (s.f !== undefined ? '.' + (/^\w+$/.test(s.f) ? s.f : `"${s.f}"`) : `[__IDX${r.segs.indexOf(s)}]`)).join('');
    const idxExprs = r.segs.filter((s) => s.idx).map((s) => cexpr(s.idx));
    let k = 0;
    const idxCompiler = () => { const f = idxExprs[k++]; return { get: f }; };
    let text;
    if (r.scope === 'local') text = '#' + r.name + segText;
    else if (r.scope === 'addr') text = r.name;
    else {
      // tên không ngoặc trong SCL: ưu tiên biến cục bộ (Siemens tự thêm #)
      if (r.bare && lt && r.name in lt) text = '#' + r.name + segText;
      else text = '"' + r.name + '"' + segText;
    }
    try { return ctx.operand(text.replace(/\[__IDX\d+\]/g, '[0]'), lt, idxCompiler); }
    catch (e) { throw new PlcError(e.message, { line: r.line }); }
  }

  function cexpr(e) {
    switch (e.k) {
      case 'const': { const v = e.v; return () => v; }
      case 'ref': { const a = refAcc(e); return () => a.get(); }
      case 'un': {
        const a = cexpr(e.a);
        if (e.op === 'NOT') return () => { const v = a(); return typeof v === 'boolean' ? !v : (~v) & 0xffff; };
        return () => -a();
      }
      case 'bin': {
        const a = cexpr(e.a), b = cexpr(e.b);
        const intDiv = isIntExpr(e.a) && isIntExpr(e.b);
        switch (e.op) {
          case 'OR': return () => { const x = a(), y = b(); return typeof x === 'boolean' ? x || y : x | y; };
          case 'XOR': return () => { const x = a(), y = b(); return typeof x === 'boolean' ? x !== y : x ^ y; };
          case 'AND': return () => { const x = a(), y = b(); return typeof x === 'boolean' ? x && y : x & y; };
          case '=': return () => a() === b();
          case '<>': return () => a() !== b();
          case '<': return () => a() < b();
          case '>': return () => a() > b();
          case '<=': return () => a() <= b();
          case '>=': return () => a() >= b();
          case '+': return () => a() + b();
          case '-': return () => a() - b();
          case '*': return () => a() * b();
          case '/': return () => { const y = b(); if (y === 0) throw new PlcError('Chia cho 0', { line: e.line }); const r = a() / y; return intDiv ? Math.trunc(r) : r; };
          case 'MOD': return () => { const y = b(); if (y === 0) throw new PlcError('Chia cho 0', { line: e.line }); return a() % y; };
          case '**': return () => Math.pow(a(), b());
        }
        throw new PlcError('Toán tử không hỗ trợ ' + e.op, { line: e.line });
      }
      case 'fn': return cfn(e);
    }
    throw new PlcError('Biểu thức không hợp lệ');
  }

  function isIntExpr(e) {
    if (e.k === 'const') return e.type !== 'Real';
    if (e.k === 'ref') { try { const t = refAcc(e).type; return t && t !== 'Real'; } catch { return false; } }
    if (e.k === 'bin') return ['+', '-', '*', '/', 'MOD'].includes(e.op) && isIntExpr(e.a) && isIntExpr(e.b);
    return false;
  }

  function cfn(e) {
    const conv = e.name.match(CONVERT);
    const args = e.args;
    if (conv) {
      const a = cexpr(args[0].e);
      const to = TYPE_NAME[conv[2]];
      if (!to) throw new PlcError('Hàm chuyển đổi không hỗ trợ: ' + e.rawName, { line: e.line });
      if (conv[1] === 'REAL' || conv[1] === 'LREAL') return () => coerce(to, Math.round(a()));
      return () => coerce(to, to === 'Bool' ? a() !== 0 : a());
    }
    if (e.name === 'TRUNC') { const a = cexpr(args[0].e); return () => Math.trunc(a()); }
    const bi = BUILTINS[e.name];
    if (bi && !e.user) {
      const order = NAMED_ORDER[e.name];
      const fns = order && args.some((x) => x.name)
        ? order.filter((n) => args.find((x) => x.name && x.name.toUpperCase() === n)).map((n) => cexpr(args.find((x) => x.name && x.name.toUpperCase() === n).e))
        : args.map((x) => cexpr(x.e));
      return () => bi(...fns.map((f) => f()));
    }
    // Gọi FC người dùng trả về giá trị
    const blk = ctx.blocks.get(e.rawName);
    if (blk && blk.type === 'FC') {
      const params = {}; for (const a of args) if (a.name) params[a.name] = a;
      const call = env.callBlock(blk, null, params, at(e.line), cexpr, refAcc);
      return () => call();
    }
    throw new PlcError(`Hàm không tồn tại: ${e.rawName}`, { line: e.line });
  }

  function cstmt(s) {
    const L = s.line;
    switch (s.k) {
      case 'assign': {
        const t = refAcc(s.target);
        if (t.constant) throw new PlcError('Không gán vào hằng số', { line: L });
        const v = cexpr(s.e);
        return () => { lineNow = L; t.set(v()); };
      }
      case 'if': {
        const arms = s.arms.map((a) => [cexpr(a.cond), cblock(a.body)]);
        const els = s.els ? cblock(s.els) : null;
        return () => { lineNow = L; for (const [c, b] of arms) if (c()) return b(); if (els) return els(); };
      }
      case 'case': {
        const sel = cexpr(s.sel);
        const cases = s.cases.map((c) => [c.labels.map((l) => [cexpr(l.lo), cexpr(l.hi)]), cblock(c.body)]);
        const els = s.els ? cblock(s.els) : null;
        return () => {
          lineNow = L; const v = sel();
          for (const [labels, b] of cases) for (const [lo, hi] of labels) if (v >= lo() && v <= hi()) return b();
          if (els) return els();
        };
      }
      case 'for': {
        const v = refAcc(s.v), from = cexpr(s.from), to = cexpr(s.to), by = s.by ? cexpr(s.by) : () => 1, body = cblock(s.body);
        return () => {
          lineNow = L; const step = by(); if (step === 0) throw new PlcError('FOR với bước 0', { line: L });
          const end = to(); let n = 0;
          for (v.set(from()); step > 0 ? v.get() <= end : v.get() >= end; v.set(v.get() + step)) {
            if (++n > LOOP_LIMIT) throw new PlcError('Vòng lặp quá dài (có thể vô hạn)', { line: L });
            const r = body(); if (r === BREAK) break; if (r === RET) return RET;
          }
        };
      }
      case 'while': {
        const c = cexpr(s.cond), body = cblock(s.body);
        return () => { lineNow = L; let n = 0; while (c()) { if (++n > LOOP_LIMIT) throw new PlcError('Vòng lặp WHILE không kết thúc trong một chu kỳ quét', { line: L }); const r = body(); if (r === BREAK) break; if (r === RET) return RET; } };
      }
      case 'repeat': {
        const c = cexpr(s.cond), body = cblock(s.body);
        return () => { lineNow = L; let n = 0; do { if (++n > LOOP_LIMIT) throw new PlcError('Vòng lặp REPEAT không kết thúc', { line: L }); const r = body(); if (r === BREAK) break; if (r === RET) return RET; } while (!c()); };
      }
      case 'exit': return () => BREAK;
      case 'continue': return () => CONT;
      case 'return': return () => RET;
      case 'call': return ccall(s);
    }
    throw new PlcError('Lệnh không hỗ trợ', { line: L });
  }

  function ccall(s) {
    const L = s.line;
    // FC người dùng?
    if (s.target.scope === 'global' && s.target.segs.length === 0) {
      const blk = ctx.blocks.get(s.target.name);
      if (blk && blk.type === 'FC') {
        const params = {}; for (const a of s.args) if (a.name) params[a.name] = a;
        const call = env.callBlock(blk, null, params, at(L), cexpr, refAcc);
        return () => { lineNow = L; call(); };
      }
      if (blk && blk.type === 'FB') throw new PlcError(`Gọi FB "${blk.name}" phải qua instance, vd. "${blk.name}_DB"(...)`, { line: L });
    }
    // Instance: #T1(...), "IEC_Timer_0_DB"(...), "Cyl1_DB"(...)
    let instGet, fbBlock = null, sysKind = null;
    const classify = (ty) => {
      const up = String(ty || '').toUpperCase().replace(/^IEC_/, '').replace(/^FB:/, '');
      if (SYSTEM_FBS.includes(up) || up === 'TIMER' || up === 'COUNTER') sysKind = up;
      else fbBlock = ctx.fbLookup(String(ty || '').replace(/^FB:/, ''));
    };
    if (s.target.scope === 'local' || s.target.segs.length > 0) {
      const a = refAcc(s.target);
      let ty = s.target.scope === 'local' && s.target.segs.length === 0 && lt ? lt[s.target.name] : a.type;
      if (!ty) { try { const o = a.get(); ty = o && o[KIND]; } catch { /* runtime */ } }
      classify(ty);
      instGet = () => a.get();
    } else {
      const name = s.target.name;
      const existing = ctx.globals.get(name);
      const dbBlk = ctx.blocks.get(name);
      const kindOf = existing ? existing[KIND] : dbBlk && dbBlk.instanceOf;
      if (!kindOf || kindOf === 'DB') throw new PlcError(`"${name}" không phải instance DB (khai báo DB với instanceOf, hoặc dùng biến Static)`, { line: L });
      classify(kindOf);
      instGet = () => ctx.globals.get(name);
    }
    if (sysKind) {
      const ins = s.args.filter((a) => a.e).map((a) => [a.name, cexpr(a.e)]);
      const outs = s.args.filter((a) => a.out).map((a) => [a.name, refAcc(a.out)]);
      for (const [n] of ins) if (!n) throw new PlcError('Gọi timer/counter phải dùng tham số có tên, vd. IN := ...', { line: L });
      return () => {
        lineNow = L; const o = instGet();
        for (const [n, f] of ins) o[n.toUpperCase()] = f();
        execSystemFb(o, ctx.now);
        for (const [n, r] of outs) r.set(o[n.toUpperCase()]);
      };
    }
    if (!fbBlock) throw new PlcError('Không xác định được khối được gọi', { line: L });
    const params = {}; for (const a of s.args) if (a.name) params[a.name] = a;
    const call = env.callBlock(fbBlock, { get: instGet }, params, at(L), cexpr, refAcc);
    return () => { lineNow = L; call(); };
  }

  function cblock(list) {
    const fs = list.map(cstmt);
    return () => { for (const f of fs) { const r = f(); if (r === BREAK || r === CONT || r === RET) return r; } };
  }

  const body = cblock(ast);
  const run = () => { try { body(); } catch (e) { if (e instanceof PlcError && e.line === undefined) e.line = lineNow; throw e; } };
  run.currentLine = () => lineNow;
  return run;
}
