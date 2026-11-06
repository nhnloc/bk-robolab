"""Labs 2-3 mechatronics station: MotoMINI + belt conveyor (DI_11 photo-eye, end stopper), servo rotary
table A (4 slots, DI_10 proximity), servo gantry B (horizontal) + C (vertical, magnet head), output bin,
Control Panel (P0..P7 toggles, PQ0..PQ7 lamps, START/STOP/SERVO ON/ROBOT ON), I/O Box (X0..X7, XQ0..XQ7),
MP3300 rack, 3 servopacks, J1000 inverter, YRC1000micro."""
from motomini_robot import *

# conveyor
CV_Y, CV_X0, CV_X1, CV_W, CV_TOP = 180.0, -330.0, 240.0, 70.0, Z0 + 40
# rotary table A
TA = V(250, -230, Z0 + 40)
TA_R, SLOT_R, SLOT_D = 100.0, 75.0, 36.0
SLOT_ANG = (135, 225, 315, 45)
# gantry B/C
GX, GY = 417.0, -283.0
MAG_Z = Z0 + 165               # magnet bottom face at rest
BEAM_Y, BEAM_Z = -215.0, 1130.0  # beam centre line (60 x 60 profile) behind the C column
BIN_C = V(400, -283, Z0)
LAMPS = ('red', 'amber', 'green', 'blue')


def build(doc):
    m = Machine('mechatro', 'Trạm cơ điện tử - Lab 2-3', accent='#0B4EA2')
    m.previewEye = (-0.55, -1.25, 0.9)
    m.previewZoom = 0.8
    m.focusFC = [[-500, -480, 750], [600, 380, 1280]]
    lab_table(m)
    r = robot(m)
    conveyor(m)
    rotary(m)
    gantry(m)
    # ---------------------------------------------------------------- output bin 90 x 90, floor Z=10, walls to Z=70
    b = BIN_C
    outer = box(b.x - 45, b.y - 45, Z0, b.x + 45, b.y + 45, Z0 + 70, ch=1)
    m.st([(outer.cut(box(b.x - 42, b.y - 42, Z0 + 10, b.x + 42, b.y + 42, Z0 + 80)), 'btnblue')])
    # ---------------------------------------------------------------- operator boxes (front-left edge)
    btns = panels(m)
    # ---------------------------------------------------------------- static props
    props(m)
    m.refs = dict(r, conveyor={'y': CV_Y, 'x': [CV_X0, CV_X1], 'width': CV_W, 'topZ': CV_TOP, 'stopperX': [240, 250],
                               'photoEyeX': 224},
                  rotaryTable={'centreFC': [TA.x, TA.y, TA.z], 'radius': TA_R, 'slotRadius': SLOT_R, 'slotDia': SLOT_D,
                               'slotAnglesDeg': list(SLOT_ANG),
                               'slotsFC': [[round(TA.x + SLOT_R * math.cos(math.radians(a)), 1),
                                            round(TA.y + SLOT_R * math.sin(math.radians(a)), 1), TA.z] for a in SLOT_ANG]},
                  gantry={'cRestFC': [GX, GY], 'magnetBottomRestZ': MAG_Z, 'magnetDia': 24,
                          'rangeB': [-292, 15], 'rangeC': [-125, 15]},
                  binFC={'centre': [b.x, b.y], 'size': [90, 90], 'floorZ': Z0 + 10, 'wallTopZ': Z0 + 70},
                  buttonsFC=btns)
    return m.export(doc)


