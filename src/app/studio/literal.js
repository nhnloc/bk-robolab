// Phân tích hằng số người dùng gõ trong watch table: TRUE/FALSE/1/0, số, 16#.., 2#.., T#..
export function parseLiteral(s) {
  const v = String(s ?? '').trim();
  if (!v) return undefined;
  if (/^(TRUE|1)$/i.test(v) && v.length <= 4) return v === '1' ? 1 : true;
  if (/^FALSE$/i.test(v)) return false;
  if (/^16#[0-9a-f_]+$/i.test(v)) return parseInt(v.slice(3).replace(/_/g, ''), 16);
  if (/^2#[01_]+$/i.test(v)) return parseInt(v.slice(2).replace(/_/g, ''), 2);
  const tm = /^T#(.+)$/i.exec(v);
  if (tm) {
    let ms = 0, any = false; const re = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/gi; let x;
    while ((x = re.exec(tm[1]))) { any = true; ms += parseFloat(x[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[x[2].toLowerCase()]; }
    return any ? ms : undefined;
  }
  if (/^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v)) return Number(v);
  return undefined;
}
