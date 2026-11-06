// Định nghĩa node chuyển động dự phòng (CONTRACT §6) + hình học placeholder (hộp đơn giản, mm hệ FreeCAD).
// manifest.json (luồng 3D) sẽ ghi đè phần "nodes" khi có.

const T = (axisFC, travel, parent) => ({ type: 'translate', axisFC, travel, ...(parent ? { parent } : {}) });
const R = (axisFC, travel) => ({ type: 'rotate', axisFC, travel });
const B = { type: 'belt' };
const O = (tag, color) => ({ type: 'output', tag, color });
const BTN = (axisFC = [0, 1, 0]) => T(axisFC, 4);

export const NODE_DEFS = {
  feeder: { cyl_1A_rod: T([1, 0, 0], 120), cyl_2A_rod: T([0, -1, 0], 30), belt_1: B },
  escapement: { cyl_1A_rod: T([0, 0, 1], 40), cyl_2A_rod: T([0, 0, 1], 40), rollers: B },
  diverter: { cyl_1A_rod: T([0, 1, 0], 420), cyl_2A_rod: T([0, 1, 0], 420), cyl_3A_rod: T([0, 1, 0], 420), belt_main: B },
  erector: { cyl_1A_rod: T([0, -1, 0], 350), arm_2A: R([0, 0, 1], 90), flap_3A: R([0, 1, 0], 90), flap_4A: R([0, 1, 0], -90), cyl_5A_rod: T([1, 0, 0], 500), magazine_pusher: T([0, -1, 0], 600), belt_out: B },
  sealer: { cyl_1A_rod: T([0, 0, 1], 40), flap_2A: R([0, 1, 0], 90), flap_3A: R([0, 1, 0], -120), cyl_4A_rod: T([0, 0, -1], 80), belt_in: B, belt_side_L: B, belt_side_R: B },
  pickplace: { slide_1A: T([1, 0, 0], 500), cyl_2A_rod: T([0, 0, -1], 150, 'slide_1A'), belt_in: B, belt_out: B },
  indexer: { table: R([0, 0, 1], 360), cyl_1A_rod: T([0, 0, 1], 30), cyl_2A_rod: T([0, 0, -1], 80), cyl_3A_rod: T([0, -1, 0], 200), cyl_4A_rod: T([1, 0, 0], 200), cyl_5A_rod: T([1, 0, 0], 200) },
  // Phần 1 (CONTRACT-P1)
  trainer: {
    btn_S1: BTN(), btn_S2: BTN(), btn_S3: BTN(), btn_SW1: R([0, 1, 0], 90),
    out_H1: O('H1', '#e53935'), out_H2: O('H2', '#fdd835'), out_H3: O('H3', '#43a047'), out_H4: O('H4', '#1e88e5'), out_BUZ: O('BUZ', '#e53935'),
    target_metal: T([1, 0, 0], 120), blocker: T([0, 0, 1], -60),
  },
  motor: {
    door: { ...T([0, 0, 1], 2200), clipAboveZFC: 2250 }, drum: R([1, 0, 0], 360), btn_Up: BTN(), btn_Down: BTN(),
    out_KM1: O('KM1', '#43a047'), out_KM2: O('KM2', '#43a047'), out_H_Up: O('H_Up', '#43a047'), out_H_Down: O('H_Down', '#fdd835'),
    obstacle: T([0, 1, 0], 0),
  },
  stardelta: {
    pulley: R([0, 1, 0], 360), needle_P: R([0, 1, 0], -270), needle_A: R([0, 1, 0], -90),
    out_KM1: O('KM1', '#43a047'), out_KM2: O('KM2', '#fdd835'), out_KM3: O('KM3', '#1e88e5'),
  },
  counter: { belt_1: { type: 'belt', uvAxisFC: [1, 0, 0] }, belt_2: { type: 'belt', uvAxisFC: [0, 1, 0] }, out_H_Full: O('H_Full', '#fb8c00') },
  palletizer: { cyl_1A_rod: T([0, 0, 1], 40), cyl_2A_rod: T([0, 1, 0], 650), plate_3A_L: T([-1, 0, 0], 450), plate_3A_R: T([1, 0, 0], 450), lift: T([0, 0, 1], 900), pallet: { type: 'static', parent: 'lift' }, belt_in: B },
};