# ----------------------------------------------------------------------------- conveyor
def conveyor(m):
    R = 12.0
    zc = CV_TOP - R
    xa, xb = CV_X0 + R, CV_X1 - R
    y0, y1 = CV_Y - CV_W / 2, CV_Y + CV_W / 2
    belt = [(box(xa, y0, CV_TOP - 2, xb, y1, CV_TOP), 'belt_g'),
            (box(xa, y0, zc - R, xb, y1, zc - R + 2), 'belt_g'),
            (cyl(R, V(xa, y0, zc), V(xa, y1, zc)), 'belt_g'),
            (cyl(R, V(xb, y0, zc), V(xb, y1, zc)), 'belt_g')]
    m.node('belt_cv', V((xa + xb) / 2, CV_Y, CV_TOP), {'type': 'belt', 'uvAxisFC': [1, 0, 0]}, belt)
    st = []
    for s in (-1, 1):
        yi = CV_Y + s * (CV_W / 2 + 1)
        st.append((box(CV_X0 - 5, yi, Z0 + 8, CV_X1, yi + s * 6, CV_TOP + 4, ch=1), 'alu'))
        for x in (xa, xb):
            st.append((cyl(6, V(x, yi + s * 6, zc), V(x, yi + s * 9, zc)), 'nickel'))
    st.append((box(xa, y0 + 2, zc - 6, xb, y1 - 2, CV_TOP - 2), 'inox'))       # slider bed
    for x in (CV_X0 + 25, -100, 100, CV_X1 - 25):
        st.append((box(x - 15, y0 - 8, Z0, x + 15, y1 + 8, Z0 + 8, ch=1), 'black'))
    # end stopper X 240..250, ~40 above the belt
    st.append((box(240, CV_Y - 42, Z0 + 8, 250, CV_Y + 42, CV_TOP + 40, ch=1.5), 'warn'))
    st.append((box(250, CV_Y - 30, Z0, 270, CV_Y + 30, Z0 + 8, ch=1), 'alu'))
    # induction motor at the infeed end (back side)
    xm = xa
    yb = y1 + 7
    st += [(box(xm - 22, yb, zc - 18, xm + 22, yb + 40, zc + 26, ch=3), 'motor'),
           (cyl(26, V(xm, yb + 40, zc + 4), V(xm, yb + 125, zc + 4), ch=2), 'motor'),
           (cyl(24, V(xm, yb + 125, zc + 4), V(xm, yb + 140, zc + 4), ch=3), 'black'),
           (box(xm - 16, yb + 60, zc + 28, xm + 16, yb + 95, zc + 44, ch=2), 'motor'),
           (box(xm - 30, yb, Z0, xm + 30, yb + 140, Z0 + 6, ch=1), 'alu')]
    for xx in (xm - 24, xm + 24):
        st.append((box(xx - 4, yb + 50, Z0 + 6, xx + 4, yb + 115, zc - 22 + 4), 'alu'))
    m.st(st)
    # DI_11 retro-reflective photo-eye across the belt near the stopper
    pe, led = photo_eye(V(224, CV_Y - 47, Z0 + 60), V(0, 1, 0), post_to_z=Z0, reflector_at=96, size=0.7)
    m.st(pe)
    m.sensor('DI_11', led)


# ----------------------------------------------------------------------------- rotary table A
def rotary(m):
    c = TA
    zt = c.z
    disc = cyl(TA_R, V(c.x, c.y, zt - 12), V(c.x, c.y, zt), ch=1.5)
    parts = []
    for a in SLOT_ANG:
        p = V(c.x + SLOT_R * math.cos(math.radians(a)), c.y + SLOT_R * math.sin(math.radians(a)), zt)
        disc = disc.cut(cyl(SLOT_D / 2, p - V(0, 0, 3), p + V(0, 0, 1)))
        parts.append((cyl(SLOT_D / 2, p - V(0, 0, 3), p - V(0, 0, 2.6)), 'black'))
    parts.insert(0, (disc, 'inox'))
    a0 = math.radians(SLOT_ANG[0] + 22)                  # red mark beside slot 0 on the rim
    q = V(c.x + (TA_R - 8) * math.cos(a0), c.y + (TA_R - 8) * math.sin(a0), zt)
    parts.append((cyl(4, q, q + V(0, 0, 0.6)), 'red'))
    parts.append((cyl(30, V(c.x, c.y, zt), V(c.x, c.y, zt + 4), ch=1), 'alu'))
    m.node('table_A', V(c.x, c.y, zt), {'type': 'rotate', 'axisFC': [0, 0, 1], 'travel': 1}, parts, quality=(0.8, 0.12))
    # servo housing
    m.st([(box(c.x - 75, c.y - 75, Z0, c.x + 75, c.y + 75, Z0 + 20, ch=3), 'servo'),
          (cyl(55, V(c.x, c.y, Z0 + 20), V(c.x, c.y, zt - 12), ch=1), 'nickel'),
          (box(c.x - 25, c.y - 75 - 70, Z0 + 2, c.x + 25, c.y - 75, Z0 + 26, ch=3), 'servo'),
          (box(c.x - 15, c.y - 150, Z0 + 6, c.x + 15, c.y - 145, Z0 + 22), 'jcap')])
    # DI_10 proximity at the rim (+Y side), looking at the disc edge
    pr, led = prox(V(c.x, c.y + TA_R + 5, zt - 6), V(0, -1, 0), 50, bracket=False)
    m.st(pr + [(box(c.x - 12, c.y + TA_R + 26, Z0, c.x + 12, c.y + TA_R + 32, zt + 6, ch=1), 'inox')])
    m.sensor('DI_10', led)


