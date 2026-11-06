// Bài giảng, chuẩn đầu ra (outcomes) và câu hỏi nhanh cho từng bài lab robot (R01–R09).
// body: Markdown rút gọn — đoạn văn, "### ", "- ", "1. ", **đậm**, `mã`, bảng | a | b |.
// Nội dung bám theo bản mô phỏng (src/robot, src/mc, src/sim); chỗ khác phần cứng thật có ghi chú.

export const COURSE_INFO = {
  title: 'Thí nghiệm Kỹ thuật Robot',
  subtitle: 'Robot Yaskawa MotoMINI, machine controller MP3300 — phòng thí nghiệm ảo',
};

export const LECTURES = {
  /* ======================= PHẦN 1 — ROBOT MOTOMINI ======================= */
  R01: {
    durationMin: 35,
    outcomes: [
      { code: 'R01.1', text: 'Mô tả ba thành phần của hệ robot Motoman (cánh tay MotoMINI, bộ điều khiển YRC1000micro, bộ lập trình cầm tay) và thông số chính của MotoMINI.' },
      { code: 'R01.2', text: 'Tuân thủ quy tắc an toàn; bật/tắt nguồn servo đúng trình tự bằng SERVO ON READY và công tắc Enable 3 vị trí.' },
      { code: 'R01.3', text: 'Sử dụng đúng các phím của bộ lập trình: chọn chế độ, hệ tọa độ, tốc độ, phím trục, HOLD, E-STOP.' },
      { code: 'R01.4', text: 'Điều khiển robot bằng tay trong các hệ JOINT, CARTESIAN (BASE), TOOL và phân biệt chuyển động TCP giữa các hệ.' },
      { code: 'R01.5', text: 'Gắp–thả vật bằng tay với nam châm OT#1 mà không va chạm.' },
    ],
    sections: [
      {
        title: '1. Hệ robot Motoman và cánh tay MotoMINI',
        body: `Một hệ robot Motoman gồm ba khối:

- **Cánh tay robot (manipulator)** MotoMINI: 6 khớp xoay nối tiếp, mỗi khớp dẫn động bằng động cơ AC servo. Tên khớp tính từ đế ra: **S, L, U, R, B, T** (đế–vai, cánh tay dưới, cánh tay trên, xoay cổ tay, gập cổ tay, xoay mặt bích).
- **Bộ điều khiển YRC1000micro**: chứa các mạch drive servo, CPU tính quỹ đạo, chạy chương trình (job), quản lý I/O và Ethernet.
- **Bộ lập trình cầm tay (programming pendant)**: màn hình + phím để điều khiển bằng tay, soạn job và giám sát.

### Thông số chính của MotoMINI
| Thông số | Giá trị |
|---|---|
| Cấu hình | Khớp xoay thẳng đứng, 6 bậc tự do |
| Tải trọng | 0,5 kg |
| Độ lặp lại | ±0,02 mm |
| Tầm với | khoảng 350 mm (vùng làm việc dạng cầu) |
| Tầm khớp S / L / U | ±170° / −85…+90° / −50…+90° |
| Tầm khớp R / B / T | ±140° / −30…+210° / ±360° |
| Tốc độ tối đa S, L / U / R, B, T | 315 °/s / 420 °/s / 600 °/s |
| Bộ điều khiển | YRC1000micro |

Bản mô phỏng dùng đúng các giới hạn khớp này: lệnh vượt giới hạn sẽ báo động **4414 PULSE LIMIT**, điểm ngoài tầm với báo **4107 OUT OF RANGE**.`,
      },
      {
        title: '2. Quy tắc an toàn',
        body: `Robot công nghiệp có thể chuyển động bất ngờ với tốc độ cao. Trong mọi bài thí nghiệm:

1. **Không** đưa người vào vùng làm việc của robot khi servo đang bật; không dùng tay đẩy robot.
2. Đi giày cách điện, không chạm vào phần kim loại hở của tủ điện.
3. Chỉ vận hành khi đã hiểu rõ thao tác; đọc kỹ hướng dẫn trước.
4. Chạy tay ở tốc độ vừa phải, **giảm xuống LOW hoặc INCH khi tới gần vật hoặc pallet**, luôn nhìn robot khi nhấn phím.
5. Không xoay khớp **B, T** quá mức: trên robot thật dây dụng cụ đi dọc cánh tay trên có thể bị đứt.
6. Gặp sự cố: nhấn **E-STOP** ngay, sau đó mới tìm nguyên nhân.

Trên phần cứng thật, sinh viên chịu trách nhiệm nếu làm hỏng robot do không tuân thủ quy tắc. Trong mô phỏng, va chạm chỉ gây báo động **4100 COLLISION DETECT** — hãy tập thói quen an toàn ngay từ đây.`,
      },
      {
        title: '3. Các phím trên bộ lập trình',
        body: `| Phím | Chức năng |
|---|---|
| **Mode switch** TEACH / PLAY / REMOTE | TEACH: điều khiển tay và soạn job. PLAY: chạy job tự động. REMOTE: robot nhận lệnh từ thiết bị ngoài (I/O, Ethernet). |
| **START** | Chạy job ở chế độ PLAY; đèn sáng khi job đang chạy. |
| **HOLD** | Tạm dừng chuyển động ở mọi chế độ. |
| **E-STOP** (nấm đỏ) | Ngắt ngay nguồn servo; xoay để nhả. |
| **SERVO ON READY** | TEACH: chuẩn bị bật servo (đèn SERVO ON nhấp nháy). PLAY: bật servo ngay. |
| **Enable switch** (3 vị trí) | Bóp nhẹ giữ ở giữa → servo bật; thả ra hoặc bóp mạnh → servo tắt. |
| **FAST / SLOW** | Tăng/giảm tốc độ tay: INCH → LOW → MED → HIGH. |
| **HIGH SPEED** | Giữ cùng phím trục để tăng tốc tạm thời. |
| **COORD** | Đổi hệ tọa độ: JOINT → CARTESIAN → TOOL → USER. |
| **Phím trục** (X−/S−, X+/S+ …) | Giữ để di chuyển trục tương ứng; có thể giữ nhiều phím cùng lúc. |
| **INTERLOCK** | Phím phối hợp: INTERLOCK + SELECT bật/tắt ngõ ra; INTERLOCK + TEST START chạy thử. |
| **TEST START** | Giữ cùng INTERLOCK để chạy thử job ở TEACH; thả là dừng. |
| **FWD / BWD** | Giữ để đi tới điểm của lệnh MOV kế tiếp / trước đó (tốc độ tay). |
| **SELECT / CANCEL** | Chọn / thoát mục đang trỏ. |
| **INSERT / MODIFY / DELETE + ENTER** | Chèn lệnh từ dòng đệm, thay lệnh tại con trỏ, xóa lệnh. MODIFY + ENTER cũng dùng để lưu điểm. |
| **INFORM LIST** | Mở danh sách lệnh INFORM để chèn vào job. |`,
      },
      {
        title: '4. Chế độ vận hành và trình tự bật servo',
        body: `### Ở chế độ TEACH (điều khiển tay)
1. Gạt Mode switch sang **TEACH**.
2. Nhấn **SERVO ON READY** → đèn SERVO ON nhấp nháy.
3. **Bóp nhẹ và giữ** công tắc Enable → servo bật, đèn sáng đều.
4. Giữ phím trục để di chuyển. Thả Enable (hoặc bóp quá mạnh) → servo tắt ngay.

Công tắc Enable 3 vị trí là cơ chế an toàn "người chết": khi hoảng hốt người ta thường buông tay hoặc bóp chặt — cả hai đều cắt servo.

### Ở chế độ PLAY (tự động)
Chọn job → gạt sang **PLAY** → nhấn **SERVO ON READY** (không cần Enable) → **START**. Nhấn **HOLD** để tạm dừng, **E-STOP** khi có sự cố.

### Báo động
Khi có báo động (va chạm, vượt giới hạn…) robot tắt servo và không cho bật lại cho tới khi nhấn **RESET**. Đổi chế độ cũng tắt servo và dừng job đang chạy.`,
      },
      {
        title: '5. Hệ tọa độ, tốc độ và vị trí Home',
        body: `| Hệ tọa độ | Phím trục điều khiển |
|---|---|
| **JOINT** | Từng khớp S, L, U, R, B, T riêng lẻ. |
| **CARTESIAN** (BASE) | TCP tịnh tiến theo X, Y, Z gắn ở đế robot và xoay quanh Rx, Ry, Rz; các khớp phối hợp với nhau. |
| **TOOL** | Như CARTESIAN nhưng trục X, Y, Z gắn với dụng cụ, đổi hướng theo cổ tay. |
| **USER** | Hệ do người dùng định nghĩa (ví dụ gắn theo pallet). |

Khi xoay Rx/Ry/Rz trong CARTESIAN, **vị trí TCP đứng yên**, chỉ hướng dụng cụ thay đổi. Khi tịnh tiến X/Y/Z, **hướng dụng cụ giữ nguyên**.

### Tốc độ tay trong mô phỏng
| Mức | Khớp | Descartes |
|---|---|---|
| INCH | 0,1° mỗi lần nhấn | 0,5 mm mỗi lần nhấn |
| LOW | chậm | 10 mm/s |
| MED | trung bình | 50 mm/s |
| HIGH | nhanh | 150 mm/s |

**Home** là tư thế mọi khớp bằng 0. Bắt đầu và kết thúc mỗi thao tác nên đưa robot về Home: menu ROBOT → Work Home Pos, giữ FWD đến khi các khớp về 0.`,
      },
      {
        title: '6. Dùng bộ lập trình trong mô phỏng',
        body: `- **Enable**: giữ chuột trên nút Enable hoặc giữ phím **Space**. Thả ra là servo tắt — giống công tắc thật.
- **Phím trục**: giữ chuột trên phím; ở mức INCH mỗi lần nhấn đi một bước nhỏ.
- **Nam châm**: menu IN/OUT → General Purpose Output, trỏ vào **OT#1**, nhấn INTERLOCK + SELECT (hoặc nút "Nam châm" cạnh màn hình).
- Nam châm chỉ hút khi dụng cụ **hướng thẳng xuống** và chạm mặt trên vật (lệch tâm không quá 8 mm). Vật thao tác là trụ thép Ø30 × 20 mm.
- Va chạm → báo động 4100, servo tắt. Nhấn RESET, bật lại servo, nhấc robot lên bằng hệ JOINT rồi làm tiếp.

Mẹo gắp vật: dùng hệ CARTESIAN, đưa TCP tới **phía trên** vật vài cm ở mức MED, rồi hạ Z ở mức LOW/INCH cho tới khi chạm.`,
      },
    ],
    quiz: [
      { q: 'Ở chế độ TEACH, sau khi nhấn SERVO ON READY, cần làm gì để servo thực sự bật?', options: ['Nhấn START', 'Bóp nhẹ và giữ công tắc Enable', 'Bóp mạnh công tắc Enable hết cỡ', 'Nhấn INTERLOCK + SELECT'], answer: 1, explain: 'Enable 3 vị trí: chỉ vị trí giữa (bóp nhẹ) mới cho servo bật; thả hoặc bóp mạnh đều cắt servo.' },
      { q: 'Trong hệ CARTESIAN, nhấn phím xoay Rz thì…', options: ['TCP tịnh tiến theo Z', 'Vị trí TCP giữ nguyên, hướng dụng cụ xoay quanh trục Z', 'Chỉ khớp S quay, TCP di chuyển theo cung tròn', 'Robot không cử động'], answer: 1, explain: 'Các trục xoay trong hệ Descartes đổi hướng dụng cụ quanh TCP cố định.' },
      { q: 'Hệ tọa độ nào có trục X, Y, Z đổi hướng theo cổ tay robot?', options: ['JOINT', 'CARTESIAN (BASE)', 'TOOL', 'Không hệ nào'], answer: 2, explain: 'Hệ TOOL gắn với dụng cụ nên quay theo mặt bích.' },
      { q: 'Tải trọng định mức của MotoMINI là bao nhiêu?', options: ['0,5 kg', '2 kg', '5 kg', '7 kg'], answer: 0, explain: 'MotoMINI là robot nhỏ: tải 0,5 kg, tầm với khoảng 350 mm.' },
      { q: 'Khi đưa dụng cụ tới gần vật trên pallet, nên chọn tốc độ tay nào?', options: ['HIGH', 'MED', 'LOW hoặc INCH', 'Giữ HIGH SPEED cho nhanh'], answer: 2, explain: 'Gần vật phải giảm tốc để kịp dừng và tránh va chạm.' },
      { q: 'Trong mô phỏng, phím nào trên bàn phím đóng vai công tắc Enable?', options: ['Enter', 'Space (giữ)', 'Shift', 'Esc'], answer: 1, explain: 'Giữ Space = bóp nhẹ Enable; thả Space = servo tắt.' },
    ],
  },

  R02: {
    durationMin: 40,
    outcomes: [
      { code: 'R02.1', text: 'Trình bày quy trình 4 bước teach → program → test → play.' },
      { code: 'R02.2', text: 'Dạy điểm và lưu vào biến vị trí P000–P127; kiểm tra điểm bằng FWD/BWD.' },
      { code: 'R02.3', text: 'Viết job INFORM với MOVJ, MOVL, SPEED, DOUT, TIMER, CALL, END; chọn đúng VJ, V, PL.' },
      { code: 'R02.4', text: 'Tổ chức chương trình thành job chính và các job con; chạy thử và chạy tự động an toàn.' },
    ],
    sections: [
      {
        title: '1. Quy trình lập trình robot',
        body: `Lập trình robot công nghiệp theo kiểu **dạy học (teach-in)** gồm 4 bước:

1. **Teach — dạy điểm**: điều khiển tay đưa robot tới các vị trí cần nhớ, lưu vào biến vị trí P.
2. **Program — viết job**: sắp xếp các lệnh di chuyển, I/O, điều khiển luồng bằng ngôn ngữ **INFORM**.
3. **Test — chạy thử**: ở TEACH, giữ INTERLOCK + TEST START (tốc độ bị giới hạn), hoặc đi từng điểm bằng FWD.
4. **Play — chạy tự động**: gạt sang PLAY, bật servo, nhấn START.

Một "điểm" gồm cả **vị trí và hướng** của dụng cụ (6 giá trị), không chỉ X, Y, Z.`,
      },
      {
        title: '2. Dạy điểm và biến vị trí P',
        body: `- Menu **VARIABLE → Position Variable**, dùng PAGE / SHIFT+PAGE để tới biến cần sửa (P000…P127).
- Đưa robot tới vị trí mong muốn rồi nhấn **MODIFY + ENTER** để lưu.
- Xóa điểm: menu Data → Clear data.
- Kiểm tra: trỏ tới điểm (hoặc tới dòng MOV trong job), giữ **FWD** khi servo bật — robot đi tới điểm ở tốc độ tay.

### Gợi ý đặt điểm cho bài gắp–thả
| Loại điểm | Ví dụ | Ghi chú |
|---|---|---|
| Home | P000 | Mọi khớp = 0 hoặc tư thế chờ an toàn |
| Điểm trung gian | P001, P003, P005, P007, P011 | Cao hơn điểm gắp/thả khoảng 50 mm |
| Điểm tiếp xúc | P002, P004, P006, P008… | Đầu nam châm chạm mặt trên vật |
| Điểm xếp chồng | tầng 2, tầng 3 ở B | Cao hơn tầng dưới đúng 20 mm (chiều cao vật) |

Job dùng điểm chưa dạy sẽ báo động **4500 POSITION DATA NOT TAUGHT**.`,
      },
      {
        title: '3. Tập lệnh INFORM trong mô phỏng',
        body: `| Nhóm | Lệnh | Ví dụ |
|---|---|---|
| Di chuyển | MOVJ, MOVL | \`MOVJ P001 VJ=10.00\`, \`MOVL P002 V=20.0\` |
| Di chuyển | SPEED | \`SPEED VJ=10.00\` (tốc độ mặc định cho lệnh MOV không ghi tốc độ) |
| I/O | DOUT, PULSE | \`DOUT OT#(1) ON\`, \`PULSE OT#(5) T=1.00\` |
| I/O | DIN, WAIT | \`DIN B000 IN#(5)\`, \`WAIT IN#(1)=ON T=10.0\` |
| Điều khiển | JUMP, *nhãn | \`JUMP *LB1 IF IN#(5)=ON\`, \`*LB1\` |
| Điều khiển | CALL, RET, END, NOP | \`CALL JOB:PICK-A1\` |
| Điều khiển | TIMER, PAUSE | \`TIMER T=0.50\` |
| Điều khiển | IF … THEN / ELSEIF / ELSE / ENDIF | \`IF (B000=1) THEN\` |
| Tính toán | SET, ADD, SUB, MUL, DIV, INC, DEC | \`SET B010 0\`, \`INC B010\` |
| Logic bit | AND, OR, XOR, NOT | \`AND B000 B001\` |
| Dịch điểm | SFTON, SFTOF | \`SFTON P020 BF\` … \`SFTOF\` |
| Chú thích | ' | \`'Gap vat A1\` |

Lệnh **MOVC** (cung tròn) và **MOVS** (spline) có trên robot thật nhưng **chưa hỗ trợ** trong mô phỏng — dùng MOVJ / MOVL. Biến số: B, I, D, R từ 000 đến 099; biến vị trí P000–P127.`,
      },
      {
        title: '4. MOVJ hay MOVL? VJ, V và PL',
        body: `| | MOVJ | MOVL |
|---|---|---|
| Nội suy | Theo khớp: các khớp cùng bắt đầu và kết thúc | Đường thẳng của TCP trong không gian |
| Quỹ đạo TCP | Cong, khó đoán trước | Thẳng, đoán trước được |
| Tốc độ | **VJ** = phần trăm tốc độ khớp tối đa (0,01–100 %) | **V** = tốc độ TCP, mm/s |
| Dùng khi | Di chuyển xa, trong khoảng không trống | Tiếp cận / rời vật, đi xuống – đi lên thẳng đứng |

Cách dùng thường gặp: MOVJ tới điểm trung gian phía trên vật → **MOVL tốc độ thấp** đi thẳng xuống điểm gắp → bật nam châm, chờ ngắn → MOVL đi thẳng lên.

Lệnh MOVJ phải dùng VJ=, không dùng V= (mô phỏng báo lỗi cú pháp nếu viết sai).

**PL (position level, 0–8)** cho phép robot "lượn" qua điểm thay vì dừng hẳn: PL=0 dừng đúng tại điểm, PL lớn → bo góc rộng hơn. Điểm gắp/thả luôn dùng **PL=0**. Mô phỏng chấp nhận tham số PL nhưng robot luôn đi tới đúng điểm.

MOVL có thể thất bại gần điểm kỳ dị hoặc ngoài tầm với (báo động **4415**); khi đó đổi sang MOVJ hoặc dạy lại điểm.`,
      },
      {
        title: '5. Cấu trúc job: job chính và job con',
        body: `Mỗi job bắt đầu bằng \`NOP\` và kết thúc bằng \`END\`. Chia chương trình thành nhiều job nhỏ giúp dễ đọc và dùng lại:

| Job MAIN | Job PICK-A1 | Job PLACE-B |
|---|---|---|
| NOP | NOP | NOP |
| CALL JOB:PICK-A1 | MOVJ P000 VJ=10.00 | MOVJ P000 VJ=10.00 |
| CALL JOB:PLACE-B | MOVJ P001 VJ=10.00 | MOVJ P007 VJ=10.00 |
| CALL JOB:PICK-A2 | MOVL P002 V=20.0 PL=0 | MOVL P008 V=20.0 PL=0 |
| CALL JOB:PLACE-C | DOUT OT#(1) ON | DOUT OT#(1) OFF |
| MOVJ P000 VJ=10.00 | TIMER T=0.20 | TIMER T=0.20 |
| END | MOVL P001 V=20.0 | MOVL P007 V=20.0 |
| | END | END |

- **CALL JOB:tên** chạy job con; gặp END (hoặc RET) thì quay về dòng kế tiếp của job gọi.
- **JUMP JOB:tên** chuyển hẳn sang job khác, không quay lại.
- Gọi lồng nhau quá sâu (quá 16 tầng) → báo động 4504.
- Job "master" là job được chọn để chạy khi nhấn START (thường là MAIN).`,
      },
      {
        title: '6. Chạy thử và chạy tự động',
        body: `### Chạy thử (TEACH)
- Bật servo (SERVO ON READY + Enable), mở job, giữ **INTERLOCK + TEST START**. Thả TEST START hoặc Enable → robot dừng.
- Khi chạy thử, tốc độ TCP bị giới hạn (250 mm/s trong mô phỏng) để an toàn.
- Hoặc trỏ từng dòng MOV và giữ **FWD** để đi từng điểm.

### Chạy tự động (PLAY)
1. JOB → Select Job, chọn job chính.
2. Gạt sang **PLAY**, nhấn **SERVO ON READY**.
3. Nhấn **START**. HOLD để tạm dừng, START để chạy tiếp.

### Báo động hay gặp khi chạy job
| Mã | Ý nghĩa |
|---|---|
| 4500 | Điểm chưa được dạy |
| 4501 | Không có job được gọi |
| 4502 | Lỗi cú pháp trong job |
| 4503 | Không có nhãn được JUMP tới |
| 4414 / 4107 | Vượt giới hạn khớp / điểm ngoài vùng làm việc |
| 4100 | Va chạm |`,
      },
    ],
    quiz: [
      { q: 'Lệnh nào đưa TCP đi theo đường thẳng?', options: ['MOVJ', 'MOVL', 'SPEED', 'CALL'], answer: 1, explain: 'MOVL = nội suy thẳng; MOVJ = nội suy khớp, quỹ đạo TCP thường là đường cong.' },
      { q: 'Trong MOVJ P001 VJ=10.00, VJ=10.00 nghĩa là…', options: ['10 mm/s', '10 °/s', '10 % tốc độ khớp tối đa', '10 giây'], answer: 2, explain: 'VJ là phần trăm tốc độ khớp tối đa; V (của MOVL) mới là mm/s.' },
      { q: 'Điểm gắp/thả vật nên dùng PL bằng bao nhiêu?', options: ['PL=0', 'PL=4', 'PL=8', 'Không quan trọng'], answer: 0, explain: 'PL=0 buộc robot dừng đúng tại điểm; PL lớn sẽ lượn qua và không chạm đúng vật.' },
      { q: 'Để lưu vị trí hiện tại của robot vào biến P005 đang trỏ, nhấn…', options: ['INSERT + ENTER', 'MODIFY + ENTER', 'DELETE + ENTER', 'INTERLOCK + SELECT'], answer: 1, explain: 'MODIFY + ENTER ghi vị trí hiện tại vào biến vị trí (hoặc thay lệnh tại con trỏ trong job).' },
      { q: 'Job MAIN chạy CALL JOB:PICK-A1. Khi PICK-A1 gặp END thì…', options: ['Robot dừng hẳn', 'Quay về dòng kế tiếp trong MAIN', 'Chạy lại PICK-A1 từ đầu', 'Báo động 4501'], answer: 1, explain: 'CALL là gọi job con; END/RET của job con trả điều khiển về job gọi.' },
      { q: 'Viết MOVC P003 V=20.0 trong mô phỏng sẽ…', options: ['Chạy cung tròn', 'Báo lỗi: MOVC chưa hỗ trợ, dùng MOVJ/MOVL', 'Tự đổi thành MOVL', 'Bỏ qua dòng đó'], answer: 1, explain: 'Bản mô phỏng chỉ hỗ trợ MOVJ và MOVL.' },
    ],
  },

  R03: {
    durationMin: 40,
    outcomes: [
      { code: 'R03.1', text: 'Đọc ngõ vào robot bằng WAIT, DIN, điều kiện IF và JUMP … IF IN#; ghi ngõ ra bằng DOUT, PULSE.' },
      { code: 'R03.2', text: 'Dùng biến B để nhớ trạng thái và đếm; dùng nhãn tạo vòng lặp chờ đúng cách.' },
      { code: 'R03.3', text: 'Phối hợp robot với Control Panel (công tắc I4–I7, đèn Q4–Q7).' },
    ],
    sections: [
      {
        title: '1. I/O của robot và Control Panel',
        body: `Robot có các ngõ vào đa dụng **IN#(n)** và ngõ ra đa dụng **OT#(n)**. Ở trạm MotoMINI chúng được nối như sau:

| Robot | Thiết bị | Ý nghĩa |
|---|---|---|
| OT#1 | Nam châm trên dụng cụ | ON = hút vật |
| IN#5 … IN#8 | Công tắc I4 … I7 (Control Panel) | Công tắc gạt, giữ trạng thái |
| OT#5 … OT#8 | Đèn Q4 … Q7 (Control Panel) | Đèn báo |

Chú ý lệch số: công tắc **I4 ứng với IN#5**, đèn **Q4 ứng với OT#5**. Viết nhầm \`IN#(4)\` là lỗi rất hay gặp.`,
      },
      {
        title: '2. Lệnh vào/ra',
        body: `| Lệnh | Tác dụng | Ghi chú |
|---|---|---|
| \`DOUT OT#(5) ON\` | Bật/tắt ngõ ra, giữ nguyên trạng thái | Có thể gán từ biến: \`DOUT OT#(5) B003\` |
| \`PULSE OT#(5) T=1.00\` | Xuất một xung dài T giây | **Không** chặn job: lệnh sau chạy ngay, ngõ ra tự tắt sau T |
| \`DIN B000 IN#(5)\` | Chép trạng thái ngõ vào vào biến B | Đọc tức thời, không chờ |
| \`WAIT IN#(5)=ON\` | Chờ tới khi ngõ vào bằng giá trị | Thêm \`T=5.0\` để chờ tối đa 5 s rồi đi tiếp |

### Lệnh có điều kiện
Nhiều lệnh nhận đuôi **IF**: \`JUMP *PICK1 IF IN#(5)=ON\`, \`CALL JOB:PLACE-C IF IN#(8)=ON\`, \`PAUSE IF IN#(8)=OFF\`, \`RET IF B000=1\`.

Khối nhiều nhánh: \`IF (IN#(8)=ON) THEN\` … \`ELSE\` … \`ENDIF\` (có thể thêm \`ELSEIF\`).`,
      },
      {
        title: '3. Nhãn, vòng lặp và vòng chờ',
        body: `Nhãn \`*TÊN\` (1–8 ký tự) đánh dấu một dòng; \`JUMP *TÊN\` nhảy tới đó. Vòng chờ công tắc điển hình:

| Dòng | Lệnh |
|---|---|
| 1 | \`*WAIT\` |
| 2 | \`JUMP *P1 IF IN#(5)=ON\` |
| 3 | \`JUMP *P2 IF IN#(6)=ON\` |
| 4 | \`JUMP *P3 IF IN#(7)=ON\` |
| 5 | \`TIMER T=0.10\` |
| 6 | \`JUMP *WAIT\` |

Dòng \`TIMER\` rất quan trọng: vòng lặp **không có lệnh chờ** (WAIT, TIMER, MOV) sẽ chiếm hết CPU — mô phỏng báo động **4505 INSTRUCTION LOOP**.

Nhảy tới nhãn không tồn tại → lỗi biên dịch / báo động 4503.`,
      },
      {
        title: '4. Biến và tính toán',
        body: `| Biến | Kiểu | Dải |
|---|---|---|
| B000–B099 | Byte (0–255) | Cờ, bộ đếm nhỏ |
| I000–I099 | Integer 16 bit | Bộ đếm |
| D000–D099 | Double integer 32 bit | Giá trị lớn |
| R000–R099 | Real | Số thực |
| P000–P127 | Vị trí | Điểm robot |

Lệnh: \`SET B000 1\`, \`ADD I001 2\`, \`SUB\`, \`MUL\`, \`DIV\`, \`INC B010\`, \`DEC B010\`; logic bit cho biến B: \`AND\`, \`OR\`, \`XOR\`, \`NOT\`. So sánh trong điều kiện: \`=\`, \`<>\`, \`<\`, \`>\`, \`<=\`, \`>=\`.

### Nhớ trạng thái
Công tắc gạt vẫn ON sau khi robot đã gắp. Nếu chỉ kiểm tra công tắc, robot sẽ quay lại gắp **ô rỗng**. Giải pháp:
- B000, B001, B002 = 1 khi đã gắp A1, A2, A3 → điều kiện gắp: công tắc ON **và** cờ = 0.
- B010 đếm số vật đã đặt ở B → chọn điểm thả tầng 1 / 2 / 3 bằng IF hoặc JUMP theo B010.

Nâng cao: \`SFTON P020 BF\` dịch các điểm MOV theo vector trong P020 (kiểu BASE), dùng để xếp chồng chỉ với một điểm thả; \`SFTOF\` tắt dịch.`,
      },
      {
        title: '5. Khung chương trình cho Yêu cầu 2.2',
        body: `1. Khởi tạo: \`SET B000 0\` … \`SET B010 0\`, đưa robot về P000.
2. Vòng chờ: nếu I4 ON và chưa gắp A1 → gắp A1; tương tự A2, A3; không thì \`TIMER\` rồi lặp.
3. Sau khi gắp: đặt cờ đã gắp, gọi job thả theo B010 (tầng), \`INC B010\`.
4. Thả xong, nhấc lên điểm trung gian rồi \`PULSE OT#(5) T=1.00\` (đèn Q4).
5. Câu b: đọc I7 (**IN#8**) để chọn B hay C; dùng bộ đếm riêng cho ô C (ví dụ B011) và xung ra Q5 (**OT#6**).
6. Quay lại vòng chờ.

Kiểm tra: gạt công tắc theo thứ tự ngẫu nhiên (ví dụ I6 → I4 → I5) — chồng ở B phải đúng thứ tự gạt, mỗi lần thả có đúng **một** xung 1 s.`,
      },
    ],
    quiz: [
      { q: 'Công tắc I5 trên Control Panel nối vào ngõ vào nào của robot?', options: ['IN#(5)', 'IN#(6)', 'IN#(4)', 'OT#(6)'], answer: 1, explain: 'I4..I7 nối IN#5..IN#8, nên I5 → IN#6.' },
      { q: 'Sau lệnh PULSE OT#(5) T=1.00, lệnh kế tiếp chạy khi nào?', options: ['Ngay lập tức', 'Sau 1 s', 'Khi đèn tắt và có sườn xuống', 'Khi nhấn START'], answer: 0, explain: 'PULSE không chặn job; ngõ ra tự tắt sau 1 s.' },
      { q: 'Vòng *L1 → JUMP *L1 IF IN#(5)=OFF (không có lệnh nào khác) trong mô phỏng sẽ…', options: ['Chạy bình thường', 'Báo động 4505 vòng lặp không có lệnh chờ', 'Báo động 4100', 'Tự thêm TIMER'], answer: 1, explain: 'Vòng lặp phải có lệnh chờ (WAIT/TIMER/MOV); cách gọn hơn là WAIT IN#(5)=ON.' },
      { q: 'Vì sao cần biến B đánh dấu vật đã gắp trong Yêu cầu 2.2?', options: ['Để robot chạy nhanh hơn', 'Vì công tắc vẫn ON sau khi gắp, robot sẽ quay lại gắp ô rỗng', 'Vì IN# chỉ đọc được một lần', 'Không cần thiết'], answer: 1, explain: 'Công tắc gạt giữ trạng thái; chương trình phải tự nhớ vật nào đã xử lý.' },
      { q: 'Lệnh nào chép trạng thái IN#(8) vào biến B005?', options: ['WAIT IN#(8)=B005', 'DIN B005 IN#(8)', 'SET B005 IN#(8)', 'DOUT B005 IN#(8)'], answer: 1, explain: 'DIN Bxxx IN#(n) đọc ngõ vào vào biến byte.' },
    ],
  },

  /* ======================= PHẦN 2 — MACHINE CONTROLLER MP3300 ======================= */
  R04: {
    durationMin: 40,
    outcomes: [
      { code: 'R04.1', text: 'Mô tả hệ Mechatro: MP3300, servo A/B/C, băng tải J1000, robot, Control Panel, I/O Box.' },
      { code: 'R04.2', text: 'Phân biệt thanh ghi S, M, G, I, O, C, D và kiểu dữ liệu B, W, L, Q, F, D, A của MP3300.' },
      { code: 'R04.3', text: 'Giải mã giá trị một vùng nhớ theo nhiều kiểu dữ liệu (thứ tự word little-endian).' },
      { code: 'R04.4', text: 'Viết ladder điều khiển băng tải theo nút nhấn và cảm biến trong trình soạn ladder của mô phỏng.' },
    ],
    sections: [
      {
        title: '1. Hệ Mechatro và machine controller MP3300',
        body: `**Machine controller (MC)** Yaskawa MP3300 là bộ điều khiển trung tâm của trạm, kết hợp chức năng PLC (ladder) và điều khiển chuyển động (motion). Nó nối với:

- **3 servopack Σ-7** qua mạng MECHATROLINK: trục **A** (mâm xoay), **B** (thanh trượt ngang), **C** (thanh trượt đứng, mang nam châm MAG2).
- **Biến tần J1000** chạy băng tải (tín hiệu S1).
- **Robot YRC1000micro** qua I/O (DO_01..DO_04 ↔ IN#1..IN#4, OT#3 → DI_12) và qua **Ethernet**.
- **Control Panel** (START, STOP, Servo ON, Robot ON, công tắc I0–I7, đèn Q0–Q7) và **I/O Box** (công tắc, đèn).

Dòng vật: băng tải đưa vật tới cảm biến → robot gắp đặt lên mâm xoay → mâm quay → thanh trượt B/C hút vật bỏ vào thùng.

Phần mềm lập trình là **MPE720**. Cấu hình module: CPU301 (CPU), **218IFD** (Ethernet, IP MC mặc định 192.168.1.1/24), **SVC** (trục servo thật), **SVR** (trục ảo), **LIO-04** (32 vào, 32 ra 24 V).`,
      },
      {
        title: '2. Các loại thanh ghi',
        body: `| Loại | Tên | Tính chất | Dùng để |
|---|---|---|---|
| **S** | Thanh ghi hệ thống | Toàn cục, giữ khi mất điện | Trạng thái của MC (vd. SB1 luôn = 1, SB402 = CPU Alarm) |
| **M** | Thanh ghi dữ liệu | Toàn cục, giữ khi mất điện | Trao đổi dữ liệu giữa các chương trình |
| **G** | Thanh ghi G | Toàn cục, **mất** khi tắt điện | Trao đổi dữ liệu giữa các chương trình |
| **I** | Thanh ghi ngõ vào | Toàn cục | Ngõ vào I/O, dữ liệu giám sát của module motion |
| **O** | Thanh ghi ngõ ra | Toàn cục | Ngõ ra I/O, tham số đặt cho module motion |
| **C** | Hằng số | Toàn cục, chỉ đọc | Chỉ ghi bằng MPE720 |
| **D** | Thanh ghi D | **Cục bộ** trong một chương trình | Biến tạm |

Tên thanh ghi = **loại + kiểu dữ liệu + số**: \`MW00010\` (M, word), \`ML00100\` (M, long), \`GL00200\` (G, long), \`IB0000A\` (I, bit). Địa chỉ bit có chữ số cuối là số bit dạng hex: \`MB000002B\` = bit 11 (B) của MW00002.`,
      },
      {
        title: '3. Kiểu dữ liệu và cách ghép word',
        body: `| Ký hiệu | Kiểu | Kích thước | Dải giá trị |
|---|---|---|---|
| B | Bit | 1 bit | 0 / 1 |
| W | Số nguyên | 1 word | −32768 … 32767 |
| L | Số nguyên kép | 2 word | −2 147 483 648 … 2 147 483 647 |
| Q | Số nguyên bốn | 4 word | ±9,22·10¹⁸ |
| F | Số thực | 2 word | ±(1,175E−38 … 3,402E+38) hoặc 0 |
| D | Số thực kép | 4 word | ±(2,225E−308 … 1,798E+308) hoặc 0 |
| A | Địa chỉ | — | 0 … 2 097 152 |

### Thứ tự word
Các kiểu nhiều word dùng **word thấp ở địa chỉ nhỏ** (little-endian): \`ML00000\` = MW00001 (word cao) ghép MW00000 (word thấp). Tương tự \`MF00002\` = MW00003:MW00002, \`MD00000\` = MW00003:MW00002:MW00001:MW00000.

Ví dụ: MW00000 = 2C3D hex, MW00001 = 9AD4 hex → ML00000 = 9AD42C3D hex. Bit cao nhất = 1 nên là số âm (bù hai). Cùng một vùng nhớ có thể đọc thành nhiều giá trị khác nhau tùy kiểu — đây là nguồn gốc của nhiều lỗi khi gửi khung Ethernet ở bài R06.`,
      },
      {
        title: '4. Bảng I/O của machine controller',
        body: `| Tag (mô phỏng) | Địa chỉ | Thanh ghi MPE720 | Tín hiệu |
|---|---|---|---|
| DI_00 / DI_01 | %I0.0 / %I0.1 | IB00000 / IB00001 | Nút START / STOP |
| DI_02 / DI_03 | %I0.2 / %I0.3 | IB00002 / IB00003 | Nút Servo ON / Robot ON |
| DI_04 / DI_05 / DI_06 | %I0.4 … %I0.6 | IB00004 … IB00006 | POT_B / NOT_B / HOME_B |
| DI_07 / DI_08 / DI_09 | %I0.7, %I1.0, %I1.1 | IB00007 … IB00009 | POT_C / NOT_C / HOME_C |
| DI_10 | %I1.2 | IB0000A | HOME_A (tiệm cận mâm xoay) |
| DI_11 | %I1.3 | IB0000B | Cảm biến có vật cuối băng tải |
| DI_12 | %I1.4 | IB0000C | Robot OT#3: đã thả vật lên mâm |
| DI_16 … DI_23 | %I2.0 … %I2.7 | IB00010 … | Công tắc I0–I7 Control Panel |
| DI_24 … DI_31 | %I3.0 … %I3.7 | IB00018 … | Công tắc I0–I7 I/O Box |
| DO_00 | %Q0.0 | OB00000 | S1 — chạy băng tải |
| DO_01 … DO_04 | %Q0.1 … %Q0.4 | OB00001 … | Tới robot IN#1 … IN#4 |
| DO_05 | %Q0.5 | OB00005 | MAG2 — nam châm trục C |
| DO_16 … DO_23 | %Q2.0 … %Q2.7 | OB00010 … | Đèn Q0–Q7 Control Panel |
| DO_24 … DO_31 | %Q3.0 … %Q3.7 | OB00018 … | Đèn Q0–Q7 I/O Box |

Số thanh ghi MPE720 là số thứ tự **dạng hex**: DI_10 → IB0000A, DI_24 → IB00018.`,
      },
      {
        title: '5. Ladder trong mô phỏng và bài băng tải',
        body: `Mô phỏng dùng trình soạn ladder kiểu soft-PLC thay cho MPE720:
- Ngõ vào/ra đã có sẵn trong bảng tag với tên **DI_xx / DO_xx**, địa chỉ hiển thị dạng %I / %Q; cột chú thích ghi thanh ghi MPE720 tương ứng (IB000xx / OB000xx).
- Bit nhớ tự khai báo là tag **%M**, ví dụ \`M_Run\` tại %M0.0 (tương đương một bit MB trong MPE720).
- Có tiếp điểm NO, NC, sườn lên **P**, sườn xuống **N**, cuộn dây thường, Set, Reset, timer TON/TOF, bộ đếm, so sánh, MOVE.

### Yêu cầu 1.1 — băng tải
| Network | Logic |
|---|---|
| 1 — tự giữ | ( DI_00 **hoặc** M_Run ) **và không** DI_01 → M_Run |
| 2 — băng tải | M_Run **và không** DI_11 → DO_00 |
| 3 — báo robot | M_Run **và** DI_11 → DO_01 |

Khi vật chắn cảm biến DI_11, băng tải dừng nhưng **M_Run vẫn giữ**, nên khi robot lấy vật đi băng tải tự chạy tiếp. Nhấn STOP thì M_Run mất và băng tải không tự chạy lại.

Trên phần cứng thật, ladder viết trong MPE720 (thư mục High-speed / Low-speed), biên dịch bằng F4, nạp xuống và Save to Flash.`,
      },
    ],
    quiz: [
      { q: 'MW00000 = 2C3D hex, MW00001 = 9AD4 hex, MW00002 = 9DE6 hex, MW00003 = C001 hex. Giá trị có dấu của MW00001 là?', options: ['11325', '-25900', '39636', '-11325'], answer: 1, explain: '9AD4 hex = 39636; vì bit 15 = 1 nên số có dấu = 39636 − 65536 = −25900. (11325 là giá trị của MW00000.)' },
      { q: 'Cùng dữ liệu trên, bit MB000002B bằng?', options: ['0', '1'], answer: 1, explain: 'MB000002B là bit 11 (B hex) của MW00002 = 9DE6 hex = 1001 1101 1110 0110 b; bit 11 = 1.' },
      { q: 'Cùng dữ liệu trên, ML00000 (có dấu) bằng?', options: ['742234836', '-1697371075', '2597596221', '1018276564'], answer: 1, explain: 'ML00000 = MW00001:MW00000 = 9AD42C3D hex = 2597596221 không dấu → −1697371075 có dấu.' },
      { q: 'Cùng dữ liệu trên, MF00002 xấp xỉ bằng?', options: ['-2.02526', '2.02526', '-2.2021', '1.5E-21'], answer: 0, explain: 'MF00002 = MW00003:MW00002 = C0019DE6 hex, đọc theo số thực IEEE-754 32 bit ≈ −2,02526.' },
      { q: 'Cùng dữ liệu trên, MD00000 xấp xỉ bằng?', options: ['-2.02526', '-2.2021', '-1697371075', '2.2021'], answer: 1, explain: 'MD00000 = C0019DE69AD42C3D hex (4 word, word thấp ở địa chỉ nhỏ), số thực 64 bit ≈ −2,2021.' },
      { q: 'Thanh ghi nào mất giá trị khi tắt nguồn MC và dùng chung cho mọi chương trình?', options: ['M', 'G', 'D', 'C'], answer: 1, explain: 'G là toàn cục nhưng không lưu khi mất điện; M toàn cục và giữ khi mất điện; D cục bộ; C chỉ đọc.' },
    ],
  },

  R05: {
    durationMin: 35,
    outcomes: [
      { code: 'R05.1', text: 'Thiết kế bảng tín hiệu bắt tay (handshake) giữa machine controller và robot qua I/O.' },
      { code: 'R05.2', text: 'Lập trình robot chờ tín hiệu ngoài và báo hoàn thành bằng xung.' },
      { code: 'R05.3', text: 'Lập trình ladder bắt sườn lên, chốt (Set) và xóa (Reset) trạng thái.' },
    ],
    sections: [
      {
        title: '1. Bảng tín hiệu MC – robot',
        body: `| Chiều | Chức năng | MC | Robot |
|---|---|---|---|
| MC → robot | Có vật ở vị trí gắp trên băng tải | DO_01 | IN#1 |
| MC → robot | Có vật ở vị trí thả trên mâm xoay (khe đang bận) | DO_02 | IN#2 |
| Robot → MC | Đã thả vật lên mâm xoay | DI_12 | OT#3 |
| Robot | Nam châm robot | — | OT#1 |

Điều kiện để robot bắt đầu một chu trình: **IN#1 = ON** (có vật để gắp) **và IN#2 = OFF** (khe thả trống).`,
      },
      {
        title: '2. Thiết kế bắt tay',
        body: `Bắt tay (handshake) là quy ước mỗi bên chỉ hành động khi bên kia đã sẵn sàng, và báo lại khi xong:

1. MC: vật tới cảm biến → dừng băng tải, bật **DO_01**.
2. Robot: thấy IN#1 ON và IN#2 OFF → gắp vật → MC thấy cảm biến trống → tắt DO_01, chạy băng tải.
3. Robot: đặt vật lên mâm, nhấc lên điểm an toàn P003 → **PULSE OT#3 100 ms**.
4. MC: bắt **sườn lên DI_12** → bật DO_02 (khe bận) và đèn DO_24.
5. Người vận hành lấy vật khỏi mâm và gạt DI_24 → MC tắt DO_02, DO_24.
6. Robot thấy IN#2 OFF và có vật mới → lặp lại.

Nguyên tắc:
- Tín hiệu "xong việc" phát **sau khi** robot đã rời vùng nguy hiểm (nhấc lên P003), nếu không cơ cấu kế tiếp (mâm xoay ở bài sau) có thể va vào dụng cụ.
- Tín hiệu dạng xung ngắn phải được bên nhận **chốt lại**; tín hiệu trạng thái (mức) thì bên gửi phải tự xóa đúng lúc.`,
      },
      {
        title: '3. Bắt sườn lên trong ladder',
        body: `OT#3 chỉ ON trong 100 ms, nhưng ta cần DO_02 giữ ON cho tới khi người vận hành xóa. Dùng **sườn lên + Set/Reset**:

| Network | Logic |
|---|---|
| 4 | Tiếp điểm sườn lên **P** của DI_12 (bit nhớ phụ \`M_E12\`) → **Set** DO_02, **Set** DO_24 |
| 5 | DI_24 → **Reset** DO_02, **Reset** DO_24 |

- Tiếp điểm P dẫn đúng **một chu kỳ quét** khi toán hạng chuyển 0 → 1. Nó cần một bit nhớ riêng để lưu trạng thái cũ — **mỗi tiếp điểm P một bit nhớ khác nhau**, không dùng chung.
- Nếu không dùng sườn mà dùng tiếp điểm thường DI_12 + Set thì vẫn chạy được ở đây, nhưng thói quen bắt sườn giúp tránh lỗi khi tín hiệu kéo dài (ví dụ đếm vật, đảo trạng thái).
- DI_24 là công tắc gạt: sau khi xóa xong phải gạt về OFF, nếu không Reset luôn thắng và DO_02 không bật lại được.

Giữ nguyên các network băng tải của R04.`,
      },
      {
        title: '4. Chương trình robot (Yêu cầu 1.2)',
        body: `| Dòng | Lệnh | Giải thích |
|---|---|---|
| 1 | \`*LB1\` | Đầu vòng lặp |
| 2 | \`MOVJ P000 VJ=10.00\` | Về điểm chờ |
| 3 | \`WAIT IN#(1)=ON\` | Có vật trên băng tải |
| 4 | \`WAIT IN#(2)=OFF\` | Khe thả trống |
| 5 | \`MOVJ P001 VJ=10.00\` | Trên điểm gắp |
| 6 | \`MOVL P002 V=20.0 PL=0\` | Xuống điểm gắp |
| 7 | \`DOUT OT#(1) ON\` + \`TIMER T=0.20\` | Hút vật |
| 8 | \`MOVL P001 V=50.0\` → \`MOVJ P003 VJ=10.00\` | Nhấc lên, tới điểm trung gian cao |
| 9 | \`MOVJ P004\` → \`MOVL P005 V=20.0 PL=0\` | Xuống điểm thả trên mâm |
| 10 | \`DOUT OT#(1) OFF\` + \`TIMER T=0.20\` | Nhả vật |
| 11 | \`MOVL P004\` → \`MOVJ P003\` | Rời mâm |
| 12 | \`PULSE OT#(3) T=0.10\` | Báo MC |
| 13 | \`JUMP *LB1\` | Lặp lại |

Dạy 6 điểm P000–P005 **trên trạm Mechatro** (khác trạm MotoMINI), kiểm tra bằng FWD ở tốc độ LOW/MED trước khi chạy PLAY.`,
      },
      {
        title: '5. Lỗi thường gặp',
        body: `- **Robot đặt chồng lên vật đang nằm trên mâm**: quên kiểm tra IN#2, hoặc ladder không giữ DO_02.
- **DO_02 không bao giờ bật**: robot báo OT#3 trước khi MC kịp thấy (xung quá ngắn) — giữ 100 ms là đủ vì chu kỳ quét MC chỉ vài ms; hoặc nhầm số OT#.
- **Băng tải chạy lại khi robot đang nhấc vật**: vật kế tiếp đâm vào vật đang treo. Ở R09 sẽ thêm trễ sau khi cảm biến hết bị chắn.
- **Robot gắp hụt**: điểm P002 dạy khi vật chưa dừng hẳn tại cảm biến; hãy dạy khi vật đã đứng yên ở vị trí gắp.`,
      },
    ],
    quiz: [
      { q: 'Robot nên bắt đầu gắp khi nào?', options: ['IN#1 ON', 'IN#1 ON và IN#2 OFF', 'IN#2 ON', 'Ngay khi nhấn START'], answer: 1, explain: 'Phải có vật để gắp (IN#1) và khe thả trên mâm đang trống (IN#2 OFF).' },
      { q: 'Vì sao robot phải nhấc lên P003 rồi mới phát xung OT#3?', options: ['Để tiết kiệm năng lượng', 'Để mâm xoay quay không va vào dụng cụ', 'Vì PULSE chỉ chạy khi robot đứng yên', 'Không cần thiết'], answer: 1, explain: 'OT#3 là tín hiệu cho MC quay mâm; dụng cụ phải rời vùng mâm trước.' },
      { q: 'Tiếp điểm sườn lên P trong ladder dẫn điện…', options: ['Suốt thời gian toán hạng = 1', 'Đúng một chu kỳ quét khi toán hạng chuyển 0 → 1', 'Khi toán hạng chuyển 1 → 0', 'Sau 100 ms'], answer: 1, explain: 'Sườn lên chỉ tạo xung một chu kỳ quét; cần bit nhớ riêng để so với trạng thái cũ.' },
      { q: 'OT#3 chỉ ON 100 ms. Để DO_02 giữ ON tới khi người vận hành xóa, ta dùng…', options: ['Cuộn dây thường DO_02', 'Cuộn Set DO_02, xóa bằng Reset khi DI_24 = 1', 'Timer TOF 100 ms', 'Không làm được'], answer: 1, explain: 'Set chốt trạng thái; Reset xóa khi có tín hiệu từ người vận hành.' },
      { q: 'Lệnh robot báo cho MC bằng xung 100 ms là…', options: ['DOUT OT#(3) ON', 'PULSE OT#(3) T=0.10', 'WAIT OT#(3)=ON', 'TIMER T=0.10'], answer: 1, explain: 'PULSE xuất xung có độ dài T giây rồi tự tắt.' },
    ],
  },

  R06: {
    durationMin: 45,
    outcomes: [
      { code: 'R06.1', text: 'Giải thích mô hình client–server UDP của High-Speed Ethernet Server (cổng 10040) trên YRC1000micro.' },
      { code: 'R06.2', text: 'Điền đúng các trường header 32 byte và phần dữ liệu cho lệnh bật/tắt servo và chạy job.' },
      { code: 'R06.3', text: 'Cấu hình 218IFD (UDP, BIN, no-protocol) và dùng MSG_SNDE gửi khung từ ladder.' },
      { code: 'R06.4', text: 'Đọc phản hồi và mã trạng thái để tìm lỗi.' },
    ],
    sections: [
      {
        title: '1. High-Speed Ethernet Server',
        body: `Ngoài I/O, robot YRC1000micro có thể nhận lệnh qua Ethernet bằng giao thức **High-Speed Ethernet Server (HSE)**:

- Robot là **server**, lắng nghe **UDP cổng 10040**, IP **192.168.1.11** (trạm 1; phần cứng thật là 192.168.1.1x theo số trạm).
- MC MP3300 là **client** (IP 192.168.1.1), gửi khung yêu cầu; robot trả khung phản hồi.
- Lệnh điều khiển (bật servo, chạy job…) chỉ được chấp nhận khi chìa khóa pendant ở **REMOTE**.

Ưu điểm so với I/O: một đường cáp mang được nhiều loại lệnh (đọc trạng thái, đọc vị trí, đọc/ghi biến, bật servo, chọn và chạy job, di chuyển). Nhược điểm: phải tự đóng gói đúng từng byte.`,
      },
      {
        title: '2. Cấu hình 218IFD',
        body: `Trong Module Configuration → **218IFD**:

| Mục | Giá trị |
|---|---|
| IP của MC | 192.168.1.1, mask 255.255.255.0 |
| Kênh (CH) | 1 |
| IP thiết bị kia (robot) | 192.168.1.11 |
| Cổng thiết bị kia | **10040** |
| Connect type | **UDP** |
| Code | **BIN** (nhị phân) |
| Communication protocol | **None** (giao thức tự do) |

Trên MC thật, cấu hình 218IFD chỉ có hiệu lực sau khi **Save to Flash** và tắt–bật lại nguồn MC. Trong mô phỏng, sai một mục (ví dụ protocol khác None) sẽ hiện lỗi ở tab "Giám sát mạng".`,
      },
      {
        title: '3. Cấu trúc khung yêu cầu',
        body: `Khung = **header 32 byte + phần dữ liệu**, mọi số đều **little-endian** (byte thấp gửi trước).

| Byte | Trường | Kiểu | Giá trị |
|---|---|---|---|
| 0–3 | Identifier | L | "YERC" = **0x43524559** |
| 4–5 | Header size | W | **0x20** (32) |
| 6–7 | Data size | W | số byte phần dữ liệu (ở đây **4**) |
| 8 | Reserve 1 | B | **3** |
| 9 | Processing division | B | **1** (điều khiển robot) |
| 10 | ACK | B | **0** = yêu cầu |
| 11 | Request ID | B | số thứ tự tự chọn, phản hồi trả lại đúng số này |
| 12–15 | Block No | L | 0 |
| 16–23 | Reserve 2 | 8 ký tự | "99999999" = 0x3939393939393939 |
| 24–25 | Command No | W | mã lệnh |
| 26–27 | Instance | W | |
| 28 | Attribute | B | |
| 29 | Service | B | |
| 30–31 | Padding | W | 0 |
| 32… | Data | | phần dữ liệu |

Ghép theo word như bảng của bài thí nghiệm: Reserve 1 + Processing division = **0x0103**; Attribute + Service = **0x1001** (attribute 1, service 0x10 = Set_Attribute_Single).`,
      },
      {
        title: '4. Ba khung lệnh của bài',
        body: `| Trường | Bật servo | Tắt servo | Chạy job |
|---|---|---|---|
| Identifier | 0x43524559 | 0x43524559 | 0x43524559 |
| Header size | 0x20 | 0x20 | 0x20 |
| Data size | 0x04 | 0x04 | 0x04 |
| Reserve 1 + Division | 0x0103 | 0x0103 | 0x0103 |
| Block No | 0 | 0 | 0 |
| Reserve 2 | 0x3939393939393939 | 0x3939393939393939 | 0x3939393939393939 |
| Command No | **0x83** | **0x83** | **0x86** |
| Instance | **2** | **2** | **1** |
| Attribute + Service | 0x1001 | 0x1001 | 0x1001 |
| Padding | 0 | 0 | 0 |
| Data | **1** | **2** | **1** |

- Lệnh 0x83 (HOLD / SERVO ON-OFF): instance 1 = HOLD, **2 = SERVO**; dữ liệu 1 = ON, 2 = OFF.
- Lệnh 0x86 (START UP — chạy job): dữ liệu = 1, chạy job đang được chọn. Robot phải đang bật servo.

Tổng kích thước = 32 + 4 = **36 byte = 18 word** → tham số SIZE (DATA_SIZE) = **18**.`,
      },
      {
        title: '5. Khung lệnh trong DB và hàm MSG_SNDE',
        body: `Mô phỏng đã tạo sẵn 3 DB theo struct header: **"Servo_On"**, **"Servo_Off"**, **"Job_Start"**. Các trường:

| Trường DB | Kiểu | Nội dung |
|---|---|---|
| Identifier | DInt | 16#43524559 |
| HeaderSize / DataSize | Word | 16#20 / 4 |
| Reserve1_Div | Word | 16#0103 |
| Ack_ReqID | Word | ACK (byte thấp) + Request ID (byte cao), thường 0 |
| BlockNo | DInt | 0 |
| Reserve2_L / Reserve2_H | DInt | 16#39393939 / 16#39393939 |
| CommandNo / Instance | Word | 16#83, 2 … |
| Attr_Service / Padding | Word | 16#1001 / 0 |
| Data | DInt | 1 hoặc 2 |

### Hộp MSG_SNDE
- **Dòng công suất vào = Execute**: sườn lên bắt đầu gửi.
- **DATA**: DB chứa khung (vd. "Servo_On"); **SIZE**: số word (18); **CH**: kênh 218IFD (1).
- Ngõ ra **Complete** (một chu kỳ khi gửi xong), **Busy**, **Error**.

Gửi xong (Complete) hoặc lỗi (Error) phải **reset Execute về 0**, nếu không lần nhấn sau không có sườn lên mới. Nút Robot ON dùng một bit đảo trạng thái (toggle bằng sườn lên) để chọn gửi Servo_On hay Servo_Off.`,
      },
      {
        title: '6. Phản hồi và mã lỗi',
        body: `Robot trả khung phản hồi có ACK = 1, cùng Request ID, byte 25 = **status** (0 = OK) và word 28–29 = **added status** (mã chi tiết). Xem ở tab "Giám sát mạng".

| Added status | Ý nghĩa (mô phỏng) |
|---|---|
| 0x0000 | OK |
| 0x1010 / 0x1011 | Command No / Instance không hợp lệ |
| 0x1014 / 0x1015 | Sai kích thước / giá trị dữ liệu |
| 0x2010 | Robot đang chạy chương trình |
| 0x2060 | Chưa ở chế độ REMOTE |
| 0x2070 | Servo chưa bật (khi gửi lệnh chạy job) |
| 0x2080 | Đang có báo động / dừng khẩn |
| 0x2090 | Không có job |
| 0xA000 | Header sai (định danh, kích thước, reserve) |

Gỡ lỗi từ dưới lên: có khung đi ra không (kênh, IP, cổng) → header có bị báo sai không → mã added status nói gì.`,
      },
    ],
    quiz: [
      { q: 'Trường Identifier của header HSE có giá trị (đọc dạng L little-endian) là…', options: ['0x59455243', '0x43524559', '0x39393939', '0x00000020'], answer: 1, explain: 'Bốn ký tự "YERC" = 59 45 52 43; đọc little-endian thành 0x43524559.' },
      { q: 'Header size bằng bao nhiêu?', options: ['0x10', '0x20', '0x24', '0x04'], answer: 1, explain: 'Header luôn dài 32 byte = 0x20.' },
      { q: 'Khung tắt servo khác khung bật servo ở trường nào?', options: ['Command No', 'Instance', 'Data (1 → 2)', 'Attribute + Service'], answer: 2, explain: 'Cùng lệnh 0x83, instance 2; dữ liệu 1 = ON, 2 = OFF.' },
      { q: 'Command No và Instance của lệnh chạy job là…', options: ['0x83 / 2', '0x86 / 1', '0x87 / 1', '0x86 / 2'], answer: 1, explain: 'Lệnh 0x86 (start-up), instance 1, dữ liệu 1.' },
      { q: 'Khung gồm header 32 byte và 4 byte dữ liệu. Tham số SIZE của MSG_SNDE là…', options: ['36', '32', '18', '16'], answer: 2, explain: 'SIZE tính bằng word: 36 byte = 18 word.' },
      { q: 'Robot trả added status 0x2060. Nguyên nhân?', options: ['Sai cổng UDP', 'Pendant chưa ở chế độ REMOTE', 'Servo chưa bật', 'Header sai'], answer: 1, explain: 'Lệnh điều khiển qua Ethernet chỉ được chấp nhận ở chế độ REMOTE.' },
    ],
  },

  /* ======================= PHẦN 3 — SERVO VÀ HỆ LUÂN CHUYỂN ======================= */
  R07: {
    durationMin: 45,
    outcomes: [
      { code: 'R07.1', text: 'Cấu hình trục servo: đơn vị tham chiếu, Fixed / Setting parameter, tham số về gốc.' },
      { code: 'R07.2', text: 'Mô tả trình tự về gốc kiểu 19 (chỉ dùng tín hiệu zero) và lý do phải về gốc sau khi cấp điện.' },
      { code: 'R07.3', text: 'Viết chương trình Motion: VAR, ZRN, MOV, ABS/INC, IOW, WHILE, TIM.' },
      { code: 'R07.4', text: 'Gọi chương trình motion bằng MSEE; bật servo, giám sát và reset lỗi CPU / trục / chương trình.' },
    ],
    sections: [
      {
        title: '1. Trục servo và tham số',
        body: `Trong MPE720, mỗi servopack trên MECHATROLINK là một trục của module SVC. Mô phỏng đặt tên trục là **A1** (mâm xoay), **B1** (thanh trượt ngang), **C1** (thanh trượt đứng).

### Fixed parameter (cố định, cần lưu Flash và khởi động lại trên MC thật)
| Tham số | Ý nghĩa |
|---|---|
| Reference unit | Đơn vị: deg, mm… |
| Number of digits below decimal point | Số chữ số thập phân. **1 → đơn vị tham chiếu 0,1 mm / 0,1°** |
| Travel distance per machine rotation | Quãng đi được mỗi vòng quay của cơ cấu |
| Servo motor / machine gear ratio | Tỉ số truyền |
| Positive / Negative software limit | Giới hạn mềm |
| Encoder selection | Tuyệt đối hay tương đối (lab dùng tương đối) |

### Setting parameter (đặt khi chạy)
Đơn vị tốc độ (đơn vị tham chiếu/giây), đơn vị gia tốc, tốc độ định vị, tham số về gốc (Creep Speed, Speed Reference, Travel Distance, Input Signal).

**Đơn vị tham chiếu** là số nguyên trong chương trình motion: với 1 chữ số thập phân, \`MOV [A1]900;\` nghĩa là **90,0°**, \`[B1]-2170\` nghĩa là **−217,0 mm**.`,
      },
      {
        title: '2. Về gốc kiểu 19',
        body: `Encoder tương đối: khi vừa cấp điện, servo coi **vị trí hiện tại là 0** — một vị trí ngẫu nhiên. Vì vậy mỗi lần bật nguồn phải **về gốc (zero point return, ZRN)** để gắn gốc tọa độ với một điểm cố định trên máy.

MP3300 có nhiều kiểu về gốc; với cách đấu cảm biến của lab chỉ dùng được **kiểu 19 — chỉ dùng tín hiệu zero input**:

1. Trục chạy với tốc độ **Creep Speed** về một hướng.
2. Gặp **sườn lên** của tín hiệu zero (Input Signal) → chuyển sang tốc độ **Speed Reference**, đi thêm quãng **Travel Distance**.
3. Điểm dừng = **gốc 0**; cờ ZeroDone bật.

### Tham số trục A1 trong mô phỏng
| Tham số | Giá trị |
|---|---|
| Creep Speed | 50 °/s |
| Speed Reference | 50 °/s |
| Travel Distance | **0** (bài gốc dùng 360°; trong mô phỏng đặt 0 để gốc nằm ngay tại cảm biến) |
| Input Signal | **DI_10** (HOME_A) |

Nếu quay hết hai vòng mà không gặp tín hiệu, trục báo lỗi 0x06 "về gốc thất bại" — kiểm tra lại Input Signal.`,
      },
      {
        title: '3. Ngôn ngữ Motion',
        body: `Cấu trúc chương trình: phần khai báo \`VAR;\` … \`END_VAR;\`, thân chương trình, kết thúc bằng \`END;\`. Mỗi câu lệnh kết thúc bằng **dấu chấm phẩy**; chú thích sau \`//\`. Khai báo biến: \`GL00100 PosCUp;\` (thanh ghi rồi tên).

| Lệnh | Ví dụ | Tác dụng |
|---|---|---|
| ZRN | \`ZRN [A1]0;\` | Về gốc (giá trị bắt buộc là 0); nhiều trục cùng lúc: \`ZRN [B1]0 [C1]0;\` |
| ABS / INC | \`ABS;\` / \`INC;\` | Chế độ tọa độ tuyệt đối (mặc định) / tương đối cho các lệnh MOV sau đó |
| MOV | \`MOV [A1]900;\` | Định vị tới đích (ABS) hoặc đi thêm (INC); các trục bắt đầu cùng lúc, mỗi trục chạy tốc độ riêng |
| MVS | \`MVS [B1]-2000 [C1]-300 F6000;\` | Nội suy thẳng: các trục bắt đầu **và kết thúc** cùng lúc; F = đơn vị tham chiếu/phút |
| TIM / TIM1MS | \`TIM T50;\` / \`TIM1MS T250;\` | Chờ 50 × 10 ms / 250 ms |
| IOW | \`IOW DI_12 == 1;\` | Chờ tới khi điều kiện đúng |
| WHILE … WEND | \`WHILE SB1 == 1;\` … \`WEND;\` | Lặp khi điều kiện đúng (SB1 luôn = 1 → lặp mãi) |
| IF … ELSE … IEND | \`IF GL00010 == 1;\` … \`IEND;\` | Rẽ nhánh |
| Gán | \`PosCUp = -300;\` | Ghi biến / thanh ghi / tag |

MOV và ZRN chờ trục tới đích rồi mới chạy lệnh sau. Ví dụ MPM002 quay mâm 90° mỗi lần robot báo:
1. \`INC;\`
2. \`WHILE SB1 == 1;\`
3. \`IOW DI_12 == 1;\` — chờ robot báo
4. \`MOV [A1]900;\` — quay thêm 90°
5. \`IOW DI_12 == 0;\` — chờ xung kết thúc, tránh quay hai lần
6. \`WEND;\` rồi \`END;\``,
      },
      {
        title: '4. Gọi chương trình motion bằng MSEE',
        body: `Chương trình motion **không tự chạy**: ladder phải gọi nó bằng hộp **MSEE** với hai tham số:
- **PROG**: số chương trình, ví dụ \`MPM001\`.
- **DATA**: DB chứa struct điều khiển/giám sát, ví dụ **"CallM1"** (cho MPM001), **"CallM2"** (cho MPM002) — đã có sẵn.

| Trường | Loại | Ý nghĩa |
|---|---|---|
| Run | Điều khiển | Sườn lên: chạy từ đầu |
| Pause | Điều khiển | 1: tạm dừng, 0: chạy tiếp |
| Stop | Điều khiển | Sườn lên: dừng hẳn (SystemPause bật) |
| AlarmReset | Điều khiển | Sườn lên: xóa lỗi chương trình |
| Running / Paused | Trạng thái | Đang chạy / đang tạm dừng |
| Alarm | Trạng thái | Chương trình lỗi (vd. MOV khi servo tắt) |
| Done | Trạng thái | Đã chạy tới END |
| SystemPause | Trạng thái | Bị buộc dừng bởi Stop |

**Quan trọng**: chương trình motion chỉ chạy khi MSEE **được quét mỗi chu kỳ**. Đặt MSEE trên một nhánh luôn có dòng (ví dụ sau tiếp điểm "CPU".AlwaysOn), điều khiển chạy/dừng bằng các bit Run/Stop — **không** đặt MSEE sau một tiếp điểm có thể tắt, nếu không chương trình bị dừng giữa chừng.`,
      },
      {
        title: '5. Servo ON, lỗi và reset',
        body: `Mỗi trục là một DB hệ thống trong ladder: **"A1"**, **"B1"**, **"C1"**.

| Trường | Ý nghĩa |
|---|---|
| ServoOn | Ghi 1 để bật servo |
| AlarmClear | Sườn lên: xóa lỗi trục |
| Running | Servo đang bật |
| ZeroDone | Đã về gốc |
| Busy | Đang chuyển động |
| Alarm | Mã lỗi trục, 0 = không lỗi |
| Warning | Cảnh báo (giới hạn mềm) |
| Pos | Vị trí hiện tại (mm / độ) |

CPU: **"CPU".Alarm** (SB402), **"CPU".Error** (SB403), **"CPU".AlwaysOn** (SB1).

### Mã lỗi trục trong mô phỏng
| Mã | Nguyên nhân |
|---|---|
| 0x01 | Có lệnh chuyển động khi servo chưa bật |
| 0x02 / 0x03 | Vượt giới hạn mềm dương / âm |
| 0x04 / 0x05 | Chạm cảm biến hành trình P-OT / N-OT |
| 0x06 | Về gốc thất bại |

### Yêu cầu 1.3
- Servo ON (DI_02) đảo trạng thái một bit nhớ → ghi vào "A1".ServoOn, "B1".ServoOn, "C1".ServoOn; đèn DO_16..18 lấy từ các bit **Running**.
- Lỗi tổng = "CPU".Alarm hoặc "CPU".Error hoặc "CallM2".Alarm hoặc "A1".Alarm ≠ 0 … → DO_19 **nhấp nháy** (hai TON nối vòng tạo xung 0,5 s).
- Reset: sườn lên nút → "A1".AlarmClear và "CallM2".AlarmReset.`,
      },
    ],
    quiz: [
      { q: 'Trục A1 có 1 chữ số thập phân (đơn vị 0,1°). Lệnh INC; MOV [A1]900; làm mâm…', options: ['Quay tới góc 900°', 'Quay thêm 90°', 'Quay thêm 9°', 'Quay về 90°'], answer: 1, explain: '900 đơn vị tham chiếu × 0,1° = 90°; INC nghĩa là đi thêm so với vị trí hiện tại.' },
      { q: 'Vì sao phải về gốc mỗi lần cấp điện cho servopack trong lab?', options: ['Để nạp lại chương trình', 'Encoder tương đối coi vị trí lúc bật nguồn là 0 (ngẫu nhiên)', 'Để kiểm tra cảm biến', 'Do MC yêu cầu Save to Flash'], answer: 1, explain: 'Với encoder tương đối, gốc tọa độ phải được xác định lại bằng cảm biến sau mỗi lần cấp điện.' },
      { q: 'Về gốc kiểu 19: trục chuyển từ Creep Speed sang Speed Reference khi…', options: ['Hết Travel Distance', 'Gặp sườn lên của tín hiệu zero input', 'Chạm P-OT', 'Có lệnh MOV'], answer: 1, explain: 'Sườn lên tín hiệu zero là mốc; sau đó trục đi thêm Travel Distance rồi đặt gốc.' },
      { q: 'Khác nhau giữa MOV và MVS?', options: ['MOV chỉ cho một trục', 'MVS: các trục bắt đầu và kết thúc cùng lúc (nội suy); MOV chỉ bắt đầu cùng lúc', 'MVS nhanh hơn MOV', 'Không khác nhau'], answer: 1, explain: 'MVS nội suy thẳng với tốc độ F; MOV định vị từng trục độc lập.' },
      { q: 'Chương trình MPM002 tự dừng ngay sau khi chạy. Nguyên nhân hay gặp nhất?', options: ['Thiếu END', 'MSEE đặt sau tiếp điểm có thể tắt nên không được quét mỗi chu kỳ', 'Sai đơn vị tham chiếu', 'Thiếu ABS'], answer: 1, explain: 'Chương trình motion chỉ chạy khi MSEE được quét mỗi chu kỳ.' },
      { q: 'Trường nào của struct MSEE báo chương trình motion đang lỗi?', options: ['Running', 'Done', 'Alarm', 'Pause'], answer: 2, explain: 'Status.Alarm = 1 khi chương trình lỗi; xóa bằng sườn lên AlarmReset.' },
    ],
  },

  R08: {
    durationMin: 45,
    outcomes: [
      { code: 'R08.1', text: 'Giải thích vai trò cảm biến hành trình (overtravel) và giới hạn mềm; cài giới hạn mềm cho B1, C1.' },
      { code: 'R08.2', text: 'Về gốc nhiều trục theo thứ tự an toàn (C trước B).' },
      { code: 'R08.3', text: 'Tìm tọa độ bằng Test Run (jog) và lưu vào thanh ghi GL; viết chuỗi chuyển động phối hợp mâm xoay + thanh trượt.' },
      { code: 'R08.4', text: 'Điều khiển chạy / dừng / tạm dừng chương trình motion và xử lý lỗi từ ladder.' },
    ],
    sections: [
      {
        title: '1. Giới hạn hành trình: overtravel và giới hạn mềm',
        body: `Mâm xoay quay vô hạn, nhưng thanh trượt B, C có hành trình hữu hạn. Hai lớp bảo vệ:

1. **Cảm biến hành trình P-OT / N-OT**: công tắc ở hai đầu hành trình. Trục chạm cảm biến thì dừng.
2. **Giới hạn mềm (software limit)**: hai giá trị vị trí dương/âm trong tham số trục. Khi lệnh MOV có đích vượt giới hạn, trục **giảm tốc và dừng đúng tại giới hạn**, báo cảnh báo.

Khi dùng cả hai, giới hạn mềm phải nằm **bên trong** vùng cảm biến OT (|soft limit| < |vị trí OT|), để giới hạn mềm tác động trước.

### Giá trị trong mô phỏng
| Trục | Positive soft limit | Negative soft limit |
|---|---|---|
| B1 | +1 mm | −280 mm |
| C1 | +1 mm | **−110 mm** |

Lưu ý mô phỏng: giới hạn mềm chỉ có hiệu lực **sau khi trục đã về gốc** (trước đó tọa độ chưa có nghĩa). Chạm giới hạn mềm khi đang chạy chương trình motion → chương trình báo lỗi "chạm giới hạn mềm". Chạm cảm biến OT → trục báo lỗi 0x04 / 0x05 và dừng. Ở lab thật, cảm biến OT nối vào MC chứ không vào servopack nên bài gốc chỉ dùng giới hạn mềm.`,
      },
      {
        title: '2. Về gốc nhiều trục',
        body: `### Tham số về gốc B1, C1 (kiểu 19)
| Tham số | B1 | C1 |
|---|---|---|
| Creep Speed | 20 mm/s | 20 mm/s |
| Speed Reference | 20 mm/s | 20 mm/s |
| Travel Distance | 0 | 0 |
| Input Signal | **DI_06** (HOME_B) | **DI_09** (HOME_C) |

Mô phỏng có cảm biến HOME riêng cho từng trục; bài gốc trên phần cứng thật mượn cảm biến hành trình làm tín hiệu zero.

### Thứ tự an toàn
Trục đứng C mang nam châm có thể đang hạ thấp, va vào mâm hoặc thùng nếu B chạy ngang. Vì vậy **luôn về gốc C trước, rồi mới tới B**:
1. \`ZRN [C1]0;\`
2. \`ZRN [B1]0;\`
3. \`ZRN [A1]0;\`

Không viết \`ZRN [B1]0 [C1]0;\` (chạy đồng thời) cho hệ này. Báo về gốc xong: "B1".ZeroDone → DO_25, "C1".ZeroDone → DO_26.

Quy tắc này áp dụng cho **mọi** chuyển động: nâng C lên cao an toàn trước khi di chuyển B.`,
      },
      {
        title: '3. Tìm tọa độ bằng Test Run',
        body: `Các tọa độ của thanh trượt được lưu trong thanh ghi để dễ chỉnh mà không sửa chương trình:

| Thanh ghi | Ý nghĩa |
|---|---|
| GL100 | C ở cao độ an toàn |
| GL102 | C hạ chạm vật trên mâm |
| GL104 | C hạ để thả vật vào thùng |
| GL200 | B ở trên khe lấy vật của mâm |
| GL202 | B ở trên thùng |

Cách tìm:
1. Bật servo, về gốc cả 3 trục.
2. Chuyển MC sang **STOP**, mở tab **Test Run**, chọn trục B1 hoặc C1.
3. Jog Forward / Backward với tốc độ **không quá 10 mm/s**; đọc vị trí hiện tại.
4. **Luôn đưa C lên cao trước khi jog B.**
5. Ghi giá trị vào chương trình theo **đơn vị tham chiếu 0,1 mm**: vị trí −217,0 mm → \`-2170\`.

Gán trong chương trình motion: khai báo \`GL00100 CUp;\` trong VAR, rồi \`CUp = -300;\` ở đầu thân chương trình.`,
      },
      {
        title: '4. Chuỗi chuyển động MPM002',
        body: `| Bước | Lệnh motion (ABS) | Ý nghĩa |
|---|---|---|
| 1 | \`MOV [C1]CUp;\` rồi \`MOV [B1]BRot;\` | Nâng C, đưa B về trên mâm |
| 2 | \`WHILE SB1 == 1;\` | Lặp mãi |
| 3 | \`IOW DI_12 == 1;\` | Chờ robot đặt vật (hoặc chờ bit chốt, xem dưới) |
| 4 | \`INC; MOV [A1]900; ABS;\` | Mâm quay 90° |
| 5 | \`MOV [C1]CPick;\` \`DO_05 = 1;\` \`TIM T20;\` \`MOV [C1]CUp;\` | Hạ C, bật MAG2, nâng lên |
| 6 | \`MOV [B1]BBin;\` | B sang trên thùng |
| 7 | \`MOV [C1]CDrop;\` \`DO_05 = 0;\` \`TIM T20;\` \`MOV [C1]CUp;\` | Hạ, nhả vật, nâng lên |
| 8 | \`MOV [B1]BRot;\` | B về trên mâm |
| 9 | \`WEND;\` \`END;\` | |

### Không bỏ lỡ tín hiệu robot
Robot chỉ báo DI_12 trong 100 ms. Nếu lúc đó MPM002 đang bận ở bước 5–8, IOW sẽ không thấy. Giải pháp: ladder **chốt sườn lên DI_12** vào một bit (ví dụ \`M_Placed\`); motion chờ \`IOW M_Placed == 1;\` rồi tự xóa \`M_Placed = 0;\`.

### Điều khiển từ ladder
- DI_24: chạy MPM001 (về gốc) qua "CallM1".Run.
- DI_25 ON → sườn lên "CallM2".Run; DI_25 OFF → "CallM2".Stop.
- DI_26 → "CallM2".Pause (1 tạm dừng trục đang chạy, 0 chạy tiếp).
- Có lỗi → DO_19 nhấp nháy; sườn lên DI_31 → AlarmClear các trục và AlarmReset chương trình.`,
      },
      {
        title: '5. Lỗi thường gặp',
        body: `| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Chương trình báo lỗi ở lệnh MOV đầu tiên | Servo chưa bật (lỗi 0x01) — bật servo trước khi Run |
| Trục dừng giữa đường, có cảnh báo | Đích vượt giới hạn mềm — kiểm tra dấu và đơn vị (mm hay 0,1 mm) |
| Nam châm C va vào mâm khi B chạy | Di chuyển B khi C chưa lên GL100 |
| Mâm quay hai lần cho một vật | Chờ DI_12 = 1 nhưng không chờ nó về 0 / không xóa bit chốt |
| Mâm không quay khi robot báo | MPM002 đang bận, bỏ lỡ xung 100 ms — chốt DI_12 trong ladder |
| Vật rơi khỏi nam châm | Không chờ (TIM) sau khi bật/tắt MAG2 |`,
      },
    ],
    quiz: [
      { q: 'Khi dùng cả cảm biến OT và giới hạn mềm, giới hạn mềm phải đặt…', options: ['Bên ngoài vị trí cảm biến OT', 'Bên trong vùng giới hạn bởi cảm biến OT', 'Trùng vị trí cảm biến OT', 'Tùy ý'], answer: 1, explain: '|soft limit| < |vị trí OT| để giới hạn mềm tác động trước cảm biến cứng.' },
      { q: 'Lệnh MOV có đích vượt giới hạn mềm thì trục…', options: ['Chạy tới đích rồi báo lỗi', 'Giảm tốc và dừng tại giới hạn mềm, báo cảnh báo', 'Không chạy và mất gốc', 'Chạy ngược chiều'], answer: 1, explain: 'Trục dừng đúng tại giới hạn mềm và bật cảnh báo.' },
      { q: 'Thứ tự về gốc an toàn cho hệ thanh trượt là…', options: ['B trước, C sau', 'C (trục đứng) trước, B sau', 'B và C đồng thời', 'Không quan trọng'], answer: 1, explain: 'Trục đứng phải lên vị trí an toàn trước khi trục ngang di chuyển.' },
      { q: 'Vị trí đọc được trong Test Run là −217,0 mm. Giá trị ghi vào GL202 (đơn vị tham chiếu 0,1 mm) là…', options: ['-217', '-2170', '-21700', '2170'], answer: 1, explain: '−217,0 mm ÷ 0,1 mm = −2170.' },
      { q: 'Muốn tạm dừng MPM002 rồi chạy tiếp từ chỗ dừng, dùng trường nào của "CallM2"?', options: ['Stop', 'Pause', 'AlarmReset', 'Run'], answer: 1, explain: 'Pause = 1 tạm dừng, = 0 chạy tiếp; Stop là dừng hẳn, Run chạy lại từ đầu.' },
    ],
  },

  R09: {
    durationMin: 40,
    outcomes: [
      { code: 'R09.1', text: 'Tích hợp robot, băng tải, mâm xoay và thanh trượt thành một hệ luân chuyển vật tự động.' },
      { code: 'R09.2', text: 'Thiết kế trình tự khởi động, dừng và xử lý lỗi cho cả hệ.' },
      { code: 'R09.3', text: 'Đo và tối ưu thời gian chu kỳ bằng cách chạy song song các cơ cấu.' },
      { code: 'R09.4', text: 'Chẩn đoán các lỗi tích hợp thường gặp (va chạm, chồng vật, mất tín hiệu).' },
    ],
    sections: [
      {
        title: '1. Kiến trúc hệ thống',
        body: `| Thiết bị | Bộ điều khiển | Chương trình |
|---|---|---|
| Băng tải | MC (DO_00 → J1000) | Ladder |
| Robot MotoMINI | YRC1000micro | Job INFORM (như R05) |
| Mâm xoay A1, thanh trượt B1/C1 | MC qua MECHATROLINK | Motion MPM001 (về gốc), MPM002 (chu trình) |
| Nút, công tắc, đèn | MC | Ladder |

Tín hiệu giữa các khối:
- MC → robot: DO_01 (IN#1, có vật để gắp), DO_02 (IN#2, khe mâm bận).
- Robot → MC: OT#3 (DI_12, đã đặt vật).
- MC → robot qua Ethernet (tùy chọn): bật servo, chạy job.
- Ladder ↔ motion: bit chốt DI_12, struct MSEE "CallM1", "CallM2", trạng thái trục "A1"/"B1"/"C1".

Hãy vẽ **sơ đồ tín hiệu** và **lưu đồ** cho từng chương trình trước khi viết code — đây cũng là phần chính của báo cáo.`,
      },
      {
        title: '2. Trình tự khởi động và dừng',
        body: `### Khởi động
1. Nhấn **Servo ON** (DI_02) → cả 3 servo bật (đèn DO_16..18).
2. Bật **DI_24** → MPM001 về gốc C → B → A; chờ DO_24..26 báo xong.
3. Bật **DI_25** → MPM002 chạy, thanh trượt về vị trí chờ.
4. Nhấn **START** → băng tải chạy.
5. Robot: PLAY + SERVO ON READY + START (hoặc gửi lệnh qua Ethernet ở REMOTE).

### Dừng
- **STOP**: băng tải dừng ngay; robot và thanh trượt làm nốt vật đang cầm rồi chờ (không có vật mới nên tự dừng ở trạng thái chờ).
- Lỗi bất kỳ (CPU, trục, chương trình motion, robot báo động) → DO_19 nhấp nháy, xử lý xong mới reset.
- E-STOP robot hoặc tắt servo MC khi đang chạy sẽ làm chương trình motion lỗi — sau khi khắc phục phải reset và thường phải về gốc lại.`,
      },
      {
        title: '3. Thời gian chu kỳ và chạy song song',
        body: `**Thời gian chu kỳ** = khoảng thời gian giữa hai vật liên tiếp rơi vào thùng. Mục tiêu tham khảo: **≤ 15 s/vật** (đề chấm: ít nhất 5 vật trong 120 s).

Mâm xoay có 4 khe cách nhau 90°: robot đặt vật ở khe **135°**, thanh trượt lấy vật ở khe **225°**. Sau mỗi lần quay 90°, vật robot vừa đặt chuyển tới vị trí lấy của thanh trượt, và một khe trống về phía robot. Nhờ đó **robot và thanh trượt làm việc song song**:
- Robot gắp vật mới trên băng tải trong khi thanh trượt mang vật trước vào thùng.
- MC chỉ quay mâm khi cả hai bên đã rời vùng mâm.

Cách rút ngắn chu kỳ:
- Tăng tốc độ ở đoạn đi xa (MOVJ, MOV trong vùng trống), giữ tốc độ thấp ở đoạn tiếp cận.
- Bỏ các điểm trung gian thừa; dùng TIMER/TIM vừa đủ để nam châm hút chắc (0,2 s).
- Đo thời gian từng công đoạn để tìm "nút cổ chai" — thường là robot.`,
      },
      {
        title: '4. Lỗi tích hợp thường gặp',
        body: `| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| Vật kế tiếp đâm vào vật robot đang nhấc | Băng tải chạy lại ngay khi DI_11 hết bị chắn | Trễ khoảng 1 s (TON) sau khi DI_11 về 0 rồi mới chạy băng tải |
| Robot đặt chồng lên vật trên mâm | Robot không chờ IN#2 OFF, hoặc MC xóa DO_02 quá sớm | MC chỉ xóa DO_02 sau khi mâm quay xong |
| Vật lệch khe | Mâm chưa về gốc đúng / quay khi robot chưa nhấc lên | Về gốc tại DI_10; robot báo OT#3 sau khi lên P003 |
| Mâm không quay | MPM002 bận, bỏ lỡ xung DI_12 | Chốt sườn DI_12 trong ladder |
| Nam châm C va thùng / mâm | B chạy khi C chưa lên | Luôn MOV C lên GL100 trước khi MOV B |
| Thanh trượt dừng, DO_19 nháy | Chạm giới hạn mềm, servo tắt | Kiểm tra tọa độ GL, reset rồi về gốc lại |
| Robot không nhận lệnh Ethernet | Chưa REMOTE / servo chưa bật | Xem added status ở tab Giám sát mạng |`,
      },
      {
        title: '5. Kiểm thử và báo cáo',
        body: `Kiểm thử theo từng lớp trước khi chạy cả hệ:
1. Ladder băng tải + tín hiệu robot (dùng nút "Lấy vật ở vị trí gắp" giả làm robot).
2. Motion về gốc và chu trình thanh trượt (dùng nút "Giả lập robot đặt vật").
3. Job robot ở TEACH với FWD, rồi PLAY một vật.
4. Cả hệ chạy liên tục ít nhất 5 vật, thử STOP giữa chừng và thử gây lỗi rồi reset.

Báo cáo đồ án gồm: sơ đồ tín hiệu giữa các thiết bị, lưu đồ chương trình robot / ladder / motion, bảng tọa độ GL và điểm P, thời gian chu kỳ đo được, các lỗi đã gặp và cách khắc phục.`,
      },
    ],
    quiz: [
      { q: 'Trình tự khởi động đúng là…', options: ['START băng tải → Servo ON → về gốc', 'Servo ON → về gốc (DI_24) → chạy MPM002 (DI_25) → START băng tải → robot START', 'Robot START → Servo ON → START', 'Về gốc → Servo ON → START'], answer: 1, explain: 'Phải bật servo trước khi về gốc, về gốc trước khi chạy chuyển động, rồi mới cấp vật.' },
      { q: 'Vật kế tiếp trên băng tải đâm vào vật robot đang nhấc. Cách sửa hợp lý?', options: ['Tăng tốc băng tải', 'Trễ khoảng 1 s sau khi DI_11 hết bị chắn rồi mới chạy băng tải', 'Bỏ cảm biến DI_11', 'Cho robot gắp nhanh hơn PL=8'], answer: 1, explain: 'Dùng timer TON để băng tải chỉ chạy lại khi robot đã nhấc vật ra khỏi đường đi.' },
      { q: 'Vì sao robot và thanh trượt có thể làm việc song song?', options: ['Vì dùng hai bộ điều khiển', 'Vì robot đặt ở khe 135° còn thanh trượt lấy ở khe 225° trên mâm 4 khe', 'Vì băng tải chạy liên tục', 'Không thể song song'], answer: 1, explain: 'Hai vị trí làm việc khác nhau trên mâm; mỗi lần quay 90° chuyển vật từ vị trí robot sang vị trí thanh trượt.' },
      { q: 'Nhấn STOP khi hệ đang chạy thì nên…', options: ['Tắt servo tất cả các trục ngay', 'Băng tải dừng ngay, robot và thanh trượt làm nốt vật đang cầm', 'Robot thả vật tại chỗ', 'Reset MC'], answer: 1, explain: 'Dừng có kiểm soát: ngừng cấp vật mới, không bỏ dở vật đang xử lý.' },
      { q: 'Thời gian chu kỳ của hệ được định nghĩa là…', options: ['Thời gian quét ladder', 'Khoảng thời gian giữa hai vật liên tiếp vào thùng', 'Thời gian robot đi từ P000 tới P005', 'Thời gian về gốc'], answer: 1, explain: 'Chu kỳ đo theo sản lượng ở đầu ra của hệ.' },
    ],
  },
};