/* ---------- Placeholder: danh sách khối. Mỗi khối: [x0,y0,z0, x1,y1,z1] (mm, FreeCAD), màu, node? pivot? ---------- */
const C = { frame: '#B8BEC6', steel: '#D5D9DD', body: '#9AA3AD', rod: '#E8EAEC', grip: '#2B2F33', belt: '#2E7D4F', beltW: '#F2F2F2', roller: '#A7ADB3', base: '#5B6168', warn: '#F2C200', glass: '#9FD3F0', wood: '#B8894F' };

function conveyor(x0, x1, y0, y1, node, color = C.belt, z = 800) {
  return [
    { b: [x0, y0 - 30, z - 120, x1, y0, z - 10], c: C.frame },
    { b: [x0, y1, z - 120, x1, y1 + 30, z - 10], c: C.frame },
    { b: [x0, y0, z - 20, x1, y1, z], c: color, node },
    ...legs(x0, x1, y0 - 30, y1 + 30, z - 120),
  ];
}
function legs(x0, x1, y0, y1, top) {
  const out = [];
  const xs = [x0 + 20, x1 - 60]; if (x1 - x0 > 1400) xs.splice(1, 0, (x0 + x1) / 2);
  for (const x of xs) for (const y of [y0, y1 - 40]) out.push({ b: [x, y, 0, x + 40, y + 40, top], c: C.frame });
  return out;
}
function cylX(x0, x1, y, z, node, rodLen, dir = 1) {
  // thân dọc X, cần đẩy theo dir
  const rodStart = dir > 0 ? x1 : x0 - rodLen;
  const rodEnd = dir > 0 ? x1 + rodLen : x0;
  return [
    { b: [x0, y - 25, z - 25, x1, y + 25, z + 25], c: C.body },
    { node, b: [rodStart, y - 8, z - 8, rodEnd, y + 8, z + 8], c: C.rod, extra: [{ b: dir > 0 ? [rodEnd, y - 40, z - 40, rodEnd + 20, y + 40, z + 40] : [rodStart - 20, y - 40, z - 40, rodStart, y + 40, z + 40], c: C.grip }] },
  ];
}

// Nút nhấn tròn (khối vuông nhỏ) nhô khỏi mặt tấm phía −Y, nhấn theo +Y.
const pbtn = (node, x, z, c, y = 170) => ({ node, b: [x - 15, y - 14, z - 15, x + 15, y, z + 15], c });
const lampAt = (node, x, z, c, y = 170) => ({ node, b: [x - 16, y - 12, z - 16, x + 16, y, z + 16], c });

