"""Lab 1 station: Yaskawa MotoMINI on the lab table, palette plate (cells A1 A2 A3 / B / C),
YRC1000micro controller + teach pendant, control panel with toggles SW4..SW7 and lamps Q4..Q7."""
from motomini_robot import *

PLATE_Z = Z0 + 10.0
CELLS = {'A1': (170, 110), 'A2': (230, 110), 'A3': (290, 110), 'B': (190, -110), 'C': (270, -110)}


def build(doc):
    m = Machine('motomini', 'Trạm MotoMINI - Lab 1', accent='#0B4EA2')
    m.previewEye = (-0.55, -1.25, 0.9)
    m.previewZoom = 0.95
    m.focusFC = [[-420, -420, 750], [420, 380, 1100]]
    lab_table(m)
    r = robot(m)
    # ---------------------------------------------------------------- palette plate
    m.st([(box(80, -170, Z0, 380, 170, PLATE_Z, ch=1.5), 'alu')])
    for k, (x, y) in CELLS.items():
        col = 'btnblue' if k.startswith('A') else 'amber'
        m.st([(cyl(18, V(x, y, PLATE_Z), V(x, y, PLATE_Z + 0.4)), col),
              (cyl(20, V(x, y, PLATE_Z), V(x, y, PLATE_Z + 0.8)).cut(cyl(18, V(x, y, PLATE_Z - 1), V(x, y, PLATE_Z + 2))), 'black')])
    for x in (95, 365):                                      # locating pins / screws
        for y in (-155, 155):
            m.st([(cyl(5, V(x, y, PLATE_Z), V(x, y, PLATE_Z + 1.5)), 'nickel')])
    # ---------------------------------------------------------------- controller + pendant
    yrc1000micro(m, V(-300, -250, 0), along=V(0, 1, 0))
    # ---------------------------------------------------------------- control panel (faces -Y, toward robot / viewer)
    pl, L = console(m, -330, -70, 220, 120, 60, 150)
    m.st(text(pl, 'CONTROL PANEL', 12, L - 18, 8, 'black', 0.3, align='l'))
    btn = {}
    for i, (tag, col) in enumerate((('Q4', 'red'), ('Q5', 'amber'), ('Q6', 'green'), ('Q7', 'blue'))):
        x = 50 + i * 54
        lamp(m, pl, x, L * 0.62, tag, col, r=10, lab=tag)
        btn['SW%d' % (4 + i)] = toggle(m, pl, x, L * 0.30, 'SW%d' % (4 + i), lab='SW%d' % (4 + i))
    m.refs = dict(r, paletteTopZ=PLATE_Z, paletteCentre=[230, 0], paletteSize=[300, 340],
                  cellsFC={k: [x, y, PLATE_Z] for k, (x, y) in CELLS.items()}, switchesFC=btn)
    return m.export(doc)
