// Tag I/O → node trên mô hình 3D (để chỉ cho sinh viên "cảm biến/cơ cấu này nối vào ngõ nào").
// Quy ước tên node trong GLB: sen_<TAG> (cảm biến), out_<TAG> (đèn/contactor), btn_<ID> (nút), cyl_<n>A_rod /
// arm_<n>A / flap_<n>A / slide_<n>A / plate_<n>A_* (xi lanh n, điều khiển bởi van nY1/nY2, báo vị trí nB1/nB2).
// Động cơ, chân không, analog… không suy ra được từ tên → bảng EXTRA theo từng máy.

const EXTRA = {
  motor: { S_Up: ['btn_Up'], S_Down: ['btn_Down'], F1: ['drum'] },
  stardelta: { P_Raw: ['needle_P'], I_Raw: ['needle_A'] },
  counter: { M1: ['belt_1'], M2: ['belt_2'], Display: ['display'] },
  feeder: { M1: ['belt_1'] },
  escapement: { M1: ['rollers'], M2: ['rollers'] },
  diverter: { M1_Run: ['belt_main'], M1_Speed: ['belt_main'], Code: ['sen_BC'], CodeValid: ['sen_BC'] },
  erector: { M1: ['belt_out'], VAC: ['cyl_1A_rod'] },
  sealer: { M1: ['belt_in'], M2: ['belt_side_L', 'belt_side_R'] },
  pickplace: { M1: ['belt_in'], M2: ['belt_out'], VAC: ['cyl_2A_rod'], Blow: ['cyl_2A_rod'] },
  indexer: { M1: ['table'] },
  palletizer: { M1: ['belt_in'], M2_Up: ['lift'], M2_Down: ['lift'], M3: ['pallet'] },
};
const LAMPS = { H_Run: 'static_lamp_green', H_Fault: 'static_lamp_red', H_Low: 'static_lamp_amber' };

/** Tên các node ứng với tag (có thể rỗng: tag chỉ có trên bảng điều khiển). has(name) → node có trong cảnh? */
export function nodesForTag(machineId, tag, has) {
  if (!tag) return [];
  const out = [];
  const add = (n) => { if (has(n) && !out.includes(n)) out.push(n); };
  for (const n of EXTRA[machineId]?.[tag] || []) add(n);
  add('sen_' + tag); add('out_' + tag); add('btn_' + tag);
  if (LAMPS[tag]) add(LAMPS[tag]);
  const cyl = /^(\d+)[YB]\d$/.exec(tag);   // 1Y1, 2Y2 → cơ cấu 1A / 2A (nB1/nB2 đã có sen_ riêng)
  if (cyl && /Y/.test(tag)) {
    const re = new RegExp(`(^|_)${cyl[1]}A(_|$)`);
    for (const n of has.names()) if (re.test(n) && !/^sen_/.test(n)) add(n);
  }
  return out;
}

/** Nút trên bảng điều khiển 2D ứng với tag ngõ vào (Start, S1, S_Up → Up…). */
export function panelButtonForTag(tag, buttons = []) {
  const ids = new Set(buttons.map((b) => b.id));
  if (ids.has(tag)) return tag;
  const s = /^S_(.+)$/.exec(tag);
  if (s && ids.has(s[1])) return s[1];
  return null;
}
