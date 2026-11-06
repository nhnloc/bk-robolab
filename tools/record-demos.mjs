// Ghi "băng" Chạy thử mẫu cho từng lab: chạy lời giải mẫu (private/solutions.js) theo kịch bản chấm,
// lưu hình ảnh trạm (khớp robot, trục, vật, đèn) 10 lần/giây + nhật ký diễn biến có chú thích.
// Băng KHÔNG chứa chương trình lời giải → đưa lên web được.
//   node tools/record-demos.mjs            (mọi lab)
//   node tools/record-demos.mjs R07 R09
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABS, loadSolutions, solutionProject } from '../src/labs/index.js';
import { gradeLab } from '../src/labs/grader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'demos');
const FRAME_MS = 100;
const r1 = (v) => Math.round(v * 10) / 10;

const BTN_NAME = {
  START: 'nút START', STOP: 'nút STOP', SERVO_ON: 'nút Servo ON', ROBOT_ON: 'nút Robot ON', Feed: 'cấp vật lên băng tải', TakeOut: 'lấy vật khỏi mâm xoay', NewPart: 'đặt vật ngẫu nhiên',
  ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [[`P${i}`, `công tắc I${i} (Control Panel, DI_${16 + i})`], [`X${i}`, `công tắc I${i} (I/O Box, DI_${24 + i})`], [`SW${i}`, `công tắc I${i} (IN#${i + 1})`]])),
};

