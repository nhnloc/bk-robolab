"""BK-AutoLab - FreeCAD parts library + GLB exporter.

Run inside the FreeCAD GUI (FreeCAD 1.1):
    import importlib, sys; sys.path.insert(0, '<root>/tools/freecad')
    import lib; importlib.reload(lib)

Conventions (docs/CONTRACT.md section 2/3): mm, Z up, X = material flow, Y = depth (back),
front of the machine = -Y. Origin = floor centre under the machine, X=0 at the infeed edge.

Every part function returns a list of (shape, colour_key) tuples in WORLD coordinates
(plus a dict of reference points where useful).  A `Machine` collects them:
    m.st(parts)                      static parts (merged per colour into `static_<colour>` nodes)
    m.node(name, origin, meta, parts) moving node; origin = node pivot / reference
    m.sensor(tag, led_pos, body)     sensor body static + `sen_<TAG>` LED node at led_pos
then `m.export(doc)` builds FreeCAD objects, writes GLB + FCStd + manifest + preview.

GLB export: own writer (MeshPart tessellation, one primitive per material per node, PBR
materials from the palette, TEXCOORD_0 on belt nodes with u = metres along belt travel).
Node translation = object Placement (rotation always identity), FreeCAD mm Z-up ->
three.js m Y-up: (x, y, z) -> (x, z, -y) / 1000.
"""
import math, os, json, struct
import FreeCAD as App
import Part

V = App.Vector
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MODELS = os.path.join(ROOT, 'assets', 'models')

# ----------------------------------------------------------------------------- palette
# key: (hex sRGB, metallic, roughness)
PAL = {
    'alu':     ('#B8BEC6', 0.75, 0.38),   # aluminium profile (contract)
    'inox':    ('#D5D9DD', 0.85, 0.22),   # stainless plate (contract)
    'cylbody': ('#9AA3AD', 0.70, 0.35),   # cylinder body (contract)
    'cylcap':  ('#6F7882', 0.65, 0.40),   # cylinder end caps
    'rod':     ('#E8EAEC', 0.95, 0.10),   # piston rod (contract)
    'black':   ('#2B2F33', 0.05, 0.75),   # gripper / cup / rubber (contract)
    'belt_g':  ('#2E7D4F', 0.00, 0.85),   # PVC belt green (contract)
    'belt_w':  ('#F2F2F2', 0.00, 0.80),   # PVC belt white (contract)
    'roller':  ('#A7ADB3', 0.85, 0.28),   # rollers (contract)
    'sensor':  ('#1F5FBF', 0.10, 0.45),   # sensors (contract)
    'valve':   ('#3A3F45', 0.20, 0.55),   # valves (contract)
    'glass':   ('#9FD3F0', 0.00, 0.05),   # guard glass (contract) - alpha blended
    'base':    ('#5B6168', 0.20, 0.70),   # floor / base frame (contract)
    'warn':    ('#F2C200', 0.05, 0.50),   # warning parts (contract)
    'nickel':  ('#C9CED3', 0.90, 0.20),   # fittings, stems, nuts
    'fitblue': ('#2F7FD8', 0.05, 0.45),   # push-in fitting collars
    'duct':    ('#80878F', 0.05, 0.60),   # cable duct
    'cabinet': ('#D9DCD6', 0.05, 0.55),   # control box RAL7035
    'motor':   ('#47566A', 0.35, 0.45),   # gear motors
    'led':     ('#3C4248', 0.10, 0.30),   # sensor LED lens (app lights it)
    'red':     ('#D7263D', 0.05, 0.40),
    'amber':   ('#F29F05', 0.05, 0.40),
    'green':   ('#23A55A', 0.05, 0.40),
    'white':   ('#F4F5F6', 0.05, 0.40),
    'btnblue': ('#1F5FBF', 0.05, 0.40),
    'wood':    ('#C8A27A', 0.00, 0.85),
    'tape':    ('#B8864B', 0.00, 0.60),   # packing tape roll
    'reflect': ('#C8202E', 0.10, 0.25),
    'accent':  ('#12808A', 0.25, 0.40),   # replaced per machine (Machine(accent=...))
}

def set_accent(hexc):
    PAL['accent'] = (hexc, 0.25, 0.40)

def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

def col_hex(c):
    return PAL[c][0] if c in PAL else c

# ----------------------------------------------------------------------------- basic geometry
def unit(v):
    v = V(v)
    return v.normalize() if v.Length > 1e-9 else V(1, 0, 0)

def box(x0, y0, z0, x1, y1, z1, ch=0.0):
    xa, xb = sorted((x0, x1)); ya, yb = sorted((y0, y1)); za, zb = sorted((z0, z1))
    s = Part.makeBox(xb - xa, yb - ya, zb - za, V(xa, ya, za))
    if ch > 0:
        c = min(ch, 0.45 * min(xb - xa, yb - ya, zb - za))
        if c > 0.2:
            s = s.makeChamfer(c, s.Edges)
    return s

def cbox(cx, cy, cz, dx, dy, dz, ch=0.0):
    return box(cx - dx / 2, cy - dy / 2, cz - dz / 2, cx + dx / 2, cy + dy / 2, cz + dz / 2, ch)

def cyl(r, p0, p1, ch=0.0):
    p0 = V(p0); p1 = V(p1); d = p1 - p0
    s = Part.makeCylinder(r, d.Length, p0, unit(d))
    if ch > 0:
        es = [e for e in s.Edges if isinstance(e.Curve, Part.Circle)]
        s = s.makeChamfer(min(ch, r * 0.4, d.Length * 0.4), es)
    return s

def cone(r0, r1, p0, p1):
    p0 = V(p0); p1 = V(p1); d = p1 - p0
    return Part.makeCone(r0, r1, d.Length, p0, unit(d))

def ngon(r, p0, p1, n=6):
    """prism with n sides (hex nuts etc.) between p0 and p1"""
    p0 = V(p0); p1 = V(p1); d = p1 - p0
    pts = [V(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), 0) for i in range(n)]
    f = Part.Face(Part.makePolygon(pts + [pts[0]]))
    s = f.extrude(V(0, 0, d.Length))
    s.Placement = App.Placement(p0, App.Rotation(V(0, 0, 1), unit(d)))
    return s

def prism(pts2d, depth, pl):
    """extrude a closed 2D polygon (local XY) along local Z by depth; placed by pl"""
    pts = [V(x, y, 0) for x, y in pts2d]
    f = Part.Face(Part.makePolygon(pts + [pts[0]]))
    s = f.extrude(V(0, 0, depth))
    s.Placement = pl.multiply(s.Placement)
    return s

def frame_pl(origin, xdir, zdir):
    """placement whose local X = xdir, local Z = zdir (orthogonalised), at origin"""
    x = unit(xdir); z = V(zdir)
    z = unit(z - x * z.dot(x))
    y = z.cross(x)
    m = App.Matrix(x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, 0, 0, 0, 1)
    p = App.Placement(m)
    p.Base = V(origin)
    return p

def xf(parts, pl):
    """apply placement pl to a list of (shape, col) -> new list"""
    out = []
    for s, c in parts:
        s2 = s.copy()
        s2.Placement = pl.multiply(s2.Placement)
        out.append((s2, c))
    return out

def default_up(d):
    return V(0, -1, 0) if abs(unit(d).z) > 0.9 else V(0, 0, 1)

# ----------------------------------------------------------------------------- aluminium profile
def _slot_poly(w, h, slot=8.0, depth=3.0):
    """40-series profile cross-section (w x h) with a slot every 40 mm module on each side"""
    def centers(L):
        n = max(1, int(round(L / 40.0)))
        m = L / n
        return [-L / 2 + m * (i + 0.5) for i in range(n)] if L >= 25 else []
    hw, hh, s = w / 2, h / 2, slot / 2
    pts = []
    # bottom edge (y=-hh), left->right
    pts.append((-hw, -hh))
    for c in centers(w):
        pts += [(c - s, -hh), (c - s, -hh + depth), (c + s, -hh + depth), (c + s, -hh)]
    pts.append((hw, -hh))
    for c in centers(h):                      # right edge, bottom->top
        pts += [(hw, c - s), (hw - depth, c - s), (hw - depth, c + s), (hw, c + s)]
    pts.append((hw, hh))
    for c in reversed(centers(w)):            # top edge, right->left
        pts += [(c + s, hh), (c + s, hh - depth), (c - s, hh - depth), (c - s, hh)]
    pts.append((-hw, hh))
    for c in reversed(centers(h)):            # left edge, top->bottom
        pts += [(-hw, c + s), (-hw + depth, c + s), (-hw + depth, c - s), (-hw, c - s)]
    return pts

def profile(p0, p1, w=40, h=40, wdir=None, col='alu'):
    """slotted aluminium extrusion from p0 to p1 (centre line). w along wdir."""
    p0 = V(p0); p1 = V(p1); d = unit(p1 - p0)
    if wdir is None:
        wdir = V(1, 0, 0) if abs(d.z) > 0.9 else V(0, 0, 1)
    pl = frame_pl(p0, wdir, d)     # local X = width dir, local Z = length
    # frame_pl orthogonalises Z against X; we want exact Z = d, so rebuild:
    x = unit(V(wdir) - d * V(wdir).dot(d)); y = d.cross(x)
    m = App.Matrix(x.x, y.x, d.x, 0, x.y, y.y, d.y, 0, x.z, y.z, d.z, 0, 0, 0, 0, 1)
    pl = App.Placement(m); pl.Base = p0
    return [(prism(_slot_poly(w, h), (p1 - p0).Length, pl), col)]

def endcap(p, d, w=40, h=40, wdir=None):
    """black plastic end cap on a profile end at p, facing d"""
    d = unit(d)
    return [(_oriented_box(p, d, wdir, w, h, 3), 'black')]

def _oriented_box(p, d, wdir, w, h, t):
    if wdir is None:
        wdir = V(1, 0, 0) if abs(d.z) > 0.9 else V(0, 0, 1)
    x = unit(V(wdir) - d * V(wdir).dot(d)); y = d.cross(x)
    m = App.Matrix(x.x, y.x, d.x, 0, x.y, y.y, d.y, 0, x.z, y.z, d.z, 0, 0, 0, 0, 1)
    pl = App.Placement(m); pl.Base = V(p)
    s = box(-w / 2, -h / 2, 0, w / 2, h / 2, t, ch=0.8)
    s.Placement = pl
    return s

def foot(x, y, zfloor=0.0, h=60):
    """levelling foot; leg profile starts at zfloor + h"""
    z = zfloor
    return [(cyl(30, V(x, y, z), V(x, y, z + 10)), 'black'),
            (ngon(13, V(x, y, z + 10), V(x, y, z + 18), 6), 'nickel'),
            (ngon(7, V(x, y, z + 18), V(x, y, z + h - 8), 8), 'nickel'),
            (box(x - 22, y - 22, z + h - 8, x + 22, y + 22, z + h, ch=1.5), 'alu')]

def leg(x, y, ztop, zfloor=0.0, w=40, h=40):
    return foot(x, y, zfloor) + profile(V(x, y, zfloor + 60), V(x, y, ztop), w, h)

# ----------------------------------------------------------------------------- floor / bases
def floor_plate(x0, x1, y0, y1, t=16):
    p = [(box(x0, y0, -t, x1, y1, 0, ch=4), 'base')]
    m, w = 40, 45   # yellow floor tape border
    for (a, b, c, d) in [(x0 + m, y0 + m, x1 - m, y0 + m + w), (x0 + m, y1 - m - w, x1 - m, y1 - m),
                         (x0 + m, y0 + m + w, x0 + m + w, y1 - m - w), (x1 - m - w, y0 + m + w, x1 - m, y1 - m - w)]:
        p.append((box(a, b, 0, c, d, 1.0), 'warn'))
    return p

