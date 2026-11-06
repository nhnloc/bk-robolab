"""BK-RoboLab - shared parts: Yaskawa MotoMINI (parametric, zero pose), lab table, YRC1000micro,
operator-panel devices (toggle switch, small pilot lamp, pushbutton) used by motomini.py / mechatro.py.

Robot frame = FreeCAD world shifted up by the table: robot base bottom centre at (0, 0, Z0).
Zero pose: L-arm vertical, U-arm horizontal along +X, flange facing +X.
Joint axes (world):  S [0,0,1] @ (0,0,750)   L [0,1,0] @ (20,0,853)   U [0,-1,0] @ (20,0,1018)
                     R [-1,0,0] @ (20,0,1018) B [0,1,0] @ (185,0,1018) T [-1,0,0] @ (185,0,1018)
Flange face x = 225, magnet tool tip (TCP) x = 275."""
from lib import *

PAL.update({
    'yaskawa': ('#DDE3EA', 0.10, 0.42),   # robot body light blue-grey
    'jcap':    ('#2E3338', 0.15, 0.55),   # dark joint caps
    'servo':   ('#3A3F45', 0.35, 0.45),   # servo motors dark grey
    'ctrl':    ('#E4E7EA', 0.05, 0.55),   # YRC1000micro housing
    'yblue':   ('#0B4EA2', 0.05, 0.45),   # Yaskawa blue accents
})

Z0 = 750.0                  # table top = robot base bottom
ZL = Z0 + 103.0             # L axis height (853)
ZU = ZL + 165.0             # U axis height (1018)
XL = 20.0                   # L/U axis X offset
XB = 185.0                  # B axis X
XF = 225.0                  # flange face X
XTCP = 275.0                # magnet tip X

AXES = {
    'link_S': ([0, 0, 1], V(0, 0, Z0), None),
    'link_L': ([0, 1, 0], V(XL, 0, ZL), 'link_S'),
    'link_U': ([0, -1, 0], V(XL, 0, ZU), 'link_L'),
    'link_R': ([-1, 0, 0], V(XL, 0, ZU), 'link_U'),
    'link_B': ([0, 1, 0], V(XB, 0, ZU), 'link_R'),
    'link_T': ([-1, 0, 0], V(XB, 0, ZU), 'link_B'),
}


def ycyl(r, x, z, y0, y1, ch=0.0):
    return cyl(r, V(x, y0, z), V(x, y1, z), ch)


def xcyl(r, y, z, x0, x1, ch=0.0):
    return cyl(r, V(x0, y, z), V(x1, y, z), ch)