async function record(lab) {
  const project = solutionProject(lab);
  if (!project) return null;
  const frames = [], notes = [], status = [], outs = [], leds = [], statics = {};
  let cell = null, nextT = 0, last = {};
  const note = (t, text, kind = 'info') => notes.push([t, text, kind]);
  const change = (list, t, v) => { if (!list.length || list[list.length - 1][1] !== v) list.push([t, v]); };
  const snap = (c, t) => {
    const v = c.getVisual();
    const parts = {}; for (const [k, x] of Object.entries(v.parts)) parts[k] = r1(+x);
    const items = v.items.map((it) => {
      if (!statics[it.id]) statics[it.id] = { kind: it.kind, size: it.size, color: it.color, label: it.label || '' };
      return [it.id, r1(it.x), r1(it.y), r1(it.z), r1(it.rotZ || 0), it.held ? 1 : 0];
    });
    frames.push({ t, p: parts, i: items, b: v.belts ? Object.fromEntries(Object.entries(v.belts).map(([k, x]) => [k, Math.round(x * 1e4) / 1e4])) : undefined });
    change(outs, t, Object.entries(v.outs || {}).filter(([, x]) => x).map(([k]) => k).join(' '));
    change(leds, t, Object.entries(v.leds || {}).filter(([, x]) => x).map(([k]) => k).join(' '));
    const r = c.robot, st = r.status();
    const mcs = c.mc ? ` · MP3300 ${c.mc.state}${[...c.mc.tasks.values()].map((k) => ` · ${k.name} ${k.state}`).join('')}` : '';
    change(status, t, `Robot ${st.mode} · ${st.servo ? 'SERVO ON' : 'SERVO OFF'} · ${st.running ? `▶ ${st.job}:${String(st.line).padStart(4, '0')}` : '■ dừng'}${st.alarm ? ' · ALARM' : ''}${mcs}`);
  };
  const diff = (c, t) => {
    // nút / công tắc
    for (const b of c.def.buttons) {
      const v = !!c.panel[b.id];
      if (last['btn' + b.id] !== undefined && last['btn' + b.id] !== v) {
        const nm = BTN_NAME[b.id] || b.label;
        if (b.kind === 'momentary') { if (v) note(t, `Nhấn ${nm}`, 'act'); }
        else note(t, `Gạt ${nm} → ${v ? 'ON' : 'OFF'}`, 'act');
      }
      last['btn' + b.id] = v;
    }
    const r = c.robot;
    for (const m of r.messages) if (!m._seen) { m._seen = true; if (!/^Đã lưu|Sẵn sàng/.test(m.text)) note(t, `Robot: ${m.text}`, m.level === 'err' ? 'err' : 'robot'); }
    if (last.mode !== r.mode && last.mode !== undefined) note(t, `Robot chuyển chế độ ${r.mode}`, 'act');
    last.mode = r.mode;
    const S = c.stats;
    if (last.placed !== undefined && S.placed > last.placed) note(t, c.def.id === 'mechatro' ? `Robot đặt vật lên mâm xoay (lần ${S.placed})` : c.def.id === 'vision' ? `Vật nằm đúng đồ gá (lần ${S.placed})` : `Robot đặt vật vào ô pallet`, 'ok');
    if (last.delivered !== undefined && S.delivered > last.delivered) note(t, `Vật vào thùng ra (tổng ${S.delivered})`, 'ok');
    last.placed = S.placed; last.delivered = S.delivered;
    for (const e of c.events) if (!e._seen) { e._seen = true; note(t, e.message, e.level === 'error' ? 'err' : e.level === 'warn' ? 'warn' : 'info'); }
    if (c.mc) {
      if (last.mc !== c.mc.state) note(t, `MP3300 ${c.mc.state}`, 'mc');
      last.mc = c.mc.state;
      for (const a of Object.values(c.mc.axes)) {
        const k = 'ax' + a.name, s = `${a.running}|${a.zeroDone}|${a.alarm}`;
        if (last[k] !== undefined && last[k] !== s) {
          const [run, zero, al] = s.split('|'), [run0, zero0, al0] = last[k].split('|');
          if (run !== run0) note(t, `Trục ${a.name}: servo ${run === 'true' ? 'ON' : 'OFF'}`, 'mc');
          if (zero !== zero0 && zero === 'true') note(t, `Trục ${a.name} về gốc xong`, 'mc');
          if (al !== al0 && al !== '0') note(t, `Trục ${a.name} báo lỗi 0x${(+al).toString(16).padStart(2, '0')}`, 'err');
        }
        last[k] = s;
      }
      for (const k of c.mc.tasks.values()) {
        const key = 'task' + k.name;
        if (last[key] !== k.state && !(last[key] === undefined && k.state === 'IDLE')) note(t, `Chương trình ${k.name}: ${k.state}${k.alarm ? ` — ${k.alarm.message}` : ''}`, k.state === 'ALARM' ? 'err' : 'mc');
        last[key] = k.state;
      }
      for (const e of c.netLog) if (!e._seen) { e._seen = true; note(t, `Ethernet → robot: ${e.info}`, 'net'); }
    }
  };
  const res = await gradeLab(lab, project, {
    hooks: {
      onCell: (c) => { cell = c; },
      onTick: (c, t) => { diff(c, t); while (t >= nextT) { snap(c, nextT); nextT += FRAME_MS; } },
      onAdd: (ck) => note(nextT, `${ck.pass ? '✓' : '✗'} Kiểm tra: ${ck.label}`, ck.pass ? 'ok' : 'err'),
    },
  });
  if (!frames.length) return { res };
  const t1 = frames[frames.length - 1].t;
  const tape = { schema: 'bk-robolab/demo@1', lab: lab.id, title: lab.title, cellId: lab.cellId, model: cell.def.model || cell.def.id, frameMs: FRAME_MS, duration: t1, score: res.score, statics, frames, notes: notes.filter(([t]) => t <= t1).sort((a, b) => a[0] - b[0]), status, outs, leds };
  return { tape, res };
}

await loadSolutions();
fs.mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const idxPath = path.join(OUT, 'index.json');
const index = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : {};
for (const lab of LABS) {
  if (want.length && !want.includes(lab.id)) continue;
  if (lab.grading?.live) { console.log(lab.id, '— lab vận hành bằng tay, bỏ qua'); continue; }
  const r = await record(lab);
  if (!r?.tape) { console.log(lab.id, '— không có lời giải'); continue; }
  if (r.res.score !== 100) { console.log(lab.id, `— lời giải chỉ đạt ${r.res.score}, KHÔNG ghi`); continue; }
  const file = path.join(OUT, `${lab.id}.json`);
  fs.writeFileSync(file, JSON.stringify(r.tape));
  index[lab.id] = { duration: r.tape.duration, frames: r.tape.frames.length, notes: r.tape.notes.length, bytes: fs.statSync(file).size };
  console.log(lab.id, `${(r.tape.duration / 1000).toFixed(0)} s, ${r.tape.frames.length} khung, ${r.tape.notes.length} ghi chú, ${(index[lab.id].bytes / 1024).toFixed(0)} KB`);
}
fs.writeFileSync(idxPath, JSON.stringify(index, null, 1));
