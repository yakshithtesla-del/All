"""R15 dressing for In This Planet (runs inside Blender).
Clothes are painted in the shader like a classic Roblox shirt: plaid / stripes / solid / code print, an open
jacket strip down the front, collar and belt. Hair is a chunky Roblox-style accessory: a cap cut from the head
shape plus swept fringe clumps. Everything is built in world space, then parented to the Head bone."""
import bpy, bmesh, math
from mathutils import Vector


def hexcol(h):
    h = h.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4)) + (1.0,)


def _bbox_world(o):
    return [o.matrix_world @ Vector(c) for c in o.bound_box]


# ------------------------------------------------------------------ clothes
def _n(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def _math(nt, op, a, b=None, val=None):
    m = _n(nt, "ShaderNodeMath", operation=op)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            m.inputs[i].default_value = x
        else:
            nt.links.new(x, m.inputs[i])
    if val is not None:
        m.inputs[1].default_value = val
    return m.outputs[0]


def _dot(nt, vec_socket, v):
    d = _n(nt, "ShaderNodeVectorMath", operation="DOT_PRODUCT")
    nt.links.new(vec_socket, d.inputs[0])
    d.inputs[1].default_value = v
    return d.outputs["Value"]


def _mix(nt, fac, a, b):
    m = _n(nt, "ShaderNodeMix", data_type="RGBA")
    nt.links.new(fac, m.inputs["Factor"])
    for sock, c in ((m.inputs[6], a), (m.inputs[7], b)):
        if isinstance(c, str):
            sock.default_value = hexcol(c)
        else:
            nt.links.new(c, sock)
    return m.outputs[2]


def cloth_material(o, fwd, spec, part):
    """One material per body part, because the pattern runs in that part's own axes.
    spec: {"color","line","pattern":"plaid|stripes|solid|code","open":hex|None,"collar":hex|None,
           "belt":hex|None,"freq":float}; part: "torso", "arm", "pants" or "shoe"."""
    m = bpy.data.materials.new(f"Cloth_{o.name}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.55
    tc = _n(nt, "ShaderNodeTexCoord")
    inv = o.matrix_world.to_3x3().inverted()
    s = o.matrix_world.to_scale().x
    f_l = (inv @ fwd).normalized()
    u_l = (inv @ Vector((0, 0, 1))).normalized()
    r_l = f_l.cross(u_l).normalized()
    c_l = sum((Vector(c) for c in o.bound_box), Vector()) / 8
    half_w = max(abs((Vector(c) - c_l).dot(r_l)) for c in o.bound_box)
    top_u = max((Vector(c) - c_l).dot(u_l) for c in o.bound_box)
    # local position relative to the part centre
    sub = _n(nt, "ShaderNodeVectorMath", operation="SUBTRACT")
    nt.links.new(tc.outputs["Object"], sub.inputs[0])
    sub.inputs[1].default_value = c_l
    P = sub.outputs[0]
    a = _dot(nt, P, r_l)
    b = _dot(nt, P, u_l)
    col = spec.get("color", "#333333")
    out = None
    pat = spec.get("pattern", "solid") if part in ("torso", "arm") else "solid"
    freq = spec.get("freq", 3.2) * s          # cycles per world unit -> per local unit
    if part == "pants":
        col = spec.get("pants", "#1B1B1B")
    if part == "shoe":
        col = spec.get("shoes", "#202020")
    if pat == "plaid":
        la = _math(nt, "LESS_THAN", _math(nt, "FRACT", _math(nt, "MULTIPLY", a, freq)), 0.22)
        lb = _math(nt, "LESS_THAN", _math(nt, "FRACT", _math(nt, "MULTIPLY", b, freq)), 0.22)
        thin_a = _math(nt, "LESS_THAN", _math(nt, "FRACT", _math(nt, "ADD", _math(nt, "MULTIPLY", a, freq), 0.55)), 0.06)
        thin_b = _math(nt, "LESS_THAN", _math(nt, "FRACT", _math(nt, "ADD", _math(nt, "MULTIPLY", b, freq), 0.55)), 0.06)
        both = _math(nt, "MULTIPLY", la, lb)
        any_ = _math(nt, "MAXIMUM", la, lb)
        thin = _math(nt, "MAXIMUM", thin_a, thin_b)
        out = _mix(nt, any_, col, spec.get("line", "#88CC88"))
        out = _mix(nt, both, out, spec.get("cross", spec.get("line", "#88CC88")))
        out = _mix(nt, thin, out, spec.get("thin", "#101010"))
    elif pat == "stripes":
        st = _math(nt, "LESS_THAN", _math(nt, "FRACT", _math(nt, "MULTIPLY", b, freq)), 0.45)
        out = _mix(nt, st, col, spec.get("line", "#FFFFFF"))
    elif pat == "code":
        noise = _n(nt, "ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 40 * s
        nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
        dots = _math(nt, "GREATER_THAN", noise.outputs["Fac"], 0.62)
        out = _mix(nt, dots, col, spec.get("line", "#35FF7A"))
        bsdf.inputs["Emission Strength"].default_value = 1.0
        nt.links.new(_mix(nt, dots, "#000000", spec.get("line", "#35FF7A")), bsdf.inputs["Emission Color"])
    if out is None:
        out = _mix(nt, _math(nt, "ADD", a, 0.0) if False else _math(nt, "MULTIPLY", a, 0.0), col, col)
    # front-only details on the torso: open jacket strip, collar, belt
    front = _math(nt, "GREATER_THAN", _dot(nt, tc.outputs["Normal"], f_l), 0.6)
    if part == "torso" and spec.get("open"):
        strip = _math(nt, "LESS_THAN", _math(nt, "ABSOLUTE", a), half_w * 0.2)
        out = _mix(nt, _math(nt, "MULTIPLY", strip, front), out, spec["open"])
    if part == "torso" and spec.get("collar"):
        near_top = _math(nt, "GREATER_THAN", b, top_u * 0.8)
        mid = _math(nt, "LESS_THAN", _math(nt, "ABSOLUTE", a), half_w * 0.38)
        out = _mix(nt, _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", near_top, mid), front), out, spec["collar"])
    if part == "pants" and spec.get("belt") and o.name.startswith("LowerTorso"):
        band = _math(nt, "GREATER_THAN", b, top_u * 0.45)
        out = _mix(nt, band, out, spec["belt"])
    nt.links.new(out, bsdf.inputs["Base Color"])
    return m


def dress(geos, fwd, spec, skin="#F2C9A0"):
    sk = bpy.data.materials.new("Skin")
    sk.use_nodes = True
    sk.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexcol(skin)
    sk.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.38
    for o in geos:
        n = o.name
        if n.startswith(("Head", "LeftHand", "RightHand")):
            mat = sk
        elif n.startswith("UpperTorso"):
            mat = cloth_material(o, fwd, spec, "torso")
        elif "Arm" in n:
            mat = cloth_material(o, fwd, spec, "arm")
        elif "Foot" in n:
            mat = cloth_material(o, fwd, spec, "shoe")
        else:
            mat = cloth_material(o, fwd, spec, "pants")
        o.data.materials.clear()
        o.data.materials.append(mat)
        for p in o.data.polygons:
            p.use_smooth = True


# ------------------------------------------------------------------ real classic clothing (585x559 templates)
TW, TH = 585, 559
BUMP = 0.45
TORSO = {"F": (231, 74, 128, 128), "B": (427, 74, 128, 128), "R": (165, 74, 64, 128), "L": (361, 74, 64, 128),
         "U": (231, 8, 128, 64), "D": (231, 204, 128, 64)}
LIMB_IMG_LEFT = {"L": (19, 355, 64, 128), "B": (85, 355, 64, 128), "R": (151, 355, 64, 128), "F": (217, 355, 64, 128),
                 "U": (217, 289, 64, 64), "D": (217, 485, 64, 64)}      # labelled "Left Arm" / "Left Leg"
LIMB_IMG_RIGHT = {"F": (308, 355, 64, 128), "L": (374, 355, 64, 128), "B": (440, 355, 64, 128), "R": (506, 355, 64, 128),
                  "U": (308, 289, 64, 64), "D": (308, 485, 64, 64)}     # labelled "Right Arm" / "Right Leg"
GROUPS = {"torso": (("UpperTorso", "LowerTorso"), TORSO),
          "larm": (("LeftUpperArm", "LeftLowerArm", "LeftHand"), LIMB_IMG_LEFT),
          "rarm": (("RightUpperArm", "RightLowerArm", "RightHand"), LIMB_IMG_RIGHT),
          "lleg": (("LeftUpperLeg", "LeftLowerLeg", "LeftFoot"), LIMB_IMG_LEFT),
          "rleg": (("RightUpperLeg", "RightLowerLeg", "RightFoot"), LIMB_IMG_RIGHT)}


def classic_uv(geos, fwd):
    """Give every body part a 'Classic' UV map that reads the shirt/pants template the way Roblox does:
    each limb group (torso, each arm, each leg) is one box unfolded onto its template region, split between
    its R15 parts by height. Run in the rest pose."""
    Z = Vector((0, 0, 1))
    F = fwd.normalized()
    by_name = {o.name.split("_Geo")[0]: o for o in geos}
    # character's right: the side the right arm is on
    ra, ut = by_name.get("RightUpperArm"), by_name.get("UpperTorso")
    Rc = (sum((ra.matrix_world @ Vector(c) for c in ra.bound_box), Vector()) / 8 -
          sum((ut.matrix_world @ Vector(c) for c in ut.bound_box), Vector()) / 8)
    Rc = (Rc - F * Rc.dot(F)).normalized()
    Rc.z = 0
    Rc.normalize()
    axes = {"F": F, "B": -F, "R": Rc, "L": -Rc, "U": Z, "D": -Z}
    front_right = (-F).cross(Z)                    # viewer's right when looking at the front
    for key, (names, rects) in GROUPS.items():
        objs = [by_name[n] for n in names if n in by_name]
        pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
        rng = {}
        for nm, ax in list(axes.items()) + [("FR", front_right)]:
            vals = [p.dot(ax) for p in pts]
            rng[nm] = (min(vals), max(vals))
        for o in objs:
            me = o.data
            uvl = me.uv_layers.get("Classic") or me.uv_layers.new(name="Classic")
            me.uv_layers.active = uvl
            mw = o.matrix_world
            n3 = mw.to_3x3()
            for poly in me.polygons:
                nw = (n3 @ poly.normal).normalized()
                side = max(axes, key=lambda s: nw.dot(axes[s]))
                x0, y0, w, h = rects[side]
                for li in poly.loop_indices:
                    p = mw @ me.vertices[me.loops[li].vertex_index].co
                    if side in ("U", "D"):
                        a = p.dot(front_right)
                        u = (a - rng["FR"][0]) / max(1e-6, rng["FR"][1] - rng["FR"][0])
                        f = p.dot(F)
                        t = (f - rng["F"][0]) / max(1e-6, rng["F"][1] - rng["F"][0])
                        if side == "D":
                            t = 1 - t
                    else:
                        vr = (-axes[side]).cross(Z)    # viewer's right when looking at this side
                        a = p.dot(vr)
                        mn = min(pp.dot(vr) for pp in _corners(rng, axes, vr))
                        mx = max(pp.dot(vr) for pp in _corners(rng, axes, vr))
                        u = (a - mn) / max(1e-6, mx - mn)
                        t = (rng["U"][1] - p.z) / max(1e-6, rng["U"][1] - rng["U"][0])
                    u, t = min(max(u, 0.0), 1.0), min(max(t, 0.0), 1.0)
                    uvl.data[li].uv = ((x0 + 0.5 + u * (w - 1)) / TW, 1 - (y0 + 0.5 + t * (h - 1)) / TH)


def _corners(rng, axes, vr):
    """Horizontal extent of the group's box along vr, from its F and R ranges."""
    F, R = axes["F"], axes["R"]
    out = []
    for f in rng["F"]:
        for r in rng["R"]:
            out.append(F * f + R * r)
    return out


def _img(nt, path):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(path, check_existing=True)
    n.interpolation = "Linear"
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "Classic"
    nt.links.new(uv.outputs["UV"], n.inputs["Vector"])
    return n


def wear(geos, shirt=None, pants=None, skin="#F2C9A0"):
    """Classic clothing over the body colour: torso = skin, pants, shirt; arms = skin, shirt; legs = skin, pants."""
    mats = {}
    for kind, layers in (("torso", (pants, shirt)), ("arm", (shirt,)), ("leg", (pants,)), ("skin", ())):
        m = bpy.data.materials.new(f"Body_{kind}")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        b.inputs["Roughness"].default_value = 0.5
        col = None
        for path in layers:
            if not path:
                continue
            t = _img(nt, path)
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            nt.links.new(t.outputs["Alpha"], mix.inputs["Factor"])
            if col is None:
                mix.inputs[6].default_value = hexcol(skin)
            else:
                nt.links.new(col, mix.inputs[6])
            nt.links.new(t.outputs["Color"], mix.inputs[7])
            col = mix.outputs[2]
        if col is None:
            b.inputs["Base Color"].default_value = hexcol(skin)
        else:
            nt.links.new(col, b.inputs["Base Color"])
            # fabric depth: the template's own painted folds and seams become a bump map
            bw = nt.nodes.new("ShaderNodeRGBToBW")
            nt.links.new(col, bw.inputs["Color"])
            bump = nt.nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value = BUMP
            bump.inputs["Distance"].default_value = 0.03
            nt.links.new(bw.outputs["Val"], bump.inputs["Height"])
            nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
            b.inputs["Sheen Weight"].default_value = 0.35       # soft cloth sheen at grazing angles
            b.inputs["Roughness"].default_value = 0.72
        mats[kind] = m
    for o in geos:
        n = o.name
        kind = ("skin" if n.startswith("Head") else "torso" if "Torso" in n else
                "arm" if ("Arm" in n or "Hand" in n) else "leg")
        o.data.materials.clear()
        o.data.materials.append(mats[kind])
        for p in o.data.polygons:
            p.use_smooth = True


# ------------------------------------------------------------------ 3D shirt: cut shell, collar, cuffs
def _pixels(path):
    import numpy as np
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    return np.array(img.pixels[:], dtype="float32").reshape(h, w, 4), img


def _px(arr, x, y):
    """Template pixel (585x559 coords, y down) -> RGBA, whatever the real image size."""
    h, w = arr.shape[:2]
    return arr[min(h - 1, max(0, int((1 - (y + 0.5) / TH) * h))), min(w - 1, max(0, int((x + 0.5) / TW * w)))]


def open_strip(arr):
    """Width (template px) of a contrasting strip down the middle of the torso front: an open jacket's
    inner shirt. 0 when the front has none."""
    import numpy as np
    x0, y0, w, h = TORSO["F"]
    cols = [np.mean([_px(arr, x0 + i, y0 + j)[:3] for j in range(20, h - 20, 6)], axis=0) for i in range(w)]
    mid = w // 2
    c0 = cols[mid]
    lo = hi = mid
    while lo > 0 and np.abs(cols[lo - 1] - c0).max() < 0.1:
        lo -= 1
    while hi < w - 1 and np.abs(cols[hi + 1] - c0).max() < 0.1:
        hi += 1
    side = np.mean(cols[:lo] + cols[hi + 1:], axis=0) if lo > 0 and hi < w - 1 else c0
    width = hi - lo + 1
    return width if 0.12 * w < width < 0.7 * w and np.abs(side - c0).max() > 0.15 else 0


def _region_color(arr, rect, skip_mid=0, dominant=False):
    import numpy as np
    x0, y0, w, h = rect
    px = [_px(arr, x0 + i, y0 + j) for i in range(2, w - 2, 4) for j in range(2, h - 2, 4)
          if not (skip_mid and abs(i - w / 2) < skip_mid / 2)]
    px = [p for p in px if p[3] > 0.5]
    if not px:
        return (0.2, 0.2, 0.2, 1)
    px = np.array(px)
    if dominant:
        sat = px[:, :3].max(1) - px[:, :3].min(1)
        px = px[sat >= np.median(sat)]
    c = np.median(px, axis=0)
    return (float(c[0]), float(c[1]), float(c[2]), 1.0)


def _flat_mat(name, rgba, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Roughness"].default_value = rough
    b.inputs["Sheen Weight"].default_value = 0.35
    return m


def _shirt_mat(path):
    m = bpy.data.materials.new("ShirtShell")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = _img(nt, path)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(t.outputs["Color"], bw.inputs["Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = BUMP
    bump.inputs["Distance"].default_value = 0.03
    nt.links.new(bw.outputs["Val"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.72
    b.inputs["Sheen Weight"].default_value = 0.35
    return m


def _shell(o, arr, mat, rim, lift, strip=0, tag="_Shirt", kill_fn=None):
    """Copy a body part, cut it where the template is see-through (or inside the open front strip),
    push it out by `lift` world units and give it real thickness."""
    fx0, fy0, fw, fh = TORSO["F"]
    s = o.matrix_world.to_scale().x
    d = lift / s
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=9, use_grid_fill=True)
    uvl = bm.loops.layers.uv["Classic"]
    kill = []
    for f in bm.faces:
        u = sum(l[uvl].uv.x for l in f.loops) / len(f.loops)
        v = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
        x, y = u * TW, (1 - v) * TH
        a = _px(arr, x, y)[3]
        in_strip = False
        if strip:
            for l in f.loops:
                lx, ly = l[uvl].uv.x * TW, (1 - l[uvl].uv.y) * TH
                if fx0 - 1 <= lx <= fx0 + fw + 1 and fy0 - 1 <= ly <= fy0 + fh + 1 and abs(lx - (fx0 + fw / 2)) < strip / 2 - 0.5:
                    in_strip = True
        if a < 0.5 or in_strip or (kill_fn is not None and kill_fn(x, y)):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * d
    me = bpy.data.meshes.new(o.name + tag)
    bm.to_mesh(me)
    bm.free()
    if not me.polygons:
        return None
    sh = o.copy()
    sh.data = me
    sh.name = o.name.replace("_Geo", "") + tag
    sh.modifiers.clear()
    bpy.context.scene.collection.objects.link(sh)
    me.materials.clear()
    me.materials.append(mat)
    me.uv_layers.active = me.uv_layers["Classic"]
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(rim)
    so = sh.modifiers.new("thick", "SOLIDIFY")
    so.thickness, so.offset, so.use_rim = d * 0.9, -1.0, True
    so.material_offset, so.material_offset_rim = 1, 1
    bv = sh.modifiers.new("soft", "BEVEL")
    bv.width, bv.segments, bv.limit_method = d * 0.25, 2, "ANGLE"
    return sh


def shirt_3d(geos, shirt_path, lift=0.03, collar=True, cuffs=True):
    """Make the shirt a real layer: a copy of the torso and arm parts, pushed out by `lift` (world units),
    cut away wherever the template is see-through (and down the open front of a jacket), with real thickness.
    Adds a standing collar and rolled cuffs in the shirt's own colours. Run in the rest pose, after classic_uv."""
    arr, _ = _pixels(shirt_path)
    strip = open_strip(arr)
    mat = _shirt_mat(shirt_path)
    SHIRT_MAT[:] = [mat]
    dark = _region_color(arr, TORSO["F"], strip, dominant=True)
    rim = _flat_mat("ShirtRim", (dark[0] * 0.55, dark[1] * 0.55, dark[2] * 0.55, 1.0))
    made = []
    for o in geos:
        if not (o.name.startswith(("UpperTorso", "LowerTorso")) or "Arm" in o.name):
            continue
        sh = _shell(o, arr, mat, rim, lift, strip)
        if sh is None:
            continue
        made.append(sh)
    by_name = {o.name.split("_Geo")[0]: o for o in geos}
    if collar and "UpperTorso" in by_name:
        made += _collar(by_name["UpperTorso"], arr, strip, lift)
    if cuffs:
        made += _cuffs(by_name, arr, lift)
    return made


def shoe_band(arr, rects):
    """Rows (from the bottom of the leg strip) where the template paints a shoe, and the shoe colour.
    (0, None) when the bottom of the leg looks like the rest of the pants."""
    import numpy as np
    x0, y0, w, h = rects["F"]
    rows = []
    for j in range(h):
        px = [_px(arr, x0 + i, y0 + h - 1 - j) for i in range(6, w - 6, 3)]
        rows.append((np.mean([p[3] for p in px]), np.mean([p[:3] for p in px], axis=0)))
    if rows[2][0] < 0.5:
        return 0, None
    c0 = np.mean([r[1] for r in rows[1:5]], axis=0)
    n = 0
    while n < h and rows[n][0] > 0.5 and np.abs(rows[n][1] - c0).max() < 0.14:
        n += 1
    top = np.mean([r[1] for r in rows[n:min(h, n + 20)]], axis=0) if n < h else c0
    if n < 6 or n > 0.6 * h or np.abs(top - c0).max() < 0.15:
        return 0, None
    return n, (float(c0[0]), float(c0[1]), float(c0[2]), 1.0)


def pants_3d(geos, pants_path, lift=0.022, shoes=True):
    """Pants as a real layer over the legs, ending above the shoe the template paints; then real 3D sneakers
    (rounded upper with a toe, and a sole) in the painted shoe colour."""
    arr, _ = _pixels(pants_path)
    mat = _shirt_mat(pants_path)
    b_ = mat.node_tree.nodes["Principled BSDF"]
    b_.inputs["Roughness"].default_value = 0.85
    b_.inputs["Sheen Weight"].default_value = 0.15
    dark = _region_color(arr, LIMB_IMG_LEFT["F"], dominant=True)
    rim = _flat_mat("PantsRim", (dark[0] * 0.55, dark[1] * 0.55, dark[2] * 0.55, 1.0))
    rows, shoe_col = shoe_band(arr, LIMB_IMG_LEFT)
    ly0, lh = LIMB_IMG_LEFT["F"][1], LIMB_IMG_LEFT["F"][3]
    cut = (lambda x, y: y > ly0 + lh - rows - 0.5 or y > ly0 + lh + 1) if (shoes and rows) else None
    made = []
    for o in geos:
        if "Leg" in o.name or "Foot" in o.name:
            sh = _shell(o, arr, mat, rim, lift, 0, "_Pants", cut)
            if sh is not None:
                made.append(sh)
    if not shoes:
        return made
    by_name = {o.name.split("_Geo")[0]: o for o in geos}
    front = Vector((0, FRONT_Y, 0))
    if shoe_col is None:
        shoe_col = hexcol("#2A2A2A")
    lum = 0.3 * shoe_col[0] + 0.6 * shoe_col[1] + 0.1 * shoe_col[2]
    sole_col = hexcol("#9A9A9A") if lum > 0.45 else hexcol("#F1F1F1")
    upper = _flat_mat("ShoeUpper", shoe_col, 0.5)
    sole = _flat_mat("ShoeSole", sole_col, 0.6)
    for side in ("Left", "Right"):
        parts = [by_name.get(f"{side}{p}") for p in ("UpperLeg", "LowerLeg", "Foot")]
        if None in parts:
            continue
        foot = parts[-1]
        lp = [q.matrix_world @ Vector(c) for q in parts for c in q.bound_box]
        fp = [foot.matrix_world @ Vector(c) for c in foot.bound_box]
        cx, cy = sum(q.x for q in fp) / 8, sum(q.y for q in fp) / 8
        zmin = min(q.z for q in lp)
        leg_h = max(q.z for q in lp) - zmin
        fw_ = max(q.x for q in fp) - min(q.x for q in fp)
        fd = max(q.y for q in fp) - min(q.y for q in fp)
        sole_h = 0.08
        shoe_h = max(0.2, (rows / lh) * leg_h if rows else 0.26)
        made.append(_box_child(foot, f"sole_{side}", Vector((cx, cy, zmin + sole_h / 2)) + front * 0.07,
                               (fw_ + lift * 2 + 0.06, fd + lift * 2 + 0.17, sole_h), sole))
        made.append(_box_child(foot, f"shoe_{side}", Vector((cx, cy, zmin + sole_h + (shoe_h - sole_h) / 2)) + front * 0.05,
                               (fw_ + lift * 2 + 0.03, fd + lift * 2 + 0.11, shoe_h - sole_h + 0.02), upper))
        if rows:                                   # a clean pants hem over the cut, just above the shoe
            zc = zmin + shoe_h
            host = next((q for q in parts if min((q.matrix_world @ Vector(c)).z for c in q.bound_box) <= zc), foot)
            hp = [host.matrix_world @ Vector(c) for c in host.bound_box]
            hx, hy = sum(q.x for q in hp) / 8, sum(q.y for q in hp) / 8
            hsx = max(q.x for q in hp) - min(q.x for q in hp)
            hsy = max(q.y for q in hp) - min(q.y for q in hp)
            made.append(_box_child(host, f"hem_{side}", Vector((hx, hy, zc + 0.035)),
                                   (hsx + lift * 3.2, hsy + lift * 3.2, 0.11), mat,
                                   rect=(LIMB_IMG_LEFT["F"][0], ly0 + lh - rows - 24, LIMB_IMG_LEFT["F"][2], 22)))
        made.append(_box_child(foot, f"toe_{side}", Vector((cx, cy, zmin + sole_h + 0.07)) + front * (fd / 2 + 0.08),
                               (fw_ + lift * 2 + 0.0, 0.16, 0.15), upper))
    return made


def _box_child(parent, name, center_w, size_w, mat, rot_z=0.0, rect=None):
    """A bevelled box built in world space, then attached to the same bone as `parent`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size_w[0], v.co.y * size_w[1], v.co.z * size_w[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.matrix_world = __import__("mathutils").Matrix.Translation(center_w) @ __import__("mathutils").Matrix.Rotation(rot_z, 4, "Z")
    me.materials.append(mat)
    if rect is not None:
        uv = me.uv_layers.new(name="Classic")
        x0, y0, w, h = rect
        for poly in me.polygons:
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                a = (co.x / max(size_w[0], 1e-6) + co.y / max(size_w[1], 1e-6)) * 0.5 + 0.5
                b = co.z / max(size_w[2], 1e-6) + 0.5
                uv.data[li].uv = ((x0 + 4 + a * (w - 8)) / TW, 1 - (y0 + 4 + (1 - b) * min(h - 8, 24)) / TH)
    bv = o.modifiers.new("bev", "BEVEL")
    bv.width, bv.segments = min(size_w) * 0.35, 3
    for p in me.polygons:
        p.use_smooth = True
    mw = o.matrix_world.copy()
    o.parent = parent.parent
    o.parent_type = parent.parent_type
    o.parent_bone = parent.parent_bone
    bpy.context.view_layer.update()
    o.matrix_world = mw
    return o


def _collar(torso, arr, strip, lift):
    pts = [torso.matrix_world @ Vector(c) for c in torso.bound_box]
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    cx, cy, top = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(zs)
    w, dpt = max(xs) - min(xs), max(ys) - min(ys)
    col = SHIRT_MAT[0]
    t, h = 0.09, 0.2
    out = []
    # which way is front: the torso's thin axis is y here; front sign from the strip side is not needed,
    # the collar wraps back and both sides, leaving the front open
    for sgn in (-1, 1):
        out.append(_box_child(torso, f"collar_side{sgn}", Vector((cx + sgn * w * 0.26, cy, top + h * 0.3)),
                              (t, dpt * 0.62, h), col, rect=TORSO["R"]))
    back = 1 if FRONT_Y < 0 else -1
    out.append(_box_child(torso, "collar_back", Vector((cx, cy + back * dpt * 0.28, top + h * 0.35)),
                          (w * 0.56, t, h * 1.1), col, rect=TORSO["B"]))
    return out


def _cuffs(by_name, arr, lift):
    out = []
    for side, rects in (("Left", LIMB_IMG_LEFT), ("Right", LIMB_IMG_RIGHT)):
        parts = [by_name.get(f"{side}{p}") for p in ("UpperArm", "LowerArm", "Hand")]
        if None in parts:
            continue
        x0, y0, w, h = rects["F"]
        end = h
        for j in range(h):
            if _px(arr, x0 + w / 2, y0 + j)[3] < 0.5:
                end = j
                break
        if end < 4:
            continue
        t = min(end, h - 6) / h
        pts = [p.matrix_world @ Vector(c) for p in parts for c in p.bound_box]
        zmax, zmin = max(q.z for q in pts), min(q.z for q in pts)
        z = zmax - t * (zmax - zmin)
        host = next((p for p in parts if min((p.matrix_world @ Vector(c)).z for c in p.bound_box) <= z), parts[-1])
        hp = [host.matrix_world @ Vector(c) for c in host.bound_box]
        cx, cy = sum(q.x for q in hp) / 8, sum(q.y for q in hp) / 8
        sx, sy = max(q.x for q in hp) - min(q.x for q in hp), max(q.y for q in hp) - min(q.y for q in hp)
        col = SHIRT_MAT[0]
        out.append(_box_child(host, f"cuff_{side}", Vector((cx, cy, z - 0.015)),
                              (sx + lift * 3.4, sy + lift * 3.4, 0.17), col, rect=(x0, y0 + max(0, end - 26), w, 26)))
    return out


SHIRT_MAT = [None]
FRONT_Y = -1          # set by the caller: sign of the character's facing along world Y


# ------------------------------------------------------------------ real Roblox hair / accessories
def char_right(geos, fwd):
    by_name = {o.name.split("_Geo")[0]: o for o in geos}
    c = lambda o: sum((o.matrix_world @ Vector(q) for q in o.bound_box), Vector()) / 8
    r = c(by_name["RightUpperArm"]) - c(by_name["UpperTorso"])
    r.z = 0
    r -= fwd * r.dot(fwd)
    return r.normalized()


def load_mesh_v1(path):
    """Roblox 'version 1.00' text mesh: N triangles of [pos][normal][uv] triples; v1.00 positions are halved."""
    import re
    txt = open(path, "rb").read().decode("latin-1")
    head, rest = txt.split("\n", 1)
    half = "1.00" in head
    _, rest = rest.split("\n", 1)
    nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", rest)]
    verts, uvs = [], []
    for i in range(0, len(nums) - 8, 9):
        x, y, z = nums[i:i + 3]
        if half:
            x, y, z = x * 0.5, y * 0.5, z * 0.5
        verts.append((x, y, z))
        uvs.append((nums[i + 6], 1 - nums[i + 7]))
    tris = [(i, i + 1, i + 2) for i in range(0, len(verts) - 2, 3)]
    return verts, uvs, tris


def accessory(mesh_path, tex_path, head_center, stud, fwd, right, handle_att=(0, 0.4, -0.15),
              head_att=(0, 0.6, 0), scale=1.05, name="hair"):
    """Place a Roblox accessory mesh the way Roblox does: Handle = head attachment - handle attachment.
    Roblox axes (x right, y up, z back) map to world (right, Z, -fwd); 'stud' is world units per stud."""
    verts, uvs, tris = load_mesh_v1(mesh_path)
    hx, hy, hz = (head_att[i] - handle_att[i] for i in range(3))
    up = Vector((0, 0, 1))
    back = -fwd
    to_w = lambda x, y, z: head_center + (right * x + up * y + back * z) * stud
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_w(hx + x * scale, hy + y * scale, hz + z * scale) for x, y, z in verts], [], tris)
    uvl = me.uv_layers.new(name="UV")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    m = bpy.data.materials.new(name + "_mat")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.5
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(tex_path, check_existing=True)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    o.data.materials.append(m)
    return o


# ------------------------------------------------------------------ procedural hair (fallback)
def _obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def _clump(name, root, tip, w, t, mat, side, curl=0.0):
    """A tapered hair lock from root to tip: 4-sided, wide at the root, pointed at the tip, slightly curved."""
    bm = bmesh.new()
    axis = (tip - root)
    n = 5
    rings = []
    for i in range(n + 1):
        u = i / n
        c = root + axis * u + side * (curl * math.sin(u * math.pi) * axis.length * 0.25)
        k = (1 - u) ** 0.8
        ww, tt = w * k + 0.01, t * k + 0.01
        nrm = axis.normalized().cross(side).normalized()
        ring = [bm.verts.new(c + side * sx * ww + nrm * sy * tt) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(4):
            bm.faces.new((r0[j], r0[(j + 1) % 4], r1[(j + 1) % 4], r1[j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    o = _obj(name, bm, mat)
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    return o


def hair(head, fwd, color="#2A1A12", style="sweep"):
    """Returns the hair objects (world space). style: sweep (side-swept fringe), spiky, bob."""
    mat = bpy.data.materials.new("Hair")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hexcol(color)
    b.inputs["Roughness"].default_value = 0.45
    hp = _bbox_world(head)
    c = sum(hp, Vector()) / 8
    top = max(p.z for p in hp)
    hw = max(p.x for p in hp) - min(p.x for p in hp)
    side = fwd.cross(Vector((0, 0, 1))).normalized()       # character's left-to-right on screen
    # cap: the head shape, scaled up, cut along a line from the forehead to the nape
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.transform(head.matrix_world)
    for v in bm.verts:
        v.co = c + (v.co - c) * Vector((1.12, 1.12, 1.08)) + Vector((0, 0, 0.06))
    front_pt = c + fwd * hw * 0.6 + Vector((0, 0, top - c.z - hw * 0.2))
    back_pt = c - fwd * hw * 0.6 + Vector((0, 0, top - c.z - hw * (0.72 if style != "bob" else 0.9)))
    d = back_pt - front_pt
    nrm = d.cross(side).normalized()
    if nrm.z < 0:
        nrm = -nrm
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=front_pt, plane_no=nrm, clear_inner=True)
    cap = _obj("hair_cap", bm, mat)
    so = cap.modifiers.new("solid", "SOLIDIFY")
    so.thickness, so.offset = 0.05, -1
    bv = cap.modifiers.new("bev", "BEVEL")
    bv.width, bv.segments = 0.02, 2
    parts = [cap]
    hair_front = c + fwd * hw * 0.62
    line_z = top - hw * 0.1
    if style == "cap":
        for i, (x, ln) in enumerate(((0.14, 0.3), (0.34, 0.22))):
            root = hair_front + side * (x * hw) + Vector((0, 0, line_z - hair_front.z - hw * 0.08))
            tip = root + side * (hw * 0.2) + Vector((0, 0, -hw * ln)) - fwd * 0.03
            parts.append(_clump(f"lock{i}", root, tip, hw * 0.16, hw * 0.045, mat, side, 0.5))
        for sgn in (-1, 1):
            root = c + side * sgn * hw * 0.56 + Vector((0, 0, top - c.z - hw * 0.12))
            tip = root + Vector((0, 0, -hw * 0.34)) + fwd * 0.04
            parts.append(_clump(f"side{sgn}", root, tip, hw * 0.14, hw * 0.06, mat, fwd, 0.0))
        return parts
    if style in ("sweep", "bob"):
        for i in range(6):
            x = -0.42 + i * 0.17
            root = hair_front + side * (x * hw) + Vector((0, 0, line_z - hair_front.z))
            ln = hw * (0.28 + 0.07 * math.sin(i * 1.7))
            tip = root + side * (hw * 0.18) + Vector((0, 0, -ln)) + fwd * 0.02
            parts.append(_clump(f"lock{i}", root, tip, hw * 0.11, hw * 0.06, mat, side, 0.4))
        for sgn in (-1, 1):                                   # side locks over the ears
            root = c + side * sgn * hw * 0.58 + Vector((0, 0, top - c.z - hw * 0.15))
            tip = root + Vector((0, 0, -hw * {"sweep": 0.45, "cap": 0.38}.get(style, 0.8))) + fwd * 0.05
            parts.append(_clump(f"side{sgn}", root, tip, hw * 0.12, hw * 0.07, mat, fwd, 0.0))
    if style in ("sweep", "spiky"):
        for i in range(5):                                    # tufts on top for volume
            ang = i / 5 * math.tau
            root = c + Vector((0, 0, top - c.z + 0.08)) + (side * math.cos(ang) + fwd * math.sin(ang)) * hw * 0.25
            tip = root + Vector((0, 0, hw * (0.22 if style == "sweep" else 0.4))) - fwd * hw * 0.12 + side * hw * 0.06
            parts.append(_clump(f"tuft{i}", root, tip, hw * 0.16, hw * 0.1, mat, side, 0.3))
    return parts


def parent_to_bone(objs, arm, bone):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.data.bones.active = arm.data.bones[bone]
    bpy.ops.object.parent_set(type="BONE", keep_transform=True)


# ------------------------------------------------------------------ hero gear: cap, hood, drawstrings
def _flatmat(name, hexc, rough=0.6):
    return _flat_mat(name, hexcol(hexc), rough)


def _rbox(name, size, mat, bevel=0.1, taper=1.0, segs=4):
    """A rounded box at the origin; `taper` shrinks the top face (a cap crown)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        k = taper if v.co.z > 0 else 1.0
        v.co = Vector((v.co.x * size[0] * k, v.co.y * size[1] * k, v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    if bevel:
        bv = o.modifiers.new("bev", "BEVEL")
        bv.width, bv.segments = bevel, segs
    for p in me.polygons:
        p.use_smooth = True
    return o


def _place(o, loc, fwd_dir, tilt=0.0):
    """Turn the object's +Y toward fwd_dir (horizontal), tilt about its own X, move to loc."""
    from mathutils import Matrix
    ang = math.atan2(-fwd_dir.x, fwd_dir.y)
    o.matrix_world = Matrix.Translation(loc) @ Matrix.Rotation(ang, 4, "Z") @ Matrix.Rotation(tilt, 4, "X")
    return o


def cap(head, fwd, right, crown="#12A7F0", brim="#FF6A00", turn=55.0):
    """A baseball cap worn turned to the character's right by `turn` degrees: tapered crown, flat brim, button."""
    hp = _bbox_world(head)
    c = sum(hp, Vector()) / 8
    top = max(p.z for p in hp)
    hw = max(p.x for p in hp) - min(p.x for p in hp)
    a = math.radians(turn)
    d = (fwd * math.cos(a) + right * math.sin(a)).normalized()
    cm, bm_ = _flatmat("CapCrown", crown, 0.55), _flatmat("CapBrim", brim, 0.55)
    ch = hw * 0.62
    cr = _place(_rbox("cap_crown", (hw * 1.16, hw * 1.16, ch), cm, hw * 0.26, 0.7, 6), c + Vector((0, 0, top - c.z + ch * 0.06)), d)
    br = _place(_rbox("cap_brim", (hw * 1.0, hw * 0.8, hw * 0.1), bm_, hw * 0.04, 1.0, 3),
                c + d * (hw * 0.88) + Vector((0, 0, top - c.z - ch * 0.3)), d, math.radians(-17))
    bt = _place(_rbox("cap_button", (hw * 0.16, hw * 0.16, hw * 0.07), cm, hw * 0.03, 1.0, 3),
                c + Vector((0, 0, top - c.z + ch * 0.64)), d)
    return [cr, br, bt]


def _attach(o, part):
    mw = o.matrix_world.copy()
    o.parent = part.parent
    o.parent_type = part.parent_type
    o.parent_bone = part.parent_bone
    bpy.context.view_layer.update()
    o.matrix_world = mw
    return o


def hood(geos, fwd, color="#1A36B8", strings="#F3E9D2"):
    """A bunched hood around the neck (a thick ring, lower at the front) and two drawstrings."""
    by = {o.name.split("_Geo")[0]: o for o in geos}
    t = by["UpperTorso"]
    tp = _bbox_world(t)
    cx, cy = sum(p.x for p in tp) / 8, sum(p.y for p in tp) / 8
    top = max(p.z for p in tp)
    w = max(p.x for p in tp) - min(p.x for p in tp)
    dep = max(p.y for p in tp) - min(p.y for p in tp)
    mat = _flatmat("Hood", color, 0.75)
    bpy.ops.mesh.primitive_torus_add(major_radius=w * 0.3, minor_radius=w * 0.135, major_segments=40, minor_segments=14,
                                     location=(cx, cy - fwd.y * w * 0.07, top + w * 0.06))
    ring = bpy.context.object
    ring.name = "hood"
    ring.scale = (1.0, 0.85, 0.75)
    ring.rotation_euler = (math.radians(16) * (-1 if fwd.y > 0 else 1), 0, 0)
    ring.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    out = [_attach(ring, t)]
    sm = _flatmat("Strings", strings, 0.6)
    for sgn in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=w * 0.022, depth=w * 0.34, vertices=12,
                                            location=(cx + sgn * w * 0.11, cy + fwd.y * (dep / 2 + 0.05), top - w * 0.16))
        st = bpy.context.object
        st.name = f"string{sgn}"
        st.rotation_euler = (0, math.radians(-6 * sgn), 0)
        st.data.materials.append(sm)
        bpy.ops.object.shade_smooth()
        out.append(_attach(st, t))
    return out