export const PLACEHOLDER = {
  trainer: [
    { b: [-100, -400, 700, 1400, 450, 750], c: C.wood },
    ...legs(-100, 1400, -400, 450, 700),
    { b: [0, 170, 750, 820, 200, 1260], c: C.steel },
    { b: [40, 160, 1120, 360, 170, 1230], c: C.body }, { b: [380, 160, 1120, 760, 170, 1230], c: '#2e8b9a' },
    pbtn('btn_S1', 100, 900, '#2fa84f'), pbtn('btn_S2', 190, 900, '#2fa84f'), pbtn('btn_S3', 280, 900, '#d32f2f'),
    { node: 'btn_SW1', pivot: [380, 165, 900], b: [365, 150, 870, 395, 168, 930], c: C.grip },
    lampAt('out_H1', 100, 1020, '#5a1f1f'), lampAt('out_H2', 190, 1020, '#5a521f'), lampAt('out_H3', 280, 1020, '#1f4d2c'), lampAt('out_H4', 370, 1020, '#1f2f5a'),
    { b: [440, 150, 990, 500, 170, 1050], c: C.grip }, lampAt('out_BUZ', 470, 1020, '#5a1f1f', 148),
    { b: [880, -60, 750, 1150, 60, 770], c: C.roller },
    { node: 'target_metal', b: [950, -35, 770, 1010, 35, 780], c: '#cfd8dc' },
    { b: [1088, -12, 800, 1112, 12, 920], c: C.body }, { node: 'sen_PRX', b: [1095, -6, 920, 1105, 6, 930], c: C.grip },
    { b: [1230, -170, 750, 1270, -130, 880], c: C.body }, { b: [1230, 130, 750, 1270, 170, 880], c: C.body },
    { node: 'sen_PE', b: [1244, 120, 860, 1256, 130, 872], c: C.grip },
    { node: 'blocker', b: [1220, -40, 850, 1280, 40, 960], c: C.warn },
  ],
  motor: [
    { b: [-80, -80, 0, 0, 80, 2300], c: C.frame }, { b: [2000, -80, 0, 2080, 80, 2300], c: C.frame },
    { b: [-80, -200, 2250, 2080, 200, 2500], c: C.body },
    { node: 'drum', pivot: [1000, 0, 2380], b: [0, -100, 2280, 2000, 100, 2480], c: C.roller },
    { node: 'door', b: [0, -15, 0, 2000, 15, 2200], c: '#90a4ae' },
    { node: 'obstacle', b: [800, -250, 0, 1200, 150, 400], c: '#c8a273' },
    { node: 'sen_PE', b: [-10, -100, 290, 10, -80, 310], c: C.grip }, { node: 'sen_LS_Up', b: [-30, -100, 2180, -10, -80, 2200], c: C.grip }, { node: 'sen_LS_Down', b: [-30, -100, 10, -10, -80, 30], c: C.grip },
    { b: [2200, -60, 1200, 2320, -20, 1500], c: C.grip },
    pbtn('btn_Up', 2260, 1420, '#2fa84f', -60), pbtn('btn_Down', 2260, 1300, '#e0a800', -60),
    lampAt('out_H_Up', 2230, 1480, '#1f4d2c', -60), lampAt('out_H_Down', 2290, 1480, '#5a521f', -60),
    { b: [2400, 0, 800, 2800, 200, 1400], c: C.steel },
    { b: [2450, -10, 1050, 2550, 0, 1250], c: C.body }, { b: [2600, -10, 1050, 2700, 0, 1250], c: C.body },
    lampAt('out_KM1', 2500, 1200, '#1f4d2c', -10), lampAt('out_KM2', 2650, 1200, '#1f4d2c', -10),
    { b: [2400, -30, 800, 2800, -20, 1400], c: C.glass, name: 'glass_cabinet' },
  ],
  stardelta: [
    { b: [0, -300, 100, 1600, 300, 700], c: '#8e1b1b' },
    ...legs(100, 1500, -300, 300, 100),
    { b: [200, -160, 700, 600, 160, 980], c: '#37474f' },
    { node: 'pulley', pivot: [400, -200, 840], b: [320, -215, 760, 480, -195, 920], c: C.steel },
    { b: [900, -160, 700, 1300, 160, 1100], c: C.body },
    { b: [1400, -320, 820, 1580, -300, 1000], c: '#fafafa' },
    { node: 'needle_P', pivot: [1490, -325, 910], b: [1486, -330, 910, 1494, -322, 980], c: '#d32f2f' },
    { node: 'sen_PS', b: [1300, -330, 760, 1320, -310, 780], c: C.grip },
    { b: [1900, 0, 0, 2500, 250, 1400], c: C.steel },
    { b: [1960, -10, 1000, 2060, 0, 1200], c: C.body }, { b: [2100, -10, 1000, 2200, 0, 1200], c: C.body }, { b: [2240, -10, 1000, 2340, 0, 1200], c: C.body },
    lampAt('out_KM1', 2010, 1160, '#1f4d2c', -10), lampAt('out_KM2', 2150, 1160, '#5a521f', -10), lampAt('out_KM3', 2290, 1160, '#1f2f5a', -10),
    { node: 'sen_F1', b: [2000, -20, 900, 2020, 0, 920], c: C.grip },
    { b: [2120, -40, 1250, 2280, -30, 1380], c: '#fafafa' },
    { node: 'needle_A', pivot: [2200, -45, 1270], b: [2196, -50, 1270, 2204, -42, 1360], c: '#d32f2f' },
    { b: [1900, -30, 600, 2500, -20, 1400], c: C.glass, name: 'glass_cabinet' },
  ],
  counter: [
    ...conveyor(0, 1500, -80, 80, 'belt_1', C.beltW),
    { b: [1500, -80, 640, 1620, 80, 660], c: C.steel },
    { b: [1400, -700, 330, 1450, 700, 440], c: C.frame }, { b: [1750, -700, 330, 1800, 700, 440], c: C.frame },
    { node: 'belt_2', b: [1450, -700, 430, 1750, 700, 450], c: '#1e5aa8' },
    ...legs(1400, 1800, -700, 700, 330),
    { b: [980, 380, 0, 1020, 420, 1300], c: C.frame },
    { name: 'display', b: [850, 370, 1300, 1150, 410, 1450], c: '#111111' },
    { node: 'out_H_Full', b: [985, 380, 1450, 1015, 410, 1500], c: '#5a3a1f' },
    { node: 'sen_B1', b: [1480, -110, 820, 1500, -90, 840], c: C.grip }, { node: 'sen_B2', b: [1400, -30, 470, 1420, -10, 490], c: C.grip }, { node: 'sen_B3', b: [50, -110, 820, 70, -90, 840], c: C.grip },
  ],
  feeder: [
    ...conveyor(200, 800, -70, 70, 'belt_1'),
    { b: [-150, -150, 0, 180, 150, 780], c: C.base },
    { b: [115, -35, 800, 185, 35, 1150], c: C.glass, name: 'glass_tube' },
    { b: [790, -80, 800, 820, 80, 860], c: C.warn },
    { b: [-120, -25, 787, 60, 25, 837], c: C.body },
    { node: 'cyl_1A_rod', b: [60, -12, 800, 115, 12, 824], c: C.rod },
    { b: [130, 60, 815, 170, 160, 855], c: C.body },
    { node: 'cyl_2A_rod', b: [140, 30, 825, 160, 60, 845], c: C.rod },
  ],
  escapement: [
    ...conveyor(0, 2000, -260, 260, 'rollers', C.roller),
    { b: [1080, -150, 620, 1120, 150, 760], c: C.body },
    { node: 'cyl_1A_rod', b: [1090, -140, 740, 1110, 140, 795], c: C.warn },
    { b: [1380, -150, 620, 1420, 150, 760], c: C.body },
    { node: 'cyl_2A_rod', b: [1390, -140, 740, 1410, 140, 795], c: C.warn },
  ],
  diverter: [
    ...conveyor(0, 3000, -200, 200, 'belt_main'),
    ...[900, 1700, 2500].flatMap((x, i) => [
      { b: [x - 60, -420, 760, x + 60, -260, 840], c: C.body },
      { node: `cyl_${i + 1}A_rod`, b: [x - 175, -255, 800, x + 175, -235, 950], c: C.steel },
      { b: [x - 190, 230, 700, x + 190, 1430, 760], c: C.roller },
      ...legs(x - 190, x + 190, 230, 1430, 700),
    ]),
    { b: [260, -260, 1000, 340, 260, 1040], c: C.grip },
  ],
  erector: [
    { b: [0, -400, 0, 2000, 500, 700], c: C.base },
    { b: [100, 300, 700, 420, 1300, 760], c: C.frame },
    { node: 'magazine_pusher', b: [110, 1280, 760, 410, 1300, 1150], c: C.steel },
    { b: [130, 320, 760, 400, 700, 1100], c: '#C8A273' },
    { node: 'cyl_1A_rod', b: [200, 230, 900, 320, 260, 1000], c: C.grip },
    { b: [240, 260, 930, 280, 400, 970], c: C.body },
    { node: 'arm_2A', pivot: [500, 50, 950], b: [500, 50, 930, 520, 350, 970], c: C.steel },
    { node: 'flap_3A', pivot: [1150, 0, 780], b: [1150, -100, 780, 1160, 100, 900], c: C.warn },
    { node: 'flap_4A', pivot: [650, 0, 780], b: [640, -100, 780, 650, 100, 900], c: C.warn },
    { b: [560, -40, 840, 700, 40, 900], c: C.body },
    { node: 'cyl_5A_rod', b: [700, -150, 800, 720, 150, 1000], c: C.steel },
    ...conveyor(1500, 2000, -220, 220, 'belt_out'),
    { b: [0, -400, 700, 1500, -380, 1300], c: C.glass, name: 'glass_front' },
  ],
  sealer: [
    ...conveyor(0, 1500, -250, 250, 'belt_in'),
    { b: [780, -150, 640, 820, 150, 760], c: C.body },
    { node: 'cyl_1A_rod', b: [790, -140, 740, 810, 140, 795], c: C.warn },
    { b: [300, -350, 0, 340, -300, 1500], c: C.frame }, { b: [300, 300, 0, 340, 350, 1500], c: C.frame },
    { b: [1100, -350, 0, 1140, -300, 1500], c: C.frame }, { b: [1100, 300, 0, 1140, 350, 1500], c: C.frame },
    { b: [300, -350, 1460, 1140, 350, 1500], c: C.frame },
    { node: 'flap_2A', pivot: [420, 0, 1160], b: [420, -60, 1160, 560, 60, 1175], c: C.steel },
    { node: 'flap_3A', pivot: [1000, 0, 1160], b: [860, -60, 1160, 1000, 60, 1175], c: C.steel },
    { b: [680, -30, 1300, 720, 30, 1460], c: C.body },
    { node: 'cyl_4A_rod', b: [500, -160, 1190, 1000, 160, 1210], c: C.steel },
    { node: 'belt_side_L', b: [1000, -300, 820, 1500, -270, 1050], c: C.belt },
    { node: 'belt_side_R', b: [1000, 270, 820, 1500, 300, 1050], c: C.belt },
  ],
  pickplace: [
    ...conveyor(0, 800, -110, 110, 'belt_in'),
    { b: [800, -110, 800, 820, 110, 860], c: C.warn },
    ...conveyor(1150, 1450, -700, 700, 'belt_out', C.beltW).map((p) => p),
    { b: [650, 200, 0, 700, 250, 1450], c: C.frame }, { b: [1450, 200, 0, 1500, 250, 1450], c: C.frame },
    { b: [650, 160, 1400, 1500, 250, 1460], c: C.frame },
    { node: 'slide_1A', b: [760, 120, 1340, 840, 250, 1420], c: C.body },
    { node: 'cyl_2A_rod', b: [785, 120, 1050, 815, 150, 1340], c: C.rod, extra: [{ b: [770, 105, 1030, 830, 165, 1050], c: C.grip }] },
  ],
  indexer: [
    { b: [100, -500, 0, 1100, 500, 760], c: C.base },
    { node: 'table', pivot: [600, 0, 800], cylinder: { r: 400, h: 30, z0: 0 }, c: C.steel, extra: [0, 90, 180, 270].map((a) => ({ cyl: { r: 40, h: 8, at: [300 * Math.cos((a + 180) * Math.PI / 180), 300 * Math.sin((a + 180) * Math.PI / 180), 30] }, c: C.grip })) },
    { b: [580, -20, 700, 620, 20, 760], c: C.body },
    { node: 'cyl_1A_rod', b: [590, -10, 760, 610, 10, 795], c: C.rod },
    { b: [570, 270, 1100, 630, 330, 1250], c: C.body },
    { node: 'cyl_2A_rod', b: [580, 280, 900, 620, 320, 1100], c: C.rod },
    { b: [570, -80, 850, 630, 0, 900], c: C.body },
    { node: 'cyl_3A_rod', b: [560, -120, 840, 640, -100, 900], c: C.steel },
    ...cylX(-150, 50, 0, 850, 'cyl_4A_rod', 60),
    { b: [200, -420, 850, 300, -380, 900], c: C.body },
    { node: 'cyl_5A_rod', b: [300, -330, 840, 320, -270, 900], c: C.steel },
  ],
  palletizer: [
    ...conveyor(0, 1500, -250, 250, 'belt_in'),
    { b: [1480, -150, 640, 1520, 150, 760], c: C.body },
    { node: 'cyl_1A_rod', b: [1490, -140, 740, 1510, 140, 795], c: C.warn },
    { b: [700, -450, 820, 1500, -420, 1000], c: C.body },
    { node: 'cyl_2A_rod', b: [750, -330, 800, 1450, -310, 1000], c: C.steel },
    { node: 'plate_3A_L', b: [700, 300, 760, 1100, 1150, 780], c: C.steel },
    { node: 'plate_3A_R', b: [1100, 300, 760, 1500, 1150, 780], c: C.steel },
    { b: [640, 260, -300, 680, 1200, 1300], c: C.frame }, { b: [1520, 260, -300, 1560, 1200, 1300], c: C.frame },
    { node: 'lift', b: [700, 300, -320, 1500, 1150, -300], c: C.roller },
    { node: 'pallet', b: [600, 325, -300, 1600, 1125, -150], c: C.wood },
  ],
};