def table_frame(x0, x1, y0, y1, ztop, top='inox', top_t=10, panels=None, legw=40, rail_h=80,
                zfloor=0.0, shelf=True):
    """machine base: profile legs + rails + levelling feet + stainless top plate (+side panels)"""
    p = []
    zr = ztop - top_t                          # top of rails
    xs = [x0 + legw / 2, x1 - legw / 2]
    n = int((x1 - x0) // 1100)
    for i in range(1, n + 1):
        xs.insert(-1, x0 + (x1 - x0) * i / (n + 1))
    ys = [y0 + legw / 2, y1 - legw / 2]
    for x in xs:
        for y in ys:
            p += leg(x, y, zr, zfloor, legw, legw)
    for y in ys:      # long rails top / bottom
        p += profile(V(x0, y, zr - rail_h / 2), V(x1, y, zr - rail_h / 2), rail_h, 40)
        if shelf:
            p += profile(V(x0 + legw, y, zfloor + 200), V(x1 - legw, y, zfloor + 200), 40, 40)
    for x in xs:      # cross rails
        p += profile(V(x, y0 + legw, zr - 20), V(x, y1 - legw, zr - 20), 40, 40)
        if shelf:
            p += profile(V(x, y0 + legw, zfloor + 200), V(x, y1 - legw, zfloor + 200), 40, 40)
    if top:
        p.append((box(x0 - 5, y0 - 5, zr, x1 + 5, y1 + 5, ztop, ch=2), top))
    if panels:
        t = 2
        zb, zt = zfloor + 180, zr - rail_h - 2
        for y, s in ((y0, -1), (y1, 1)):
            for i in range(len(xs) - 1):
                xa, xb = xs[i] + legw / 2 + 2, xs[i + 1] - legw / 2 - 2
                yy = y if s < 0 else y - t
                p.append((box(xa, yy - (0 if s > 0 else t), zb, xb, yy + (t if s > 0 else 0), zt, ch=0.8), panels))
        for x in (x0, x1):
            xx = x - t if x == x0 else x
            p.append((box(xx, y0 + legw + 2, zb, xx + t, y1 - legw - 2, zt, ch=0.8), panels))
    return p

# ----------------------------------------------------------------------------- pneumatics
def fitting(p, d):
    """push-in fitting at p, pointing d (out of the port)"""
    d = unit(d); p = V(p)
    return [(ngon(5.5, p, p + d * 5, 6), 'nickel'),
            (cyl(4.2, p + d * 5, p + d * 11), 'nickel'),
            (cyl(5.2, p + d * 11, p + d * 14), 'fitblue')]

def pcyl(front, d, stroke, bore=32, up=None, rod_ext=14, reeds=True, mount=None):
    """ISO-15552 style profile cylinder.
    front: centre of the rod-end face of the body; d: extension direction; up: side where the
    fittings are. Returns dict(body=[..], rod=[..], tip=V (rod end at rest), led1, led2, pl, a, L)
    mount: None | 'foot' (two L-feet on the -up side)"""
    d = unit(d)
    up = default_up(d) if up is None else up
    pl = frame_pl(front, d, up)
    a = bore + 13.0
    rr = max(5.0, round(bore * 0.19))
    capL = max(14.0, bore * 0.6)
    L = stroke + bore * 0.9 + 36
    body, rod = [], []
    tube = box(-L + capL, -a / 2 + 1.5, -a / 2 + 1.5, -capL, a / 2 - 1.5, a / 2 - 1.5)
    tube = tube.makeChamfer(4, [e for e in tube.Edges if abs(e.tangentAt(e.FirstParameter).x) > 0.9])
    body.append((tube, 'cylbody'))
    for x0 in (-L, -capL):
        body.append((box(x0, -a / 2, -a / 2, x0 + capL, a / 2, a / 2, ch=2.5), 'cylcap'))
    body.append((cyl(rr + 6, V(0, 0, 0), V(4, 0, 0), ch=1.2), 'cylcap'))           # bearing boss
    for xc in (-capL / 2, -L + capL / 2):
        body += fitting(V(xc, 0, a / 2), V(0, 0, 1))
    if mount == 'foot':
        for x0 in (-L, -capL):
            body.append((box(x0, -a / 2 - 8, -a / 2 - 22, x0 + capL - 2, a / 2 + 8, -a / 2 - 3, ch=1), 'cylcap'))
    led1 = led2 = None
    if reeds:
        ys = a / 2 + 2.5
        for i, xc in enumerate((-L + capL + 18, -capL - 18)):
            body.append((box(xc - 13, ys - 2.5, a / 2 - 13, xc + 13, ys + 2.5, a / 2 - 5, ch=0.8), 'sensor'))
            led = V(xc + 13.5, ys, a / 2 - 9)
            if i == 0: led1 = led
            else: led2 = led
    rod.append((cyl(rr, V(-capL, 0, 0), V(rod_ext, 0, 0), ch=0.8), 'rod'))
    rod.append((ngon(rr + 4, V(rod_ext - 7, 0, 0), V(rod_ext - 1, 0, 0), 6), 'nickel'))
    out = dict(body=xf(body, pl), rod=xf(rod, pl), tip=pl.multVec(V(rod_ext, 0, 0)),
               rear=pl.multVec(V(-L, 0, 0)), pl=pl, a=a, L=L)
    out['led1'] = pl.multVec(led1) if led1 else None
    out['led2'] = pl.multVec(led2) if led2 else None
    return out

def gcyl(front, d, stroke, w=64, t=36, up=None, plate=12, reeds=True):
    """guided cylinder (body + guide plate on two rods). front = body front face centre.
    moving part 'rod' = plate + guide rods (+ hidden piston rod). tip = plate outer face centre."""
    d = unit(d)
    up = default_up(d) if up is None else up
    pl = frame_pl(front, d, up)
    L = stroke * 0.55 + 70
    body = [(box(-L, -w / 2, -t / 2, 0, w / 2, t / 2, ch=2.5), 'cylbody')]
    body.append((box(-L - 6, -w / 2 + 6, -t / 2 + 2, -L, w / 2 - 6, t / 2 - 2, ch=1), 'cylcap'))
    for xc in (-12, -L + 12):
        body += fitting(V(xc, -w / 4, t / 2), V(0, 0, 1))
    rod = []
    gap = 3
    rod.append((box(gap, -w / 2 - 4, -t / 2, gap + plate, w / 2 + 4, t / 2, ch=1.5), 'alu'))
    gr = max(5.0, t * 0.17)
    for yc in (-w * 0.32, w * 0.32):
        rod.append((cyl(gr, V(-L - stroke * 0.95, yc, 0), V(gap, yc, 0)), 'rod'))
    rod.append((cyl(gr + 0.5, V(-1, 0, 0), V(gap, 0, 0)), 'rod'))
    led1 = led2 = None
    if reeds:
        zs = t / 2 + 2.5
        for i, xc in enumerate((-L + 22, -22)):
            body.append((box(xc - 12, w / 4 - 2.5, zs - 2.5, xc + 12, w / 4 + 2.5, zs + 2.5, ch=0.8), 'sensor'))
            led = V(xc + 12.5, w / 4, zs)
            if i == 0: led1 = led
            else: led2 = led
    return dict(body=xf(body, pl), rod=xf(rod, pl), tip=pl.multVec(V(gap + plate, 0, 0)), pl=pl,
                led1=pl.multVec(led1) if led1 else None, led2=pl.multVec(led2) if led2 else None, L=L)

def rodless(p0, p1, up=V(0, 0, 1), w=46, h=42, carr_len=170, carr_w=86, reeds=True):
    """rodless band cylinder along p0->p1 (body centre line). Carriage on top (+up) at rest at p0 end.
    returns dict(body, carriage, top (carriage top-centre at rest), led1, led2)"""
    p0 = V(p0); p1 = V(p1); d = unit(p1 - p0); Ltot = (p1 - p0).Length
    pl = frame_pl(p0, d, up)
    body = profile(V(0, 0, 0), V(Ltot, 0, 0), h, w, wdir=V(0, 0, 1), col='cylbody')
    body = [(s, 'cylbody') for s, c in body]
    for x0 in (-30, Ltot):
        body.append((box(x0, -w / 2 - 4, -h / 2 - 4, x0 + 30, w / 2 + 4, h / 2 + 4, ch=2.5), 'cylcap'))
        body += fitting(V(x0 + 15, 0, h / 2 + 4), V(0, 0, 1))
    # end stops / shock absorbers
    for x0, s in ((0, 1), (Ltot, -1)):
        body.append((cyl(7, V(x0, -w / 2 - 12, h / 2 - 2), V(x0 + s * 28, -w / 2 - 12, h / 2 - 2)), 'nickel'))
    car = []
    cx = 0 + carr_len / 2 + 2
    car.append((box(cx - carr_len / 2, -carr_w / 2, h / 2 - 10, cx + carr_len / 2, carr_w / 2, h / 2 + 18, ch=3), 'alu'))
    car.append((box(cx - carr_len / 2 + 10, -carr_w / 2 + 6, h / 2 + 18, cx + carr_len / 2 - 10, carr_w / 2 - 6, h / 2 + 20), 'black'))
    led1 = led2 = None
    if reeds:
        led1 = V(30, -w / 2 - 3, 0); led2 = V(Ltot - 30, -w / 2 - 3, 0)
        for lp in (led1, led2):
            body.append((box(lp.x - 13, -w / 2 - 5, -4, lp.x + 13, -w / 2, 4, ch=0.8), 'sensor'))
        led1 = V(led1.x + 13.5, led1.y - 0.5, led1.z); led2 = V(led2.x + 13.5, led2.y - 0.5, led2.z)
    return dict(body=xf(body, pl), carriage=xf(car, pl), top=pl.multVec(V(cx, 0, h / 2 + 20)),
                led1=pl.multVec(led1) if led1 else None, led2=pl.multVec(led2) if led2 else None)

def rotary(p, axis, size=70, up=None):
    """rotary vane actuator body centred on the shaft exit point p, shaft along axis.
    returns static parts and led positions (two reed switches)"""
    axis = unit(axis)
    up = up or (V(0, 0, 1) if abs(axis.z) < 0.9 else V(1, 0, 0))
    pl = frame_pl(p, axis, up)
    s = size
    parts = [(box(-s * 0.8, -s / 2, -s / 2, -3, s / 2, s / 2, ch=4), 'cylbody'),
             (cyl(s * 0.22, V(-3, 0, 0), V(0, 0, 0)), 'cylcap')]
    parts += fitting(V(-s * 0.5, -s * 0.2, s / 2), V(0, 0, 1))
    parts += fitting(V(-s * 0.5, s * 0.2, s / 2), V(0, 0, 1))
    leds = []
    for yc in (-s * 0.25, s * 0.25):
        parts.append((box(-s * 0.8 + 6, yc - 3, -s / 2 - 5, -s * 0.8 + 32, yc + 3, -s / 2, ch=0.8), 'sensor'))
        leds.append(pl.multVec(V(-s * 0.8 + 33, yc, -s / 2 - 2.5)))
    return xf(parts, pl), leds

def vcup(p, d=V(0, 0, -1), r=16):
    """vacuum cup; p = cup lip centre, d = direction from mount toward the lip"""
    d = unit(d); p = V(p)
    return [(cyl(6, p - d * 52, p - d * 26), 'nickel'),
            (ngon(9, p - d * 40, p - d * 33, 6), 'nickel'),
            (cyl(r * 0.55, p - d * 26, p - d * 16), 'black'),
            (cone(r * 0.55, r, p - d * 16, p - d * 3), 'black'),
            (cyl(r, p - d * 3, p), 'black')]

def valve_island(p, n=4, along=V(1, 0, 0), facing=V(0, -1, 0)):
    """5/2 valve island. p = centre of manifold bottom, valves stacked along `along`,
    ports + solenoids toward `facing`."""
    along = unit(along); facing = unit(facing)
    pl = frame_pl(p, along, facing.cross(along) * -1)   # local Z = up (along x facing)
    # local: x along, y = facing, z up
    pl = frame_pl(p, along, along.cross(facing))
    pitch = 19.0
    W = n * pitch + 2 * 22
    parts = [(box(-W / 2, -26, 0, W / 2, 26, 24, ch=2), 'alu')]
    for sx in (-1, 1):
        parts.append((box(sx * W / 2 - (22 if sx > 0 else 0), -28, 0, sx * W / 2 + (0 if sx > 0 else 22), 28, 40, ch=2), 'valve'))
        parts.append((cyl(7, V(sx * (W / 2 - 11), 28, 12), V(sx * (W / 2 - 11), 46, 12), ch=2), 'black'))  # silencers
        parts += fitting(V(sx * (W / 2 - 11), 28, 30), V(0, 1, 0))
    for i in range(n):
        x = -W / 2 + 22 + pitch * (i + 0.5)
        parts.append((box(x - 9, -24, 24, x + 9, 22, 70, ch=1.5), 'valve'))
        parts.append((box(x - 9, 22, 40, x + 9, 44, 72, ch=2), 'black'))           # solenoid
        parts.append((box(x - 3, 44, 62, x + 3, 45.5, 67), 'amber'))              # LED
        for zc in (32, 52):
            parts += fitting(V(x, -24, zc), V(0, -1, 0))
    return xf(parts, pl)

def frl(p, facing=V(0, -1, 0)):
    """filter-regulator with gauge + shut-off; p = centre of the top block bottom"""
    facing = unit(facing)
    pl = frame_pl(p, facing.cross(V(0, 0, 1)) * -1, V(0, 0, 1))
    # local x along pipe, y = -facing? keep simple: build with front = -y local
    pl = frame_pl(p, V(0, 0, 1).cross(facing), V(0, 0, 1))
    parts = [(box(-30, -25, 0, 30, 25, 50, ch=3), 'valve'),
             (box(-75, -20, 5, -32, 20, 45, ch=3), 'btnblue'),          # shut-off valve
             (cyl(18, V(0, 0, 0), V(0, 0, -20)), 'valve'),
             (cyl(16, V(0, 0, -20), V(0, 0, -85), ch=4), 'inox'),        # bowl
             (cyl(22, V(0, 0, 50), V(0, 0, 70), ch=2), 'black'),         # adj. knob
             (cyl(20, V(0, 25, 25), V(0, 34, 25), ch=1.5), 'nickel'),    # gauge
             (cyl(16, V(0, 34, 25), V(0, 35, 25)), 'white')]
    for sx in (-1, 1):
        parts += fitting(V(sx * (30 if sx > 0 else 75), 0, 25), V(sx, 0, 0))
    return xf(parts, pl)

# ----------------------------------------------------------------------------- sensors
def photo_eye(p, d, post_to_z=None, reflector_at=None, size=1.0, up=V(0, 0, 1), with_post=True):
    """retro-reflective photo-eye. p = lens face centre, d = beam direction.
    post_to_z: z where the mounting rod ends (vertical rod below the bracket).
    reflector_at: distance along d where a reflector is placed (with its own small post).
    returns (parts, led_pos)"""
    d = unit(d); p = V(p)
    pl = frame_pl(p, d, up)
    s = size
    parts = [(box(-20 * s, -11 * s, -16 * s, 0, 11 * s, 16 * s, ch=2), 'sensor'),
             (box(-1, -8 * s, -12 * s, 1.0, 8 * s, 12 * s, ch=0.5), 'black'),     # lens
             (cyl(5 * s, V(-20 * s, 0, -16 * s), V(-20 * s, 0, -24 * s)), 'black'),   # connector
             (box(-30 * s, -12 * s, -6 * s, -20 * s, 12 * s, 6 * s), 'inox')]       # bracket
    led = pl.multVec(V(-14 * s, 0, 16.5 * s))
    out = xf(parts, pl)
    rod_base = pl.multVec(V(-38 * s, 0, 0))
    if post_to_z is not None and with_post:
        out.append((cyl(6, rod_base + V(0, 0, 8), V(rod_base.x, rod_base.y, post_to_z)), 'inox'))
        out.append((box(rod_base.x - 10, rod_base.y - 10, rod_base.z - 10, rod_base.x + 10, rod_base.y + 10, rod_base.z + 10, ch=1.5), 'black'))
    if reflector_at:
        q = p + d * reflector_at
        plr = frame_pl(q, d, up)
        rp = [(box(0, -20, -20, 4, 20, 20, ch=1), 'reflect'), (box(4, -12, -6, 14, 12, 6), 'inox')]
        out += xf(rp, plr)
        rb = plr.multVec(V(20, 0, 0))
        if post_to_z is not None and with_post:
            out.append((cyl(6, rb + V(0, 0, 8), V(rb.x, rb.y, post_to_z)), 'inox'))
            out.append((box(rb.x - 10, rb.y - 10, rb.z - 10, rb.x + 10, rb.y + 10, rb.z + 10, ch=1.5), 'black'))
    return out, led

def bar(p0, p1, w=30, t=6, col='inox', up=V(0, 0, 1)):
    """flat bar (bracket) from p0 to p1, width w (perpendicular, in the plane ⟂ up), thickness t along up"""
    p0 = V(p0); p1 = V(p1); d = p1 - p0
    pl = frame_pl(p0, d, up)
    return xf([(box(-w / 2 if False else -t, -w / 2, -t / 2, d.Length + t, w / 2, t / 2, ch=0.8), col)], pl)

def pe_post(p, d, zbase, reflector_at=None, side_y=None):
    """photo-eye (+reflector) on vertical rods that end at zbase on clamp blocks;
    if side_y is given, a flat bar bracket runs from each rod foot horizontally to y = side_y(+/-)"""
    parts, led = photo_eye(p, d, post_to_z=zbase, reflector_at=reflector_at)
    return parts, led

def prox(p, d, length=55, r=6.0, bracket=True):
    """M12 inductive sensor; p = sensing face, d = sensing direction. returns (parts, led)"""
    d = unit(d); p = V(p)
    back = p - d * length
    parts = [(cyl(r, p - d * 1, back), 'sensor'),
             (cyl(r * 0.8, p, p - d * 1), 'black'),
             (ngon(r + 3, p - d * 12, p - d * 16, 6), 'nickel'),
             (ngon(r + 3, p - d * 26, p - d * 30, 6), 'nickel'),
             (cyl(r - 1.5, back, back - d * 8), 'led'),
             (cyl(4, back - d * 8, back - d * 20), 'black')]
    if bracket:
        up = V(0, 0, 1) if abs(d.z) < 0.9 else V(1, 0, 0)
        pl = frame_pl(p - d * 21, d, up)
        parts += xf([(box(-2, -14, -14, 2, 14, 14 + 10, ch=0.6), 'inox')], pl)
    return parts, back - d * 4

def led_shape(p, r=2.6):
    return Part.makeSphere(r, V(p))

# ----------------------------------------------------------------------------- conveyors
def gearmotor(p, shaft_dir, motor_dir, size=1.0):
    """shaft-mounted gear motor. p = shaft centre on the gearbox face, shaft_dir = into the
    conveyor, motor_dir = direction the motor body extends."""
    s = size
    pl = frame_pl(p, unit(shaft_dir) * -1, unit(motor_dir))   # local x out of conveyor, z along motor
    parts = [(box(0, -45 * s, -45 * s, 80 * s, 45 * s, 60 * s, ch=6 * s), 'motor'),
             (cyl(42 * s, V(40 * s, 0, 60 * s), V(40 * s, 0, 190 * s), ch=4), 'motor'),
             (cyl(40 * s, V(40 * s, 0, 190 * s), V(40 * s, 0, 215 * s), ch=6), 'black'),   # fan cover
             (box(10 * s, -25 * s, 80 * s, 70 * s, 25 * s, 130 * s, ch=3), 'motor'),
             (box(78 * s, -22 * s, 85 * s, 88 * s, 22 * s, 125 * s, ch=2), 'motor')]
    # terminal box on top of the motor (local +x side = away from conveyor)
    parts[3] = (box(78 * s, -25 * s, 90 * s, 105 * s, 25 * s, 140 * s, ch=3), 'motor')
    parts[4] = (cyl(5 * s, V(105 * s, 0, 115 * s), V(118 * s, 0, 115 * s)), 'black')
    return xf(parts, pl)

def belt_conveyor(x0, x1, width, ztop=800.0, yc=0.0, belt_col='belt_g', motor_side=-1,
                  motor_end='out', legs=True, guides=None, frame_h=80, leg_inset=120, zfloor=0.0,
                  leg_bottom=None, motor_dir=V(0, 0, -1)):
    """flat belt conveyor running +X. belt top = ztop, belt between y = yc +/- width/2.
    guides: None or (clear_width, height_above_belt).
    returns dict(static=[...], belt=[...], roller_z, frame_y)"""
    st, belt = [], []
    R = 25.0
    zc = ztop - R
    xa, xb = x0 + R, x1 - R
    hw = width / 2
    belt.append((box(xa, yc - hw, ztop - 3, xb, yc + hw, ztop), belt_col))
    belt.append((box(xa, yc - hw, zc - R, xb, yc + hw, zc - R + 3), belt_col))
    for x in (xa, xb):
        belt.append((cyl(R, V(x, yc - hw, zc), V(x, yc + hw, zc)), belt_col))
    fy = hw + 4 + 15        # side frame centre offset
    ftop = ztop - 4
    for s in (-1, 1):
        y = yc + s * fy
        st += profile(V(x0 - 10, y, ftop - frame_h / 2), V(x1 + 10, y, ftop - frame_h / 2), frame_h, 30)
        for x in (x0 - 10, x1 + 10):
            st.append((box(x - (3 if x < x0 else 0), y - 15, ftop - frame_h, x + (0 if x < x0 else 3), y + 15, ftop, ch=1), 'black'))
        for x in (xa, xb):   # bearing / shaft ends
            st.append((cyl(9, V(x, y, zc), V(x, y + s * 22, zc), ch=1.5), 'roller'))
            st.append((box(x - 28, y + s * 15, zc - 28, x + 28, y + s * 19, zc + 28, ch=2), 'inox'))
    # slider bed under top belt
    st.append((box(xa, yc - hw + 2, ztop - 10, xb, yc + hw - 2, ztop - 3), 'inox'))
    if legs:
        lb = (ftop - frame_h) if leg_bottom is None else leg_bottom
        n = max(2, int(math.ceil((x1 - x0 - 2 * leg_inset) / 1200.0)) + 1)
        for i in range(n):
            x = x0 + leg_inset + (x1 - x0 - 2 * leg_inset) * i / (n - 1)
            for s in (-1, 1):
                st += leg(x, yc + s * fy, lb, zfloor)
            st += profile(V(x, yc - fy + 20, zfloor + 220), V(x, yc + fy - 20, zfloor + 220), 40, 40)
            st += profile(V(x, yc - fy + 20, lb - 20), V(x, yc + fy - 20, lb - 20), 40, 40)
    if motor_side:
        xm = xb if motor_end == 'out' else xa
        y = yc + motor_side * (fy + 19)
        st += gearmotor(V(xm, y, zc), V(0, -motor_side, 0), motor_dir, 0.8)
    if guides:
        gw, gh = guides
        for s in (-1, 1):
            y = yc + s * (gw / 2 + 2)
            st.append((box(x0 + 20, y - 2, ztop + gh - 15, x1 - 20, y + 2, ztop + gh + 15, ch=0.8), 'inox'))
            k = max(2, int((x1 - x0) // 450) + 1)
            for i in range(k):
                x = x0 + 60 + (x1 - x0 - 120) * i / (k - 1)
                yo = yc + s * (fy + 15)
                st.append((cyl(5, V(x, y + s * 2, ztop + gh), V(x, yo, ztop + gh)), 'inox'))
                st.append((cyl(5, V(x, yo, ztop + gh), V(x, yo, ftop - 20)), 'inox'))
                st.append((box(x - 10, yo - 8, ftop - 40, x + 10, yo + 8, ftop - 15, ch=1.5), 'black'))
    return dict(static=st, belt=belt, roller_z=zc, frame_y=fy)

def roller_conveyor(x0, x1, width, ztop=800.0, yc=0.0, pitch=100.0, R=25.0, legs=True,
                    zfloor=0.0, drive_side=1, leg_inset=120, chain_guard=True):
    """driven roller conveyor along +X; rollers' top = ztop. returns dict(static, rollers)"""
    st, rol = [], []
    zc = ztop - R
    hw = width / 2
    fy = hw + 8
    n = int((x1 - x0) // pitch)
    off = (x1 - x0 - (n - 1) * pitch) / 2
    for i in range(n):
        x = x0 + off + i * pitch
        rol.append((cyl(R, V(x, yc - hw, zc), V(x, yc + hw, zc)), 'roller'))
        rol.append((ngon(7, V(x, yc - fy, zc), V(x, yc - hw, zc), 6), 'nickel'))
        rol.append((ngon(7, V(x, yc + hw, zc), V(x, yc + fy, zc), 6), 'nickel'))
    for s in (-1, 1):
        y = yc + s * (fy + 2)
        st.append((box(x0, y - 3, zc - 60, x1, y + 3, ztop + 10, ch=1.2), 'inox'))       # side channel
        st.append((box(x0, y - 3 + (s * 3 if s < 0 else 0), ztop + 10, x1, y + 3, ztop + 13, ch=0.8), 'inox'))
        st.append((box(x0, y + s * 3 - (20 if s < 0 else 0) + (0 if s < 0 else 0), zc - 60, x1, y + s * 3 + (0 if s < 0 else 20), zc - 57), 'inox'))
    if chain_guard:
        y = yc + drive_side * (fy + 5)
        st.append((box(x0 + 10, y + (0 if drive_side > 0 else -24), zc - 35, x1 - 10, y + (24 if drive_side > 0 else 0), zc + 35, ch=4), 'accent'))
    if legs:
        k = max(2, int(math.ceil((x1 - x0 - 2 * leg_inset) / 1200.0)) + 1)
        for i in range(k):
            x = x0 + leg_inset + (x1 - x0 - 2 * leg_inset) * i / (k - 1)
            for s in (-1, 1):
                st += leg(x, yc + s * (fy + 25), zc - 60, zfloor)
                st.append((box(x - 20, yc + s * (fy + 3), zc - 100, x + 20, yc + s * (fy + 45), zc - 60, ch=1), 'alu'))
            st += profile(V(x, yc - fy - 5, zfloor + 220), V(x, yc + fy + 5, zfloor + 220), 40, 40)
    return dict(static=st, rollers=rol, roller_z=zc, frame_y=fy)

# ----------------------------------------------------------------------------- guards, panels
def guard(x0, x1, y0, y1, z0, z1, sides=('front', 'back', 'left', 'right'), top=False,
          openings=None, handles=(), band=120, post=30, max_panel=1100, hinges=()):
    """safety guard: profile frame + glass panels + accent kick band.
    openings: dict side -> list of (a0, a1, zt): open rectangles (a along the side, from z0 to zt)
    handles: list of (side, a, z) door-handle positions. returns (static_parts, glass_parts)"""
    openings = openings or {}
    st, gl = [], []
    hp = post / 2
    def posts(a0, a1):
        n = max(1, int(math.ceil((a1 - a0) / max_panel)))
        return [a0 + (a1 - a0) * i / n for i in range(n + 1)]
    xs = posts(x0, x1); ys = posts(y0, y1)
    corners = set()
    # vertical posts
    def vpost(x, y):
        if (round(x), round(y)) in corners: return
        corners.add((round(x), round(y)))
        st.extend(profile(V(x, y, z0), V(x, y, z1), post, post))
    if 'front' in sides or 'back' in sides:
        for x in xs:
            if 'front' in sides: vpost(x, y0)
            if 'back' in sides: vpost(x, y1)
    for y in ys:
        if 'left' in sides: vpost(x0, y)
        if 'right' in sides: vpost(x1, y)
    for x in (x0, x1):
        for y in (y0, y1):
            vpost(x, y)
    # horizontal rails top + bottom (+ band top)
    def hrail(p, q):
        st.extend(profile(p, q, post, post))
    for z in (z1 - hp, z0 + band + hp):
        hrail(V(x0 + hp, y0, z), V(x1 - hp, y0, z)); hrail(V(x0 + hp, y1, z), V(x1 - hp, y1, z))
        hrail(V(x0, y0 + hp, z), V(x0, y1 - hp, z)); hrail(V(x1, y0 + hp, z), V(x1, y1 - hp, z))
    gz0, gz1 = z0 + band + post, z1 - post
    t = 6
    def panels(side):
        if side in ('front', 'back'):
            y = y0 if side == 'front' else y1
            ax = xs
        else:
            y = None
            ax = ys
        ops = openings.get(side, [])
        for i in range(len(ax) - 1):
            a0, a1 = ax[i] + hp, ax[i + 1] - hp
            # kick band (accent sheet) unless an opening reaches the floor here
            band_ok = not any(o[0] < a1 and o[1] > a0 for o in ops)
            pieces = [(a0, a1, gz0, gz1)]
            for (o0, o1, zt) in ops:
                new = []
                for (b0, b1, c0, c1) in pieces:
                    if o1 <= b0 or o0 >= b1 or zt <= c0:
                        new.append((b0, b1, c0, c1)); continue
                    if o0 > b0: new.append((b0, o0, c0, c1))
                    if o1 < b1: new.append((o1, b1, c0, c1))
                    if zt < c1: new.append((max(o0, b0), min(o1, b1), zt, c1))
                pieces = new
            for (b0, b1, c0, c1) in pieces:
                if b1 - b0 < 20 or c1 - c0 < 20: continue
                if side in ('front', 'back'):
                    gl.append((box(b0, y - t / 2, c0, b1, y + t / 2, c1), 'glass'))
                else:
                    x = x0 if side == 'left' else x1
                    gl.append((box(x - t / 2, b0, c0, x + t / 2, b1, c1), 'glass'))
            if band_ok:
                if side in ('front', 'back'):
                    st.append((box(a0, y - 1.5, z0, a1, y + 1.5, z0 + band, ch=0.6), 'accent'))
                else:
                    x = x0 if side == 'left' else x1
                    st.append((box(x - 1.5, a0, z0, x + 1.5, a1, z0 + band, ch=0.6), 'accent'))
            # opening frame edges
            for (o0, o1, zt) in ops:
                if o0 < a1 and o1 > a0 and zt > z0 + band:
                    c0, c1 = max(o0, a0), min(o1, a1)
                    if side in ('front', 'back'):
                        st.append((box(c0, y - 10, zt, c1, y + 10, zt + 20, ch=1), 'alu'))
                    else:
                        x = x0 if side == 'left' else x1
                        st.append((box(x - 10, c0, zt, x + 10, c1, zt + 20, ch=1), 'alu'))
    for sd in sides:
        panels(sd)
    if top:
        gl.append((box(x0 + hp, y0 + hp, z1 - 3, x1 - hp, y1 - hp, z1 + 3), 'glass'))
    for (side, a, z) in handles:
        if side in ('front', 'back'):
            y = y0 if side == 'front' else y1
            s = -1 if side == 'front' else 1
            st.append((box(a - 8, y + s * 4, z - 90, a + 8, y + s * 34, z + 90, ch=4), 'black'))
            st.append((box(a - 10, y + s * 3, z - 105, a + 10, y + s * 12, z - 75, ch=2), 'black'))
            st.append((box(a - 10, y + s * 3, z + 75, a + 10, y + s * 12, z + 105, ch=2), 'black'))
        else:
            x = x0 if side == 'left' else x1
            s = -1 if side == 'left' else 1
            st.append((box(x + s * 4, a - 8, z - 90, x + s * 34, a + 8, z + 90, ch=4), 'black'))
    for (side, a, z) in hinges:
        y = y0 if side == 'front' else y1
        st.append((box(a - 12, y - 8, z - 30, a + 12, y + 8, z + 30, ch=2), 'black'))
    return st, gl

def slot_plate(x0, x1, y0, y1, ztop, t=20, pitch=50, along='x'):
    """slotted aluminium training plate (MPS style) with dark T-slot lines"""
    p = [(box(x0, y0, ztop - t, x1, y1, ztop, ch=2.5), 'alu')]
    if along == 'x':
        n = int((y1 - y0) // pitch)
        off = (y1 - y0 - (n - 1) * pitch) / 2
        for i in range(n):
            y = y0 + off + i * pitch
            p.append((box(x0 + 3, y - 4, ztop - 0.2, x1 - 3, y + 4, ztop + 1.0), 'valve'))
    else:
        n = int((x1 - x0) // pitch)
        off = (x1 - x0 - (n - 1) * pitch) / 2
        for i in range(n):
            x = x0 + off + i * pitch
            p.append((box(x - 4, y0 + 3, ztop - 0.2, x + 4, y1 - 3, ztop + 1.0), 'valve'))
    return p

def warn_label(p, normal, size=60):
    """yellow warning triangle with black '!' on a surface; p = centre, normal = facing"""
    n = unit(normal)
    up = V(0, 0, 1) if abs(n.z) < 0.9 else V(0, 1, 0)
    pl = frame_pl(p, n.cross(up) * -1, up)
    pl = frame_pl(p, up.cross(n), up)   # local x = right, z = up, y = -n
    h = size * 0.866
    tri = [(-size / 2, -h / 3), (size / 2, -h / 3), (0, 2 * h / 3)]
    pts = [V(x, 0, z) for x, z in tri]
    f = Part.Face(Part.makePolygon(pts + [pts[0]]))
    s = f.extrude(V(0, -1.2, 0))
    parts = [(s, 'warn'),
             (box(-size * 0.04, -1.8, -h * 0.05, size * 0.04, -1.2, h * 0.38), 'black'),
             (box(-size * 0.04, -1.8, -h * 0.2, size * 0.04, -1.2, -h * 0.12), 'black')]
    return xf(parts, pl)

def duct(p0, p1, w=40, h=60, up=V(0, 0, 1)):
    """slotted cable duct from p0 to p1 (bottom centre line)"""
    p0 = V(p0); p1 = V(p1); d = unit(p1 - p0); L = (p1 - p0).Length
    pl = frame_pl(p0, d, up)
    parts = [(box(0, -w / 2, 0, L, w / 2, h - 6), 'duct'),
             (box(-1, -w / 2 - 2, h - 6, L + 1, w / 2 + 2, h, ch=1.2), 'duct')]
    return xf(parts, pl)

def lamp_tower(p, h_pole=60):
    """stack light: returns (base_parts, {'green':[..],'amber':[..],'red':[..]}) bottom at p"""
    p = V(p)
    z = p.z
    base = [(cyl(22, V(p.x, p.y, z), V(p.x, p.y, z + 18), ch=2), 'black'),
            (cyl(9, V(p.x, p.y, z + 18), V(p.x, p.y, z + 18 + h_pole)), 'nickel')]
    z += 18 + h_pole
    lamps = {}
    for c in ('green', 'amber', 'red'):
        base.append((cyl(30, V(p.x, p.y, z), V(p.x, p.y, z + 4)), 'black'))
        lamps[c] = [(cyl(29, V(p.x, p.y, z + 4), V(p.x, p.y, z + 46)), c)]
        z += 46
    base.append((cyl(30, V(p.x, p.y, z), V(p.x, p.y, z + 12), ch=4), 'black'))
    return base, lamps

def control_box(p, facing=V(0, -1, 0), w=300, h=340, t=170, post_from_z=None):
    """operator control box with buttons, E-stop and lamp tower.
    p = centre of the box back-bottom edge. returns (static_parts, lamps_dict)"""
    f = unit(facing)
    pl = frame_pl(p, V(0, 0, 1).cross(f), V(0, 0, 1))   # local x right, y = -f? -> fix below
    # local frame: x = right (seen from the front), y = into the box (= -facing), z = up
    xr = unit(f.cross(V(0, 0, 1)) * -1)
    pl = frame_pl(p, xr, V(0, 0, 1))
    # in this frame local y = z x x = (0,0,1) x xr ; check sign vs facing
    ly = V(0, 0, 1).cross(xr)
    sgn = 1 if ly.dot(f) > 0 else -1          # local +y*sgn = facing
    S = lambda y: y * sgn
    parts = []
    parts.append((box(-w / 2, S(0), 0, w / 2, S(t), h, ch=5), 'cabinet'))
    parts.append((box(-w / 2 + 12, S(t), 12, w / 2 - 12, S(t + 3), h - 12, ch=1), 'cabinet'))  # door
    parts.append((box(w / 2 - 30, S(t + 3), h / 2 - 40, w / 2 - 20, S(t + 14), h / 2 + 40, ch=2), 'black'))
    # E-stop on yellow plate
    parts.append((box(-w / 2 + 30, S(t + 3), h - 120, -w / 2 + 120, S(t + 5), h - 30, ch=1), 'warn'))
    ec = V(-w / 2 + 75, 0, h - 75)
    parts.append((cyl(20, V(ec.x, S(t + 5), ec.z), V(ec.x, S(t + 16), ec.z)), 'black'))
    parts.append((cyl(30, V(ec.x, S(t + 16), ec.z), V(ec.x, S(t + 34), ec.z), ch=6), 'red'))
    # buttons: start green, stop red, reset blue, selector black
    for i, (c, kind) in enumerate((('green', 'btn'), ('red', 'btn'), ('btnblue', 'btn'), ('black', 'sel'))):
        bx = -w / 2 + 160 + (i % 2) * 70
        bz = h - 75 - (i // 2) * 85
        parts.append((cyl(17, V(bx, S(t + 3), bz), V(bx, S(t + 9), bz)), 'nickel'))
        if kind == 'btn':
            parts.append((cyl(13, V(bx, S(t + 9), bz), V(bx, S(t + 16), bz), ch=2), c))
        else:
            parts.append((cyl(13, V(bx, S(t + 9), bz), V(bx, S(t + 12), bz)), 'black'))
            parts.append((box(bx - 3, S(t + 12), bz - 12, bx + 3, S(t + 22), bz + 12, ch=1), 'black'))
        parts.append((box(bx - 22, S(t + 3), bz - 42, bx + 22, S(t + 4), bz - 28), 'white'))
    parts.append((box(-w / 2 + 30, S(t + 3), 30, w / 2 - 50, S(t + 4), 70), 'accent'))   # brand plate
    out = xf(parts, pl)
    base, lamps = lamp_tower(pl.multVec(V(w / 2 - 60, S(t / 2), h)))
    out += base
    if post_from_z is not None:
        b = pl.multVec(V(0, S(t / 2), 0))
        out += profile(V(b.x, b.y, post_from_z + 60), V(b.x, b.y, b.z), 80, 40, wdir=xr)
        out += foot(b.x - xr.x * 25, b.y - xr.y * 25, post_from_z)
        out += foot(b.x + xr.x * 25, b.y + xr.y * 25, post_from_z)
        out.append((box(b.x - 110, b.y - 110, post_from_z, b.x + 110, b.y + 110, post_from_z + 8, ch=2), 'base'))
    return out, lamps

# ----------------------------------------------------------------------------- machine builder
class Machine:
    def __init__(self, mid, title='', accent='#12808A'):
        self.id = mid
        self.title = title
        self.accent = accent
        set_accent(accent)
        self.statics = {}          # col -> [shapes]
        self.nodes = {}            # name -> dict(origin, parts, meta, quality)
        self.order = []
        self.refs = {}
        self.quality = {'static_ink': (0.25, 0.5), 'static_inkw': (0.25, 0.5)}

    def st(self, parts):
        for s, c in parts:
            self.statics.setdefault(c, []).append(s)

    def node(self, name, origin, meta=None, parts=(), quality=None):
        if name not in self.nodes:
            self.nodes[name] = dict(origin=V(origin), parts=[], meta=meta or {})
            self.order.append(name)
        self.nodes[name]['parts'] += list(parts)
        if quality:
            self.quality[name] = quality
        return self.nodes[name]

    def sensor(self, tag, led, body=(), r=2.6):
        self.st(body)
        self.node('sen_' + tag, V(led), {'type': 'sensor'}, [(led_shape(V(led), r), 'led')])

    def cylinder(self, name, c, axis, travel, extra=(), parent=None, b1=None, b2=None):
        """register a pcyl/gcyl dict: body static, rod (+extra tool parts) as moving node"""
        self.st(c['body'])
        meta = {'type': 'translate', 'axisFC': list(axis), 'travel': travel}
        if parent: meta['parent'] = parent
        self.node(name, c['tip'], meta, c['rod'] + list(extra))
        if b1 and c.get('led1') is not None: self.sensor(b1, c['led1'])
        if b2 and c.get('led2') is not None: self.sensor(b2, c['led2'])

    def lamps(self, lamps, amber='H_Warn'):
        sig = {'green': 'H_Run', 'amber': amber, 'red': 'H_Fault'}
        for c, parts in lamps.items():
            o = parts[0][0].BoundBox.Center
            self.node('static_lamp_' + c, o, {'type': 'lamp', 'color': c, 'signal': sig[c]}, parts)

    # -------------------------------------------------------------- FreeCAD objects
    def build(self, doc):
        for o in list(doc.Objects):
            doc.removeObject(o.Name)
        objs = []
        for c, shapes in self.statics.items():
            objs.append(add(doc, 'static_' + c, [(s, c) for s in shapes], App.Placement()))
        for n in self.order:
            nd = self.nodes[n]
            objs.append(add(doc, n, nd['parts'], App.Placement(nd['origin'], App.Rotation())))
        doc.recompute()
        return objs

    def export(self, doc, camera=None, extra_meta=None):
        objs = self.build(doc)
        meta = {n: self.nodes[n]['meta'] for n in self.order}
        info = dict(title=self.title, accent=self.accent, refs=self.refs)
        for k in ('previewEye', 'previewZoom', 'focusFC'):
            if getattr(self, k, None) is not None: info[k] = getattr(self, k)
        if extra_meta: info.update(extra_meta)
        return export_machine(doc, self.id, objs, meta, info, camera, self.quality)

# ----------------------------------------------------------------------------- doc helpers
def add(doc, label, parts, placement=None, color=None):
    """create a Part::Feature. parts = shape or list of (shape, colour). The shape list is
    expressed in world coordinates; it is moved so that the object's Placement = placement.
    Per-face colours are stored in ShapeAppearance and in the 'FaceColors' property."""
    if isinstance(parts, Part.Shape):
        parts = [(parts, color or 'alu')]
    placement = placement or App.Placement()
    inv = placement.inverse()
    shapes, cols = [], []
    for s, c in parts:
        s2 = s.copy()
        s2.Placement = inv.multiply(s2.Placement)
        shapes.append(s2)
        cols += [col_hex(c)] * len(s.Faces)
    comp = Part.makeCompound(shapes)
    o = doc.addObject('Part::Feature', label.replace('.', '_'))
    o.Label = label
    o.Shape = comp
    o.Placement = placement
    o.addProperty('App::PropertyStringList', 'FaceColors', 'BK', 'per-face colours')
    o.FaceColors = cols
    if App.GuiUp:
        vo = o.ViewObject
        mats = []
        cache = {}
        for h in cols:
            if h not in cache:
                m = App.Material()
                m.DiffuseColor = hex_rgb(h)
                if h == PAL['glass'][0]:
                    m.Transparency = 0.7
                cache[h] = m
            mats.append(cache[h])
        vo.ShapeAppearance = mats
        vo.DisplayMode = 'Shaded'
        if label.startswith('glass_'):
            vo.Transparency = 70
    return o

# ----------------------------------------------------------------------------- GLB writer
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def _mat_for_hex(h):
    for k, (hx, me, ro) in PAL.items():
        if hx.lower() == h.lower():
            return k, me, ro
    return h, 0.1, 0.5

def tessellate(obj, lin=0.6, ang=0.45, detail=1.0):
    """-> dict hex -> (P (n,3) fc local mm, N (n,3), F (m,3))"""
    import numpy as np
    import MeshPart
    sh = obj.Shape.copy()
    sh.Placement = App.Placement()
    cols = list(obj.FaceColors) if hasattr(obj, 'FaceColors') else ['#B8BEC6'] * len(sh.Faces)
    groups = {}
    for i, f in enumerate(sh.Faces):
        a = ang
        try:
            srf = f.Surface
            r = getattr(srf, 'Radius', None)
            if r is None and hasattr(srf, 'MajorRadius'):
                r = srf.MajorRadius
            if r is None and srf.__class__.__name__ == 'Cone':
                r = max(e.Curve.Radius for e in f.Edges if hasattr(e.Curve, 'Radius')) if any(hasattr(e.Curve, 'Radius') for e in f.Edges) else None
            if r is None and srf.__class__.__name__ == 'Plane':
                rs = [e.Curve.Radius for e in f.Edges if isinstance(e.Curve, Part.Circle)]
                r = max(rs) if rs else None
            if r is not None:
                segs = min(48.0, max(8.0, 6.0 + r / 2.5)) * detail
                a = max(ang, 2 * math.pi / segs)
        except Exception:
            pass
        try:
            m = MeshPart.meshFromShape(Shape=f, LinearDeflection=lin, AngularDeflection=a, Relative=False)
        except Exception:
            continue
        pts, fac = m.Topology
        if not fac:
            continue
        P = np.array([(p.x, p.y, p.z) for p in pts], dtype=np.float64)
        F = np.array(fac, dtype=np.int64)
        tn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
        N = np.zeros_like(P)
        for k in range(3):
            np.add.at(N, F[:, k], tn)
        ln = np.linalg.norm(N, axis=1, keepdims=True)
        ln[ln == 0] = 1
        N /= ln
        g = groups.setdefault(cols[i] if i < len(cols) else '#B8BEC6', [[], [], [], 0])
        g[0].append(P); g[1].append(N); g[2].append(F + g[3]); g[3] += len(P)
    out = {}
    for h, (Ps, Ns, Fs, _) in groups.items():
        out[h] = (np.concatenate(Ps), np.concatenate(Ns), np.concatenate(Fs))
    return out

def write_glb(objs, path, root_name, belts=None, quality=None, uvfaces=None):
    """objs: FreeCAD objects (identity rotation). belts: {label: FC direction vector}.
    uvfaces: {label: (uAxisFC, vAxisFC, w, h)} -> TEXCOORD_0 0..1 across a face centred on the node origin
    (u = right, v = up, glTF convention: v measured downward = 1 - up)."""
    import numpy as np
    belts = belts or {}
    uvfaces = uvfaces or {}
    quality = quality or {}
    blob = bytearray()
    views, accs, meshes, nodes, mats = [], [], [], [], []
    mat_idx = {}
    tri_total = 0
    bb_min = np.array([1e9] * 3); bb_max = np.array([-1e9] * 3)

    def add_view(arr, target):
        while len(blob) % 4: blob.append(0)
        off = len(blob)
        b = arr.tobytes()
        blob.extend(b)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), 'target': target})
        return len(views) - 1

    def add_acc(arr, ctype, typ, target, minmax=False):
        v = add_view(arr, target)
        a = {'bufferView': v, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            a['min'] = [float(x) for x in arr.min(axis=0)]
            a['max'] = [float(x) for x in arr.max(axis=0)]
        accs.append(a)
        return len(accs) - 1

    def material(h):
        if h in mat_idx: return mat_idx[h]
        name, me, ro = _mat_for_hex(h)
        r, g, b = hex_rgb(h)
        m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [_lin(r), _lin(g), _lin(b), 1.0],
                                                    'metallicFactor': me, 'roughnessFactor': ro}}
        if name == 'glass':
            m['pbrMetallicRoughness']['baseColorFactor'][3] = 0.28
            m['alphaMode'] = 'BLEND'
            m['doubleSided'] = True
        if name in ('red', 'amber', 'green') :
            pass
        mats.append(m)
        mat_idx[h] = len(mats) - 1
        return mat_idx[h]

    stats = {}
    for o in objs:
        q = quality.get(o.Label, (1.5, 0.12))
        detail = 0.75 if o.Label.startswith('sen_') else 1.0
        groups = tessellate(o, q[0], q[1], detail)
        base = o.Placement.Base
        prims = []
        ntri = 0
        for h, (P, N, F) in groups.items():
            Pw = P + np.array([base.x, base.y, base.z])
            bb_min = np.minimum(bb_min, Pw.min(axis=0)); bb_max = np.maximum(bb_max, Pw.max(axis=0))
            pos = np.stack([P[:, 0], P[:, 2], -P[:, 1]], axis=1) / 1000.0
            nor = np.stack([N[:, 0], N[:, 2], -N[:, 1]], axis=1)
            attrs = {'POSITION': add_acc(pos.astype(np.float32), 5126, 'VEC3', 34962, True),
                     'NORMAL': add_acc(nor.astype(np.float32), 5126, 'VEC3', 34962)}
            if o.Label in belts:
                d = np.array(belts[o.Label], dtype=float); d /= np.linalg.norm(d)
                perp = np.array([-d[1], d[0], 0.0])
                u = P.dot(d) / 1000.0
                v = (P.dot(perp) + P[:, 2]) / 1000.0
                attrs['TEXCOORD_0'] = add_acc(np.stack([u, v], axis=1).astype(np.float32), 5126, 'VEC2', 34962)
            elif o.Label in uvfaces:
                ua, va, fw, fh = uvfaces[o.Label]
                u = P.dot(np.array(ua, dtype=float)) / fw + 0.5
                v = 0.5 - P.dot(np.array(va, dtype=float)) / fh
                attrs['TEXCOORD_0'] = add_acc(np.stack([u, v], axis=1).astype(np.float32), 5126, 'VEC2', 34962)
            idx = F.reshape(-1)
            if len(P) < 65535:
                ia = add_acc(idx.astype(np.uint16), 5123, 'SCALAR', 34963)
            else:
                ia = add_acc(idx.astype(np.uint32), 5125, 'SCALAR', 34963)
            prims.append({'attributes': attrs, 'indices': ia, 'material': material(h), 'mode': 4})
            ntri += len(F)
        tri_total += ntri
        stats[o.Label] = ntri
        node = {'name': o.Label, 'translation': [base.x / 1000.0, base.z / 1000.0, -base.y / 1000.0]}
        if prims:
            meshes.append({'name': o.Label, 'primitives': prims})
            node['mesh'] = len(meshes) - 1
        nodes.append(node)
    root = {'name': root_name, 'children': list(range(1, len(nodes) + 1))}
    gltf = {'asset': {'version': '2.0', 'generator': 'BK-AutoLab tools/freecad/lib.py (FreeCAD %s)' % '.'.join(App.Version()[:3])},
            'scene': 0, 'scenes': [{'name': root_name, 'nodes': [0]}],
            'nodes': [root] + nodes, 'meshes': meshes, 'materials': mats,
            'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': 0}]}
    while len(blob) % 4: blob.append(0)
    gltf['buffers'][0]['byteLength'] = len(blob)
    js = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(bytes(blob))
    return dict(tris=tri_total, size=total, per_node=stats, bbox_fc=[bb_min.tolist(), bb_max.tolist()])

# ----------------------------------------------------------------------------- export pipeline
def camera_for(bb3, eye=(-0.8, 0.75, 1.3), fov=45.0, fill=0.8):
    """default three.js camera (metres, Y-up): 3/4 view from front-left-above, matching the preview"""
    c = [(bb3[0][i] + bb3[1][i]) / 2 for i in range(3)]
    c[1] = bb3[0][1] + (bb3[1][1] - bb3[0][1]) * 0.4
    R = 0.5 * math.sqrt(sum((bb3[1][i] - bb3[0][i]) ** 2 for i in range(3)))
    n = math.sqrt(sum(e * e for e in eye))
    d = R / math.tan(math.radians(fov / 2)) * fill
    return {'pos': [round(c[i] + eye[i] / n * d, 3) for i in range(3)], 'target': [round(v, 3) for v in c], 'fov': fov}

def export_machine(doc, mid, objs, node_meta, info=None, camera=None, quality=None):
    """write assets/models/<id>.glb, src/<id>.FCStd, preview/<id>.png and merge manifest.json"""
    info = info or {}
    os.makedirs(os.path.join(MODELS, 'src'), exist_ok=True)
    os.makedirs(os.path.join(MODELS, 'preview'), exist_ok=True)
    belts = {n: m.get('uvAxisFC', [1, 0, 0]) for n, m in node_meta.items() if m.get('type') == 'belt'}
    uvf = {n: (m['uAxisFC'], m['vAxisFC'], m['faceSizeMM'][0], m['faceSizeMM'][1])
           for n, m in node_meta.items() if m.get('faceSizeMM')}
    res = write_glb(objs, os.path.join(MODELS, mid + '.glb'), mid, belts, quality, uvf)
    (x0, y0, z0), (x1, y1, z1) = res['bbox_fc']
    bb3 = [[x0 / 1000, z0 / 1000, -y1 / 1000], [x1 / 1000, z1 / 1000, -y0 / 1000]]
    bb3 = [[round(v, 4) for v in p] for p in bb3]
    eye = info.get('previewEye', (-0.8, -1.3, 0.75))
    zoom = info.get('previewZoom', 0.66)
    fbb = None
    if info.get('focusFC'):
        (fx0, fy0, fz0), (fx1, fy1, fz1) = info['focusFC']
        fbb = App.BoundBox(fx0, fy0, fz0, fx1, fy1, fz1)
    if camera is None:
        cb = bb3 if fbb is None else [[fx0 / 1000, fz0 / 1000, -fy1 / 1000], [fx1 / 1000, fz1 / 1000, -fy0 / 1000]]
        camera = camera_for(cb, eye=(eye[0], eye[2], -eye[1]), fill=0.8 * zoom / 0.66)
    mpath = os.path.join(MODELS, 'manifest.json')
    try:
        with open(mpath) as f:
            man = json.load(f)
    except Exception:
        man = {}
    man.setdefault('units', 'm'); man.setdefault('up', 'Y')
    man.setdefault('notes', {
        'bbox': 'bbox in three.js metres, Y-up (FreeCAD (x,y,z) mm -> (x, z, -y)/1000); bboxFC in FreeCAD mm Z-up',
        'axisFC': 'FreeCAD axes (Z-up); rotation sign = right-hand rule about axisFC',
        'belt': 'belt nodes carry TEXCOORD_0: u = metres along uvAxisFC (direction of travel); scroll texture offset.x by +speed*t (m/s) to move material along uvAxisFC',
        'sensor': 'sen_<TAG> node origin = LED position; mesh is a small LED sphere (material "led")',
        'lamp': 'static_lamp_<color> = stack-light segments (optional to light up; signal = suggested source)',
        'refs': 'reference points in FreeCAD mm (Z-up) for spawning procedural items'})
    man.setdefault('machines', {})
    entry = {'file': mid + '.glb', 'title': info.get('title', ''), 'accent': info.get('accent'),
             'bbox': bb3, 'bboxUnits': 'm (three.js, Y-up)',
             'bboxFC': [[round(v, 1) for v in res['bbox_fc'][0]], [round(v, 1) for v in res['bbox_fc'][1]]],
             'camera': camera, 'triangles': res['tris'], 'bytes': res['size'],
             'nodes': {}, 'refs': info.get('refs', {})}
    for n, m in node_meta.items():
        if m:
            entry['nodes'][n] = m
    man['machines'][mid] = entry
    order = ['feeder', 'escapement', 'diverter', 'erector', 'sealer', 'pickplace', 'indexer', 'palletizer',
             'trainer', 'motor', 'stardelta', 'counter']
    man['machines'] = dict(sorted(man['machines'].items(), key=lambda kv: order.index(kv[0]) if kv[0] in order else 99))
    with open(mpath, 'w') as f:
        json.dump(man, f, indent=1)
    try:
        doc.saveAs(os.path.join(MODELS, 'src', mid + '.FCStd'))
        import glob
        for f in glob.glob(os.path.join(MODELS, 'src', mid + '*.FCBak')):
            os.remove(f)
    except Exception as e:
        print('FCStd save failed', e)
    save_preview(doc, os.path.join(MODELS, 'preview', mid + '.png'), eye, zoom, fbb)
    print('%s: %d tris, %.1f KB' % (mid, res['tris'], res['size'] / 1024.0))
    return res

def save_preview(doc, path, eye=(-0.8, -1.3, 0.75), zoom=0.66, bb=None):
    if not App.GuiUp:
        return
    import FreeCADGui as Gui
    try:
        Gui.ActiveDocument = Gui.getDocument(doc.Name)
        v = Gui.ActiveDocument.ActiveView
        if bb is None:
            bb = App.BoundBox()
            for o in doc.Objects:
                if o.Label != 'static_base' and hasattr(o, 'Shape'):
                    bb.add(o.Shape.BoundBox)
        set_view(v, eye=eye, zoom=zoom, bb=bb)
        v.saveImage(path, 1200, 800, 'White')
    except Exception as e:
        print('preview failed', e)

def set_view(v, eye=(-0.8, -1.3, 0.75), zoom=0.66, bb=None):
    """perspective 3/4 view from front-left-above (front = -Y), framed on bounding box bb."""
    from pivy import coin
    v.setCameraType('Perspective')
    cam = v.getCameraNode()
    if bb is None:
        v.fitAll()
        bb = App.BoundBox()
        import FreeCADGui as Gui
        for o in Gui.ActiveDocument.Document.Objects:
            if hasattr(o, 'Shape') and o.ViewObject.Visibility:
                bb.add(o.Shape.BoundBox)
    c = bb.Center
    c = V(c.x, c.y, bb.ZMin + (bb.ZMax - bb.ZMin) * 0.4)
    R = bb.DiagonalLength / 2
    e = V(*eye).normalize()
    dist = R / math.sin(math.radians(22.5)) * zoom
    p = c + e * dist
    cam.position.setValue(coin.SbVec3f(p.x, p.y, p.z))
    cam.pointAt(coin.SbVec3f(c.x, c.y, c.z), coin.SbVec3f(0, 0, 1))
    cam.focalDistance.setValue(dist)
    cam.nearDistance.setValue(dist * 0.05)
    cam.farDistance.setValue(dist * 4)

def get_doc(mid):
    name = 'bk_' + mid
    try:
        doc = App.getDocument(name)
    except Exception:
        doc = App.newDocument(name)
    if App.GuiUp:
        import FreeCADGui as Gui
        Gui.ActiveDocument = Gui.getDocument(doc.Name)
    return doc

def run(mid):
    """import tools/freecad/<mid>.py, build and export"""
    import importlib, sys
    if HERE not in sys.path: sys.path.insert(0, HERE)
    mod = importlib.import_module(mid)
    importlib.reload(mod)
    doc = get_doc(mid)
    return mod.build(doc)


# ----------------------------------------------------------------------------- pose preview (QA)
_REST = {}

def pose(doc, mid, values=1.0):
    """Move nodes like the app would (values: float for all, or {node: 0..1}). pose(doc, mid, 0) restores."""
    with open(os.path.join(MODELS, 'manifest.json')) as f:
        nodes = json.load(f)['machines'][mid]['nodes']
    objs = {o.Label: o for o in doc.Objects}
    for n in nodes:
        if n in objs and (doc.Name, n) not in _REST:
            _REST[(doc.Name, n)] = App.Placement(objs[n].Placement)
    def val(n):
        return values.get(n, 0.0) if isinstance(values, dict) else values
    def offset(n):
        meta = nodes.get(n, {})
        off = V(0, 0, 0)
        if meta.get('type') == 'translate':
            off = V(*meta['axisFC']) * (meta['travel'] * val(n))
        if meta.get('parent'):
            off = off + offset(meta['parent'])
        return off
    for n, meta in nodes.items():
        if n not in objs:
            continue
        rest = _REST[(doc.Name, n)]
        pl = App.Placement(rest)
        pl.Base = rest.Base + offset(n)
        if meta.get('type') == 'rotate':
            pl.Rotation = App.Rotation(V(*meta['axisFC']), meta['travel'] * val(n))
        objs[n].Placement = pl
    doc.recompute()


# ============================================================================= Phần 1 (L01-L04) parts
# Electrical / operator devices. Most functions work in a "face frame": local x = right (seen from
# the front), local y = up on the surface, local z = out of the surface (towards the operator),
# surface at local z = 0.  face_pl(p, n) builds that frame.
PAL.update({
    'lens_red':    ('#8E1B22', 0.00, 0.25),   # pilot lamp lenses (dark = off; app adds emissive)
    'lens_yellow': ('#A07C0C', 0.00, 0.25),
    'lens_green':  ('#17703A', 0.00, 0.25),
    'lens_blue':   ('#174A94', 0.00, 0.25),
    'lens_amber':  ('#A0600A', 0.00, 0.25),
    'lcd':         ('#0E1012', 0.10, 0.20),   # LED display face
    'seg':         ('#3A1212', 0.00, 0.40),   # unlit 7-segment
    'plc':         ('#3F474C', 0.15, 0.55),   # S7-1200 housing
    'petrol':      ('#00838A', 0.10, 0.45),   # petrol-teal front strip
    'ctr':         ('#5E656C', 0.10, 0.55),   # contactor / relay housings
    'carton':      ('#C49A6C', 0.00, 0.85),
    'tank':        ('#A32A2A', 0.30, 0.35),   # compressor tank red
    'iron':        ('#3C4146', 0.55, 0.50),   # cast iron
    'copper':      ('#B87333', 0.85, 0.30),
    'wall':        ('#DCD6CB', 0.00, 0.90),
    'door':        ('#BCC4CC', 0.70, 0.35),   # galvanised shutter slats
    'galv':        ('#C2C7C2', 0.75, 0.40),   # galvanised mounting plate
    'wood':        ('#C8A27A', 0.00, 0.85),
    'ink':         ('#16191C', 0.00, 0.60),   # printed / engraved text (flat faces)
    'inkw':        ('#FBFBFB', 0.00, 0.60),
})

LENS = {'red': 'lens_red', 'yellow': 'lens_yellow', 'green': 'lens_green', 'blue': 'lens_blue', 'amber': 'lens_amber'}
LAMP_HEX = {'red': '#e53935', 'yellow': '#fdd835', 'green': '#43a047', 'blue': '#1e88e5', 'amber': '#ffb300'}

def face_pl(p, n, up=V(0, 0, 1)):
    """face frame at p: local z = n (out of surface), local x = right seen from the front, local y = up"""
    n = unit(n)
    if abs(V(up).dot(n)) > 0.95:
        up = V(0, 1, 0)
    return frame_pl(p, V(up).cross(n), n)

def lp(pl, x, y, z=0.0):
    return pl.multVec(V(x, y, z))

def ldir(pl, x, y, z):
    return pl.Rotation.multVec(V(x, y, z))

_FONT = None
def _font():
    global _FONT
    if _FONT is None:
        import glob
        c = glob.glob('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') + \
            glob.glob('/usr/share/fonts/**/*Sans*Bold*.ttf', recursive=True) + glob.glob('/usr/share/fonts/**/*.ttf', recursive=True)
        _FONT = c[0] if c else ''
    return _FONT

def text(pl, s, x, y, h=8.0, col='black', t=0.4, align='c', z=0.0):
    """raised text on a face frame, baseline-centre (align c) / left (l) at local (x, y)"""
    f = _font()
    if not f or not s.strip():
        return []
    try:
        ws = Part.makeWireString(s, os.path.dirname(f) + '/', os.path.basename(f), h, 0)
    except Exception:
        return []
    faces = []
    for wl in ws:
        if not wl:
            continue
        try:
            fc = Part.makeFace(wl, 'Part::FaceMakerBullseye')
            faces += fc.Faces
        except Exception:
            pass
    if not faces:
        return []
    ff = []
    for fc in faces:                     # flat glyph faces only (no side walls -> few triangles), facing +z
        if fc.normalAt(0, 0).z < 0:
            fc = fc.reversed()
        ff.append(fc)
    comp = Part.makeCompound(ff)
    bb = comp.BoundBox
    dx = x - (bb.XMin + bb.XMax) / 2 if align == 'c' else x - bb.XMin
    comp.translate(V(dx, y, z + t))
    comp.Placement = pl.multiply(comp.Placement)
    return [(comp, {'black': 'ink', 'white': 'inkw'}.get(col, col))]

def label_plate(pl, x, y, s, w=44, h=14, th=8.0):
    """white engraved label plate centred at local (x, y)"""
    return [(prism([(x - w / 2, y - h / 2), (x + w / 2, y - h / 2), (x + w / 2, y + h / 2), (x - w / 2, y + h / 2)], 1.2, pl), 'white')] + \
        text(pl, s, x, y - th * 0.38, th, 'black', 0.3, z=1.2)

def lbox(pl, x0, y0, z0, x1, y1, z1, col, ch=0.0):
    """box in face-frame coordinates"""
    s = box(x0, y0, z0, x1, y1, z1, ch)
    s.Placement = pl.multiply(s.Placement)
    return (s, col)

def lcyl(pl, r, x, y, z0, z1, col, ch=0.0):
    return (cyl(r, lp(pl, x, y, z0), lp(pl, x, y, z1), ch), col)

def lring(pl, r0, r1, x, y, z0, z1, col):
    a, b = lp(pl, x, y, z0), lp(pl, x, y, z1)
    return (cyl(r1, a, b).cut(cyl(r0, a - (b - a), b + (b - a))), col)

def pushbutton(pl, x, y, col='green'):
    """22 mm flush pushbutton (chrome bezel). -> (static, cap_parts, cap_origin, press_axis)"""
    st = [lcyl(pl, 15, x, y, 0, 2.5, 'nickel', ch=0.8), lring(pl, 12.3, 14.5, x, y, 2.5, 5, 'black')]
    cap = [lcyl(pl, 12, x, y, 2.5, 9, col, ch=1.5)]
    return st, cap, lp(pl, x, y, 9), ldir(pl, 0, 0, -1)

def selector(pl, x, y, rest_deg=45.0):
    """2-position selector, black knob; knob lever built at rest angle rest_deg (CCW from up).
    -> (static, knob_parts, pivot, axis_out)"""
    st = [lcyl(pl, 15, x, y, 0, 2.5, 'nickel', ch=0.8), lcyl(pl, 13, x, y, 2.5, 6, 'black')]
    a = math.radians(rest_deg)
    kpl = pl.multiply(App.Placement(V(x, y, 0), App.Rotation(V(0, 0, 1), rest_deg)))
    knob = [lcyl(pl, 11, x, y, 6, 9, 'black', ch=1)]
    knob.append(lbox(kpl, -4, -14, 9, 4, 14, 21, 'black', ch=1.5))
    knob.append(lbox(kpl, -1, 9, 21, 1, 13, 21.4, 'white'))       # white pointer mark
    return st, knob, lp(pl, x, y, 0), ldir(pl, 0, 0, 1)

def pilot_lamp(pl, x, y, color='red'):
    """22 mm LED pilot light. -> (static, lens_parts, lens_centre)"""
    st = [lcyl(pl, 15, x, y, 0, 2.5, 'nickel', ch=0.8)]
    lens = [lcyl(pl, 12, x, y, 2.5, 13, LENS[color], ch=4)]
    return st, lens, lp(pl, x, y, 8)

def buzzer(pl, x, y):
    """panel buzzer Ø30 with red flashing ring. -> (static, ring_parts, ring_centre)"""
    st = [lcyl(pl, 15, x, y, 0, 2.5, 'nickel', ch=0.8), lcyl(pl, 12.5, x, y, 2.5, 14, 'black', ch=1.5)]
    for r in (3, 6.5, 10):
        st.append(lring(pl, r - 1, r, x, y, 14, 14.6, 'valve'))
    ring = [lring(pl, 12.6, 16.5, x, y, 2.5, 10, 'lens_red')]
    return st, ring, lp(pl, x, y, 8)

def din_rail(pl, x0, x1, y, z=0.0):
    return [lbox(pl, x0, y - 17.5, z, x1, y + 17.5, z + 1.5, 'nickel'),
            lbox(pl, x0, y - 12.5, z + 1.5, x1, y - 11, z + 7.5, 'nickel'),
            lbox(pl, x0, y + 11, z + 1.5, x1, y + 12.5, z + 7.5, 'nickel')]

def s7_1200(pl, x, y, z=7.5):
    """S7-1200 CPU 1214C (110 x 100 x 75) centred at local (x, y) on a DIN rail at depth z"""
    p = [lbox(pl, x - 55, y - 50, z, x + 55, y + 50, z + 62, 'plc', ch=2),
         lbox(pl, x - 52, y + 20, z + 62, x + 52, y + 47, z + 75, 'plc', ch=2),      # top terminal cover
         lbox(pl, x - 52, y - 47, z + 62, x + 52, y - 22, z + 75, 'plc', ch=2),      # bottom terminal cover
         lbox(pl, x - 52, y - 20, z + 62, x - 20, y + 18, z + 72, 'petrol', ch=1.5),  # front flap
         lbox(pl, x - 18, y - 20, z + 62, x + 52, y + 18, z + 70, 'valve', ch=1)]     # LED window
    for i in range(14):   # DI LEDs
        p.append(lbox(pl, x - 12 + i * 4.4, y + 9, z + 70, x - 9.5 + i * 4.4, y + 12, z + 70.6, 'green'))
    for i in range(10):   # DQ LEDs
        p.append(lbox(pl, x - 12 + i * 4.4, y - 12, z + 70, x - 9.5 + i * 4.4, y - 9, z + 70.6, 'green'))
    for i, c in enumerate(('green', 'amber', 'amber')):
        p.append(lbox(pl, x - 46, y + 10 - i * 8, z + 72, x - 40, y + 14 - i * 8, z + 72.6, c))
    p += text(pl, 'PLC', x - 36, y - 15, 5, 'white', 0.3, z=z + 72)
    p += text(pl, 'CPU 1214C', x + 17, y - 18, 5, 'white', 0.3, z=z + 70)
    p.append(lbox(pl, x - 36, y - 49, z + 30, x - 24, y - 50.5, z + 45, 'black'))      # RJ45
    return p

def psu(pl, x, y, w=55, z=7.5, s='24V DC'):
    p = [lbox(pl, x - w / 2, y - 45, z, x + w / 2, y + 45, z + 58, 'cabinet', ch=2),
         lbox(pl, x - w / 2 + 4, y + 25, z + 58, x + w / 2 - 4, y + 42, z + 63, 'valve', ch=1),
         lbox(pl, x - w / 2 + 4, y - 42, z + 58, x + w / 2 - 4, y - 25, z + 63, 'valve', ch=1),
         lbox(pl, x + w / 2 - 12, y + 10, z + 58, x + w / 2 - 7, y + 14, z + 59, 'green')]
    p += text(pl, s, x - 3, y - 5, 6, 'black', 0.3, z=z + 58)
    return p

def terminals(pl, x0, n, y, z=7.5, pitch=6.2, cols=('valve',)):
    p = []
    for i in range(n):
        c = cols[i % len(cols)]
        xa = x0 + i * pitch
        p.append(lbox(pl, xa, y - 30, z, xa + pitch - 0.4, y + 30, z + 32, c))
        p.append(lbox(pl, xa + 1, y - 26, z + 32, xa + pitch - 1.4, y + 26, z + 40, c))
    p.append(lbox(pl, x0 + n * pitch, y - 30, z, x0 + n * pitch + 8, y + 30, z + 36, 'inox', ch=0.8))
    return p

def mcb(pl, x, y, poles=1, z=7.5, col='white'):
    w = 18 * poles
    p = [lbox(pl, x - w / 2, y - 45, z, x + w / 2, y + 45, z + 45, col, ch=1),
         lbox(pl, x - w / 2 + 1, y - 22, z + 45, x + w / 2 - 1, y + 22, z + 68, col, ch=1),
         lbox(pl, x - w / 2 + 3, y - 2, z + 68, x + w / 2 - 3, y + 12, z + 78, 'black', ch=1),   # toggle (ON)
         lbox(pl, x - w / 2 + 2, y - 18, z + 68, x + w / 2 - 2, y - 10, z + 68.5, 'btnblue')]
    return p

def contactor(pl, x, y, z=7.5, w=45):
    """AC contactor (45 x 85 x 90) with status window. -> (static, indicator_parts, indicator_centre)"""
    p = [lbox(pl, x - w / 2, y - 42, z, x + w / 2, y + 42, z + 70, 'ctr', ch=1.5),
         lbox(pl, x - w / 2 + 2, y - 26, z + 70, x + w / 2 - 2, y + 26, z + 88, 'ctr', ch=1.5),
         lbox(pl, x - w / 2 + 3, y - 40, z + 70, x + w / 2 - 3, y - 28, z + 74, 'black'),
         lbox(pl, x - w / 2 + 3, y + 28, z + 70, x + w / 2 - 3, y + 40, z + 74, 'black'),
         lbox(pl, x - w / 2 + 4, y + 8, z + 88, x + w / 2 - 4, y + 22, z + 89, 'white')]    # label
    for i in (-1, 0, 1):
        p.append(lcyl(pl, 2.8, x + i * 13, y + 35, z + 74, z + 75.5, 'nickel'))
        p.append(lcyl(pl, 2.8, x + i * 13, y - 35, z + 74, z + 75.5, 'nickel'))
    ind = [lbox(pl, x - 9, y - 16, z + 87, x + 9, y + 2, z + 91, 'lens_green', ch=1)]
    return p, ind, lp(pl, x, y - 7, z + 91)

def overload(pl, x, y, z=7.5, w=45):
    """thermal overload relay under a contactor. -> (static, led_pos)"""
    p = [lbox(pl, x - w / 2, y - 30, z, x + w / 2, y + 30, z + 75, 'ctr', ch=1.5),
         lcyl(pl, 7, x - 8, y + 5, z + 75, z + 79, 'btnblue', ch=1),       # current dial
         lcyl(pl, 5, x + 10, y + 5, z + 75, z + 81, 'red', ch=1),          # reset
         lbox(pl, x - w / 2 + 4, y - 24, z + 75, x + w / 2 - 4, y - 12, z + 76, 'white')]
    return p, lp(pl, x + 12, y - 18, z + 78)

def gauge(pl, x, y, R=50, sweep=-270.0, zero_deg=225.0, face_z=0.0, depth=30.0, zones=None, ticks=11,
          bezel='nickel', case='black', label=None):
    """round analogue gauge on a face frame. zero_deg = angle of the zero mark (CCW from local +x),
    sweep = signed degrees (negative = clockwise). zones: [(f0, f1, col)] coloured arcs (fractions).
    -> (static, needle_parts, pivot_world, axis_out_world).  Needle points to zero at rest."""
    z0 = face_z
    if case:
        st = [lcyl(pl, R + 4, x, y, z0, z0 + depth, case, ch=2),
              lring(pl, R, R + 5, x, y, z0 + depth, z0 + depth + 4, bezel),
              lcyl(pl, R, x, y, z0 + depth - 1, z0 + depth, 'white')]
    else:                    # caller draws case + face (e.g. square panel meter); face at z0 + depth
        st = []
    zf = z0 + depth
    def ang(f): return math.radians(zero_deg + sweep * f)
    for (f0, f1, c) in (zones or []):
        n = max(2, int(abs(sweep) * (f1 - f0) / 6))
        for i in range(n):
            a = ang(f0 + (f1 - f0) * (i + 0.5) / n)
            seg = abs(math.radians(sweep) * (f1 - f0) / n) * R * 0.78 + 0.6
            tpl = pl.multiply(App.Placement(V(x, y, 0), App.Rotation(V(0, 0, 1), math.degrees(a))))
            st.append(lbox(tpl, R * 0.70, -seg / 2, zf, R * 0.86, seg / 2, zf + 0.3, c))
    for i in range(ticks):
        a = math.degrees(ang(i / (ticks - 1)))
        tpl = pl.multiply(App.Placement(V(x, y, 0), App.Rotation(V(0, 0, 1), a)))
        st.append(lbox(tpl, R * 0.78, -0.9, zf, R * 0.95, 0.9, zf + 0.5, 'black'))
        if i < ticks - 1:
            a2 = math.degrees(ang((i + 0.5) / (ticks - 1)))
            tpl = pl.multiply(App.Placement(V(x, y, 0), App.Rotation(V(0, 0, 1), a2)))
            st.append(lbox(tpl, R * 0.86, -0.5, zf, R * 0.95, 0.5, zf + 0.5, 'black'))
    if label:
        st += text(pl, label, x, y - R * 0.45, R * 0.18, 'black', 0.3, z=zf)
    if case:
        st.append((cyl(R, lp(pl, x, y, zf + 6), lp(pl, x, y, zf + 7)), 'glass'))   # cover glass
    npl = pl.multiply(App.Placement(V(x, y, 0), App.Rotation(V(0, 0, 1), zero_deg)))
    needle = [(prism([(-R * 0.18, -2.2), (R * 0.84, -0.5), (R * 0.84, 0.5), (-R * 0.18, 2.2)], 1.0,
                     npl.multiply(App.Placement(V(0, 0, zf + 2), App.Rotation()))), 'red'),
              lcyl(pl, R * 0.08, x, y, zf + 1.5, zf + 4, 'black', ch=0.5)]
    return st, needle, lp(pl, x, y, zf), ldir(pl, 0, 0, 1)

SEG7 = {'a': (0, 1, 1, 0), 'b': (1, 1, 0, 1), 'c': (1, 0, 0, 1), 'd': (0, 0, 1, 0),
        'e': (0, 0, 0, 1), 'f': (0, 1, 0, 1), 'g': (0, 0.5, 1, 0)}

def seg7_digit(pl, x, y, h, z, col='seg'):
    """unlit '8.' seven-segment digit, lower-left corner at local (x, y), height h"""
    w = h * 0.55; t = h * 0.12; p = []
    for k, (cx, cy, horiz, half) in {'a': (0.5, 1, 1, 0), 'g': (0.5, 0.5, 1, 0), 'd': (0.5, 0, 1, 0),
                                     'f': (0, 0.75, 0, 0), 'b': (1, 0.75, 0, 0), 'e': (0, 0.25, 0, 0),
                                     'c': (1, 0.25, 0, 0)}.items():
        px, py = x + cx * w + (1 - cy) * h * 0.08, y + cy * h
        if horiz:
            L = w - t * 1.2
            pts = [(px - L / 2, py), (px - L / 2 + t / 2, py + t / 2), (px + L / 2 - t / 2, py + t / 2),
                   (px + L / 2, py), (px + L / 2 - t / 2, py - t / 2), (px - L / 2 + t / 2, py - t / 2)]
        else:
            L = h / 2 - t * 1.2
            pts = [(px, py - L / 2), (px + t / 2, py - L / 2 + t / 2), (px + t / 2, py + L / 2 - t / 2),
                   (px, py + L / 2), (px - t / 2, py + L / 2 - t / 2), (px - t / 2, py - L / 2 + t / 2)]
        p.append((prism(pts, 0.4, pl.multiply(App.Placement(V(0, 0, z), App.Rotation()))), col))
    p.append(lcyl(pl, t * 0.5, x + w + t * 0.9, y + t * 0.5, z, z + 0.4, col))
    return p

def cabinet(p, facing, w, h, d, window=None, hinge='left', col='cabinet'):
    """wall/floor electrical cabinet; p = bottom-centre of the BACK face.
    window: (x0, y0, x1, y1) door-local window rect (door frame local, origin door bottom-left) -> glass.
    -> dict(static, glass, pl_plate (face frame on the mounting plate, origin plate centre),
            pl_door (face frame on the door outer face, origin door centre))"""
    f = unit(facing)
    pl = face_pl(p, f)
    st, gl = [], []
    t = 1.5
    st.append(lbox(pl, -w / 2, 0, 0, w / 2, h, d - 22, col, ch=4))          # body
    st.append(lbox(pl, -w / 2 + 25, 25, d - 22, w / 2 - 25, h - 25, d - 21, 'black'))   # gasket line
    # door frame (outer face at z = d)
    if window:
        x0, y0, x1, y1 = window
        door = box(-w / 2 + 3, 3, d - 20, w / 2 - 3, h - 3, d, ch=3)
        cut = box(-w / 2 + x0, y0, d - 25, -w / 2 + x1, y1, d + 5, ch=0)
        door = door.cut(cut)
        door.Placement = pl.multiply(door.Placement)
        st.append((door, col))
        gl.append(lbox(pl, -w / 2 + x0 - 6, y0 - 6, d - 12, -w / 2 + x1 + 6, y1 + 6, d - 8, 'glass'))
    else:
        st.append(lbox(pl, -w / 2 + 3, 3, d - 20, w / 2 - 3, h - 3, d, col, ch=3))
    # handle + hinges
    hx = w / 2 - 28 if hinge == 'left' else -w / 2 + 28
    st.append(lbox(pl, hx - 9, h / 2 - 50, d, hx + 9, h / 2 + 50, d + 18, 'black', ch=4))
    st.append(lcyl(pl, 7, hx, h / 2 + 30, d + 18, d + 22, 'nickel'))
    gx = -w / 2 - 2 if hinge == 'left' else w / 2 + 2
    for yy in (h * 0.15, h * 0.85):
        st.append(lbox(pl, gx - 5, yy - 30, d - 30, gx + 5, yy + 30, d - 4, 'black', ch=2))
    # mounting plate
    st.append(lbox(pl, -w / 2 + 30, 30, 20, w / 2 - 30, h - 30, 23, 'galv'))
    # gland plate / cable entries on the bottom
    for i in range(3):
        gx2 = -w / 4 + i * w / 4
        st.append((cyl(9, lp(pl, gx2, 0, d * 0.45), lp(pl, gx2, -14, d * 0.45)), 'black'))
    pp = pl.multiply(App.Placement(V(0, h / 2, 23), App.Rotation()))
    pd = pl.multiply(App.Placement(V(0, h / 2, d), App.Rotation()))
    return dict(static=st, glass=gl, pl_plate=pp, pl_door=pd, pl=pl)

def prox_m18(p, d, length=80):
    """M18 inductive sensor; returns (parts, led)"""
    return prox(p, d, length=length, r=9.0, bracket=False)

def through_beam(p, d, up=V(0, 0, 1), col='sensor'):
    """one half of a through-beam pair (emitter or receiver) facing d. p = lens centre. -> (parts, led)"""
    pl = face_pl(p, d, up)
    parts = [lbox(pl, -15, -25, -40, 15, 25, 0, col, ch=2),
             lbox(pl, -10, -6, -0.5, 10, 14, 0.8, 'black', ch=0.5),
             lcyl(pl, 6, 0, -25, -20, -20, 'black')]
    parts[-1] = (cyl(6, lp(pl, 0, -25, -20), lp(pl, 0, -37, -20)), 'black')
    return parts, lp(pl, 0, 26, -12)

def limit_switch(p, facing, lever_dir=V(0, 0, 1)):
    """roller-lever limit switch body (30 x 60 x 30) at p (back centre) facing `facing`. -> (parts, led)"""
    pl = face_pl(p, facing)
    parts = [lbox(pl, -16, -30, 0, 16, 30, 32, 'ctr', ch=2),
             lbox(pl, -14, 30, 2, 14, 40, 30, 'black', ch=1),
             lcyl(pl, 6, 0, 18, 32, 40, 'nickel'),
             lbox(pl, -3, 14, 38, 3, 60, 43, 'nickel', ch=0.8),
             (cyl(9, lp(pl, -6, 58, 40.5), lp(pl, 6, 58, 40.5)), 'black'),
             (cyl(5, lp(pl, 0, -30, 16), lp(pl, 0, -44, 16)), 'black')]
    return parts, lp(pl, 9, -18, 32.5)
