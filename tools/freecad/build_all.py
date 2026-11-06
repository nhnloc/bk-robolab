"""Build every BK-RoboLab machine (run inside the FreeCAD GUI):
    exec(open('<root>/tools/freecad/build_all.py').read())
or, from the FreeCAD Python console:  import build_all; build_all.main()"""
import importlib, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else None
if HERE is None:
    HERE = '/home/nhnloc/0_Project/robotic-lab-simulation/bk-robolab/tools/freecad'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib
importlib.reload(lib)

ORDER = ['motomini', 'mechatro']
