// Ngôn ngữ chương trình Motion kiểu MPE720 (tập con): VAR/END_VAR, ABS/INC, MOV, MVS, ZRN, TIM, TIM1MS,
// IOW, WHILE/WEND, IF/ELSE/IEND, gán biểu thức, END. Câu lệnh kết thúc bằng ';', chú thích '//'.

export class MotionError extends Error { constructor(msg, line) { super(msg); this.line = line; } }

const REG = /^(SB|MB|MW|ML|MF|MD|GB|GW|GL|GF|DB|DW|DL|DF)(\d{1,6})$/i;
export const isReg = (s) => REG.test(s);

/* ------------------------------------------------------------ tách câu lệnh */
function statements(src) {
  const out = [];
  const lines = String(src || '').split(/\r?\n/);
  let buf = '', startLine = 1;
  lines.forEach((ln, i) => {
    const code = ln.replace(/\/\/.*$/, '');
    for (const ch of code) {
      if (ch === ';') { if (buf.trim()) out.push({ text: buf.trim(), line: startLine }); buf = ''; startLine = i + 1; }
      else { if (!buf.trim()) startLine = i + 1; buf += ch; }
    }
    buf += ' ';
  });
  if (buf.trim()) out.push({ text: buf.trim(), line: startLine, noSemi: true });
  return out;
}