def robot(m):
    """add the MotoMINI (static base + link_S..link_T nodes) to Machine m"""
    # ---------------------------------------------------------------- static base (not part of link_S)
    m.st([(cyl(60, V(0, 0, Z0), V(0, 0, Z0 + 60), ch=3), 'yaskawa'),
          (box(-75, -75, Z0, 75, 75, Z0 + 8, ch=2), 'yaskawa'),
          (cbox(-62, 0, Z0 + 30, 16, 40, 30, ch=2), 'jcap')])          # cable connector at the back
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.st([(cyl(5, V(sx * 62, sy * 62, Z0 + 8), V(sx * 62, sy * 62, Z0 + 11)), 'nickel')])
    # ---------------------------------------------------------------- link_S: turret + shoulder clevis
    S = [(cyl(56, V(0, 0, Z0 + 60), V(0, 0, Z0 + 64)), 'jcap'),
         (cyl(55, V(0, 0, Z0 + 64), V(0, 0, Z0 + 74), ch=2), 'yaskawa'),
         (box(-58, -30, Z0 + 66, -12, 30, ZL + 12, ch=6), 'yaskawa')]     # rear S/L motor hump
    for s in (-1, 1):
        y0, y1 = s * 29, s * 50
        S.append((box(-14, min(y0, y1), Z0 + 66, XL + 30, max(y0, y1), ZL, ch=4), 'yaskawa'))
        S.append((ycyl(32, XL, ZL, y0, y1), 'yaskawa'))
        S.append((ycyl(24, XL, ZL, y1, y1 + s * 3), 'jcap'))
    m.node('link_S', AXES['link_S'][1], _meta('link_S'), S)
    # ---------------------------------------------------------------- link_L: lower arm (vertical)
    L = [(box(XL - 24, -27, ZL, XL + 24, 27, ZU, ch=5), 'yaskawa'),
         (ycyl(28, XL, ZL, -28, 28), 'yaskawa'),
         (ycyl(27, XL, ZU, -26, 26), 'yaskawa'),
         (box(XL + 24, -14, ZL + 40, XL + 25, 14, ZU - 40), 'yblue')]   # blue stripe on the front
    m.node('link_L', AXES['link_L'][1], _meta('link_L'), L)
    # ---------------------------------------------------------------- link_U: elbow housing (clevis around L top)
    U = [(box(XL + 30, -46, ZU - 30, XL + 62, 46, ZU + 32, ch=5), 'yaskawa'),
         (box(XL - 44, -24, ZU + 30, XL + 62, 24, ZU + 44, ch=4), 'yaskawa'),   # top bridge / U motor
         (box(XL - 50, -22, ZU + 2, XL - 28, 22, ZU + 42, ch=4), 'servo'),     # U motor rear cap
         (cyl(30, V(XL + 62, 0, ZU), V(XL + 66, 0, ZU)), 'jcap')]             # R joint ring
    for s in (-1, 1):
        y0, y1 = s * 28, s * 46
        U.append((ycyl(31, XL, ZU, y0, y1), 'yaskawa'))
        U.append((box(XL, min(y0, y1), ZU - 31, XL + 32, max(y0, y1), ZU + 31), 'yaskawa'))
        U.append((ycyl(22, XL, ZU, y1, y1 + s * 3), 'jcap'))
    m.node('link_U', AXES['link_U'][1], _meta('link_U'), U)
    # ---------------------------------------------------------------- link_R: forearm along +X to the wrist fork
    xr0 = XL + 66
    R = [(xcyl(27, 0, ZU, xr0, xr0 + 20, ch=2), 'yaskawa'),
         (cone(27, 22, V(xr0 + 20, 0, ZU), V(XB - 32, 0, ZU)), 'yaskawa'),
         (box(XB - 34, -31, ZU - 20, XB - 24, 31, ZU + 20, ch=2), 'yaskawa')]
    for s in (-1, 1):
        y0, y1 = s * 20, s * 31
        R.append((box(XB - 26, min(y0, y1), ZU - 20, XB, max(y0, y1), ZU + 20), 'yaskawa'))
        R.append((ycyl(20, XB, ZU, y0, y1), 'yaskawa'))
        R.append((ycyl(15, XB, ZU, y1, y1 + s * 2.5), 'jcap'))
    m.node('link_R', AXES['link_R'][1], _meta('link_R'), R)
    # ---------------------------------------------------------------- link_B: wrist body between the forks
    B = [(ycyl(18, XB, ZU, -19, 19), 'yaskawa'),
         (box(XB, -18, ZU - 18, XB + 18, 18, ZU + 18, ch=3), 'yaskawa'),
         (xcyl(17, 0, ZU, XB + 18, XF - 10, ch=1), 'yaskawa')]
    m.node('link_B', AXES['link_B'][1], _meta('link_B'), B)
    # ---------------------------------------------------------------- link_T: flange + magnet gripper
    T = [(xcyl(15, 0, ZU, XF - 10, XF), 'jcap'),
         (box(XF - 8, 13, ZU - 3, XF - 2, 16.5, ZU + 3), 'yblue'),        # orientation mark
         (xcyl(18, 0, ZU, XF, XF + 6, ch=1), 'nickel'),                   # tool adapter plate
         (xcyl(12, 0, ZU, XF + 6, XTCP - 8), 'valve'),                    # magnet body
         (box(XF + 14, -15, ZU - 4, XF + 30, 15, ZU + 4, ch=1), 'valve'),  # cable boss
         (xcyl(12, 0, ZU, XTCP - 8, XTCP), 'red')]                        # magnet pole (tip)
    m.node('link_T', AXES['link_T'][1], _meta('link_T'), T)
    return {'baseFC': [0, 0, Z0], 'tcpZeroFC': [XTCP, 0, ZU], 'flangeX': XF,
            'axesFC': {n: {'axis': a, 'point': [p.x, p.y, p.z]} for n, (a, p, _) in AXES.items()}}


def _meta(n):
    a, _, par = AXES[n]
    d = {'type': 'rotate', 'axisFC': a, 'travel': 1}
    if par:
        d['parent'] = par
    return d


# ----------------------------------------------------------------------------- lab table + controller
def lab_table(m):
    m.st(table_frame(-500, 600, -480, 380, Z0, top='wood', top_t=25, shelf=True, legw=40, rail_h=60))
    m.st(floor_plate(-750, 850, -800, 650))


def yrc1000micro(m, c, along=V(0, 1, 0), z=None, pendant=True):
    """YRC1000micro controller 425 (W, along `along`) x 280 (D) x 125 (H), centred at c (bottom at z)"""
    z = Z0 if z is None else z
    a = unit(along)
    n = V(-a.y, a.x, 0)                                  # front normal (left of `along`)
    pl = App.Placement(V(c.x, c.y, z), App.Rotation(V(1, 0, 0), a))
    p = [(box(-212, -140, 0, 212, 140, 125, ch=4), 'ctrl'),
         (box(-200, 140, 10, 200, 141, 115), 'servo'),             # front panel
         (box(-190, 141, 20, -60, 142, 105), 'jcap'),              # vents
         (box(150, 141, 70, 185, 145, 100, ch=1), 'yblue'),        # power switch
         (cyl(6, V(120, 141, 85), V(120, 145, 85)), 'green'),
         (box(-212, 110, 125, 212, 140, 126), 'yblue')]
    if pendant:                                                    # teach pendant lying on top
        p += [(box(-100, -60, 126, 100, 60, 150, ch=6), 'ctrl'),
              (box(-60, -40, 150, 40, 40, 151), 'lcd'),
              (cyl(9, V(70, 30, 150), V(70, 30, 156), ch=1), 'red')]
    m.st(xf(p, pl))


