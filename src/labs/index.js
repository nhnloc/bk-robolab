// Nội dung các bài lab robot (giai đoạn 1: Bài 1–3 của học phần Thí nghiệm Kỹ thuật Robot) và project khởi đầu.
import { MACHINES } from '../sim/index.js';
import { MSEE_FIELDS, HSE_STRUCT } from '../mc/mp3300.js';
import { PALETTE, PUCK } from '../sim/layout.js';

// Lời giải tham khảo KHÔNG nằm trong web: private/solutions.js (đã .gitignore) trên máy giảng viên.
let SOL = null;
export async function loadSolutions() {
  if (SOL) return true;
  try { SOL = await import('../../private/solutions.js'); } catch { SOL = null; }
  return !!SOL;
}

/* ------------------------------------------------------------------ project */
export const SCHEMA = 'bk-robolab/project@1';
const field = (f) => ({ name: f.name, type: f.type, init: f.type === 'Bool' ? false : 0 });
export const mseeDb = (name, number = 10) => ({ name, type: 'DB', number, fields: MSEE_FIELDS.map(field) });
export const hseDb = (name, number = 20, init = {}) => ({ name, type: 'DB', number, fields: HSE_STRUCT.map((f) => ({ ...field(f), init: init[f.name] ?? 0 })) });

export function mcTags(cellId) {
  const io = MACHINES[cellId]?.ioMap;
  if (!io) return [];
  return [...io.inputs, ...io.outputs].map((x) => ({ name: x.tag, address: x.addr, type: 'Bool', comment: `${x.mp} · ${x.desc}` }));
}
export function emptyMc(cellId) {
  return {
    tags: mcTags(cellId),
    blocks: [{ name: 'Main', type: 'OB', number: 1, lang: 'LAD', networks: [{ title: '', comment: '', rung: { t: 'series', items: [] } }] }],
    watch: [], motion: [], axes: {}, eth: { conns: [] },
  };
}
const JOB = (name, lines) => ({ name, lines });

/** Project khởi đầu. prev: { labId: project } các lab trước (để kế thừa chương trình robot / MC). */
export function starterProject(lab, prev = {}) {
  const p = { schema: SCHEMA, name: `${lab.id} — ${lab.title}`, labId: lab.id, cellId: lab.cellId, robot: { jobs: [], pvars: {}, master: null }, mc: null, evidence: {} };
  const s = lab.starter || {};
  const from = (lab.inherit || []).map((id) => prev[id]).find(Boolean);
  if (s.jobs) { p.robot.jobs = s.jobs.map((j) => ({ ...j, lines: [...j.lines] })); p.robot.master = s.master || s.jobs[0]?.name || null; }
  if (lab.tools.includes('mpe')) p.mc = emptyMc(lab.cellId);
  if (s.pvars) p.robot.pvars = JSON.parse(JSON.stringify(s.pvars));
  if (lab.tools.includes('code')) p.pc = { code: s.code || '' };
  if (from) {
    if (from.robot && from.cellId === lab.cellId) {
      const r = JSON.parse(JSON.stringify(from.robot));
      // giữ job / điểm có sẵn của lab mới nếu lab trước không có
      for (const j of p.robot.jobs) if (!r.jobs.some((x) => x.name === j.name)) r.jobs.push(j);
      r.pvars = { ...p.robot.pvars, ...r.pvars };
      r.master = p.robot.master || r.master;
      p.robot = r;
    }
    if (from.mc && p.mc) p.mc = JSON.parse(JSON.stringify(from.mc));
    if (from.pc?.code && p.pc) p.pc.code = from.pc.code.trimEnd() + '\n\n' + (s.codeAppend || '');
  }
  if (p.mc) {
    for (const b of s.dbs || []) if (!p.mc.blocks.some((x) => x.name === b.name)) p.mc.blocks.push(JSON.parse(JSON.stringify(b)));
    for (const m of s.motion || []) if (!p.mc.motion.some((x) => x.name === m.name)) p.mc.motion.push({ ...m });
    for (const [k, v] of Object.entries(s.axes || {})) p.mc.axes[k] = { ...v, ...(p.mc.axes[k] || {}) };
  }
  return p;
}

/** Project lời giải (chỉ trang giảng viên, cần private/solutions.js). */
export function solutionProject(lab) {
  if (!SOL?.SOLUTIONS?.[lab.id]) return null;
  return SOL.SOLUTIONS[lab.id](starterProject(lab), { lab });
}

/* ------------------------------------------------------------------ chấm: tiện ích */
const near = (a, b, tol = 8) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const pucksAt = (cell, name) => cell.items.filter((it) => !it.held && !it.lost && near([it.x, it.y], PALETTE.cells[name])).sort((a, b) => a.z - b.z);
/** Vật số label nằm ở ô name, tầng level (0 = sát pallet). */
const placed = (cell, label, name, level = 0) => pucksAt(cell, name).some((it) => it.label === String(label) && Math.abs(it.z - (PALETTE.top + level * PUCK.h)) < 1.5);
/** Theo dõi độ dài các xung trên một ngõ ra robot (lấy mẫu mỗi 10 ms). */
function pulseWatch(c, n) {
  const w = { rises: [], widths: [], on: false, t0: 0 };
  c.every(10, () => {
    const v = !!c.robot.OT[n];
    if (v && !w.on) { w.on = true; w.t0 = c.cell.time; w.rises.push(c.cell.time); }
    if (!v && w.on) { w.on = false; w.widths.push(c.cell.time - w.t0); }
  });
  return w;
}
const okWidth = (w, ms, tol = 0.25) => w.widths.length > 0 && w.widths.every((x) => Math.abs(x - ms) <= ms * tol);

