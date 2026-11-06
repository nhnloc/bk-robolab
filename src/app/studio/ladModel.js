// Thao tác trên cây LAD (CONTRACT §5). Đường dẫn path: chỉ số con nối bằng '.', gốc = ''.

export const join = (path, i) => (path === '' ? String(i) : path + '.' + i);
export const splitPath = (path) => (path === '' ? [] : path.split('.').map(Number));
export const parentPath = (path) => { const p = splitPath(path); p.pop(); return p.join('.'); };
export const lastIndex = (path) => { const p = splitPath(path); return p[p.length - 1]; };
const kids = (n) => (n.t === 'series' ? n.items : n.t === 'parallel' ? n.branches : null);

export function getNode(root, path) {
  let n = root;
  for (const i of splitPath(path)) { const k = kids(n); if (!k || !k[i]) return null; n = k[i]; }
  return n;
}

export function findPath(root, target, path = '') {
  if (root === target) return path;
  const k = kids(root); if (!k) return null;
  for (let i = 0; i < k.length; i++) { const r = findPath(k[i], target, join(path, i)); if (r !== null) return r; }
  return null;
}

export const isLeaf = (n) => n && n.t !== 'series' && n.t !== 'parallel';
export const isOutput = (n) => n && (n.t === 'coil' || (n.t === 'box' && n.fn !== 'R_TRIG' && n.fn !== 'F_TRIG' && false));

/** Chuẩn hóa: gốc là series, mỗi nhánh là series, gộp series lồng nhau, bỏ parallel 1 nhánh / nhánh rỗng. */
export function normalize(n, isBranch = false) {
  if (!n) return { t: 'series', items: [] };
  if (n.t === 'series') {
    const items = [];
    for (const c of n.items || []) {
      const x = normalize(c);
      if (x.t === 'series') items.push(...x.items);
      else if (x.t === 'parallel' && x.branches.length === 1) items.push(...x.branches[0].items);
      else if (x.t === 'parallel' && x.branches.length === 0) continue;
      else items.push(x);
    }
    n.items = items;
    return n;
  }
  if (n.t === 'parallel') {
    n.branches = (n.branches || []).map((b) => (b.t === 'series' ? normalize(b, true) : normalize({ t: 'series', items: [b] }, true))).filter((b) => b.items.length > 0);
    return n;
  }
  return isBranch ? { t: 'series', items: [n] } : n;
}

export function normRoot(rung) {
  if (!rung || rung.t !== 'series') rung = { t: 'series', items: rung ? [rung] : [] };
  return normalize(rung);
}

/** Vị trí chèn mặc định (khi chưa chọn gì): tiếp điểm chèn trước cuộn dây đầu tiên ở gốc, cuộn dây chèn cuối. */
function defaultInsert(rung, node) {
  if (node.t === 'coil' || node.t === 'box') { rung.items.push(node); return; }
  let i = rung.items.findIndex((x) => x.t === 'coil');
  if (i < 0) i = rung.items.length;
  rung.items.splice(i, 0, node);
}

/** Chèn node sau phần tử tại path (hoặc vào cuối nếu path rỗng / null). Trả về rung mới (đã chuẩn hóa). */
export function insertAfter(rung, path, node) {
  rung = normRoot(rung);
  if (path === null || path === undefined || path === '') { defaultInsert(rung, node); return normRoot(rung); }
  const target = getNode(rung, path);
  if (!target) { defaultInsert(rung, node); return normRoot(rung); }
  if (target.t === 'parallel' || target.t === 'series') {
    // chọn cả nhánh/khối song song → chèn sau nó trong series cha
    const pp = parentPath(path); const parent = getNode(rung, pp);
    if (parent?.t === 'series') parent.items.splice(lastIndex(path) + 1, 0, node);
    else if (target.t === 'series') target.items.push(node);
    return normRoot(rung);
  }
  const parent = getNode(rung, parentPath(path));
  parent.items.splice(lastIndex(path) + 1, 0, node);
  return normRoot(rung);
}

export function insertBefore(rung, path, node) {
  rung = normRoot(rung);
  const target = path ? getNode(rung, path) : null;
  if (!target) { rung.items.unshift(node); return normRoot(rung); }
  const parent = getNode(rung, parentPath(path));
  if (parent?.t === 'series') parent.items.splice(lastIndex(path), 0, node);
  return normRoot(rung);
}

/** Xóa phần tử (hoặc khối song song) tại path. */
export function removeAt(rung, path) {
  rung = normRoot(rung);
  if (!path) return rung;
  const parent = getNode(rung, parentPath(path));
  if (!parent) return rung;
  const k = kids(parent);
  k.splice(lastIndex(path), 1);
  return normRoot(rung);
}

/**
 * Mở nhánh song song quanh dải phần tử [path..endPath] trong cùng series:
 * a b c  →  a (b | <mới>) c
 */
export function wrapParallel(rung, path, endPath, newNode) {
  rung = normRoot(rung);
  const pp = parentPath(path);
  const parent = getNode(rung, pp);
  if (!parent || parent.t !== 'series') return rung;
  let i0 = lastIndex(path), i1 = endPath && parentPath(endPath) === pp ? lastIndex(endPath) : i0;
  if (i1 < i0) [i0, i1] = [i1, i0];
  const seg = parent.items.splice(i0, i1 - i0 + 1);
  const par = { t: 'parallel', branches: [{ t: 'series', items: seg }, { t: 'series', items: [newNode] }] };
  parent.items.splice(i0, 0, par);
  return normRoot(rung);
}

/** Thêm một nhánh vào khối song song chứa path (hoặc chính path là parallel). */
export function addBranch(rung, path, newNode) {
  rung = normRoot(rung);
  let p = path;
  while (p !== '' && p !== null) {
    const n = getNode(rung, p);
    if (n?.t === 'parallel') { n.branches.push({ t: 'series', items: [newNode] }); return normRoot(rung); }
    p = p.includes('.') ? parentPath(p) : '';
  }
  return null; // không nằm trong khối song song nào
}

/** Liệt kê lá (phần tử) theo thứ tự hiển thị. */
export function leaves(rung, path = '', out = []) {
  if (!rung) return out;
  if (rung.t === 'series') rung.items.forEach((c, i) => leaves(c, join(path, i), out));
  else if (rung.t === 'parallel') rung.branches.forEach((c, i) => leaves(c, join(path, i), out));
  else out.push({ path, node: rung });
  return out;
}

/** Toán hạng của một node (để kiểm tra, autocomplete, tìm kiếm). */
export function operands(n) {
  if (!n) return [];
  if (n.t === 'contact' || n.t === 'coil') return n.op !== undefined ? [n.op] : [];
  if (n.t === 'cmp') return [n.in1, n.in2];
  if (n.t === 'box') return [n.instance, ...Object.values(n.params || {})].filter(Boolean);
  return [];
}