# ----------------------------------------------------------------------------- gantry B/C
def _sbox(m, p, led_dir, tag, parent=None):
    """small slot/limit sensor body at p with LED at p + led_dir*8"""
    m.st([] if parent else [(cbox(p.x, p.y, p.z, 14, 14, 14, ch=1), 'sensor')])
    led = p + unit(led_dir) * 8.5
    if parent:
        m.node('slide_B', V(GX, GY, BEAM_Z), {}, [(cbox(p.x, p.y, p.z, 14, 14, 14, ch=1), 'sensor')])
    m.sensor(tag, led)
    if parent:
        m.nodes['sen_' + tag]['meta']['parent'] = parent


def gantry(m):
    zb0, zb1 = BEAM_Z - 30, BEAM_Z + 30
    # posts + beam (static)
    for x in (20.0, 540.0):
        m.st(profile(V(x, BEAM_Y, Z0), V(x, BEAM_Y, zb0), 50, 50))
        m.st([(box(x - 45, BEAM_Y - 45, Z0, x + 45, BEAM_Y + 45, Z0 + 8, ch=1.5), 'alu')])
    m.st(profile(V(-10, BEAM_Y, BEAM_Z), V(570, BEAM_Y, BEAM_Z), 60, 60))
    m.st(endcap(V(-10, BEAM_Y, BEAM_Z), V(-1, 0, 0), 60, 60) + endcap(V(570, BEAM_Y, BEAM_Z), V(1, 0, 0), 60, 60))
    yr = BEAM_Y - 30                                     # beam front face
    m.st([(box(10, yr - 6, BEAM_Z - 12, 550, yr, BEAM_Z + 12), 'nickel')])   # linear rail
    # B servo motor on the beam end (+X)
    m.st([(box(495, BEAM_Y - 25, zb1, 560, BEAM_Y + 25, zb1 + 50, ch=3), 'servo'),
          (box(480, BEAM_Y - 22, zb1 + 3, 495, BEAM_Y + 22, zb1 + 47, ch=2), 'jcap'),
          (cyl(8, V(560, BEAM_Y, zb1 + 25), V(575, BEAM_Y, zb1 + 25)), 'black')])
    # B sensors on the beam top (+end, -end, home)
    for x, tag in ((447.0, 'DI_04'), (110.0, 'DI_05'), (GX, 'DI_06')):
        _sbox(m, V(x, BEAM_Y + 18, zb1 + 7), V(0, 0, 1), tag)
    # ---------------------------------------------------------------- slide_B: carriage + C column + C servo
    yc0, yc1 = GY - 22, GY + 22                         # column y range (-305..-261)
    yp0 = yr - 6 - 14                                    # carriage plate front
    B = [(box(GX - 50, yp0, BEAM_Z - 40, GX + 50, yr - 6, BEAM_Z + 40, ch=2), 'alu'),
         (box(GX - 40, yr - 6, BEAM_Z - 18, GX - 10, yr - 2, BEAM_Z + 18), 'black'),   # rail blocks
         (box(GX + 10, yr - 6, BEAM_Z - 18, GX + 40, yr - 2, BEAM_Z + 18), 'black'),
         (box(GX - 4, yr - 4, zb1, GX + 4, BEAM_Y + 6, zb1 + 22), 'black'),            # dog over the sensors
         (box(GX - 30, yc0, Z0 + 210, GX + 30, yp0, BEAM_Z + 70, ch=2), 'alu'),         # C column housing
         (box(GX - 24, yc0 - 2, Z0 + 230, GX + 24, yc0, BEAM_Z + 50), 'black'),         # cover strip
         (box(GX - 26, GY - 26, BEAM_Z + 70, GX + 26, GY + 26, BEAM_Z + 135, ch=3), 'servo'),   # C servo on top
         (box(GX - 22, GY - 22, BEAM_Z + 135, GX + 22, GY + 22, BEAM_Z + 142, ch=1.5), 'jcap')]
    # column must contain the ram centre line
    m.node('slide_B', V(GX, GY, BEAM_Z), {'type': 'translate', 'axisFC': [1, 0, 0], 'travel': 1}, B)
    # C sensors on the column side (move with B)
    for z, tag in ((Z0 + 370, 'DI_07'), (Z0 + 245, 'DI_08'), (Z0 + 355, 'DI_09')):
        _sbox(m, V(GX + 37, GY - 10, z), V(0, -1, 0), tag, parent='slide_B')
    # ---------------------------------------------------------------- slide_C: ram + magnet head
    zr0 = MAG_Z + 22
    C = [(box(GX - 13, GY - 13, zr0, GX + 13, GY + 13, Z0 + 360), 'rod'),
         (cyl(17, V(GX, GY, zr0 - 4), V(GX, GY, zr0), ch=1), 'nickel'),
         (cyl(12, V(GX, GY, MAG_Z + 4), V(GX, GY, zr0 - 4)), 'valve'),
         (cyl(12, V(GX, GY, MAG_Z), V(GX, GY, MAG_Z + 4)), 'red')]
    m.node('slide_C', V(GX, GY, MAG_Z), {'type': 'translate', 'axisFC': [0, 0, 1], 'travel': 1, 'parent': 'slide_B'}, C)


