// Khung khóa học (20 lab, 5 phần) phía UI. Nội dung chi tiết (mục tiêu, bước, chấm) lấy từ src/labs khi có;
// bảng này chỉ để hiển thị danh sách, tuần học và ánh xạ lab → máy mô phỏng.
// Tên học phần / phần / lab / máy nằm trong src/app/i18n.js (khóa course.*, part.*, machine.*) — đọc theo ngôn ngữ hiện tại.
import { t } from './i18n.js';

/** Tên học phần (dự phòng khi chưa có COURSE_INFO của nhóm nội dung). */
export const courseTitle = () => t('course.title');

const withTitle = (list, prefix) => list.map((x) => Object.defineProperty(x, 'title', { get: () => t(prefix + x.id), enumerable: true, configurable: true }));

export const PARTS = withTitle([
  { id: 1, weeks: '1–3' },
  { id: 2, weeks: '4–6' },
  { id: 3, weeks: '7–9' },
  { id: 4, weeks: '10–11' },
], 'part.');

/** machineId = trạm mô phỏng (null → lab sắp có). */
export const COURSE = withTitle([
  { id: 'R01', part: 1, week: 1, level: 1, machineId: 'motomini' },
  { id: 'R02', part: 1, week: 2, level: 2, machineId: 'motomini' },
  { id: 'R03', part: 1, week: 3, level: 2, machineId: 'motomini' },
  { id: 'R04', part: 2, week: 4, level: 1, machineId: 'mechatro' },
  { id: 'R05', part: 2, week: 5, level: 2, machineId: 'mechatro' },
  { id: 'R06', part: 2, week: 6, level: 3, machineId: 'mechatro' },
  { id: 'R07', part: 3, week: 7, level: 2, machineId: 'mechatro' },
  { id: 'R08', part: 3, week: 8, level: 3, machineId: 'mechatro' },
  { id: 'R09', part: 3, week: 9, level: 4, machineId: 'mechatro' },
  { id: 'R10', part: 4, week: 10, level: 3, machineId: null },
  { id: 'R11', part: 4, week: 11, level: 3, machineId: null },
], 'course.');

export const MACHINE_IDS = ['motomini', 'mechatro'];
/** Tên máy theo ngôn ngữ hiện tại: MACHINE_TITLES[id]. */
export const MACHINE_TITLES = Object.defineProperties({}, Object.fromEntries(MACHINE_IDS.map((id) => [id, { get: () => t('machine.' + id), enumerable: true }])));