# ----------------------------------------------------------------------------- operator devices
def toggle(m, pl, x, y, bid, rest_deg=20.0, lab=None):
    """miniature toggle switch at face-frame (x, y). Lever node btn_<bid> pivots about the face's
    local +x (= world +X for the panels used here); rest = lever tilted up rest_deg, v=1 -> 40 deg down."""
    m.st([lcyl(pl, 9, x, y, 0, 2.0, 'nickel', ch=0.6), (ngon(7.5, lp(pl, x, y, 2), lp(pl, x, y, 6), 6), 'nickel')])
    piv = lp(pl, x, y, 6)
    a = math.radians(rest_deg)
    d = ldir(pl, 0, math.sin(a), math.cos(a))
    lever = [(cyl(2.6, piv, piv + d * 20), 'nickel'), (cyl(4.2, piv + d * 18, piv + d * 26, ch=1.2), 'black'),
             (Part.makeSphere(4.5, piv), 'nickel')]
    m.node('btn_' + bid, piv, {'type': 'rotate', 'axisFC': [1, 0, 0], 'travel': 40, 'button': bid, 'kind': 'toggle'},
           lever)
    if lab:
        m.st(text(pl, lab, x, y - 20, 6, 'black', 0.3))
    return [round(v, 1) for v in piv]


def lamp(m, pl, x, y, tag, color, r=9.0, lab=None):
    """dome pilot lamp; node out_<tag>"""
    m.st([lcyl(pl, r + 2.5, x, y, 0, 2.5, 'nickel', ch=0.6)])
    c = lp(pl, x, y, 2.5)
    n = ldir(pl, 0, 0, 1)
    dome = Part.makeSphere(r, c).common(cyl(r + 1, c, c + n * (r + 1)))
    m.node('out_' + tag, lp(pl, x, y, 6), {'type': 'output', 'tag': tag, 'color': LAMP_HEX[color]},
           [(dome, LENS[color])])
    if lab:
        m.st(text(pl, lab, x, y + r + 6, 6, 'black', 0.3))


def push(m, pl, x, y, bid, color, lab=None, r=11.0):
    """flush pushbutton; node btn_<bid> translates 4 mm into the panel"""
    m.st([lcyl(pl, r + 3, x, y, 0, 2.5, 'nickel', ch=0.8), lring(pl, r + 0.3, r + 2.5, x, y, 2.5, 5, 'black')])
    cap = [lcyl(pl, r, x, y, 2.5, 9, color, ch=1.5)]
    into = [round(v, 4) for v in ldir(pl, 0, 0, -1)]
    m.node('btn_' + bid, lp(pl, x, y, 9), {'type': 'translate', 'axisFC': into, 'travel': 4, 'button': bid,
                                          'kind': 'momentary'}, cap)
    if lab:
        m.st(text(pl, lab, x, y - r - 12, 6, 'black', 0.3))


def console(m, x0, x1, yf, depth, hf, hb, col='cabinet', facing=-1):
    """sloped desk box on the table; front edge at y = yf, facing -Y (facing=-1) or +Y (facing=+1).
    returns the face frame of the sloped top (local x = +X, y = up the slope, z = out)"""
    ya, yb = sorted((yf, yf - facing * depth))
    zf, zb = Z0 + hf, Z0 + hb
    # side profile polygon in (y, z), extruded along X
    if facing < 0:
        poly = [(yf, Z0), (yf + depth, Z0), (yf + depth, zb), (yf, zf)]
    else:
        poly = [(yf - depth, Z0), (yf, Z0), (yf, zf), (yf - depth, zb)]
    pts = [V(x0, y, z) for y, z in poly]
    body = Part.Face(Part.makePolygon(pts + [pts[0]])).extrude(V(x1 - x0, 0, 0))
    m.st([(body, col)])
    t = V(0, -facing * depth, hb - hf)
    nrm = unit(V(0, facing * (hb - hf), depth))
    p0 = V(x0, yf, zf)
    pl = face_pl(p0, nrm)
    m.st([(prism([(4, 4), (x1 - x0 - 4, 4), (x1 - x0 - 4, t.Length - 4), (4, t.Length - 4)], 0.6, pl), 'white')])
    return pl, t.Length
