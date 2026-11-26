"""The In This Town cast (runs inside Blender). One call imports the R15 rig and dresses it:
    cast.spawn(who, (x, y), face)  ->  dict(arm, face, faces, hover, fwd, face_front, face_center, geos)
Cast:
    hero   Pip, the narrator: warm brown skin, orange star hoodie, purple beanie with a pom-pom
           (art: engine/narrator_art.py; faces smirk grin happy laugh shock scared sad angry)
    kid    plaid friend / sibling            dad    green flannel, side-swept brown hair
    mom    grey cardigan, brown bob           comic  the comedian, black leather jacket
    clown  orange spiky hair, red nose        guy    denim jacket, spiky black hair
    teen   black hoodie, hair mesh
All but the hero use the classic faces in assets/roblox/faces (angry cry deadpan evil grin laugh nervous sad
scared shock sideeye sleepy smile smug wink). To add someone, add a recipe to CAST (see _r below)."""
import bpy, os, math
from mathutils import Vector
import rbx

MILO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(MILO, "work")
CLOTHES = os.path.join(MILO, "assets", "roblox", "clothes")
HAIRS = os.path.join(MILO, "assets", "roblox", "hair")

FACES = os.path.join(MILO, "assets", "roblox", "faces")


def _r(skin, shirt, pants, hair, face="smile", **kw):
    d = {"skin": skin, "shirt": os.path.join(CLOTHES, shirt + ".png"), "pants": os.path.join(CLOTHES, pants + ".png"),
         "faces": FACES, "face": face, "face_scale": 1.0, "collar": True, "hair": hair}
    d.update(kw)
    return d


CAST = {
    "hero": {"skin": "#8A5634", "shirt": os.path.join(WORK, "narrator", "hoodie.png"),
             "pants": os.path.join(CLOTHES, "382538503.png"), "faces": os.path.join(WORK, "narrator", "faces"),
             "face": "smirk", "face_scale": 1.1, "collar": False, "hood": "#B9420C", "beanie": "#5B2EA6",
             "hair": ("cap", "#1C120E")},
    "kid": {"skin": "#F2C9A0", "shirt": os.path.join(CLOTHES, "398635081.png"),
            "pants": os.path.join(CLOTHES, "398633812.png"), "faces": FACES, "face": "smile", "face_scale": 1.0,
            "collar": True, "hair": ("mesh", os.path.join(HAIRS, "319626684.mesh"), os.path.join(HAIRS, "1744035631.png"))},
    "dad": _r("#E8B48A", "382538059", "382538503", ("sweep", "#3A2414"), "deadpan"),
    "mom": _r("#F2C9A0", "398634295", "398634487", ("bob", "#5A3418")),
    "comic": _r("#C68E5F", "382538295", "129459077", ("sweep", "#151012"), "grin"),
    "clown": _r("#F7E6DA", "4047886060", "398635338", ("spiky", "#FF6A1A"), "grin", nose="#E8202A"),
    "guy": _r("#B47B52", "144076436", "144076760", ("spiky", "#1A1414")),
    "teen": _r("#F2C9A0", "607785314", "382537569",
               ("mesh", os.path.join(HAIRS, "83293901.mesh"), os.path.join(HAIRS, "6858317867.png"))),
}


def glow(name, hexc, strength=6.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rbx.hexcol(hexc)
    b.inputs["Emission Color"].default_value = rbx.hexcol(hexc)
    b.inputs["Emission Strength"].default_value = strength
    return m


def metal(name, hexc, rough=0.28):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rbx.hexcol(hexc)
    b.inputs["Metallic"].default_value = 0.9
    b.inputs["Roughness"].default_value = rough
    return m


def face_plane(img, face_front, fwd, size, emissive=False, push=0.012):
    bpy.ops.mesh.primitive_plane_add(size=1, location=face_front + fwd * push)
    f = bpy.context.object
    f.name = "Face"
    f.scale = (size, size, 1)
    f.rotation_euler = fwd.to_track_quat("Z", "Y").to_euler()
    m = bpy.data.materials.new("FaceMat")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(img, check_existing=True)
    t.extension = "CLIP"
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.4
    if emissive:
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = 2.2
    f.data.materials.append(m)
    return f


def _sphere(name, loc, r, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def _rod(name, a, b, r, mat):
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=12, location=(a + b) / 2)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def head_box(head):
    hp = [head.matrix_world @ Vector(c) for c in head.bound_box]
    c = sum(hp, Vector()) / 8
    return c, max(p.z for p in hp), max(p.x for p in hp) - min(p.x for p in hp)


def beanie(head, fwd, color):
    """A knit beanie: the top of a sphere over the head, a folded band and a pom-pom."""
    import bmesh
    c, top, hw = head_box(head)
    up = Vector((0, 0, 1))
    knit = bpy.data.materials.new("Beanie")
    knit.use_nodes = True
    nt = knit.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.9
    tex = nt.nodes.new("ShaderNodeTexWave")                  # knit ribs
    tex.inputs["Scale"].default_value = 18.0
    tex.wave_type = "BANDS"
    tex.bands_direction = "X"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = 0.78
    mr.inputs["To Max"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = rbx.hexcol(color)
    nt.links.new(tex.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], mix.inputs[7])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    cut = c.z + hw * 0.2                                      # bottom edge just above the brows
    bpy.ops.mesh.primitive_uv_sphere_add(radius=hw * 0.73, location=c + up * hw * 0.04, segments=32, ring_count=16)
    cap = bpy.context.object
    cap.name = "beanie"
    cap.scale = (1.0, 1.0, 1.02)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    loc = cap.matrix_world.translation
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cut - loc.z),
                           plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(cap.data)
    bm.free()
    cap.data.materials.append(knit)
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(radius=hw * 0.745, depth=hw * 0.22, vertices=40,
                                        location=(c.x, c.y, cut + hw * 0.07))
    band = bpy.context.object
    band.name = "beanie_band"
    band.data.materials.append(knit)
    bpy.ops.object.shade_smooth()
    pom = _sphere("beanie_pom", c + up * (hw * 0.04 + hw * 0.75), hw * 0.17, knit)
    return [cap, band, pom]


