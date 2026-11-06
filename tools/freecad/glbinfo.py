"""Inspect a GLB: node names, translations, triangle counts, materials.
Usage: python3 glbinfo.py file.glb [-v]"""
import json, struct, sys, os

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    ln = struct.unpack('<I', data[12:16])[0]
    return json.loads(data[20:20 + ln]), len(data)

def info(path, verbose=False):
    g, size = load(path)
    meshes = g.get('meshes', [])
    acc = g.get('accessors', [])
    mats = g.get('materials', [])
    def tris(mi):
        t = 0
        for p in meshes[mi]['primitives']:
            if 'indices' in p:
                t += acc[p['indices']]['count'] // 3
            else:
                t += acc[p['attributes']['POSITION']]['count'] // 3
        return t
    total = 0
    nodes = []
    for n in g.get('nodes', []):
        t = tris(n['mesh']) if 'mesh' in n else 0
        total += t
        nodes.append((n.get('name'), n.get('translation'), n.get('rotation'), t, n.get('children')))
    if verbose:
        for nm, tr, rot, t, ch in nodes:
            print(f"  {nm!s:28} tris={t:6} T={tr} R={rot} ch={ch}")
        for m in mats:
            print('  mat', m.get('name'), m.get('pbrMetallicRoughness', {}).get('baseColorFactor'))
    return {'size': size, 'tris': total, 'names': [n[0] for n in nodes if n[0]], 'nodes': nodes}

if __name__ == '__main__':
    r = info(sys.argv[1], '-v' in sys.argv)
    print(f"{os.path.basename(sys.argv[1])}: {r['size']/1024:.1f} KB, {r['tris']} tris, {len(r['names'])} named nodes")
