// Chế độ công khai: bản đưa lên web (GitHub Pages) chỉ dành cho sinh viên —
// không có vai trò Giảng viên, không nạp lời giải. Chạy trên máy (localhost) thì có đủ.
const host = typeof location !== 'undefined' ? location.hostname : 'localhost';
export const PUBLIC_MODE = !['localhost', '127.0.0.1', '::1', ''].includes(host) && !host.endsWith('.localhost');