def gear(who, head, fwd, right, face_front):
    r = CAST[who]
    c, top, hw = head_box(head)
    out = []
    h = r.get("hair")
    if h and h[0] == "mesh":
        out.append(rbx.accessory(h[1], h[2], c, hw / 1.2, fwd, right))
    elif h:
        out += rbx.hair(head, fwd, h[1], h[0])
    if r.get("beanie"):
        out += beanie(head, fwd, r["beanie"])
    if r.get("nose"):
        m = bpy.data.materials.new("ClownNose")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = rbx.hexcol(r["nose"])
        b.inputs["Roughness"].default_value = 0.2
        b.inputs["Coat Weight"].default_value = 0.8
        out.append(_sphere("clown_nose", face_front + fwd * hw * 0.07 - Vector((0, 0, hw * 0.05)), hw * 0.12, m))
    return out


LAST_HOVER = 0.0


def build(who, geos, arm, fwd, face_front, face_center, face=None):
    global LAST_HOVER
    LAST_HOVER = 0.0
    r = CAST[who]
    rbx.FRONT_Y = -1 if fwd.y < 0 else 1
    rbx.classic_uv(geos, fwd)
    rbx.wear(geos, r["shirt"], r["pants"], skin=r["skin"])
    made = rbx.shirt_3d(geos, r["shirt"], collar=r["collar"]) + rbx.pants_3d(geos, r["pants"])
    if r.get("hood"):
        made += rbx.hood(geos, fwd, r["hood"])
    head = next(o for o in geos if o.name.startswith("Head"))
    c, top, hw = head_box(head)
    right = rbx.char_right(geos, fwd)
    push = 0.012
    f = face_plane(os.path.join(r["faces"], (face or r["face"]) + ".png"), face_front, fwd, hw * r["face_scale"],
                   r.get("glow_face", False), push)
    rbx.parent_to_bone([f] + gear(who, head, fwd, right, face_front), arm, "Head")
    bpy.context.view_layer.update()
    return f


def faces_dir(who):
    return CAST[who]["faces"]


def spawn(who, pos=(0.0, 0.0), face=None, height=5.0):
    """Import an R15 rig, scale it to `height`, dress it as `who`, then move it to pos (x, y).
    Returns dict(arm, face, faces, hover, fwd, face_front, face_center, geos)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(MILO, "assets", "roblox", "R15_Block.fbx"))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    bpy.context.view_layer.update()
    ff = next(o for o in new if o.name.startswith("FaceFront_Att")).matrix_world.translation.copy()
    fc = next(o for o in new if o.name.startswith("FaceCenter_Att")).matrix_world.translation.copy()
    for o in [o for o in new if "_Att" in o.name]:
        new.remove(o)
        bpy.data.objects.remove(o)
    geos = [o for o in new if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in geos for c in o.bound_box]
    zmin, zmax = min(p.z for p in pts), max(p.z for p in pts)
    k = height / (zmax - zmin)
    arm.scale = tuple(v * k for v in arm.scale)
    arm.location.z -= zmin * k
    bpy.context.view_layer.update()
    ff = Vector((ff.x * k, ff.y * k, (ff.z - zmin) * k))
    fc = Vector((fc.x * k, fc.y * k, (fc.z - zmin) * k))
    fwd = (ff - fc).normalized()
    f = build(who, geos, arm, fwd, ff, fc, face)
    hv = LAST_HOVER
    arm.location.x += pos[0]
    arm.location.y += pos[1]
    bpy.context.view_layer.update()
    off = Vector((pos[0], pos[1], hv))
    return {"arm": arm, "face": f, "faces": faces_dir(who), "hover": hv, "fwd": fwd, "geos": geos,
            "face_front": ff + off, "face_center": fc + off}
