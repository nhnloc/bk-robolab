// Trình hiển thị Markdown tối giản và an toàn cho bài giảng.
// Hỗ trợ: đoạn văn (cách nhau dòng trống), "### " tiêu đề nhỏ, "- " danh sách, "1. " danh sách số,
// **đậm**, `code`, bảng "| a | b |" có dòng "|---|---|".
// An toàn: KHÔNG dùng innerHTML — mọi chữ đi vào DOM qua text node (tương đương escape HTML).
import { h } from '../dom.js';

/** Phần nội dòng: **đậm** và `code` → mảng Node/chuỗi. */
export function mdInline(text) {
  const out = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*/g;
  let last = 0, m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) out.push(h('code.md-code', m[1]));
    else out.push(h('strong', ...mdInline(m[2])));
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Tách 1 dòng bảng thành ô: bỏ "|" đầu/cuối; "|" trong `code` hoặc viết "\|" không tách ô. */
const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '', inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
};
const isSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const UL = /^\s*[-*]\s+(.*)$/;
const OL = /^\s*(\d+)[.)]\s+(.*)$/;
const HD = /^\s*#{1,6}\s+(.*)$/;

/** Khối Markdown → DocumentFragment. */
export function renderMd(src) {
  const frag = document.createDocumentFragment();
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  const flush = () => { if (para.length) { frag.append(h('p', ...mdInline(para.join(' ')))); para = []; } };
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { flush(); i++; continue; }
    let m;
    if ((m = HD.exec(line))) { flush(); frag.append(h('h4.md-h', ...mdInline(m[1]))); i++; continue; }
    if (line.trim().startsWith('|')) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      let head = null, body = rows;
      if (rows.length > 1 && isSep(rows[1])) { head = splitRow(rows[0]); body = rows.slice(2); }
      body = body.filter((r) => !isSep(r)).map(splitRow);
      frag.append(h('div.md-table-wrap', h('table.md-table',
        head ? h('thead', h('tr', head.map((c) => h('th', ...mdInline(c))))) : null,
        h('tbody', body.map((r) => h('tr', r.map((c) => h('td', ...mdInline(c)))))))));
      continue;
    }
    const ul = UL.exec(line), ol = OL.exec(line);
    if (ul || ol) {
      flush();
      const ordered = !!ol && !ul;
      const re = ordered ? OL : UL;
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const mm = re.exec(lines[i]);
        if (mm) items.push(ordered ? mm[2] : mm[1]);
        else if (/^\s+\S/.test(lines[i]) && items.length && !UL.test(lines[i]) && !OL.test(lines[i])) items[items.length - 1] += ' ' + lines[i].trim();
        else break;
        i++;
      }
      const start = ordered ? parseInt(ol[1], 10) : 1;
      frag.append(h(ordered ? 'ol.md-list' : 'ul.md-list', ordered && start !== 1 ? { start } : null, items.map((x) => h('li', ...mdInline(x)))));
      continue;
    }
    para.push(line.trim()); i++;
  }
  flush();
  return frag;
}
