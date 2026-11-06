// Đọc giá trị I/O hiện tại từ máy (ưu tiên) hoặc PLC, theo tag hoặc địa chỉ.
export function ioValue(io, m, plc) {
  const src = io.dir === 'Q' ? m?.outputs : m?.inputs;
  if (src) {
    if (io.tag && io.tag in src) return src[io.tag];
    if (io.addr && io.addr in src) return src[io.addr];
  }
  try { return plc?.read(io.addr); } catch { return undefined; }
}