# ----------------------------------------------------------------------------- operator boxes
def panels(m):
    btn = {}
    # Control Panel
    pl, L = console(m, -480, -280, -440, 120, 45, 125)
    m.st(text(pl, 'CONTROL PANEL', 10, L - 14, 7, 'black', 0.3, align='l'))
    for i in range(8):
        x = 16 + i * 24
        lamp(m, pl, x, L - 38, 'PQ%d' % i, LAMPS[i % 4], r=7.5, lab='Q%d' % i)
        btn['P%d' % i] = toggle(m, pl, x, L - 72, 'P%d' % i, lab='P%d' % i)
    for x, bid, col, lab in ((28, 'START', 'green', 'START'), (76, 'STOP', 'red', 'STOP'),
                             (124, 'SERVO_ON', 'btnblue', 'SERVO ON'), (172, 'ROBOT_ON', 'btnblue', 'ROBOT ON')):
        push(m, pl, x, 30, bid, col, lab, r=9)
    # I/O Box
    pl, L = console(m, -260, -60, -440, 120, 45, 125, col='plc')
    m.st(text(pl, 'I/O BOX', 10, L - 14, 7, 'black', 0.3, align='l'))
    for i in range(8):
        x = 16 + i * 24
        lamp(m, pl, x, L - 45, 'XQ%d' % i, LAMPS[i % 4], r=7.5, lab='XQ%d' % i)
        btn['X%d' % i] = toggle(m, pl, x, L - 95, 'X%d' % i, lab='X%d' % i)
    return btn


# ----------------------------------------------------------------------------- props
def props(m):
    yb = 375.0                                           # back edge
    # MP3300 rack
    x0, x1 = 300, 520
    p = [(box(x0, yb - 70, Z0, x1, yb, Z0 + 130, ch=2), 'plc')]
    for i in range(6):
        xa = x0 + 8 + i * 35
        p += [(box(xa, yb - 72, Z0 + 10, xa + 30, yb - 70, Z0 + 120, ch=0.5), 'petrol' if i == 0 else 'ctr'),
              (box(xa + 5, yb - 73, Z0 + 95, xa + 25, yb - 72, Z0 + 112), 'lcd' if i == 0 else 'black')]
    m.st(p)
    # 3 servopacks (A, B, C)
    for i in range(3):
        xa = -40 + i * 65
        m.st([(box(xa, yb - 130, Z0, xa + 50, yb, Z0 + 160, ch=2), 'plc'),
              (box(xa + 4, yb - 131, Z0 + 110, xa + 46, yb - 130, Z0 + 150), 'lcd'),
              (box(xa + 8, yb - 132, Z0 + 20, xa + 42, yb - 130, Z0 + 90, ch=0.5), 'black')])
    # J1000 inverter
    m.st([(box(-200, yb - 108, Z0, -132, yb, Z0 + 128, ch=2), 'ctr'),
          (box(-194, yb - 109, Z0 + 70, -138, yb - 108, Z0 + 115), 'lcd'),
          (box(-194, yb - 109, Z0 + 8, -138, yb - 108, Z0 + 60), 'black')])
    # cable duct along the back edge
    m.st(duct(V(-480, yb - 160, Z0), V(-240, yb - 160, Z0), 40, 40))
    # YRC1000micro on the floor under the table
    yrc1000micro(m, V(-250, 0, 0), along=V(0, 1, 0), z=0, pendant=False)