/* ------------------------------------------------------------------ Danh sách lab */
const PART1 = [
  {
    id: 'R01', part: 1, week: 1, cellId: 'motomini', level: 1, durationMin: 120, tools: ['pendant'],
    title: 'Vận hành robot bằng tay: hệ tọa độ và gắp–thả',
    objectives: [
      'Nắm cấu tạo hệ robot Motoman: cánh tay MotoMINI, bộ điều khiển YRC1000micro, bộ lập trình cầm tay',
      'Bật nguồn servo đúng trình tự (SERVO ON READY + công tắc Enable) và tuân thủ quy tắc an toàn',
      'Điều khiển robot bằng tay trong các hệ tọa độ JOINT, CARTESIAN (BASE), TOOL',
      'Gắp–thả vật bằng tay bằng nam châm (OT#1)',
    ],
    tasks: [
      'Chế độ TEACH. Nhấn SERVO ON READY, giữ công tắc Enable (giữ chuột hoặc phím Space) để bật servo. Thả Enable → servo tắt.',
      'Yêu cầu 1.1a — Hệ JOINT, tốc độ MED: lần lượt điều khiển từng khớp S, L, U, R, B, T. Quan sát và vẽ sơ đồ động học (DH) của robot vào báo cáo.',
      'Yêu cầu 1.1b — Hệ CARTESIAN: điều khiển theo X, Y, Z và Rx, Ry, Rz. Nhận xét vị trí TCP khi xoay quanh trục, và hướng TCP khi tịnh tiến.',
      'Yêu cầu 1.1c — Hệ TOOL: điều khiển theo từng trục; so sánh phương chiều chuyển động TCP giữa hệ TOOL và CARTESIAN.',
      'Đưa robot về vị trí Home (mọi khớp = 0): ROBOT → Work Home Pos, giữ FWD.',
      'Yêu cầu 1.2a — Cảnh "A1, A2": gắp vật từ A1 thả vào B, từ A2 thả vào C (hệ CARTESIAN). Gần vật hãy giảm tốc xuống LOW / INCH.',
      'Yêu cầu 1.2b — Cảnh "A1, A2, A3": gắp lần lượt A1, A2, A3 thả chồng lên nhau ở B.',
    ],
    hints: [
      'Nam châm: menu IN/OUT → General Purpose Output, chọn OT#1 và nhấn INTERLOCK + SELECT (hoặc nút "Nam châm" cạnh màn hình).',
      'Nam châm chỉ hút khi đầu dụng cụ hướng thẳng xuống và chạm mặt trên vật (lệch ≤ 8 mm).',
      'Xoay khớp B, T quá mức trên robot thật sẽ làm đứt dây dụng cụ — tập thói quen giữ góc hợp lý.',
      'Va chạm làm robot báo động 4100 và tắt servo: RESET báo động, nhấc robot lên bằng hệ JOINT rồi làm tiếp.',
    ],
    setup: { scene: 'A12', scenes: ['A12', 'A123'] },
    grading: { live: true },
  },
  {
    id: 'R02', part: 1, week: 2, cellId: 'motomini', level: 2, durationMin: 150, tools: ['pendant'],
    title: 'Dạy điểm và lập trình job INFORM gắp–thả',
    objectives: ['Dạy điểm (teach) và lưu vào biến vị trí P', 'Viết job bằng ngôn ngữ INFORM: MOVJ, MOVL, DOUT, TIMER, CALL, END', 'Chạy thử (TEST START) và chạy tự động (PLAY)', 'Tổ chức chương trình thành job chính và các job con'],
    tasks: [
      'Dạy các điểm như Hình 13: P000 = điểm Home; P001, P003, P005, P007, P011 = điểm trung gian cao hơn điểm gắp/thả ~50 mm; P002, P004, P006, P008, P009, P010, P012… = điểm tiếp xúc / xếp chồng.',
      'Yêu cầu 2.1a — Job MAIN (cảnh "A1, A2"): gắp A1 thả vào B, gắp A2 thả vào C. Viết theo mẫu: MAIN gọi PICK-A1, PLACE-B, … (CALL JOB:…).',
      'Yêu cầu 2.1b — Job STACK (cảnh "A1, A2, A3"): gắp lần lượt A1, A2, A3 thả chồng lên nhau ở B. Kết thúc ở P000.',
      'Chạy thử từng job bằng INTERLOCK + TEST START (TEACH) rồi chạy tự động: gạt sang PLAY, SERVO ON READY, START.',
    ],
    hints: [
      'Dạy điểm: VARIABLE → Position Variable, chọn Pxxx, đưa robot tới vị trí rồi MODIFY + ENTER.',
      'Thả chồng: điểm thả ở B tầng 2 cao hơn tầng 1 đúng chiều cao vật (20 mm).',
      'Đi xuống / lên gần vật nên dùng MOVL tốc độ thấp; di chuyển xa dùng MOVJ.',
      'Bật nam châm xong nên chờ TIMER T=0.20 cho vật hút chắc rồi mới nhấc lên.',
    ],
    setup: { scene: 'A12', scenes: ['A12', 'A123'] },
    starter: { master: 'MAIN', jobs: [
      JOB('MAIN', ['NOP', 'CALL JOB:PICK-A1', 'CALL JOB:PLACE-B', 'END']),
      JOB('PICK-A1', ['NOP', 'MOVJ P000 VJ=10.00', 'MOVJ P001 VJ=10.00', 'MOVJ P002 VJ=5.00 PL=0', 'DOUT OT#(1) ON', 'MOVJ P001 VJ=10.00', 'END']),
      JOB('PLACE-B', ['NOP', 'MOVJ P000 VJ=10.00', 'MOVJ P007 VJ=10.00', 'MOVJ P008 VJ=5.00 PL=0', 'DOUT OT#(1) OFF', 'MOVJ P007 VJ=5.00', 'END']),
      JOB('STACK', ['NOP', "'Yêu cầu 2.1b: xếp chồng A1, A2, A3 lên B", 'END']),
    ] },
    grading: {
      scenario: async (c) => {
        const jobs = c.project.robot.jobs.map((j) => j.name.toUpperCase());
        const main = c.project.robot.jobs.find((j) => j.name.toUpperCase() === 'MAIN');
        c.add('struct', 'Job MAIN gọi các job con bằng CALL JOB:', 10, !!main && main.lines.some((l) => /^\s*CALL\s+JOB:/i.test(l)), main ? '' : 'Không có job MAIN');
        // a) A1→B, A2→C
        c.scene('A12');
        const ra = await c.runJob('MAIN', 90000);
        c.add('a12', 'MAIN: vật A1 nằm ở ô B, vật A2 nằm ở ô C', 30, placed(c.cell, 1, 'B') && placed(c.cell, 2, 'C'), ra.note);
        const crashA = c.cell.stats.crashes, dropA = c.cell.stats.drops;
        // b) xếp chồng
        if (!jobs.includes('STACK')) { c.add('stack', 'STACK: xếp chồng A1, A2, A3 ở B', 30, false, 'Không có job STACK'); }
        else {
          c.scene('A123');
          const rb = await c.runJob('STACK', 120000);
          const ok = placed(c.cell, 1, 'B', 0) && placed(c.cell, 2, 'B', 1) && placed(c.cell, 3, 'B', 2);
          c.add('stack', 'STACK: chồng ở B đúng thứ tự (A1 dưới cùng, A3 trên cùng)', 30, ok, rb.note || (!ok ? c.describe() : ''));
          const p0 = c.project.robot.pvars.P000;
          const home = p0 && p0.type === 'PULSE' && p0.q.every((v, i) => Math.abs(v - c.robot.q[i]) < 0.5);
          c.add('home', 'Kết thúc ở P000 (Home)', 5, rb.ended && !!home, home ? '' : 'Robot không dừng ở P000');
        }
        const crashes = c.cell.stats.crashes + crashA, drops = c.cell.stats.drops + dropA;
        c.add('safe', 'Không va chạm, không thả rơi vật từ trên cao', 15, (placed(c.cell, 1, 'B') || c.cell.stats.placed > 0) && crashes === 0 && drops === 0, [crashes ? `${crashes} lần va chạm` : '', drops ? `${drops} lần thả rơi` : ''].filter(Boolean).join(' · '));
      },
    },
  },
  {
    id: 'R03', part: 1, week: 3, cellId: 'motomini', level: 2, durationMin: 150, tools: ['pendant'],
    title: 'Robot kết hợp I/O: chọn vật bằng công tắc, báo đèn',
    objectives: ['Đọc ngõ vào (WAIT, IF, JUMP … IF IN#) và ghi ngõ ra (DOUT, PULSE)', 'Dùng biến B để nhớ trạng thái, nhãn và vòng lặp', 'Phối hợp robot với Control Panel'],
    tasks: [
      'Nối dây: IN#5..IN#8 của robot ← công tắc I4..I7; OT#5..OT#8 → đèn Q4..Q7 (Hình 14).',
      'Yêu cầu 2.2a — Job MAIN (cảnh "A1, A2, A3", mọi công tắc OFF): khi người dùng bật ngẫu nhiên I4, I5, I6, robot gắp vật tương ứng ở A1, A2, A3 thả chồng lên nhau ở B. Sau mỗi lần thả, xuất 1 xung dài 1 s ra đèn Q4.',
      'Yêu cầu 2.2b — Job MAIN2: như câu a, thêm I7: I7 OFF → thả vào B (xung 1 s ra Q4); I7 ON → thả vào C (xung 1 s ra Q5). Vật ở B và ở C đều xếp chồng.',
      'Công tắc vẫn giữ ON sau khi robot đã gắp — chương trình phải nhớ vật nào đã gắp để không gắp lại ô rỗng.',
    ],
    hints: ['PULSE OT#(5) T=1.00 không làm dừng chương trình.', 'Dùng biến B000..B002 đánh dấu A1..A3 đã gắp; B010 đếm số vật đã chồng ở B để chọn điểm thả tầng 1/2/3.', 'Vòng chờ: *WAIT ... JUMP *WAIT — nhớ có ít nhất một lệnh chờ (WAIT/TIMER) trong vòng lặp.'],
    setup: { scene: 'A123', scenes: ['A123'] },
    starter: { master: 'MAIN', jobs: [JOB('MAIN', ['NOP', '*LOOP', "'Chờ công tắc I4..I6 (IN#5..IN#7)", 'TIMER T=0.10', 'JUMP *LOOP', 'END'])] },
    grading: {
      scenario: async (c) => {
        // a)
        c.scene('A123');
        const qa = pulseWatch(c, 5);
        const started = await c.startJob('MAIN');
        await c.run(1500);
        const order = [6, 4, 5];
        for (const sw of order) { c.cell.press('SW' + sw, true); c.cell.press('SW' + sw, false); await c.run(16000); }
        await c.run(3000);
        const okA = placed(c.cell, 3, 'B', 0) && placed(c.cell, 1, 'B', 1) && placed(c.cell, 2, 'B', 2);
        c.add('a', 'Câu a: gắp đúng vật theo công tắc (I6 → I4 → I5) và chồng ở B', 35, started && okA, okA ? '' : c.describe());
        c.add('qa', 'Câu a: 3 xung dài 1 s ra đèn Q4 (OT#5)', 15, qa.widths.length === 3 && okWidth(qa, 1000), `Đếm được ${qa.widths.length} xung${qa.widths.length ? ` (${qa.widths.map((w) => (w / 1000).toFixed(2) + ' s').join(', ')})` : ''}`);
        const crA = c.cell.stats.crashes;
        // b)
        c.stop();
        c.scene('A123');
        const qb4 = pulseWatch(c, 5), qb5 = pulseWatch(c, 6);
        const job = c.hasJob('MAIN2') ? 'MAIN2' : 'MAIN';
        await c.startJob(job);
        await c.run(1500);
        const steps = [[false, 4], [true, 5], [false, 6]];
        for (const [i7, sw] of steps) {
          if (!!c.cell.panel.SW7 !== i7) c.cell.press('SW7', true);
          await c.run(300);
          c.cell.press('SW' + sw, true); await c.run(16000);
        }
        await c.run(3000);
        const okB = placed(c.cell, 1, 'B', 0) && placed(c.cell, 3, 'B', 1) && placed(c.cell, 2, 'C', 0);
        c.add('b', `Câu b (${job}): I7 chọn ô thả B / C`, 25, okB, okB ? '' : c.describe());
        c.add('qb', 'Câu b: xung 1 s ra Q4 khi thả ở B, ra Q5 khi thả ở C', 15, qb4.widths.length === 2 && qb5.widths.length === 1 && okWidth(qb4, 1000) && okWidth(qb5, 1000), `Q4: ${qb4.widths.length} xung, Q5: ${qb5.widths.length} xung`);
        const cr = crA + c.cell.stats.crashes;
        c.add('safe', 'Không va chạm', 10, okA && cr === 0, cr ? `${cr} lần va chạm` : '');
      },
    },
  },
];