/* ------------------------------------------------------------ biểu thức */
function tokenize(s, line) {
  const toks = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<>', '<=', '>=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two === '<>' ? '!=' : two === '&&' ? '&' : two === '||' ? '|' : two }); i += 2; continue; }
    if ('+-*/()<>&|!'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (m) { toks.push({ t: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue; }
    const id = /^[A-Za-z_][\w.]*/.exec(s.slice(i));
    if (id) { toks.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    throw new MotionError(`Ký tự không hợp lệ "${c}"`, line);
  }
  return toks;
}
export function parseExpr(s, line) {
  const toks = tokenize(s, line); let p = 0;
  const peek = () => toks[p], eat = (v) => { if (toks[p]?.v === v) { p++; return true; } return false; };
  const prec = [['|'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/']];
  const lvl = (k) => {
    if (k >= prec.length) return unary();
    let a = lvl(k + 1);
    for (;;) { const t = peek(); if (t?.t === 'op' && prec[k].includes(t.v)) { p++; a = { k: 'bin', op: t.v, a, b: lvl(k + 1) }; } else return a; }
  };
  const unary = () => {
    if (eat('-')) return { k: 'neg', a: unary() };
    if (eat('!')) return { k: 'not', a: unary() };
    const t = toks[p++];
    if (!t) throw new MotionError('Biểu thức thiếu toán hạng', line);
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') return { k: 'id', v: t.v };
    if (t.v === '(') { const e = lvl(0); if (!eat(')')) throw new MotionError('Thiếu ")"', line); return e; }
    throw new MotionError(`Không mong đợi "${t.v}"`, line);
  };
  const e = lvl(0);
  if (p < toks.length) throw new MotionError(`Thừa "${toks[p].v}" trong biểu thức`, line);
  return e;
}

/* ------------------------------------------------------------ biên dịch */
/** axes: tên trục hợp lệ (vd. ['A1','B1','C1']). Trả { stmts, vars, errors }. */
export function compileMotion(src, { axes = [] } = {}) {
  const errors = [];
  const out = []; const vars = {};
  const st = statements(src);
  let inVar = false, ended = false;
  const blocks = [];
  const axisList = (txt, line, needVal = true) => {
    const items = []; const re = /\[\s*([A-Za-z]\w*)\s*\]\s*([^[]*)/g; let m; let rest = txt;
    while ((m = re.exec(txt))) {
      const ax = m[1].toUpperCase();
      if (!axes.includes(ax)) throw new MotionError(`Không có trục [${m[1]}] (trục đã cấu hình: ${axes.join(', ') || '—'})`, line);
      const v = m[2].trim();
      if (needVal && !v) throw new MotionError(`[${ax}] thiếu giá trị`, line);
      items.push({ axis: ax, e: v ? parseExpr(v, line) : { k: 'num', v: 0 } });
      rest = rest.replace(m[0], '');
    }
    if (!items.length) throw new MotionError('Thiếu danh sách trục, vd. [A1]900', line);
    return items;
  };
  for (const { text, line, noSemi } of st) {
    try {
      if (noSemi) throw new MotionError(`Thiếu dấu ";" sau "${text.slice(0, 30)}"`, line);
      const up = text.toUpperCase();
      if (up === 'VAR') { inVar = true; continue; }
      if (up === 'END_VAR') { inVar = false; continue; }
      if (inVar) {
        // "ML00100 Pos_Up" hoặc "Pos_Up : ML00100" hoặc "Pos_Up AT ML00100"
        const m = /^(\w+)\s+(\w+)$/.exec(text) || /^(\w+)\s*(?::|\bAT\b)\s*(\w+)$/i.exec(text);
        if (!m) throw new MotionError('Khai báo biến: <thanh ghi> <tên>; vd. ML00100 PosUp;', line);
        let [, a, b] = m; if (!isReg(a) && isReg(b)) [a, b] = [b, a];
        if (!isReg(a)) throw new MotionError(`"${a}" không phải thanh ghi (ML/MW/MF/GL/…)`, line);
        vars[b] = a.toUpperCase();
        continue;
      }
      if (ended) throw new MotionError('Có lệnh sau END', line);
      let m;
      if (up === 'ABS' || up === 'INC') { out.push({ op: up, line }); continue; }
      if (up === 'END') { out.push({ op: 'END', line }); ended = true; continue; }
      if ((m = /^(MOV|MVS|ZRN)\b(.*)$/i.exec(text))) {
        const op = m[1].toUpperCase(); let body = m[2];
        let feed = null;
        const f = /\bF\s*([^[\]]+)$/i.exec(body);
        if (f && op === 'MVS') { feed = parseExpr(f[1].trim(), line); body = body.slice(0, f.index); }
        const items = axisList(body, line);
        if (op === 'ZRN') for (const it of items) if (!(it.e.k === 'num' && it.e.v === 0)) throw new MotionError('ZRN: giá trị sau mỗi trục phải là 0, vd. ZRN [A1]0;', line);
        out.push({ op, items, feed, line });
        continue;
      }
      if ((m = /^(TIM1MS|TIM)\s+T\s*(.+)$/i.exec(text))) { out.push({ op: 'TIM', ms: m[1].toUpperCase() === 'TIM1MS' ? 1 : 10, e: parseExpr(m[2], line), line }); continue; }
      if ((m = /^IOW\s+(.+)$/i.exec(text))) { out.push({ op: 'IOW', e: parseExpr(m[1], line), line }); continue; }
      if ((m = /^WHILE\s+(.+)$/i.exec(text))) { blocks.push({ k: 'WHILE', at: out.length, line }); out.push({ op: 'WHILE', e: parseExpr(m[1], line), line }); continue; }
      if (up === 'WEND') {
        const b = blocks.pop(); if (!b || b.k !== 'WHILE') throw new MotionError('WEND không có WHILE', line);
        out.push({ op: 'WEND', to: b.at, line }); out[b.at].end = out.length; continue;
      }
      if ((m = /^IF\s+(.+)$/i.exec(text))) { blocks.push({ k: 'IF', at: out.length, line }); out.push({ op: 'IF', e: parseExpr(m[1], line), line }); continue; }
      if (up === 'ELSE') {
        const b = blocks[blocks.length - 1]; if (!b || b.k !== 'IF') throw new MotionError('ELSE không có IF', line);
        b.else = out.length; out.push({ op: 'ELSE', line }); out[b.at].else = out.length; continue;
      }
      if (up === 'IEND') {
        const b = blocks.pop(); if (!b || b.k !== 'IF') throw new MotionError('IEND không có IF', line);
        out.push({ op: 'IEND', line });
        if (b.else !== undefined) out[b.else].end = out.length; else out[b.at].else = out.length;
        continue;
      }
      if ((m = /^([A-Za-z_][\w.]*)\s*=(?!=)\s*(.+)$/.exec(text))) { out.push({ op: 'SET', dst: m[1], e: parseExpr(m[2], line), line }); continue; }
      throw new MotionError(`Lệnh không hợp lệ: "${text.slice(0, 40)}"`, line);
    } catch (e) {
      errors.push({ line: e.line ?? line, message: e.message });
    }
  }
  for (const b of blocks) errors.push({ line: b.line, message: `${b.k} thiếu ${b.k === 'IF' ? 'IEND' : 'WEND'}` });
  if (inVar) errors.push({ line: 1, message: 'Thiếu END_VAR' });
  if (!ended && !errors.length) errors.push({ line: st.length ? st[st.length - 1].line : 1, message: 'Chương trình phải kết thúc bằng END;' });
  return { stmts: out, vars, errors };
}

/* ------------------------------------------------------------ thực thi */
/**
 * Một tác vụ motion (được MSEE gọi). env:
 *   axis(name) → ServoAxis, read(name) → số, write(name, v), regs: Map thanh ghi
 */
export class MotionTask {
  constructor(name, compiled, env) {
    this.name = name; this.c = compiled; this.env = env;
    this.state = 'IDLE';     // IDLE | RUN | PAUSE | DONE | ALARM
    this.pc = 0; this.inc = false; this.wait = null; this.alarm = null; this.feed = null;
  }
  get running() { return this.state === 'RUN' || this.state === 'PAUSE'; }
  start() { this.pc = 0; this.inc = false; this.wait = null; this.alarm = null; this.state = 'RUN'; }
  pause(on) { if (on && this.state === 'RUN') this.state = 'PAUSE'; else if (!on && this.state === 'PAUSE') this.state = 'RUN'; }
  stop() {
    if (this.wait?.axes) for (const a of this.wait.axes) this.env.axis(a)?.stop();
    this.wait = null; if (this.state !== 'ALARM') this.state = 'IDLE';
  }
  fail(msg, line) {
    this.alarm = { message: msg, line }; this.state = 'ALARM';
    if (this.wait?.axes) for (const a of this.wait.axes) this.env.axis(a)?.stop();
    this.wait = null;
  }
  resetAlarm() { if (this.state === 'ALARM') { this.state = 'IDLE'; this.alarm = null; } }

  val(e) {
    switch (e.k) {
      case 'num': return e.v;
      case 'id': {
        const n = this.c.vars[e.v] || e.v;
        const v = this.env.read(n);
        if (v === undefined) throw new MotionError(`Không biết "${e.v}"`);
        return +v;
      }
      case 'neg': return -this.val(e.a);
      case 'not': return this.val(e.a) ? 0 : 1;
      case 'bin': {
        const a = this.val(e.a), b = this.val(e.b);
        switch (e.op) {
          case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? 0 : Math.trunc(a / b);
          case '==': return +(a === b); case '!=': return +(a !== b); case '<': return +(a < b); case '>': return +(a > b);
          case '<=': return +(a <= b); case '>=': return +(a >= b); case '&': return +(!!a && !!b); case '|': return +(!!a || !!b);
        }
      }
    }
    return 0;
  }

  step(dt) {
    if (this.state !== 'RUN') {
      if (this.state === 'PAUSE' && this.wait?.axes) for (const a of this.wait.axes) { const ax = this.env.axis(a); if (ax?.cmd) { this.wait.paused ||= {}; this.wait.paused[a] = ax.cmd; ax.stop(); } }
      return;
    }
    let budget = 200;
    while (this.state === 'RUN' && budget-- > 0) {
      if (this.wait) {
        const w = this.wait;
        if (w.paused) { for (const [a, cmd] of Object.entries(w.paused)) { const ax = this.env.axis(a); ax.moveTo(cmd.target, cmd.v); } w.paused = null; }
        if (w.axes) {
          for (const a of w.axes) { const ax = this.env.axis(a); if (ax.alarm) { this.fail(`Trục ${a}: lỗi servo 0x${ax.alarm.toString(16).padStart(2, '0')}`, w.line); return; } }
          if (w.axes.some((a) => this.env.axis(a).busy)) return;
          for (const a of w.axes) { const ax = this.env.axis(a); if (ax.warning) { this.fail(`Trục ${a}: chạm giới hạn mềm`, w.line); return; } }
        } else if (w.ms !== undefined) { w.t += dt; dt = 0; if (w.t < w.ms) return; }
        else if (w.e) { let ok; try { ok = this.val(w.e); } catch (e) { this.fail(e.message, w.line); return; } if (!ok) return; }
        this.wait = null; this.pc++;
        continue;
      }
      const S = this.c.stmts[this.pc];
      if (!S) { this.state = 'DONE'; return; }
      try {
        switch (S.op) {
          case 'ABS': this.inc = false; this.pc++; break;
          case 'INC': this.inc = true; this.pc++; break;
          case 'END': this.state = 'DONE'; return;
          case 'MOV': case 'MVS': {
            const tg = S.items.map((it) => { const ax = this.env.axis(it.axis); const v = ax.fromRef(this.val(it.e)); return { ax, name: it.axis, target: this.inc ? ax.pos + v : v, d: 0 }; });
            for (const g of tg) g.d = Math.abs(g.target - g.ax.pos);
            if (S.op === 'MVS') {
              if (S.feed) this.feed = this.val(S.feed);
              if (!this.feed) throw new MotionError('MVS cần tốc độ F (đơn vị tham chiếu/phút), vd. MVS [B1]-2000 F6000;');
              const len = Math.hypot(...tg.map((g) => g.d));
              const v = tg[0].ax.fromRef(this.feed) / 60;
              for (const g of tg) { const e = g.ax.moveTo(g.target, len > 0 ? (v * g.d) / len : v); if (e) throw new MotionError(`Trục ${g.name}: servo chưa bật / đang lỗi`); }
            } else for (const g of tg) { const e = g.ax.moveTo(g.target, g.ax.prm.speedRef); if (e) throw new MotionError(`Trục ${g.name}: servo chưa bật / đang lỗi`); }
            this.wait = { axes: tg.map((g) => g.name), line: S.line };
            return;
          }
          case 'ZRN': {
            for (const it of S.items) { const e = this.env.axis(it.axis).home(); if (e) throw new MotionError(`Trục ${it.axis}: servo chưa bật — không về gốc được`); }
            this.wait = { axes: S.items.map((i) => i.axis), line: S.line };
            return;
          }
          case 'TIM': this.wait = { ms: this.val(S.e) * S.ms, t: 0, line: S.line }; return;
          case 'IOW': this.wait = { e: S.e, line: S.line }; continue;
          case 'WHILE': if (this.val(S.e)) this.pc++; else this.pc = S.end; break;
          case 'WEND': this.pc = S.to; return; // nhường 1 nhịp mỗi vòng lặp
          case 'IF': if (this.val(S.e)) this.pc++; else this.pc = S.else; break;
          case 'ELSE': this.pc = S.end; break;
          case 'IEND': this.pc++; break;
          case 'SET': { const n = this.c.vars[S.dst] || S.dst; if (!this.env.write(n, this.val(S.e))) throw new MotionError(`Không ghi được "${S.dst}"`); this.pc++; break; }
          default: this.pc++;
        }
      } catch (e) { this.fail(e.message, S.line); return; }
    }
  }
}
