# BK-RoboLab — Phòng thí nghiệm robot ảo

Mô phỏng các bài thí nghiệm của học phần **Thí nghiệm Kỹ thuật Robot** (robot Yaskawa MotoMINI + YRC1000micro, machine controller MP3300, servo Σ-7) chạy hoàn toàn trên trình duyệt: teach pendant ảo, MPE720 ảo (Ladder + Motion), trạm 3D dựng bằng FreeCAD, chấm bài tự động. Cùng hạ tầng với BK-AutoLab (PLC). Phục vụ giảng dạy; không liên kết với Yaskawa.

## Chạy thử

```bash
python3 -m http.server 8000
```
Mở http://localhost:8000, tự đăng ký (Họ tên, Lớp, MSSV). Máy không có WebGL hiện sơ đồ 2D (nhìn trên + nhìn ngang) thay cho 3D.

## Bài lab (giai đoạn 1: Bài 1–3 của tài liệu gốc)

| Lab | Nội dung | Trạm | Công cụ |
|---|---|---|---|
| R01 | Vận hành bằng tay: servo, jog JOINT/CARTESIAN/TOOL, gắp–thả bằng tay | MotoMINI + pallet | Pendant (chấm theo thao tác thực tế) |
| R02 | Dạy điểm, job INFORM: MAIN gọi PICK/PLACE, xếp chồng | MotoMINI + pallet | Pendant |
| R03 | Robot + I/O: công tắc I4–I7 chọn vật, xung đèn Q4/Q5 | MotoMINI + pallet | Pendant |
| R04 | MP3300: thanh ghi, kiểu dữ liệu, ladder băng tải | Mechatro | MPE720 |
| R05 | Bắt tay robot ↔ MC qua I/O (DO_01, DO_02, DI_12) | Mechatro | Pendant + MPE720 |
| R06 | Ethernet MC → robot: 218IFD, khung High-Speed Ethernet, MSG-SNDE | Mechatro | Pendant + MPE720 |
| R07 | Servo mâm xoay: về gốc kiểu 19, MPM001/MPM002, MSEE, lỗi & reset | Mechatro | Pendant + MPE720 |
| R08 | Thanh trượt B/C: giới hạn mềm, về gốc C→B, chuỗi GL, Test Run | Mechatro | Pendant + MPE720 |
| R09 | Đồ án: hệ luân chuyển vật hoàn chỉnh | Mechatro | Pendant + MPE720 |
| R10 | Giao tiếp robot – máy tính: tự viết thư viện High-Speed Ethernet (JavaScript), đọc vị trí, xung → độ, động học thuận, jog | MotoMINI + camera | PC App + Pendant |
| R11 | Vision: nhận dạng vật (ngưỡng, vùng liên thông, mômen), hiệu chuẩn affine bằng 3 điểm mốc, gửi P010/B000 cho robot, bù góc | MotoMINI + camera | PC App + Pendant |

R10–R11 thay Qt C++ của tài liệu gốc bằng JavaScript chạy ngay trong trình duyệt (`src/pc/runner.js`); mã sinh viên giao tiếp với robot ảo qua `udp.send()` đúng khung UDP thật.

R06–R09 tự kế thừa chương trình robot/MC của lab trước khi sinh viên mở lần đầu.

## Chạy thử mẫu

Trên trang lab có nút **Chạy thử mẫu**: phát lại trạm chạy theo lời giải mẫu (chạy / tạm dừng, chạy lại, tốc độ 0,5–4×, tua, nhật ký diễn biến có chú thích — bấm một dòng để tua tới). Băng ghi ở `assets/demos/<lab>.json` chỉ có hình ảnh trạm và sự kiện, **không có chương trình lời giải**, nên đưa lên web được. R01 (thao tác bằng tay) không có băng ghi.

Ghi lại (máy giảng viên, cần `private/solutions.js`) mỗi khi sửa lời giải, mô phỏng hoặc kịch bản chấm:
```bash
node tools/record-demos.mjs          # mọi lab (hoặc: node tools/record-demos.mjs R07 R09)
```
Script chỉ ghi lab có lời giải đạt 100/100.

## Kiểm thử

```bash
node tests/robolab.test.mjs   # động học, INFORM, motion, khung Ethernet; lời giải mẫu mọi lab = 100/100
node tests/plc.test.mjs       # lõi soft-PLC (ladder dùng cho MP3300)
```
Lời giải mẫu ở `private/solutions.js` (không đưa lên git).

## Cấu trúc

- `src/pc/` chạy chương trình máy tính của sinh viên (R10–R11)
- `src/robot/` động học MotoMINI (`kinematics.js`), ngôn ngữ INFORM (`inform.js`), bộ điều khiển YRC1000micro (`controller.js`), High-Speed Ethernet Server (`hse.js`)
- `src/mc/` MP3300: trục servo (`axis.js`), ngôn ngữ Motion (`motion.js`), MSEE / MSG-SNDE / biến trục (`mp3300.js`); ladder dùng lại `src/plc/`
- `src/sim/` bố trí trạm (`layout.js`), vật lý trạm (`cell.js`), đồng hồ (`runtime.js`)
- `src/labs/` nội dung lab, bài giảng (`lectures.js`), chấm bài (`grader.js`)
- `src/app/robot/` teach pendant, trạm; `src/app/mpe/` MPE720; `src/app/studio/` trình soạn ladder
- `tools/freecad/` script dựng mô hình (`motomini_robot.py`, `motomini.py`, `mechatro.py`) → `assets/models/*.glb`
- `docs/CONTRACT.md` đặc tả kỹ thuật

## Ghi chú

- Mô hình MotoMINI hiện là mô hình tham số dựng trong FreeCAD theo kích thước khớp thật (165/165/40 mm). Có file STEP chính hãng thì có thể thay hình học, giữ nguyên tên node và gốc trục.
- Giao diện robot/MPE720 hiện chỉ có tiếng Việt (nút EN đổi phần khung chung và tên lab).
- Mật khẩu giảng viên dùng chung `data/teacher.json` chép từ BK-AutoLab.