/* ---------------- Phần 2: Machine controller MP3300 (Bài 2) ---------------- */
const ROBOT_JOB_R05 = [
  'NOP',
  "'Yêu cầu 1.2: chờ IN#1 ON và IN#2 OFF, gắp ở băng tải, thả lên mâm xoay, báo OT#3",
  '*LB1',
  'MOVJ P000 VJ=10.00',
  'END',
];
const MC_HINT_DBS = [];

/** Kịch bản chung: bật robot PLAY chạy job. */
async function robotPlay(c, job = 'MAIN') {
  const r = c.robot;
  r.setMode('PLAY'); r.servoOnReady();
  if (!r.selectJob(job)) return false;
  return r.start();
}

const PART2 = [
  {
    id: 'R04', part: 2, week: 4, cellId: 'mechatro', level: 1, durationMin: 120, tools: ['mpe'],
    title: 'MP3300: thanh ghi, kiểu dữ liệu và ladder băng tải',
    objectives: ['Phân biệt các loại thanh ghi S, M, G, I, O, C, D và kiểu dữ liệu B, W, L, Q, F, D, A của MP3300', 'Tạo project, cấu hình module (CPU301, LIO-04, 218IFD) trong MPE720', 'Viết chương trình Ladder điều khiển băng tải theo nút nhấn và cảm biến'],
    tasks: [
      'Chuẩn bị: làm phần câu hỏi trong Bài giảng (thanh ghi, kiểu dữ liệu, đổi giá trị MW00000..MW00003).',
      'Yêu cầu 1.1a — Nhấn START (DI_00): băng tải (DO_00) chạy; nhấn STOP (DI_01): băng tải dừng.',
      'Yêu cầu 1.1b — Khi băng tải đang chạy và có vật chắn cảm biến (DI_11): băng tải dừng, DO_01 bật (báo robot). Khi vật không còn chắn cảm biến: băng tải chạy tiếp, DO_01 tắt.',
      'Thử: dùng nút "Lấy vật ở vị trí gắp" (khung Mô phỏng) để giả làm robot nhấc vật đi.',
    ],
    hints: ['Mạch tự giữ: (DI_00 OR M_Run) AND NOT DI_01 → M_Run. Băng tải: DO_00 = M_Run AND NOT DI_11.', 'Tag nhớ (M) tự khai báo trong bảng tag, ví dụ M_Run tại %M0.0 (tương đương MB000000 trong MPE720).'],
    cellOpts: { feedMs: 4000 },
    grading: {
      scenario: async (c) => {
        const Q = c.mc.io.outputs;
        c.cell.panel.Feed = false;
        await c.run(1000);
        const idle = !Q.DO_00;
        await c.press('START', 200); await c.run(300);
        const runs = !!Q.DO_00;
        c.add('start', 'START → băng tải chạy (DO_00), trước đó không tự chạy', 20, idle && runs, !idle ? 'DO_00 bật trước khi nhấn START' : !runs ? 'DO_00 không bật sau START' : '');
        await c.press('STOP', 200); await c.run(300);
        const stops = !Q.DO_00;
        await c.run(1000);
        c.add('stop', 'STOP → băng tải dừng và không tự chạy lại', 20, runs && stops && !Q.DO_00, !stops ? 'DO_00 vẫn bật sau STOP' : '');
        await c.press('START', 200);
        c.cell.panel.Feed = true;
        let arrived = false;
        for (let i = 0; i < 30 && !arrived; i++) { await c.run(500); arrived = !!c.mc.io.inputs.DI_11; }
        await c.run(300);
        const stopAt = arrived && !Q.DO_00 && !!Q.DO_01;
        c.add('sensor', 'Có vật ở cảm biến DI_11 → băng tải dừng, DO_01 bật', 25, stopAt, !arrived ? 'Vật không tới được cảm biến (băng tải không chạy?)' : !stopAt ? `DO_00=${+!!Q.DO_00}, DO_01=${+!!Q.DO_01}` : '');
        c.cell.panel.Feed = false;
        c.takePick();
        await c.run(400);
        c.add('resume', 'Lấy vật đi → băng tải chạy tiếp, DO_01 tắt', 25, stopAt && !!Q.DO_00 && !Q.DO_01, `DO_00=${+!!Q.DO_00}, DO_01=${+!!Q.DO_01}`);
      },
    },
  },
  {
    id: 'R05', part: 2, week: 5, cellId: 'mechatro', level: 2, durationMin: 150, tools: ['pendant', 'mpe'],
    title: 'Phối hợp robot và machine controller qua I/O',
    objectives: ['Thiết kế trao đổi tín hiệu (bắt tay) giữa machine controller và robot qua I/O', 'Lập trình robot chờ tín hiệu ngoài, báo hoàn thành bằng xung', 'Lập trình ladder bắt sườn lên, chốt và xóa trạng thái'],
    tasks: [
      'Bảng tín hiệu: MC DO_01 → robot IN#1 (có vật ở vị trí gắp); MC DO_02 → robot IN#2 (có vật ở vị trí thả trên mâm xoay); robot OT#3 → MC DI_12 (đã thả vật lên mâm).',
      'Ladder (giữ yêu cầu 1.1a, b của R04) và thêm: 1.1c — khi DI_12 có sườn lên: DO_02 bật, DO_24 (đèn Q0 trên I/O Box) bật. 1.1d — khi người dùng lấy vật khỏi mâm xoay và bật DI_24 (công tắc I0 trên I/O Box): DO_02 tắt, DO_24 tắt.',
      'Robot (job MAIN), yêu cầu 1.2: chờ ở P000. Khi IN#1 ON và IN#2 OFF: tới P001 (trên điểm gắp vài cm) → P002 (điểm gắp) → bật nam châm OT#1 → lên P001 → P003 (điểm trung gian cao) → P004 (trên điểm thả) → P005 (điểm thả trên mâm xoay) → tắt nam châm → lên P003 → xung OT#3 100 ms → quay lại bước đầu.',
      'Dạy 6 điểm P000..P005 trên trạm này, kiểm tra bằng FWD ở tốc độ LOW/MED, rồi chạy PLAY + START.',
      'Thử cả chu trình: START (MC) → vật tới → robot gắp đặt → đèn Q0 sáng → bấm "Lấy vật khỏi mâm xoay" và gạt I0 (I/O Box) → robot làm vật tiếp theo.',
    ],
    hints: ['Sườn lên DI_12 trong ladder: tiếp điểm P (-|P|-) cần một bit nhớ riêng.', 'Robot thả vật xong phải nhấc lên P003 rồi mới báo OT#3 — để mâm xoay (bài sau) không va vào dụng cụ.', 'Công tắc DI_24 là công tắc gạt: sau khi xóa xong, gạt về OFF.'],
    starter: { master: 'MAIN', jobs: [JOB('MAIN', ROBOT_JOB_R05)] },
    cellOpts: { feedMs: 6000, aStart: 0 },
    grading: {
      scenario: async (c) => {
        const Q = c.mc.io.outputs;
        const okStart = await robotPlay(c);
        await c.run(500);
        await c.press('START', 200);
        let t = 0; while (t < 45000 && !(c.cell.stats.placed >= 1)) { await c.run(500); t += 500; }
        c.add('place1', 'Robot gắp vật trên băng tải, đặt lên mâm xoay', 20, okStart && c.cell.stats.placed >= 1, okStart ? (c.cell.stats.placed ? '' : 'Chưa có vật nào được đặt lên mâm trong 45 s') : 'Không chạy được job MAIN');
        await c.run(1500);
        const lamp = !!Q.DO_02 && !!Q.DO_24;
        c.add('latch', 'Sườn lên DI_12 → DO_02 và DO_24 bật', 15, lamp, `DO_02=${+!!Q.DO_02}, DO_24=${+!!Q.DO_24}`);
        await c.run(12000);
        c.add('wait', 'Khi DO_02 đang bật, robot không đặt thêm vật (không chồng lên vật trên mâm)', 15, lamp && c.cell.stats.placed === 1 && !c.cell.stats.stacked, c.cell.stats.stacked ? 'Robot đặt chồng lên vật trên mâm' : '');
        c.cell.action('takeOut');
        c.cell.press('X0', true); await c.run(800);
        const cleared = !Q.DO_02 && !Q.DO_24;
        c.cell.press('X0', true); await c.run(500);
        c.add('clear', 'Lấy vật + bật DI_24 → DO_02 và DO_24 tắt', 15, lamp && cleared, `DO_02=${+!!Q.DO_02}, DO_24=${+!!Q.DO_24}`);
        t = 0; while (t < 40000 && c.cell.stats.placed < 2) { await c.run(500); t += 500; }
        c.add('cycle', 'Chu trình lặp lại: robot đặt vật thứ hai', 15, c.cell.stats.placed >= 2, `Số vật đã đặt: ${c.cell.stats.placed}`);
        c.add('safe', 'Không va chạm, không rơi vật', 15, c.cell.stats.crashes === 0 && c.cell.stats.drops === 0 && c.cell.stats.placed >= 1, [c.cell.stats.crashes ? `${c.cell.stats.crashes} va chạm` : '', c.cell.stats.drops ? `${c.cell.stats.drops} lần rơi` : ''].filter(Boolean).join(' · '));
      },
    },
  },
  {
    id: 'R06', part: 2, week: 6, cellId: 'mechatro', level: 3, durationMin: 150, tools: ['pendant', 'mpe'], inherit: ['R05'],
    title: 'Giao tiếp Ethernet MC – robot (High-Speed Ethernet Server)',
    objectives: ['Hiểu cấu trúc khung lệnh High-Speed Ethernet Server (UDP 10040) của YRC1000micro', 'Cấu hình module 218IFD (kết nối UDP, mã BIN, no-protocol)', 'Dùng hàm MSG-SNDE gửi lệnh bật/tắt servo và chạy job robot'],
    tasks: [
      'Chuẩn bị: điền bảng giá trị khung lệnh (Bật servo / Tắt servo / Bắt đầu JOB) trong Bài giảng.',
      'MPE720 → Cấu hình module → 218IFD: địa chỉ MC 192.168.1.1; thêm kết nối kênh 1: IP robot 192.168.1.11, cổng 10040, UDP, BIN, Communication protocol = None.',
      'Tạo DB theo struct header (đã có mẫu "Servo_On", "Servo_Off", "Job_Start") và nhập giá trị các trường; DATA_SIZE = 18 word (32 byte header + 4 byte dữ liệu).',
      'Yêu cầu 2.1a — Nhấn Robot ON (DI_03) lần đầu: servo robot bật; nhấn lần nữa: servo tắt (luân phiên).',
      'Yêu cầu 2.1b — Bật công tắc DI_31 (I7 trên I/O Box): job MAIN của bài R05 được chạy.',
      'Robot phải ở chế độ REMOTE (chìa khóa trên pendant) thì mới nhận lệnh qua Ethernet. Xem khung gửi/nhận ở tab "Giám sát mạng".',
    ],
    hints: ['Gửi xong (Complete) hoặc lỗi (Error) thì reset Execute về 0, nếu không lần nhấn sau không gửi được.', 'Mỗi DB là một khung lệnh; dùng 3 hàm MSG-SNDE trên 3 kênh hoặc 1 kênh dùng chung (gửi lần lượt).', 'Giá trị Identifier 0x43524559 nhập dạng 16#43524559; Reserve 2 = 0x3939393939393939 → hai trường L = 16#39393939.'],
    starter: { dbs: [hseDb('Servo_On', 20), hseDb('Servo_Off', 21), hseDb('Job_Start', 22)] },
    cellOpts: { aStart: 0 },
    grading: {
      scenario: async (c) => {
        const eth = c.project.mc?.eth || {};
        const conn = (eth.conns || []).find((x) => x.remoteIp === '192.168.1.11' && +x.remotePort === 10040 && x.type === 'UDP' && x.code === 'BIN' && x.protocol === 'None');
        c.add('cfg', '218IFD: kết nối UDP tới 192.168.1.11:10040, BIN, no-protocol', 10, !!conn, conn ? '' : 'Chưa có kết nối đúng (xem lại IP, cổng, UDP, BIN, None)');
        const r = c.robot;
        r.setMode('REMOTE'); r.selectJob(r.program.master || 'MAIN');
        await c.run(500);
        await c.press('ROBOT_ON', 200); await c.run(800);
        const on1 = r.servo;
        c.add('on', 'Nhấn Robot ON lần 1 → servo robot bật', 20, on1, on1 ? '' : lastNet(c));
        await c.press('ROBOT_ON', 200); await c.run(800);
        const off = !r.servo;
        c.add('off', 'Nhấn Robot ON lần 2 → servo robot tắt', 20, on1 && off, off ? '' : lastNet(c));
        await c.press('ROBOT_ON', 200); await c.run(800);
        c.cell.press('X7', true); await c.run(1500);
        const run = r.busy;
        c.add('job', 'Bật DI_31 → robot chạy job', 20, r.servo && run, run ? '' : lastNet(c));
        await c.press('START', 200);
        let t = 0; while (t < 45000 && c.cell.stats.placed < 1) { await c.run(500); t += 500; }
        c.add('xfer', 'Hệ thống chuyển được vật lên mâm xoay', 10, c.cell.stats.placed >= 1, `Số vật đã đặt: ${c.cell.stats.placed}`);
        c.add('safe', 'Không va chạm', 10, run && c.cell.stats.crashes === 0, '');
      },
    },
  },
];
const lastNet = (c) => { const e = c.cell.netLog[c.cell.netLog.length - 1]; const m = c.mc.netLog[c.mc.netLog.length - 1]; return e ? `Khung cuối: ${e.info}` : m?.text ? m.text : 'Robot không nhận được khung nào'; };

