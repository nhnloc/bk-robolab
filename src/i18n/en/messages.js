// English for dynamic messages: machine event log (this.log / this.crash), grader checks,
// PLC compile/runtime errors, HMI display labels.
//
// EXACT:    whole message (trimmed) → English.
// PATTERNS: [viTemplate, enTemplate] — {0}, {1}… are parameters captured from the Vietnamese
//           message and re-inserted into the English one (each parameter is itself translated
//           recursively, so nested messages such as "VA CHẠM: <message>" work). More specific
//           templates (more fixed text) are tried first. Tag names, addresses and code stay as captured.

export const EXACT = {
  /* ---- HMI displays / trends (getVisual) ---- */
  'Dòng điện': 'Current',
  'Tốc độ': 'Speed',
  'Áp suất': 'Pressure',
  'Độ mở cửa': 'Door opening',
  'Bảng LED': 'LED display',
  'v/ph': 'rpm',

  /* ---- kit.js ---- */
  'Đã giải trừ va chạm': 'Collision cleared',

  /* ---- motor (L02) ---- */
  'KM1 và KM2 đóng cùng lúc — ngắn mạch 2 pha, CB nhảy': 'KM1 and KM2 closed at the same time — phase-to-phase short circuit, circuit breaker tripped',
  'Đảo chiều khi động cơ còn quay — dòng điện và lực cơ khí rất lớn. Hãy dừng ít nhất 0,5 s trước khi đảo chiều': 'Reversed while the motor was still turning — very high current and mechanical stress. Stop for at least 0.5 s before reversing',
  'Cửa đè lên vật cản dưới chân cửa': 'Door came down onto the obstacle under the door',
  'Rơ-le nhiệt F1 tác động: động cơ quá tải (chạy vào giới hạn cơ khí hoặc bị kẹt)': 'Thermal overload relay F1 tripped: motor overloaded (driven against the mechanical end stop or jammed)',
  'Đã reset rơ-le nhiệt F1': 'Thermal overload relay F1 reset',

  /* ---- stardelta (L03) ---- */
  'KM2 (sao) và KM3 (tam giác) đóng cùng lúc — ngắn mạch 3 pha': 'KM2 (star) and KM3 (delta) closed at the same time — 3-phase short circuit',
  'Đóng thẳng tam giác khi động cơ đứng yên = khởi động trực tiếp: dòng khởi động ~6,5 lần định mức': 'Delta closed with the motor at standstill = direct-on-line start: starting current ~6.5 × rated current',
  'Chạy sao quá 15 s — rơ-le nhiệt F1 tác động': 'Running in star for more than 15 s — thermal overload relay F1 tripped',
  'Quá dòng kéo dài — rơ-le nhiệt F1 tác động': 'Sustained overcurrent — thermal overload relay F1 tripped',
  'Van an toàn xả khí ở 10 bar': 'Safety valve blowing off at 10 bar',

  /* ---- trainer (L01) ---- */
  'Cảm biến NPN đấu vào ngõ vào kiểu sink (1M = 0 V): PLC không nhận được tín hiệu. Đèn trên cảm biến vẫn sáng!': 'NPN sensor wired to a sinking input (1M = 0 V): the PLC does not receive the signal. The LED on the sensor still lights up!',

  /* ---- counter (L04) ---- */
  'Lon rơi xuống sàn — không có thùng dưới máng': 'Can fell on the floor — no case under the chute',

  /* ---- feeder (L07) ---- */
  'Đã nạp đầy ổ chứa': 'Magazine refilled',
  'Đẩy phôi khi xi lanh kẹp 2A chưa giữ chồng phôi: phôi thứ hai bị kéo theo và kẹt': 'Pushed while clamp cylinder 2A was not holding the stack: the second workpiece was dragged along and jammed',
  'Đẩy phôi mới vào phôi trước còn nằm ở đầu băng tải': 'Pushed a new workpiece into the previous one still lying at the start of the conveyor',

  /* ---- escapement (L08) ---- */
  'Hai thùng qua chặn 2 sát nhau — tách thùng không đạt': 'Two cases passed stop 2 back to back — separation failed',

  /* ---- diverter (L09) ---- */
  'Đã dọn các làn': 'Lanes cleared',

  /* ---- erector (L10) ---- */
  'Đã nạp đầy carton': 'Carton blanks loaded',
  'Tay mở 2A quay khi tay hút 1A chưa về — va chạm tay hút': 'Opening arm 2A swung while suction arm 1A was not home — hit the suction arm',
  'Đẩy thùng khi tay mở 2A chưa về': 'Pushed the case while opening arm 2A was not home',
  'Đẩy thùng mới khi thùng trước chưa rời khỏi máy (băng tải ra chưa chạy?)': 'Pushed a new case while the previous one had not left the machine (outfeed conveyor not running?)',
  'Rơi tấm carton khi tay hút đang di chuyển (nhả chân không quá sớm)': 'Dropped the carton blank while the suction arm was moving (vacuum released too early)',
  'Nhả chân không khi thùng chưa mở hết — tấm carton bật lại': 'Vacuum released before the box was fully open — the blank sprang back flat',
  'Đẩy thùng khi chân không chưa nhả — thùng bị giật rách': 'Pushed the case before the vacuum was released — the case was torn',
  'Thùng rách do đẩy khi còn hút': 'Case torn: pushed while still held by vacuum',
  'Tay mở 2A quay khi không giữ chân không — tấm carton không mở được': 'Opening arm 2A swung without vacuum holding the blank — the blank could not be opened',
  'Gấp vạt nhỏ khi thùng chưa mở xong': 'Minor flaps folded before the box was fully open',
  'Vạt nhỏ chưa gấp khi tới thanh gấp vạt lớn — đáy thùng hở': 'Minor flaps not folded on reaching the major-flap folding rail — case bottom left open',
  'Tay gấp vạt trước 3A chưa rút, cản đường thùng': 'Front flap folder 3A not retracted, blocking the case',
  'Hết băng keo — đáy thùng không dán': 'Out of tape — case bottom not taped',
  'Vạt lớn chưa gấp — không dán được': 'Major flaps not folded — cannot tape',

  /* ---- sealer (L11A) ---- */
  'Chặn nâng trúng đáy thùng': 'Stop raised into the bottom of a case',
  'Hạ tấm ép khi vạt nhỏ chưa gấp — nắp bị đè méo': 'Hold-down plate lowered before the minor flaps were folded — lid crushed',
  'Đai kéo chạy khi tay gấp vạt chưa rút — thùng bị kẹt': 'Drive belts started while a flap folder was not retracted — case jammed',
  'Vạt nhỏ chưa gấp khi tới thanh gấp vạt lớn': 'Minor flaps not folded on reaching the major-flap folding rail',
  'Tấm ép chưa hạ — vạt nhỏ bật lên khi qua thanh gấp': 'Hold-down plate not lowered — minor flaps sprang up at the folding rail',
  'Hết băng keo — nắp không được dán': 'Out of tape — lid not taped',
  'Nắp chưa gấp — không dán được': 'Lid not folded — cannot tape',

  /* ---- pickplace (L11B) ---- */
  'Hạ trục Z khi trục X đang ở giữa hành trình': 'Z axis lowered while the X axis was mid-stroke',
  'Di chuyển trục X khi trục Z chưa lên hết — giác hút va vào băng tải/khay': 'X axis moved while the Z axis was not fully up — suction cup hit the conveyor/tray',
  'Chân không yếu — sản phẩm rơi khi di chuyển': 'Weak vacuum — product dropped during the move',
  'Nhả sản phẩm khi trục Z chưa hạ hết — sản phẩm rơi vào khay': 'Product released before the Z axis was fully down — product dropped into the tray',
  'Đặt sản phẩm vào ô đã có hàng': 'Product placed into an occupied cell',
  'Đặt sản phẩm lệch ô khay': 'Product placed off the tray cell',
  'Nhả sản phẩm khi không có khay': 'Product released with no tray present',
  'Nhả sản phẩm giữa hành trình — sản phẩm rơi': 'Product released mid-stroke — product dropped',

  /* ---- indexer (L06) ---- */
  'Đã nạp đầy máng phôi': 'Part chute refilled',
  'Đẩy chốt định vị khi bàn chưa đúng vị trí chia': 'Locating pin engaged while the table was not at an index position',
  'Quay bàn khi chốt định vị chưa rút': 'Table rotated while the locating pin was not retracted',
  'Quay bàn khi có xi lanh chưa lùi về — va vào phôi/ổ gá': 'Table rotated while a cylinder was not retracted — hit a part/fixture',
  'Nạp phôi vào ổ gá đã có phôi': 'Loaded a part into a fixture that already holds one',
  'Phôi rơi do nạp khi bàn chưa đúng vị trí': 'Part dropped: loaded while the table was not in position',
  'Ép khi bàn chưa khóa đúng vị trí': 'Pressed while the table was not locked in position',

  /* ---- palletizer (L18P) ---- */
  'Đóng tấm đỡ lớp đè lên chồng hàng (chưa hạ bàn nâng)': 'Layer plate closed onto the stack (lift table not lowered)',
  'Đẩy hàng lên khi tấm đỡ lớp đang mở': 'Row pushed while the layer plate was open',
  'Đẩy hàng khi tấm đỡ đã đủ 2 hàng': 'Row pushed while the layer plate already holds 2 rows',
  'Thùng chạy quá đầu băng tải (chặn chưa nâng)': 'Case ran off the end of the conveyor (stop not raised)',
  'Thả lớp khi không có pallet — hàng rơi xuống sàn': 'Layer dropped with no pallet present — cases fell on the floor',
  'Lệnh lên và xuống bàn nâng cùng lúc': 'Lift table up and down commanded at the same time',
  'Bàn nâng ép chồng hàng vào tấm đỡ lớp': 'Lift table pressed the stack against the layer plate',
  'Chạy con lăn pallet khi bàn nâng chưa xuống đáy': 'Pallet rollers started while the lift table was not at the bottom',

  /* ---- grader.js ---- */
  'Chương trình biên dịch không lỗi': 'Program compiles without errors',
  'Máy tự chạy sau khi nhấn Start': 'Machine runs automatically after pressing Start',
  'H_Run sáng trước khi nhấn Start': 'H_Run is on before Start is pressed',
  'Không có va chạm cơ khí': 'No mechanical collisions',
  'Không có sản phẩm lỗi': 'No defective products',
  'Dừng khẩn tắt mọi đầu ra, nhả không tự chạy lại': 'Emergency stop switches off all outputs; releasing it does not restart the machine',
  'Còn đầu ra bật sau khi nhấn Dừng khẩn': 'Some outputs are still on after pressing Emergency stop',
  'Máy tự chạy lại khi nhả Dừng khẩn': 'Machine restarts by itself when Emergency stop is released',
  'Nút Stop dừng máy': 'Stop button stops the machine',
  'H_Run vẫn sáng sau khi nhấn Stop': 'H_Run is still on after pressing Stop',

  /* ---- labs/index.js: starter project, L01–L04 scenario checks ---- */
  'Ví dụ: đèn Run sáng khi công tắc ở Auto': 'Example: Run lamp on when the selector is in Auto',
  'Xóa network này và bắt đầu viết chương trình của bạn.': 'Delete this network and start writing your own program.',
  '// ---- Dừng khẩn: về bước 0, tắt mọi đầu ra ----': '// ---- Emergency stop: back to step 0, all outputs off ----',
  'Còi BUZ kêu khi nhấn S3 (nút NC)': 'Buzzer BUZ sounds when S3 is pressed (NC button)',
  'H4 = có kim loại AND tia quang không bị chắn': 'H4 = metal present AND photoelectric beam not blocked',
  'Nhấn Lên: cửa tự giữ đi lên và dừng ở công tắc hành trình trên': 'Press Up: door seals in, moves up and stops at the upper limit switch',
  'Nhả nút Lên thì KM1 phải vẫn đóng (tự giữ) và H_Up sáng': 'After releasing Up, KM1 must stay closed (seal-in) and H_Up must be on',
  'Rơ-le nhiệt tác động — KM1 không nhả khi chạm LS_Up': 'Thermal overload relay tripped — KM1 did not drop out at LS_Up',
  'KM1 vẫn đóng khi cửa đã mở hết': 'KM1 still closed when the door is fully open',
  'Nhấn Xuống: cửa tự giữ đi xuống và dừng ở công tắc hành trình dưới': 'Press Down: door seals in, moves down and stops at the lower limit switch',
  'Nhả nút Xuống thì KM2 phải vẫn đóng và H_Down sáng': 'After releasing Down, KM2 must stay closed and H_Down must be on',
  'KM2 vẫn đóng khi cửa đã đóng hết': 'KM2 still closed when the door is fully closed',
  'Nút Stop dừng cửa giữa hành trình': 'Stop button stops the door mid-travel',
  'Contactor vẫn đóng sau khi nhấn Stop': 'A contactor is still closed after pressing Stop',
  'Khóa liên động: KM1 và KM2 không bao giờ đóng cùng lúc': 'Interlock: KM1 and KM2 are never closed at the same time',
  'KM1 và KM2 đã đóng cùng lúc — ngắn mạch': 'KM1 and KM2 were closed at the same time — short circuit',
  'Có vật cản ở chân cửa khi đang xuống: dừng ngay': 'Obstacle at the door edge while closing: stop immediately',
  'Cửa vẫn đi xuống khi PE = 1': 'Door keeps moving down while PE = 1',
  'Rơ-le nhiệt F1 tác động: dừng động cơ và bật đèn H_Fault': 'Thermal overload relay F1 tripped: stop the motor and turn on lamp H_Fault',
  'F1 không tác động (kiểm tra kịch bản)': 'F1 did not trip (check the test scenario)',
  'Contactor vẫn đóng khi F1 = 0': 'A contactor is still closed while F1 = 0',
  'Đèn H_Fault không sáng khi F1 = 0': 'Lamp H_Fault is not on while F1 = 0',
  'Bảng LED hiển thị đúng số lon trong thùng đang nạp': 'LED display shows the correct number of cans in the case being filled',

  /* ---- PLC compiler / runtime (src/plc) ---- */
  'Thiếu toán hạng': 'Missing operand',
  'Không gán trực tiếp DB': 'A DB cannot be assigned directly',
  'Ghi bit trong word chưa hỗ trợ': 'Writing a bit inside a word is not supported yet',
  'Thiếu dấu " đóng': 'Missing closing "',
  "Thiếu dấu ' đóng": "Missing closing '",
  'Sau # phải là tên biến': '# must be followed by a variable name',
  'Địa chỉ không hợp lệ': 'Invalid address',
  "Thiếu ';'": "Missing ';'",
  'Truy cập bit .%X chưa hỗ trợ trong SCL': 'Bit access .%X is not supported in SCL yet',
  'Thiếu tên trường sau dấu chấm': 'Missing field name after the dot',
  'Chia cho 0': 'Division by 0',
  'Biểu thức không hợp lệ': 'Invalid expression',
  'Không gán vào hằng số': 'Cannot assign to a constant',
  'FOR với bước 0': 'FOR loop with step 0',
  'Vòng lặp quá dài (có thể vô hạn)': 'Loop too long (possibly infinite)',
  'Vòng lặp WHILE không kết thúc trong một chu kỳ quét': 'WHILE loop does not finish within one scan cycle',
  'Vòng lặp REPEAT không kết thúc': 'REPEAT loop does not terminate',
  'Lệnh không hỗ trợ': 'Unsupported statement',
  'Gọi timer/counter phải dùng tham số có tên, vd. IN := ...': 'Timer/counter calls must use named parameters, e.g. IN := ...',
  'Không xác định được khối được gọi': 'Cannot determine the called block',
  'Có tag chưa đặt tên': 'A tag has no name',
  'Tham số đầu ra phải là biến': 'An output parameter must be a variable',
  'Thiếu khối Main [OB1]': 'Missing block Main [OB1]',
  'Chưa nạp chương trình hợp lệ': 'No valid program loaded',
  'Chỉ force được ngõ vào/ra %I, %Q': 'Only inputs/outputs %I, %Q can be forced',
  'Phần tử LAD rỗng': 'Empty LAD element',
  'Nhánh song song rỗng': 'Empty parallel branch',
  'Cuộn dây không ghi vào hằng số': 'A coil cannot write to a constant',
  'MOVE: thiếu OUT1': 'MOVE: missing OUT1',
  'hết file': 'end of file',
};

