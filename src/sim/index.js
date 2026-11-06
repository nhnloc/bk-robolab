// Danh mục trạm mô phỏng (robot cell). createMachine giữ tên cũ để dùng lại phần giao diện.
import { createCell, CELL_IDS } from './cell.js';

export function createMachine(id, opts) { return createCell(id, opts); }
/** Thông tin tĩnh: id, title, summary, ioMap (MC), robotIo, buttons, faults */
export const MACHINES = Object.fromEntries(CELL_IDS.map((id) => [id, createCell(id).def]));
export const MACHINE_IDS = CELL_IDS;