/* ---------------- Phần 3: Servo với MP3300 (Bài 3) ---------------- */
const MOTION_TPL = (name, what) => ({ name, source: `// ${name}: ${what}\nVAR;\nEND_VAR;\n\nEND;\n` });
/** Giả lập robot: đặt vật lên khe robot và phát xung OT#3 (DI_12). */
async function fakeRobotPlace(c) {
  const cell = c.cell;
  const k = cell.robotSlot();
  const [x, y] = (await import('../sim/layout.js')).slotXY(k, cell.mc.axes.A1.phys);
  if (!cell.items.some((it) => it.on === 'rotary' && it.slot === k)) cell.puck(x, y, 40, { on: 'rotary', slot: k, label: 'R' });
  cell.robot.OT[3] = true; await c.run(150); cell.robot.OT[3] = false;
}

const PART3 = [
  {
    id: 'R07', part: 3, week: 7, cellId: 'mechatro', level: 2, durationMin: 150, tools: ['pendant', 'mpe'], inherit: ['R06', 'R05'],
    title: 'Điều khiển servo mâm xoay bằng chương trình Motion',
    objectives: ['Cấu hình trục servo (SVC, Fixed / Setting parameter), về gốc kiểu 19 (chỉ dùng tín hiệu zero)', 'Viết chương trình Motion: ZRN, MOV, INC/ABS, IOW, WHILE', 'Gọi chương trình motion bằng MSEE, xử lý lỗi và reset'],
    tasks: [
      'Cấu hình module → Trục A1 (mâm xoay): đơn vị độ, 1 chữ số thập phân; về gốc: Creep Speed 50 °/s, Speed Reference 50 °/s, Travel Distance 0, Input Signal DI_10.',
      'Yêu cầu 1.1 — MPM001: về gốc mâm xoay (ZRN [A1]0;) tại vị trí cảm biến tiệm cận DI_10.',
      'Yêu cầu 1.2 — MPM002: mỗi khi có tín hiệu từ robot (DI_12) mâm xoay quay 90° (gợi ý: WHILE SB1 == 1; … WEND;).',
      'Yêu cầu 1.3a — Nhấn Servo ON (DI_02) lần 1: bật cả 3 servo; lần 2: tắt. Trạng thái hiển thị ở DO_16, DO_17, DO_18.',
      'Yêu cầu 1.3b — Băng tải và DO_01 như bài R04. Bật công tắc DI_24: chạy MPM001 (về gốc).',
      'Yêu cầu 1.3c — Nhấn START: MPM002 chạy; nhấn STOP: MPM002 dừng. Có lỗi của CPU, servo hoặc chương trình motion → DO_19 nhấp nháy. Nhấn Robot ON (DI_03) để reset lỗi.',
    ],
    hints: ['Struct điều khiển MSEE đã có sẵn: "CallM1" (MPM001), "CallM2" (MPM002). Control.Run, Stop, AlarmReset tác động bằng sườn lên.', 'Lỗi chương trình motion: "CallM2".Alarm; lỗi trục: "A1".Alarm <> 0. Xóa: sườn lên "A1".AlarmClear và "CallM2".AlarmReset.', 'Nhấp nháy: 2 timer TON nối vòng, hoặc so sánh thời gian.', 'Chương trình motion chỉ chạy khi MSEE được quét mỗi chu kỳ — đừng đặt MSEE sau một tiếp điểm có thể tắt.'],
    starter: {
      dbs: [mseeDb('CallM1', 10), mseeDb('CallM2', 11)],
      motion: [MOTION_TPL('MPM001', 'về gốc mâm xoay'), MOTION_TPL('MPM002', 'quay mâm 90° mỗi lần robot báo DI_12')],
      axes: { A1: { creep: 10, zrnSpeed: 10, zrnTravel: 0, zrnSignal: '', speedRef: 90 } },
    },
    grading: {
      scenario: async (c) => {
        const Q = c.mc.io.outputs, A = c.mc.axes.A1;
        const okRobot = await robotPlay(c);
        await c.run(300);
        await c.press('SERVO_ON', 200); await c.run(500);
        const on = A.running && c.mc.axes.B1.running && c.mc.axes.C1.running && Q.DO_16 && Q.DO_17 && Q.DO_18;
        await c.press('SERVO_ON', 200); await c.run(500);
        const off = !A.running && !Q.DO_16;
        c.add('servo', 'Servo ON luân phiên bật/tắt 3 servo, đèn DO_16..18 theo trạng thái', 15, on && off, `Lần 1: ${on ? 'bật' : 'chưa bật đủ'} · lần 2: ${off ? 'tắt' : 'chưa tắt'}`);
        await c.press('SERVO_ON', 200); await c.run(500);
        c.cell.press('X0', true);
        let t = 0; while (t < 20000 && !A.zeroDone) { await c.run(500); t += 500; }
        c.cell.press('X0', true);
        const am = ((A.phys % 360) + 360) % 360;
        const aligned = A.zeroDone && (am > 357.5 || am < 2.5);
        c.add('home', 'DI_24 → MPM001 về gốc mâm xoay tại cảm biến DI_10', 20, aligned, A.zeroDone ? (aligned ? '' : `Mâm dừng lệch ${am.toFixed(1)}° so với cảm biến`) : 'Trục A1 chưa về gốc (xem tham số Input Signal, Creep Speed, servo)');
        await c.press('START', 200);
        const a0 = A.phys;
        t = 0; while (t < 50000 && c.cell.stats.placed < 1) { await c.run(500); t += 500; }
        await c.run(4000);
        const d = A.phys - a0;
        c.add('rot', 'Robot thả vật (DI_12) → mâm quay đúng 90°', 25, okRobot && c.cell.stats.placed >= 1 && Math.abs(d - 90) < 0.5, c.cell.stats.placed ? `Mâm quay ${d.toFixed(1)}°` : 'Robot chưa đặt vật nào lên mâm (kiểm tra job robot / băng tải)');
        // gây lỗi: tắt servo khi MPM002 đang chạy rồi giả lập robot báo DI_12
        await c.press('SERVO_ON', 200); await c.run(300);
        c.robot.stopProgram();
        await fakeRobotPlace(c);
        await c.run(600);
        let toggles = 0, last = !!Q.DO_19;
        for (let i = 0; i < 40; i++) { await c.run(50); const v = !!Q.DO_19; if (v !== last) toggles++; last = v; }
        c.add('alarm', 'Lỗi chương trình motion (servo tắt) → DO_19 nhấp nháy', 15, toggles >= 2, `DO_19 đổi trạng thái ${toggles} lần trong 2 s`);
        await c.press('ROBOT_ON', 200); await c.run(800);
        let still = 0; for (let i = 0; i < 20; i++) { await c.run(50); if (Q.DO_19) still++; }
        c.add('reset', 'Nhấn Robot ON (DI_03) → xóa lỗi, DO_19 tắt', 15, toggles >= 2 && still === 0, still ? 'DO_19 vẫn sáng / nhấp nháy' : '');
      },
    },
  },
  {
    id: 'R08', part: 3, week: 8, cellId: 'mechatro', level: 3, durationMin: 180, tools: ['pendant', 'mpe'], inherit: ['R07', 'R06', 'R05'],
    title: 'Hệ thanh trượt B/C: giới hạn mềm, về gốc, chuyển động phối hợp',
    objectives: ['Cài đặt giới hạn mềm (software limit) và hiểu ảnh hưởng tới lệnh MOV', 'Về gốc nhiều trục theo thứ tự an toàn', 'Viết chuỗi chuyển động phối hợp mâm xoay + thanh trượt dùng thanh ghi GL', 'Tìm tọa độ bằng Test Run (jog trục)'],
    tasks: [
      'Yêu cầu 2.1 — Giới hạn mềm: B1: +1 mm / −280 mm; C1: +1 mm / −110 mm (bật "Software limit").',
      'Yêu cầu 2.2 — Thêm vào MPM001 về gốc trục B và C (kiểu 19): B1 dùng HOME_B (DI_06), C1 dùng HOME_C (DI_09), Creep 20 mm/s, Speed 20 mm/s, Travel 0. Về gốc C (trục đứng) TRƯỚC rồi mới tới B. Trạng thái về gốc xong hiện ở DO_25 (B) và DO_26 (C).',
      'Yêu cầu 2.4 — Dùng tab Test Run (MC ở STOP): jog B1, C1 (≤ 10 mm/s) tìm tọa độ GL100 (C lên cao an toàn), GL102 (C hạ chạm vật trên mâm), GL104 (C hạ thả vào thùng), GL200 (B trên khe mâm), GL202 (B trên thùng). Ghi vào chương trình (đơn vị 0,1 mm).',
      'Yêu cầu 2.3a — MPM002: C1 tới GL100 rồi B1 tới GL200 → chờ DI_12 → mâm quay 90° → C1 tới GL102, bật MAG2 (DO_05), về GL100 → B1 tới GL202 → C1 tới GL104, tắt MAG2, về GL100 → B1 về GL200 → lặp lại.',
      'Yêu cầu 2.3b, c — DI_24: chạy MPM001. DI_25: bật thì MPM002 chạy, tắt thì dừng. DI_26: bật thì tạm dừng, tắt thì chạy tiếp. Có lỗi → DO_19 nhấp nháy; sườn lên DI_31 → reset lỗi.',
      'Thử với nút "Giả lập robot đặt vật" (khung Mô phỏng) trước khi chạy cùng robot thật.',
    ],
    hints: ['Luôn đưa C lên cao (GL100) trước khi di chuyển B.', 'Giá trị trong MOV là đơn vị tham chiếu: [B1]-2170 nghĩa là −217,0 mm.', 'Robot báo DI_12 chỉ 100 ms — nếu MPM002 đang bận, hãy chốt sườn lên DI_12 vào một bit nhớ trong ladder rồi cho motion chờ bit đó (IOW) và tự xóa.'],
    starter: {
      dbs: [mseeDb('CallM1', 10), mseeDb('CallM2', 11)],
      motion: [MOTION_TPL('MPM001', 'về gốc C, B rồi A'), MOTION_TPL('MPM002', 'chu trình mâm xoay + thanh trượt')],
      axes: { B1: { softLimitEnable: false, softPos: 0, softNeg: 0, creep: 10, zrnSpeed: 10, zrnSignal: '', speedRef: 50 }, C1: { softLimitEnable: false, softPos: 0, softNeg: 0, creep: 10, zrnSpeed: 10, zrnSignal: '', speedRef: 50 } },
    },
    grading: {
      scenario: async (c) => {
        const ax = c.mc.axes, B = ax.B1, C = ax.C1, Q = c.mc.io.outputs;
        const prm = c.project.mc?.axes || {};
        const lim = (p, pos, neg) => p && p.softLimitEnable && Math.abs(p.softPos - pos) < 0.05 && Math.abs(p.softNeg - neg) < 0.05;
        c.add('soft', 'Giới hạn mềm B1 (+1/−280) và C1 (+1/−110) đã bật', 10, lim(prm.B1, 1, -280) && lim(prm.C1, 1, -110), `B1: ${fmtLim(prm.B1)} · C1: ${fmtLim(prm.C1)}`);
        await c.press('SERVO_ON', 200); await c.run(500);
        if (!B.running) { await c.press('SERVO_ON', 200); await c.run(500); }
        c.cell.press('X0', true);
        let bad = false, t = 0;
        const b0 = B.phys;
        while (t < 30000 && !(B.zeroDone && C.zeroDone && ax.A1.zeroDone)) { await c.run(100); t += 100; if (!C.zeroDone && Math.abs(B.phys - b0) > 0.5) bad = true; }
        c.cell.press('X0', true);
        const homed = B.zeroDone && C.zeroDone;
        c.add('home', 'DI_24 → về gốc C trước, sau đó B (và A)', 15, homed && !bad, !homed ? 'Chưa về gốc xong B1/C1' : bad ? 'Trục B di chuyển khi C chưa về gốc xong' : '');
        c.add('lamp', 'DO_25 / DO_26 báo về gốc xong', 5, homed && !!Q.DO_25 && !!Q.DO_26, `DO_25=${+!!Q.DO_25}, DO_26=${+!!Q.DO_26}`);
        c.cell.press('X1', true); // DI_25
        await c.run(6000);
        const ready = Math.abs(C.pos) > 3 || Math.abs(B.pos) > 3;
        c.robot.stopProgram();
        await fakeRobotPlace(c);
        const del0 = c.cell.stats.delivered;
        // tạm dừng giữa chừng
        t = 0; while (t < 15000 && !(B.busy)) { await c.run(100); t += 100; }
        let paused = false, resumed = false;
        if (B.busy) {
          c.cell.press('X2', true); await c.run(600);
          const p1 = B.phys; await c.run(800); paused = Math.abs(B.phys - p1) < 0.2;
          c.cell.press('X2', true);
        }
        t = 0; while (t < 40000 && c.cell.stats.delivered === del0) { await c.run(500); t += 500; }
        resumed = c.cell.stats.delivered > del0;
        c.add('cycle', 'MPM002: mâm quay 90°, thanh trượt lấy vật bỏ vào thùng', 30, ready && resumed, resumed ? '' : `Vật chưa vào thùng. ${c.cell.events.slice(-1)[0]?.message || ''}`);
        c.add('pause', 'DI_26 tạm dừng trục đang chạy, tắt DI_26 thì chạy tiếp', 15, paused && resumed, paused ? '' : 'Trục không dừng khi bật DI_26');
        await c.run(8000);
        await fakeRobotPlace(c);
        t = 0; const d1 = c.cell.stats.delivered; while (t < 40000 && c.cell.stats.delivered === d1) { await c.run(500); t += 500; }
        c.add('loop', 'Chu trình lặp lại cho vật thứ hai', 10, c.cell.stats.delivered > d1, '');
        c.add('safe', 'Không va chạm', 5, resumed && c.cell.stats.crashes === 0, c.cell.events.filter((e) => e.level === 'error').slice(-1)[0]?.message || '');
      },
    },
  },
  {
    id: 'R09', part: 3, week: 9, cellId: 'mechatro', level: 4, durationMin: 240, tools: ['pendant', 'mpe'], inherit: ['R08', 'R07', 'R06', 'R05'],
    title: 'Đồ án: hệ luân chuyển vật hoàn chỉnh (robot + băng tải + servo)',
    objectives: ['Tích hợp robot, băng tải, mâm xoay và thanh trượt thành một hệ tự động', 'Thiết kế trình tự khởi động, dừng và xử lý lỗi cho cả hệ', 'Tối ưu thời gian chu kỳ'],
    tasks: [
      'Yêu cầu 3 — Robot chạy chương trình như R05. MC: băng tải, mâm xoay, thanh trượt chạy như R08.',
      'Trình tự vận hành: Servo ON → DI_24 về gốc → DI_25 chạy MPM002 → START băng tải → robot PLAY + START.',
      'Hệ phải chạy liên tục: vật trên băng tải → robot → mâm xoay → thanh trượt → thùng. Không va chạm, không đặt chồng, không rơi vật.',
      'Nhấn STOP: băng tải dừng ngay; robot và thanh trượt làm nốt vật đang cầm.',
      'Báo cáo: sơ đồ tín hiệu giữa các thiết bị, lưu đồ chương trình robot / ladder / motion, thời gian chu kỳ đo được.',
    ],
    hints: ['Robot chỉ được thả khi khe mâm trống (IN#2 OFF) — MC xóa DO_02 sau khi mâm quay xong.', 'Thanh trượt lấy vật ở khe 225°, robot thả ở khe 135°: hai việc có thể chạy song song.', 'Robot vừa nhấc vật lên mà băng tải chạy lại ngay thì vật kế tiếp sẽ đâm vào vật đang treo — hãy trễ ~1 s sau khi cảm biến DI_11 hết bị chắn (TON).', 'Thời gian chu kỳ tham khảo ≤ 15 s/vật.'],
    starter: { dbs: [mseeDb('CallM1', 10), mseeDb('CallM2', 11)] },
    cellOpts: { feedMs: 5000 },
    grading: {
      scenario: async (c) => {
        const ax = c.mc.axes, Q = c.mc.io.outputs;
        await c.press('SERVO_ON', 200); await c.run(500);
        if (!ax.A1.running) { await c.press('SERVO_ON', 200); await c.run(500); }
        c.cell.press('X0', true);
        let t = 0; while (t < 30000 && !(ax.A1.zeroDone && ax.B1.zeroDone && ax.C1.zeroDone)) { await c.run(500); t += 500; }
        c.cell.press('X0', true);
        c.cell.press('X1', true);
        await c.run(3000);
        await c.press('START', 200);
        const okR = await robotPlay(c);
        const T = 120000;
        for (t = 0; t < T; t += 1000) await c.run(1000);
        const s = c.cell.stats;
        c.add('throughput', 'Sản lượng: ≥ 5 vật vào thùng trong 120 s', 40, okR && s.delivered >= 5, `Vào thùng: ${s.delivered} · chu kỳ gần nhất ${(s.cycleTimeMs / 1000).toFixed(1)} s`);
        c.add('order', 'Không đặt chồng / lệch khe trên mâm xoay', 15, s.delivered > 0 && !s.stacked && !s.misplaced, [s.stacked ? `${s.stacked} lần chồng` : '', s.misplaced ? `${s.misplaced} lần lệch khe` : ''].join(' '));
        c.add('safe', 'Không va chạm, không rơi vật', 20, s.delivered > 0 && s.crashes === 0 && s.drops === 0, c.cell.events.filter((e) => e.level !== 'info').slice(-2).map((e) => e.message).join('\n'));
        await c.press('STOP', 200); await c.run(500);
        c.add('stop', 'STOP → băng tải dừng', 15, s.delivered > 0 && !Q.DO_00, Q.DO_00 ? 'DO_00 vẫn bật' : '');
      },
    },
  },
];
const fmtLim = (p) => (p ? `${p.softLimitEnable ? 'bật' : 'tắt'} ${p.softPos}/${p.softNeg}` : '—');
void MC_HINT_DBS;

import { PART4 } from './part4.js';
export const LABS = [...PART1, ...PART2, ...PART3, ...PART4];
export const PARTS = [
  { id: 1, title: 'Robot công nghiệp MotoMINI', weeks: '1–3' },
  { id: 2, title: 'Machine controller MP3300 và giao tiếp robot', weeks: '4–6' },
  { id: 3, title: 'Điều khiển servo và hệ luân chuyển vật', weeks: '7–9' },
  { id: 4, title: 'Robot – máy tính và vision', weeks: '10–11' },
];
