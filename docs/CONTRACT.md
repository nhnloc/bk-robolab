# BK-RoboLab — Đặc tả kỹ thuật

## 1. Hệ tọa độ & bố trí
- Hệ robot (BASE): gốc = tâm mặt đáy đế robot; X trước, Y trái, Z lên; mm, độ. Mặt bàn Z = 0 (cao 750 mm so với sàn).
- Thế giới FreeCAD = hệ robot + (0, 0, 750). GLB: FreeCAD (x, y, z) mm → three.js (x, z, −y)/1000.
- Mọi kích thước trạm nằm trong `src/sim/layout.js` (pallet, băng tải, mâm xoay, thanh trượt, thùng). Script FreeCAD dùng cùng số.

## 2. Robot MotoMINI (`src/robot/kinematics.js`)
Tư thế 0: L-arm đứng, U-arm nằm ngang hướng +X, mặt bích hướng +X. Trục khớp (điểm trên trục, hướng):

| Khớp | Điểm (mm, BASE) | Trục | Giới hạn (°) | Xung/độ |
|---|---|---|---|---|
| S | (0, 0, 0) | +Z | ±170 | 34816/30 |
| L | (20, 0, 103) | +Y | −85..90 | 102400/90 |
| U | (20, 0, 268) | −Y | −50..90 | 51200/90 |
| R | (20, 0, 268) | −X | ±140 | 10204/30 |
| B | (185, 0, 268) | +Y | −30..210 | 10204/30 |
| T | (185, 0, 268) | −X | ±360 | 10204/30 |

Mặt bích tại x = 225; dụng cụ nam châm Z = 50 mm → TCP (275, 0, 268) ở tư thế 0. Góc Rx, Ry, Rz: R = Rz·Ry·Rx. FK = tích hàm mũ; IK = bình phương tối thiểu tắt dần (Jacobian hình học).

Node GLB: `link_S … link_T` (rotate, travel 1, giá trị = độ, chuỗi cha–con), gốc node = điểm trên trục.

## 3. Trạm
- `motomini`: robot, pallet ô A1 A2 A3 B C; Control Panel I4–I7 → IN#5–8, Q4–Q7 ← OT#5–8; OT#1 = nam châm.
- `mechatro`: MC DI_00..31 = %I0.0..%I3.7, DO_00..31 = %Q0.0..%Q3.7 (bảng `MECHATRO_IO` trong `cell.js`). DO_01..04 → robot IN#1..4; robot OT#3 → DI_12. Trục A1 (mâm, độ), B1 (ngang, mm), C1 (dọc, mm); node `table_A` (rotate Z), `slide_B` (translate X), `slide_C` (translate Z, cha slide_B), băng tải `belt_cv`. Giá trị node = vị trí vật lý trục.

## 4. Project sinh viên
```js
{ schema: 'bk-robolab/project@1', labId, cellId,
  robot: { jobs: [{ name, lines: ['NOP', …, 'END'] }], pvars: { P000: { type: 'PULSE', q: [6] } | { type: 'BASE', p: [x,y,z,rx,ry,rz] } }, master },
  mc: { tags, blocks /* như BK-AutoLab */, watch, motion: [{ name: 'MPM001', source }], axes: { A1: {…tham số} }, eth: { conns: [{ ch, localPort, remoteIp, remotePort, type, code, protocol }] } } | null,
  evidence: { … }   // R01: thao tác đã làm (hệ tọa độ, servo, home, cảnh hoàn thành)
}
```

## 5. MP3300
- Ladder: soft-PLC của BK-AutoLab + lệnh mở rộng `MSEE` (PROG, DATA) và `MSG_SNDE` (Execute = dòng công suất, DATA, SIZE word, CH, DEV=16, PRO=2 → Complete/Busy/Error).
- DB hệ thống: `"A1" "B1" "C1"` (ServoOn, AlarmClear, Running, ZeroDone, Busy, Alarm, Warning, Pos) và `"CPU"` (Alarm, Error, AlwaysOn).
- Motion chỉ chạy khi MSEE tương ứng được quét mỗi chu kỳ (quét 10 ms).
- Khung gửi qua MSG-SNDE = các trường DB theo thứ tự, little-endian (W = 2 byte, L = 4 byte).

## 6. High-Speed Ethernet Server (robot 192.168.1.11:10040, UDP)
Header 32 byte LE: "YERC", 0x20, data size, reserve1 = 3, division = 1, ACK, request ID, block no, "99999999", command, instance, attribute, service, padding. Lệnh hỗ trợ: 0x70, 0x72, 0x75, 0x78, 0x7A–0x7D, 0x82, 0x83, 0x84, 0x86, 0x87, 0x8A, 0x8B. Lệnh thay đổi trạng thái cần chế độ REMOTE.

## 7. Chấm bài
`gradeLab(lab, project)` dựng trạm mới (seed cố định), nạp chương trình, chạy kịch bản `lab.grading.scenario(c)`; R01 chấm theo `project.evidence`. Lời giải mẫu mọi lab phải đạt 100 (`tests/robolab.test.mjs`).
