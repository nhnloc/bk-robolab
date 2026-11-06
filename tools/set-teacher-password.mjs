// Đặt mật khẩu giảng viên cho bản web: node tools/set-teacher-password.mjs
// Ghi data/teacher.json (chỉ chứa salt + băm PBKDF2, không chứa mật khẩu). Sau đó commit + git push.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const ITER = 200000;
const tty = process.stdin.isTTY;
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!tty });
const realWrite = process.stdout.write.bind(process.stdout);
if (tty) rl._writeToOutput = () => {};            // ẩn ký tự khi gõ (không in ra màn hình)
const lines = [];
let waiter = null;
rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
const ask = (q) => { realWrite(q); return new Promise((res) => { if (lines.length) { realWrite('\n'); res(lines.shift()); } else waiter = (l) => { realWrite('\n'); res(l); }; }); };
const p1 = await ask('Mật khẩu giảng viên mới (ít nhất 10 ký tự): ');
const p2 = await ask('Nhập lại: ');
rl.close();
if (p1 !== p2) { console.error('Hai lần nhập không khớp.'); process.exit(1); }
if (p1.length < 10) { console.error('Mật khẩu quá ngắn (cần ít nhất 10 ký tự).'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(p1, salt, ITER, 32, 'sha256').toString('hex');
const file = new URL('../data/teacher.json', import.meta.url);
writeFileSync(file, JSON.stringify({ algo: 'PBKDF2-SHA256', iterations: ITER, salt, hash }, null, 2) + '\n');
console.log('Đã ghi data/teacher.json. Tiếp theo: git add data/teacher.json && git commit -m "Đặt mật khẩu giảng viên" && git push');