export const PATTERNS = [
  /* ---- kit.js ---- */
  ['VA CHẠM: {0}', 'COLLISION: {0}'],
  ['Giảng viên bật lỗi: {0}', 'Instructor injected fault: {0}'],
  ['Tắt lỗi: {0}', 'Fault cleared: {0}'],
  ['Xi lanh {0} bị kẹt', 'Cylinder {0} jammed'],
  ['Xi lanh {0} chạy chậm (tiết lưu sai)', 'Cylinder {0} too slow (flow control misadjusted)'],
  ['Cảm biến {0} hỏng', 'Sensor {0} faulty'],
  ['Không có máy: {0}', 'No such machine: {0}'],

  /* ---- machines ---- */
  ['Chuyển sang tam giác quá sớm (tốc độ mới {0} %) — dòng tăng vọt', 'Switched to delta too early (speed only {0} %) — current surge'],
  ['Thời gian chết giữa KM2 nhả và KM3 đóng chỉ {0} ms — nguy cơ hồ quang ngắn mạch (nên ≥ 50 ms)', 'Dead time between KM2 opening and KM3 closing only {0} ms — risk of an arcing short circuit (should be ≥ 50 ms)'],
  ['Thùng bị bỏ quá {0} lon', 'More than {0} cans put into the case'],
  ['Thùng ra khi mới có {0}/{1} lon', 'Case left with only {0}/{1} cans'],
  ['Chặn tại X={0} nâng trúng đáy thùng', 'Stop at X={0} raised into the bottom of a case'],
  ['Gạt {0} đẩy lệch tâm thùng ({1} mm)', 'Diverter {0} pushed the case off-centre ({1} mm)'],
  ['Thùng mã {0} vào làn {1} — sai làn', 'Case with code {0} went into lane {1} — wrong lane'],
  ['Thùng mã {0} không được gạt, đi ra làn loại', 'Case with code {0} was not diverted and went to the reject lane'],
  ['Khay ra khi mới có {0}/{1} sản phẩm', 'Tray left with only {0}/{1} products'],
  ['Phôi đạt bị gạt vào máng {0}', 'Good part ejected into the {0} chute'],
  ['Phôi không đạt bị gạt vào máng {0}', 'Reject part ejected into the {0} chute'],
  ['Thả lớp từ độ cao {0} mm — hàng bị va đập (bàn nâng chưa lên đúng mức)', 'Layer dropped from a height of {0} mm — cases damaged (lift table not at the right level)'],
  ['Lớp chỉ có {0}/4 thùng', 'Layer has only {0}/4 cases'],
  ['Pallet ra khi mới có {0}/{1} lớp', 'Pallet left with only {0}/{1} layers'],

  /* ---- grader.js ---- */
  ['{0} dòng {1}: {2}', '{0} line {1}: {2}'],
  ['Sản xuất đủ sản lượng (≥ {0} sản phẩm đạt trong {1} s)', 'Required output reached (≥ {0} good products in {1} s)'],
  ['Đạt: {0}', 'Good: {0}'],
  ['{0} · Sản phẩm đã đặt vào khay: {1}', '{0} · Products placed in trays: {1}'],
  ['· Sản phẩm đã đặt vào khay: {0}', '· Products placed in trays: {0}'],
  ['PLC STOP: {0}', 'PLC STOP: {0}'],
  ['Lỗi: {0}', 'Defects: {0}'],
  ['Sai làn: {0}', 'Wrong lane: {0}'],
  ['Sai {0}/{1} lần lấy mẫu. Ví dụ: {2}', 'Wrong in {0}/{1} samples. Example: {2}'],

  /* ---- labs/index.js ---- */
  ['{0} → {1} phải BẬT', '{0} → {1} must be ON'],
  ['{0} → {1} phải TẮT', '{0} → {1} must be OFF'],
  ['bảng LED = {0}, thùng có {1} lon', 'LED display = {0}, case holds {1} cans'],
  ['{0} — Lời giải tham khảo', '{0} — Reference solution'],

  /* ---- src/plc ---- */
  ['Kiểu không hỗ trợ: {0}', 'Unsupported type: {0}'],
  ['Không phải khối hệ thống: {0}', 'Not a system block: {0}'],
  ['Kiểu instance không hợp lệ: {0}', 'Invalid instance type: {0}'],
  ['"{0}" đã được dùng cho kiểu {1}, không dùng cho {2} được', '"{0}" is already used for type {1}, it cannot be used for {2}'],
  ['Không ghi được vào hằng số {0}', 'Cannot write to constant {0}'],
  ['Toán hạng không hợp lệ: {0}', 'Invalid operand: {0}'],
  ['Biến cục bộ #{0} chưa khai báo', 'Local variable #{0} is not declared'],
  ['Tag "{0}" có địa chỉ sai: {1}', 'Tag "{0}" has a wrong address: {1}'],
  ['Tag "{0}": kiểu {1} không khớp địa chỉ {2}', 'Tag "{0}": type {1} does not match address {2}'],
  ['Tag "{0}" không có trường con', 'Tag "{0}" has no members'],
  ['Không tìm thấy tag hoặc DB "{0}"', 'Tag or DB "{0}" not found'],
  ['Không có trường .{0} trong {1}', 'No member .{0} in {1}'],
  ['Chỉ số mảng ngoài giới hạn: {0}', 'Array index out of range: {0}'],
  ['Địa chỉ không hợp lệ: {0}', 'Invalid address: {0}'],
  ['Địa chỉ vượt vùng nhớ: {0}', 'Address outside the memory area: {0}'],
  ['Không truy cập được thành phần của {0}', 'Cannot access members of {0}'],
  ['Hằng không hợp lệ: {0}', 'Invalid constant: {0}'],
  ["Ký tự không hợp lệ: '{0}'", "Invalid character: '{0}'"],
  ["Thiếu '{0}' (gặp '{1}')", "Missing '{0}' (found '{1}')"],
  ["Thiếu {0} (gặp '{1}')", "Missing {0} (found '{1}')"],
  ['Không mong đợi từ khóa {0}', 'Unexpected keyword {0}'],
  ["Thiếu ':=' sau {0}", "Missing ':=' after {0}"],
  ["Mong đợi tên biến, gặp '{0}'", "Expected a variable name, found '{0}'"],
  ["Không mong đợi '{0}'", "Unexpected '{0}'"],
  ['Toán tử không hỗ trợ {0}', 'Unsupported operator {0}'],
  ['Hàm chuyển đổi không hỗ trợ: {0}', 'Unsupported conversion function: {0}'],
  ['Hàm không tồn tại: {0}', 'Function does not exist: {0}'],
  ['Gọi FB "{0}" phải qua instance, vd. "{1}_DB"(...)', 'FB "{0}" must be called through an instance, e.g. "{1}_DB"(...)'],
  ['"{0}" không phải instance DB (khai báo DB với instanceOf, hoặc dùng biến Static)', '"{0}" is not an instance DB (declare the DB with instanceOf, or use a Static variable)'],
  ['Tag trùng tên: "{0}"', 'Duplicate tag name: "{0}"'],
  ['Tag "{0}": địa chỉ không hợp lệ {1}', 'Tag "{0}": invalid address {1}'],
  ['Gọi đệ quy khối "{0}" không được phép', 'Recursive call of block "{0}" is not allowed'],
  ['Gọi "{0}": thiếu tham số InOut {1}', 'Call of "{0}": missing InOut parameter {1}'],
  ['Gọi "{0}": thiếu tham số {1}', 'Call of "{0}": missing parameter {1}'],
  ['"{0}" không có tham số {1}', '"{0}" has no parameter {1}'],
  ['Instance của "{0}" không hợp lệ', 'Invalid instance of "{0}"'],
  ['Loại khối không hỗ trợ: {0}', 'Unsupported block type: {0}'],
  ['Tiếp điểm cần toán hạng Bool: {0}', 'A contact needs a Bool operand: {0}'],
  ['Loại tiếp điểm không hợp lệ: {0}', 'Invalid contact type: {0}'],
  ['Loại cuộn dây không hợp lệ: {0}', 'Invalid coil type: {0}'],
  ['Phép so sánh không hợp lệ: {0}', 'Invalid comparison: {0}'],
  ['Phần tử LAD không rõ: {0}', 'Unknown LAD element: {0}'],
  ['Lệnh không hỗ trợ: {0}', 'Unsupported instruction: {0}'],
  ['{0}: thiếu tham số {1}', '{0}: missing parameter {1}'],
  ['Không tìm thấy khối FB/FC "{0}"', 'FB/FC block "{0}" not found'],
  ['Gọi FB "{0}" cần instance DB', 'Calling FB "{0}" requires an instance DB'],
  ['{0}: cần instance (vd. "IEC_Timer_0_DB")', '{0}: needs an instance (e.g. "IEC_Timer_0_DB")'],
  ['{0}: thiếu PT', '{0}: missing PT'],
  ['{0}: thiếu PV', '{0}: missing PV'],
];
