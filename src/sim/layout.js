// Bố trí hình học các trạm (mm, hệ tọa độ robot: gốc = tâm đáy đế robot, Z = 0 ở mặt bàn).
// Mô hình 3D (tools/freecad/*.py) dùng cùng các số này; thế giới FreeCAD = hệ robot + (0, 0, TABLE_Z).

export const TABLE_Z = 750;                 // mặt bàn thí nghiệm so với sàn
export const PUCK = { d: 30, h: 20 };       // vật thao tác: trụ thép Ø30×20
export const TOOL = { z: 50 };              // dụng cụ nam châm: TCP cách mặt bích 50 mm theo trục Z dụng cụ

/** Trạm MotoMINI (Bài 1): pallet có các ô A1 A2 A3 B C. */
export const PALETTE = {
  center: [230, 0], size: [300, 340], top: 10,
  cells: { A1: [170, 110], A2: [230, 110], A3: [290, 110], B: [190, -110], C: [270, -110] },
};

/** Trạm Mechatro (Bài 2–3): băng tải, mâm xoay (trục A), thanh trượt ngang B + dọc C, thùng ra. */
export const CONVEYOR = { y: 180, x0: -330, x1: 240, top: 40, width: 70, stopX: 240, sensorX: 224 };
export const ROTARY = { center: [250, -230], r: 75, top: 40, slotAngle0: 135, slotR: 18, radius: 100 };
export const GANTRY = {
  y: -283,           // đường chạy thanh trượt B (song song X)
  x0: 417,           // x của trục C khi B (vật lý) = 0
  cTop: 165,         // cao độ đáy nam châm khi C (vật lý) = 0
  bPhys: [-292, 15], cPhys: [-125, 15],
  bPot: 12, bNot: -290, cPot: 12, cNot: -122,
  home: 3,           // cảm biến HOME tác động trong ±3 mm quanh vật lý 0
};
export const BIN = { center: [400, -283], size: [90, 90], floor: 10, wall: 70 };

/** Góc thực của khe k khi mâm (vật lý) quay a độ. */
export const slotAngle = (k, a) => ROTARY.slotAngle0 + k * 90 + a;
export function slotXY(k, a) {
  const t = (slotAngle(k, a) * Math.PI) / 180;
  return [ROTARY.center[0] + ROTARY.r * Math.cos(t), ROTARY.center[1] + ROTARY.r * Math.sin(t)];
}
