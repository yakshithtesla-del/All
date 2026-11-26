"""The 3D kit (runs inside Blender 5.x, EEVEE). Nothing here is story-specific.

What it gives a story file:
  M(name, rgb)                 plastic material
  Static(coll)                 many boxes merged into a few meshes (walls, houses, furniture)
  part(...)                    one movable box / cylinder
  picture(...)                 a flat board with a drawn texture on it (signs, posters, clock face)
  Char(...)                    a blocky character: root, body, neck, 2 arms, 2 legs, a drawn face
  build_street(), build_room() the two sets
  mood(name)                   day / dusk / night / room lighting
  cam(pos, target, fov)        the camera
Units: 1 = one stud. A grown-up is about 5.3 tall, a house about 14 wide.
Characters face -Y. Angles are in degrees."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "tex")          # drawn textures (clock face), made by town_tex.py
D = math.radians


# ---------------------------------------------------------------- small maths
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def lerp(a, b, t): return a + (b - a) * t
def lerp3(a, b, t): return tuple(lerp(a[i], b[i], t) for i in range(len(a)))
def ease(t): t = clamp(t); return t * t * (3 - 2 * t)
def ease_out(t): t = clamp(t); return 1 - (1 - t) ** 3
def ease_in(t): t = clamp(t); return t ** 3
def ramp(t, t0, t1): return clamp((t - t0) / max(1e-6, t1 - t0))
def pop(t, t0, d=0.22):
    """0 -> 1 with a little overshoot: the snappy pose change the real shorts use."""
    x = ramp(t, t0, t0 + d)
    return 1 + 0.18 * math.sin(x * math.pi) * (1 - x) * 2 - (1 - x) ** 3 if x < 1 else 1.0
def wig(t, hz, amp=1.0, ph=0.0): return math.sin(t * hz * 2 * math.pi + ph) * amp


def lin(c):
    """0-255 sRGB -> linear RGBA for Blender."""
    out = []
    for v in c[:3]:
        v = v / 255.0
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


# ---------------------------------------------------------------- scene basics
def new_scene(w=1080, h=1920, fps=30, samples=16):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = w, h, 100
    s.render.fps = fps
    s.render.image_settings.file_format = "JPEG"; s.render.image_settings.quality = 96
    s.render.film_transparent = False
    ee = s.eevee
    ee.taa_render_samples = samples
    ee.use_shadows = True
    # soft contact shading (ambient occlusion); costs about 15% render time
    for k, v in (("use_raytracing", True), ("ray_tracing_method", "SCREEN"), ("use_fast_gi", True), ("fast_gi_method", "AMBIENT_OCCLUSION_ONLY"), ("shadow_ray_count", 1), ("shadow_step_count", 4), ("use_volumetric_shadows", False)):
        try: setattr(ee, k, v)
        except Exception: pass
    for vt in ("Standard", "Khronos PBR Neutral"):
        try: s.view_settings.view_transform = vt; break
        except Exception: pass
    try: s.view_settings.look = "None"
    except Exception: pass
    s.view_settings.exposure = 0.0; s.view_settings.gamma = 1.0
    # world: a two-colour sky
    wd = bpy.data.worlds.new("sky"); s.world = wd; wd.use_nodes = True
    nt = wd.node_tree; nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange"); mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    bg = nt.nodes.new("ShaderNodeBackground"); out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Generated"], sp.inputs[0]); nt.links.new(sp.outputs["Z"], mr.inputs[0])
    mr.inputs[1].default_value = -0.05; mr.inputs[2].default_value = 0.55
    amb = nt.nodes.new("ShaderNodeBackground"); lp = nt.nodes.new("ShaderNodeLightPath"); ms = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mr.outputs[0], mix.inputs[0]); nt.links.new(mix.outputs[2], bg.inputs[0])
    nt.links.new(lp.outputs["Is Camera Ray"], ms.inputs[0]); nt.links.new(amb.outputs[0], ms.inputs[1]); nt.links.new(bg.outputs[0], ms.inputs[2]); nt.links.new(ms.outputs[0], out.inputs[0])
    G.world_mix, G.world_bg, G.world_amb = mix, bg, amb
    # sun + camera
    sd = bpy.data.lights.new("sun", "SUN"); sd.angle = D(3.0)
    G.sun = bpy.data.objects.new("sun", sd); s.collection.objects.link(G.sun)
    fd = bpy.data.lights.new("fill", "SUN"); fd.angle = D(20.0); fd.use_shadow = False
    G.fill = bpy.data.objects.new("fill", fd); s.collection.objects.link(G.fill)
    cd = bpy.data.cameras.new("cam"); cd.sensor_fit = "VERTICAL"; cd.clip_start = 0.1; cd.clip_end = 2000
    G.cam = bpy.data.objects.new("cam", cd); s.collection.objects.link(G.cam); s.camera = G.cam
    return s


class G:  # globals of the running build
    world_mix = world_bg = world_amb = sun = fill = cam = None
    mats = {}; colls = {}; images = {}


def coll(name):
    if name not in G.colls:
        c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); G.colls[name] = c
    return G.colls[name]


def use(*names):
    """Show only these collections (sets and characters) in the render."""
    for n, c in G.colls.items(): c.hide_render = n not in names


def M(name, rgb=None, rough=0.5, emit=None, emit_k=0.0, spec=0.4, tex=None, ts=1.0, amt=None):
    """Plastic material. tex adds the fine surface detail real Roblox materials have:
    'noise' (paint, plastic), 'fabric', 'grass', 'asphalt', 'brick', 'siding', 'shingle', 'planks', 'tiles'."""
    if name in G.mats: return G.mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(rgb); b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    if emit is not None:
        b.inputs["Emission Color"].default_value = lin(emit); b.inputs["Emission Strength"].default_value = emit_k
    if tex:
        tc = nt.nodes.new("ShaderNodeTexCoord"); mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"
        dark = {"noise": 0.80, "fabric": 0.70, "grass": 0.62, "asphalt": 0.72, "brick": 0.62, "siding": 0.74, "shingle": 0.6, "planks": 0.68, "tiles": 0.7}[tex]
        if amt is not None: dark = 1 - amt
        mx.inputs[6].default_value = lin(tuple(v * dark for v in rgb)); mx.inputs[7].default_value = lin(tuple(min(255, v * 1.06) for v in rgb))
        if tex in ("noise", "fabric", "grass", "asphalt"):
            n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = {"noise": 1.2, "fabric": 16.0, "grass": 2.2, "asphalt": 9.0}[tex] * ts
            n.inputs["Detail"].default_value = {"noise": 3.0, "fabric": 6.0, "grass": 8.0, "asphalt": 6.0}[tex]; n.inputs["Roughness"].default_value = 0.65
            nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
            mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[1].default_value = 0.3; mr.inputs[2].default_value = 0.7
            nt.links.new(n.outputs[0], mr.inputs[0]); nt.links.new(mr.outputs[0], mx.inputs[0])
        else:
            # brick-like patterns laid on walls (x+y, z) or on floors (x, y)
            sp = nt.nodes.new("ShaderNodeSeparateXYZ"); cb = nt.nodes.new("ShaderNodeCombineXYZ"); nt.links.new(tc.outputs["Object"], sp.inputs[0])
            if tex in ("planks", "tiles"):
                nt.links.new(sp.outputs["X"], cb.inputs["X"]); nt.links.new(sp.outputs["Y"], cb.inputs["Y"])
            else:
                ad = nt.nodes.new("ShaderNodeMath"); ad.operation = "ADD"; nt.links.new(sp.outputs["X"], ad.inputs[0]); nt.links.new(sp.outputs["Y"], ad.inputs[1])
                nt.links.new(ad.outputs[0], cb.inputs["X"]); nt.links.new(sp.outputs["Z"], cb.inputs["Y"])
            br = nt.nodes.new("ShaderNodeTexBrick"); nt.links.new(cb.outputs[0], br.inputs["Vector"])
            w, h, mortar, off = {"brick": (1.6, 0.6, 0.05, 0.5), "siding": (40.0, 0.62, 0.05, 0.0), "shingle": (1.3, 0.75, 0.06, 0.5), "planks": (7.0, 0.9, 0.03, 0.37), "tiles": (2.0, 2.0, 0.035, 0.0)}[tex]
            br.inputs["Scale"].default_value = 1.0 / ts; br.inputs["Brick Width"].default_value = w; br.inputs["Row Height"].default_value = h
            br.inputs["Mortar Size"].default_value = mortar; br.inputs["Mortar Smooth"].default_value = 0.2; br.offset = off
            br.inputs["Color1"].default_value = (1, 1, 1, 1); br.inputs["Color2"].default_value = (0.55, 0.55, 0.55, 1); br.inputs["Mortar"].default_value = (0, 0, 0, 1)
            n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 3.0; nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
            mu = nt.nodes.new("ShaderNodeMath"); mu.operation = "MULTIPLY"; nt.links.new(br.outputs["Color"], mu.inputs[0]); nt.links.new(n.outputs[0], mu.inputs[1])
            mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs[1].default_value = 0.0; mr.inputs[2].default_value = 0.62
            nt.links.new(mu.outputs[0], mr.inputs[0]); nt.links.new(mr.outputs[0], mx.inputs[0])
        nt.links.new(mx.outputs[2], b.inputs["Base Color"])
    G.mats[name] = m
    return m


def set_emit(mat, k, rgb=None, base=None):
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Emission Strength"].default_value = k
    if rgb is not None: b.inputs["Emission Color"].default_value = lin(rgb)
    if base is not None and not b.inputs["Base Color"].is_linked: b.inputs["Base Color"].default_value = lin(base)


def image(name):
    if name not in G.images: G.images[name] = bpy.data.images.load(os.path.join(TEX, name + ".png"))
    return G.images[name]


# ---------------------------------------------------------------- geometry
class Mesher:
    """Collects boxes / cylinders / blobs into one mesh."""
    def __init__(self): self.v = []; self.f = []

    def _add(self, bm, loc, rot):
        mtx = Matrix.Translation(loc) @ Euler([D(a) for a in rot]).to_matrix().to_4x4()
        o = len(self.v)
        for v in bm.verts: self.v.append(tuple(mtx @ v.co))
        bm.verts.index_update()
        for f in bm.faces: self.f.append([o + v.index for v in f.verts])
        bm.free()

    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.04, seg=2):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts: v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        bv = min(bevel, 0.45 * min(size))
        if bv > 0.004: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bv, segments=seg, profile=0.5, affect="EDGES")
        self._add(bm, loc, rot); return self

    def cyl(self, r, h, loc=(0, 0, 0), rot=(0, 0, 0), n=20, r2=None, bevel=0.0):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=h)
        if bevel > 0:
            ring = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-5]
            bmesh.ops.bevel(bm, geom=ring, offset=bevel, segments=2, profile=0.5, affect="EDGES")
        self._add(bm, loc, rot); return self

    def blob(self, r, loc=(0, 0, 0), scale=(1, 1, 1), sub=1, rot=(0, 0, 0)):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
        for v in bm.verts: v.co.x *= scale[0]; v.co.y *= scale[1]; v.co.z *= scale[2]
        self._add(bm, loc, rot); return self

    def ball(self, r, loc=(0, 0, 0), scale=(1, 1, 1)):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=r)
        for v in bm.verts: v.co.x *= scale[0]; v.co.y *= scale[1]; v.co.z *= scale[2]
        self._add(bm, loc, (0, 0, 0)); return self

    def spike(self, base, direction, length, radius, n=4, bend=0.0):
        """A hair spike: a thin cone from `base` pointing along `direction`."""
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=n, radius1=radius, radius2=0.015, depth=length)
        for v in bm.verts:
            v.co.z += length / 2; v.co.y += bend * (v.co.z / length) ** 2 * length
        d = Vector(direction).normalized(); q = Vector((0, 0, 1)).rotation_difference(d)
        mtx = Matrix.Translation(base) @ q.to_matrix().to_4x4(); o = len(self.v)
        for v in bm.verts: self.v.append(tuple(mtx @ v.co))
        bm.verts.index_update()
        for f in bm.faces: self.f.append([o + v.index for v in f.verts])
        bm.free(); return self

    def prism(self, w, d, h, loc=(0, 0, 0), rot=(0, 0, 0)):
        """Roof: ridge runs along x, w long, d deep, h high, base centred on loc."""
        bm = bmesh.new()
        pts = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0), (-w / 2, 0, h), (w / 2, 0, h)]
        vs = [bm.verts.new(p) for p in pts]
        for idx in ((0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (3, 2, 1, 0)): bm.faces.new([vs[i] for i in idx])
        self._add(bm, loc, rot); return self

    def make(self, name, mat, collection, smooth=True, parent=None, loc=(0, 0, 0)):
        me = bpy.data.meshes.new(name); me.from_pydata(self.v, [], self.f); me.update()
        if smooth: me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        ob = bpy.data.objects.new(name, me); ob.data.materials.append(mat)
        collection.objects.link(ob)
        if smooth:
            md = ob.modifiers.new("wn", "WEIGHTED_NORMAL"); md.keep_sharp = True; md.weight = 100
        if parent is not None: ob.parent = parent
        ob.location = loc
        return ob


class Static:
    """A set piece: st.box('wall', (255,255,255), size, loc) ... st.done(). One mesh per colour."""
    def __init__(self, collection, origin=(0, 0, 0)):
        self.c = collection; self.o = Vector(origin); self.m = {}; self.flat = {}

    def _get(self, mat, flat=False):
        d = self.flat if flat else self.m
        if mat.name not in d: d[mat.name] = (mat, Mesher())
        return d[mat.name][1]

    def box(self, mat, size, loc, rot=(0, 0, 0), bevel=0.04): self._get(mat).box(size, Vector(loc) + self.o, rot, bevel); return self
    def cyl(self, mat, r, h, loc, rot=(0, 0, 0), n=20, r2=None, bevel=0.0): self._get(mat).cyl(r, h, Vector(loc) + self.o, rot, n, r2, bevel); return self
    def ball(self, mat, r, loc, scale=(1, 1, 1)): self._get(mat).ball(r, Vector(loc) + self.o, scale); return self
    def blob(self, mat, r, loc, scale=(1, 1, 1), sub=1, rot=(0, 0, 0)): self._get(mat, True).blob(r, Vector(loc) + self.o, scale, sub, rot); return self
    def prism(self, mat, w, d, h, loc, rot=(0, 0, 0)): self._get(mat, True).prism(w, d, h, Vector(loc) + self.o, rot); return self

    def done(self, name="set", shadow=True):
        obs = []
        for k, (mat, ms) in self.m.items(): obs.append(ms.make(f"{name}_{k}", mat, self.c, True))
        for k, (mat, ms) in self.flat.items(): obs.append(ms.make(f"{name}_{k}_flat", mat, self.c, False))
        for o in obs: o.visible_shadow = shadow
        return obs


def empty(name, collection, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); collection.objects.link(e); e.empty_display_size = 0.2
    if parent is not None: e.parent = parent
    e.location = loc; return e


def part(name, mat, collection, size=None, loc=(0, 0, 0), parent=None, bevel=0.04, cyl=None, ball=None, rot=(0, 0, 0), inner=(0, 0, 0)):
    """One movable piece. inner = where the shape sits relative to the object's own origin (its pivot)."""
    ms = Mesher()
    if cyl: ms.cyl(cyl[0], cyl[1], inner, rot, bevel=0.0)
    elif ball: ms.ball(ball, inner)
    else: ms.box(size, inner, rot, bevel)
    return ms.make(name, mat, collection, True, parent, loc)


def picture(name, tex, collection, w, h, loc=(0, 0, 0), yaw=0.0, emit=0.0, parent=None, thick=0.12, back=(40, 40, 46), tilt=0.0):
    """A solid board showing a drawn texture. It faces -Y before `yaw` (degrees, about Z) is applied."""
    me = bpy.data.meshes.new(name)
    v = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
    me.from_pydata(v, [], [(0, 1, 2, 3)]); uv = me.uv_layers.new(name="uv")
    for i, c in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))): uv.data[i].uv = c
    m = bpy.data.materials.new(name + "_m"); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes["Principled BSDF"]; t = nt.nodes.new("ShaderNodeTexImage"); t.image = image(tex)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.6
    if emit > 0:
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = emit
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me); collection.objects.link(ob)
    if parent is not None: ob.parent = parent
    ob.location = loc; ob.rotation_euler = (D(tilt), 0, D(yaw))
    if thick > 0:
        bk = part(name + "_bk", M("board_%d_%d_%d" % back, back), collection, (w + 0.16, thick, h + 0.16), (0, thick / 2 + 0.01, 0), parent=ob, bevel=0.03)
    ob["mat"] = m.name
    return ob


def text3d(name, body, mat, collection, size=1.0, depth=0.12, loc=(0, 0, 0), parent=None):
    """Solid extruded letters (for floating Z's). They face -Y."""
    cu = bpy.data.curves.new(name, "FONT"); cu.body = body; cu.size = size; cu.extrude = depth; cu.align_x = "CENTER"; cu.align_y = "CENTER"
    cu.bevel_depth = 0.02
    ob = bpy.data.objects.new(name, cu); ob.data.materials.append(mat); collection.objects.link(ob)
    if parent is not None: ob.parent = parent
    ob.location = loc; ob.rotation_euler = (D(90), 0, 0)
    return ob


# ---------------------------------------------------------------- characters
FACE_NAMES = ["happy", "scared", "sleepy", "asleep", "yawn", "shock", "smug", "stern",
              "blink", "wired", "c_tired", "c_yawn", "c_grin", "c_asleep", "dad_asleep", "mom"]
SKIN = (232, 190, 160)   # must match the eyelid colour in rt_faces.py
PALE = (188, 184, 210)   # the creature


class Char:
    """A blocky avatar with Roblox proportions: head, torso, two arms, two legs, a drawn face.
    Everything is driven by .at() and .pose() once per frame."""
    def __init__(self, name, shirt, pants, skin=SKIN, scale=1.0, tall=False, sleeve=0.8, shoes=(238, 238, 242), sole=(40, 40, 46)):
        self.name = name; self.c = coll(name); self.scale = scale; self.face_name = "happy"; self.skin = skin
        if tall: self.LW, self.LH, self.TW, self.TD, self.TH, self.AW, self.AH, self.HW, self.HD, self.HH = 0.72, 3.3, 1.7, 0.95, 2.5, 0.62, 3.3, 1.36, 1.3, 1.36
        else:    self.LW, self.LH, self.TW, self.TD, self.TH, self.AW, self.AH, self.HW, self.HD, self.HH = 0.98, 2.0, 2.0, 1.0, 2.0, 0.98, 2.0, 1.36, 1.3, 1.3
        c = self.c; ms = M(name + "_shirt", shirt, rough=0.75, tex="fabric"); mp = M(name + "_pants", pants, rough=0.8, tex="fabric"); mk = M(name + "_skin", skin, rough=0.55)
        msh = M(name + "_shoes", shoes, rough=0.5); mso = M(name + "_sole", sole, rough=0.6)
        self.root = empty(name + "_root", c); self.root.scale = (scale,) * 3
        self.body = empty(name + "_body", c, self.root, (0, 0, self.LH))
        self.torso = part(name + "_torso", ms, c, (self.TW, self.TD, self.TH), parent=self.body, inner=(0, 0, self.TH / 2), bevel=0.05)
        self.neck = empty(name + "_neck", c, self.body, (0, 0, self.TH))
        self.head = part(name + "_head", self._face_mat(skin), c, (self.HW, self.HD, self.HH), parent=self.neck, inner=(0, 0, 0), loc=(0, 0, self.HH / 2 + 0.02), bevel=0.3)
        self.arm = {}; self.leg = {}
        for s, sx in (("L", 1), ("R", -1)):
            a = empty(f"{name}_arm{s}", c, self.body, (sx * (self.TW / 2 + self.AW / 2 + 0.01), 0, self.TH - 0.3))
            up = self.AH * sleeve
            if up > 0.05: part(f"{name}_slv{s}", ms, c, (self.AW, self.AW, up), parent=a, inner=(0, 0, 0.3 - up / 2), bevel=0.05)
            part(f"{name}_hand{s}", mk, c, (self.AW * 0.94, self.AW * 0.94, self.AH - up), parent=a, inner=(0, 0, 0.3 - up - (self.AH - up) / 2), bevel=0.05)
            self.arm[s] = a
            l = empty(f"{name}_leg{s}", c, self.root, (sx * (self.LW / 2 + 0.01), 0, self.LH))
            part(f"{name}_lg{s}", mp, c, (self.LW, self.LW, self.LH - 0.42), parent=l, inner=(0, 0, -(self.LH - 0.42) / 2), bevel=0.05)
            part(f"{name}_sh{s}", msh, c, (self.LW + 0.08, self.LW + 0.36, 0.36), parent=l, inner=(0, -0.14, -self.LH + 0.3), bevel=0.1)
            part(f"{name}_so{s}", mso, c, (self.LW + 0.1, self.LW + 0.38, 0.12), parent=l, inner=(0, -0.14, -self.LH + 0.07), bevel=0.03)
            self.leg[s] = l
        self.pose()

    def _face_mat(self, skin):
        m = bpy.data.materials.new(self.name + "_face"); m.use_nodes = True; nt = m.node_tree
        b = nt.nodes["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.55
        tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); cb = nt.nodes.new("ShaderNodeCombineXYZ")
        mp = nt.nodes.new("ShaderNodeMapping"); mp.vector_type = "POINT"; img = nt.nodes.new("ShaderNodeTexImage"); img.image = image("faces"); img.extension = "CLIP"
        nt.links.new(tc.outputs["Object"], sp.inputs[0]); nt.links.new(sp.outputs["X"], cb.inputs["X"]); nt.links.new(sp.outputs["Z"], cb.inputs["Y"])
        nt.links.new(cb.outputs[0], mp.inputs["Vector"]); nt.links.new(mp.outputs[0], img.inputs["Vector"])
        self.FS = 1.06; self.FZ = -0.04 * self.HH
        mp.inputs["Scale"].default_value = (0.25 / (self.HW * self.FS), 0.25 / (self.HH * self.FS), 1)
        sn = nt.nodes.new("ShaderNodeSeparateXYZ"); lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = -0.8
        nt.links.new(tc.outputs["Normal"], sn.inputs[0]); nt.links.new(sn.outputs["Y"], lt.inputs[0])
        mu = nt.nodes.new("ShaderNodeMath"); mu.operation = "MULTIPLY"; nt.links.new(lt.outputs[0], mu.inputs[0]); nt.links.new(img.outputs["Alpha"], mu.inputs[1])
        mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.inputs[6].default_value = lin(skin)
        nt.links.new(mu.outputs[0], mx.inputs[0]); nt.links.new(img.outputs["Color"], mx.inputs[7]); nt.links.new(mx.outputs[2], b.inputs["Base Color"])
        self._map = mp; return m

    def face(self, name, t=None, blink=True):
        """Swap the drawn face. With t (seconds) the open-eyed faces blink now and then."""
        if t is not None and blink and name in ("happy", "smug", "mom", "stern") and (t + 0.37 * (hash(self.name) % 7)) % 2.3 < 0.09: name = "blink"
        i = FACE_NAMES.index(name); self.face_name = name
        self._map.inputs["Location"].default_value = (0.125 + (i % 4) * 0.25, 0.125 + (3 - i // 4) * 0.25 - 0.25 * self.FZ / (self.HH * self.FS), 0)

    def at(self, x, y, z=0.0, yaw=0.0, pitch=0.0, roll=0.0):
        self.root.location = (x, y, z); self.root.rotation_euler = (D(pitch), D(roll), D(yaw))

    def pose(self, head=(0, 0, 0), lean=(0, 0, 0), aL=(0, 0), aR=(0, 0), lL=0.0, lR=0.0, bob=0.0, squash=1.0):
        """head/lean = (nod forward, turn, tilt). aL/aR = (swing forward, lift sideways[, twist]). lL/lR = swing forward."""
        self.neck.rotation_euler = (D(-head[0]), D(head[2]), D(head[1]))
        self.body.rotation_euler = (D(-lean[0]), D(lean[2]), D(lean[1])); self.body.location.z = self.LH + bob
        self.body.scale = (1, 1, squash)
        for s, sx, a in (("L", 1, aL), ("R", -1, aR)):
            self.arm[s].rotation_euler = (D(-a[0]), D(-sx * a[1]), D(a[2] if len(a) > 2 else 0))
        self.leg["L"].rotation_euler = (D(-lL), 0, 0); self.leg["R"].rotation_euler = (D(-lR), 0, 0)

    def walk(self, ph, amp=38, arm=34, bob=0.14, lean=6, head=(0, 0, 0)):
        s = math.sin(ph)
        self.pose(head=head, lean=(lean, 0, 0), aL=(-arm * s, 4), aR=(arm * s, 4), lL=amp * s, lR=-amp * s, bob=abs(math.cos(ph)) * bob)

    def run(self, ph, head=(0, 0, 0)):
        s = math.sin(ph)
        self.pose(head=head, lean=(22, 0, 0), aL=(-75 * s, 10), aR=(75 * s, 10), lL=62 * s, lR=-62 * s, bob=abs(math.cos(ph)) * 0.35)

    # ---- hair / hats, all parented to the head
    def hair(self, style, rgb, rgb2=None, seed=1):
        """'spiky' (messy anime spikes), 'short', 'long', 'bun', 'nightcap', 'copcap'. Faceted like Roblox hair meshes."""
        import random
        rnd = random.Random(seed * 7919 + len(self.name)); h = self.head; c = self.c; W, Dp, H = self.HW, self.HD, self.HH
        m = M(f"{self.name}_hair", rgb, rough=0.6, tex="noise", ts=5.0, amt=0.3); ms = Mesher()
        def cap(drop=0.0):
            # a shell over the top and back of the head
            ms.blob(0.5, (0, 0.16, H * 0.22), (W * 1.12, Dp * 1.04, H * 0.82), sub=2)
            if drop: ms.box((W * 1.06, 0.3, drop), (0, Dp / 2 + 0.04, H * 0.1 - drop / 2), bevel=0.1)
        def crown(n, lmin, lmax, rad, down=0.0, front=True):
            for i in range(n):
                a = 2 * math.pi * i / n + rnd.uniform(-0.2, 0.2); el = rnd.uniform(0.15, 1.2)
                p = Vector((math.cos(a) * W * 0.5 * math.cos(el), math.sin(a) * Dp * 0.5 * math.cos(el) + 0.05, H * 0.2 + math.sin(el) * H * 0.36))
                if p.y < -Dp * 0.18 and el < 0.95: continue   # keep the forehead clear
                d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el) + 0.25, math.sin(el) * 0.9 - down + rnd.uniform(-0.2, 0.2)))
                ms.spike(p * 0.9, d, rnd.uniform(lmin, lmax), rad * rnd.uniform(0.8, 1.2), n=4, bend=rnd.uniform(-0.15, 0.15))
        def bangs(n, ln, rad, spread=1.0):
            for i in range(n):
                u = (i + 0.5) / n - 0.5; x = u * W * 1.02
                p = Vector((x, -Dp / 2 - 0.1, H / 2 + 0.1))
                d = Vector((u * 1.6 * spread + rnd.uniform(-0.2, 0.2), -0.02, -1.0))
                ms.spike(p, d, min(0.46, ln * rnd.uniform(0.75, 1.1)) * (1.0 - 0.4 * abs(u)), rad, n=4)
        def sides(ln, rad):
            for sx in (-1, 1):
                for k in range(3):
                    p = Vector((sx * (W / 2 + 0.02), -Dp * 0.3 + k * Dp * 0.3, H * 0.34))
                    ms.spike(p, (sx * 0.25, -0.05 + 0.1 * k, -1), ln * rnd.uniform(0.8, 1.2), rad, n=4)
        if style == "spiky":
            cap(); crown(26, 0.5, 0.95, 0.3); bangs(7, 0.46, 0.22); sides(0.7, 0.22)
        if style == "short":
            cap(0.5); crown(16, 0.25, 0.45, 0.26, down=0.3); bangs(5, 0.36, 0.22, spread=0.6); sides(0.5, 0.2)
        if style == "long":
            cap(0.6); bangs(6, 0.5, 0.24, spread=0.8)
            for i in range(9):
                u = i / 8 - 0.5
                ms.spike((u * W * 1.1, Dp / 2 + 0.02 - abs(u) * 0.5, H * 0.3), (u * 0.3, 0.12, -1), rnd.uniform(1.9, 2.5), 0.3, n=4)
            for sx in (-1, 1):
                for k in range(3): ms.spike((sx * (W / 2 + 0.04), -Dp * 0.2 + k * 0.3, H * 0.34), (sx * 0.12, 0.05, -1), rnd.uniform(1.5, 2.0), 0.24, n=4)
        if style == "bun":
            cap(0.4); bangs(5, 0.4, 0.22, spread=0.7); sides(0.6, 0.2); ms.blob(0.44, (0, 0.25, H / 2 + 0.34), sub=1)
        if style == "nightcap":
            m2 = M(f"{self.name}_hair2", rgb2 or (255, 255, 255), rough=0.8, tex="fabric")
            ms.cyl(W * 0.57, 0.36, (0, 0, H / 2 + 0.08), n=18)
            ms.cyl(W * 0.53, 1.8, (0.32, 0.1, H / 2 + 1.02), (8, 22, 0), n=12, r2=0.14)
            Mesher().ball(0.27, (0.72, 0.22, H / 2 + 1.88)).make(self.name + "_pom", m2, c, True, h)
            Mesher().cyl(W * 0.61, 0.26, (0, 0, H / 2 - 0.02), n=18).make(self.name + "_band", m2, c, True, h)
        if style == "copcap":
            m2 = M(f"{self.name}_hair2", rgb2 or (250, 210, 60), rough=0.3)
            ms.cyl(W * 0.6, 0.5, (0, 0.02, H / 2 + 0.2), n=18); ms.cyl(W * 0.66, 0.16, (0, 0.02, H / 2 + 0.5), n=18)
            ms.box((W * 0.9, 0.7, 0.1), (0, -Dp / 2 - 0.22, H / 2 + 0.0), (-10, 0, 0), bevel=0.03)
            Mesher().box((0.34, 0.08, 0.34), (0, -W * 0.61, H / 2 + 0.26), bevel=0.05).make(self.name + "_badge", m2, c, True, h)
        if ms.v: ms.make(self.name + "_hair", m, c, style in ("nightcap", "copcap"), h)
        return self

    def extra(self, name, rgb, size, loc, on="torso", bevel=0.03, rot=(0, 0, 0), emit=0.0, tex=None):
        """Stick a coloured block on the torso / head / an arm (stripes, zips, pockets, badges)."""
        par = {"torso": self.torso, "head": self.head, "armL": self.arm["L"], "armR": self.arm["R"], "body": self.body}[on]
        mt = M(f"{self.name}_{name}", rgb, rough=0.7, emit=rgb if emit else None, emit_k=emit, tex=tex)
        return part(f"{self.name}_{name}", mt, self.c, size, parent=par, inner=loc, bevel=bevel, rot=rot)

    def jacket(self, inner_rgb, zip_rgb=(210, 210, 215)):
        """Open jacket: a strip of the shirt underneath shows down the middle, like most Roblox outfits."""
        self.extra("inner", inner_rgb, (self.TW * 0.3, 0.06, self.TH * 0.99), (0, -self.TD / 2 - 0.005, self.TH / 2), bevel=0.01, tex="fabric")
        for sx in (-1, 1): self.extra(f"lapel{sx}", zip_rgb, (0.05, 0.07, self.TH * 0.96), (sx * self.TW * 0.155, -self.TD / 2 - 0.012, self.TH / 2), bevel=0.01)
        return self

    def stripes(self, rgb, n=3):
        for i in range(n):
            z = self.TH * (i + 0.6) / (n + 0.2)
            self.extra(f"st{i}", rgb, (self.TW + 0.03, self.TD + 0.03, self.TH * 0.13), (0, 0, z), bevel=0.01, tex="fabric")
        return self

    def hand_pos(self, side="R"):
        """Empty at the end of an arm, to parent props to."""
        return empty(f"{self.name}_grip{side}", self.c, self.arm[side], (0, -0.1, 0.3 - self.AH + 0.1))


# ---------------------------------------------------------------- light and camera
MOODS = {
    #  sky you see: horizon, zenith, brightness | ambient colour, k | sun k, colour, (elevation, azimuth) | fill k, colour
    "day":        ((170, 214, 250), (44, 118, 232), 1.0,  (170, 200, 255), 0.40, 5.6, (255, 240, 214), (46, 216), 0.22, (190, 210, 255)),
    "dusk":       ((255, 150, 90),  (60, 52, 140),  0.9,  (170, 130, 190), 0.34, 3.6, (255, 150, 90),  (15, 238), 0.25, (150, 130, 220)),
    "night":      ((26, 36, 90),    (5, 7, 26),     1.0,  (96, 110, 180),  0.19, 0.6, (160, 178, 245), (44, 150), 0.12, (130, 145, 235)),
    "room":       ((170, 214, 250), (44, 118, 232), 1.0,  (250, 238, 224), 0.36, 2.8, (255, 238, 214), (56, 205), 0.5,  (250, 240, 228)),
    "room_dusk":  ((255, 150, 90),  (60, 52, 140),  0.9,  (255, 210, 170), 0.22, 1.5, (255, 190, 140), (56, 205), 0.4,  (255, 205, 170)),
    "room_night": ((26, 36, 90),    (5, 7, 26),     1.0,  (128, 136, 190), 0.22, 0.7, (170, 182, 240), (52, 20),  0.26, (150, 158, 215)),
}


def mood(name, k=1.0, sun_dir=None):
    hz, zen, sk, ac, ak, su, sc, sd, fk, fc = MOODS[name]
    G.world_mix.inputs[6].default_value = lin(hz); G.world_mix.inputs[7].default_value = lin(zen)
    G.world_bg.inputs[1].default_value = sk
    G.world_amb.inputs[0].default_value = lin(ac); G.world_amb.inputs[1].default_value = ak * k
    G.sun.data.energy = su * k; G.sun.data.color = lin(sc)[:3]
    el, az = sun_dir or sd
    G.sun.rotation_euler = (D(90 - el), 0, D(az))
    G.fill.data.energy = fk * k; G.fill.data.color = lin(fc)[:3]
    G.fill.rotation_euler = (D(40), 0, D(az + 150))


def cam(pos, target, fov=40.0, roll=0.0, dof=None):
    c = G.cam; c.location = pos
    q = (Vector(target) - Vector(pos)).to_track_quat("-Z", "Y")
    c.rotation_euler = (q.to_matrix() @ Matrix.Rotation(D(roll), 3, "Z")).to_euler()
    c.data.angle = D(fov)
    c.data.dof.use_dof = dof is not None
    if dof: c.data.dof.focus_distance = dof[0]; c.data.dof.aperture_fstop = dof[1]


def point_light(name, collection, loc, rgb, watts, radius=0.5, shadow=True, parent=None):
    d = bpy.data.lights.new(name, "POINT"); d.energy = watts; d.color = lin(rgb)[:3]; d.shadow_soft_size = radius; d.use_shadow = shadow
    o = bpy.data.objects.new(name, d); collection.objects.link(o); o.location = loc
    if parent is not None: o.parent = parent
    return o


# ---------------------------------------------------------------- set: the street
HOUSE_COLS = [((158, 62, 50), (58, 44, 46), "brick"), ((214, 170, 86), (88, 58, 44), "siding"), ((70, 118, 176), (44, 50, 72), "siding"), ((226, 216, 196), (120, 52, 46), "siding"),
              ((96, 150, 128), (48, 62, 66), "siding"), ((232, 232, 226), (64, 72, 96), "siding"), ((196, 110, 62), (70, 48, 42), "brick"), ((124, 106, 168), (52, 46, 78), "siding")]


class Street:
    """A straight road along X with a row of houses on each side and a clock tower at the +X end."""
    def __init__(self):
        c = coll("street"); self.c = c; st = Static(c); self.win = []; self.lamps = []; self.houses = []
        grass = M("grass", (66, 150, 56), rough=0.95, tex="grass"); road = M("road", (52, 54, 62), rough=0.8, tex="asphalt"); walk = M("walk", (168, 170, 178), rough=0.8, tex="tiles")
        white = M("white", (232, 232, 236), rough=0.6); line = M("line", (236, 236, 226), rough=0.7); trunk = M("trunk", (96, 62, 40), rough=0.85, tex="noise", ts=4.0, amt=0.35)
        leaf = M("leaf", (44, 128, 56), rough=0.85, tex="noise", ts=3.0, amt=0.3); leaf2 = M("leaf2", (78, 158, 62), rough=0.85, tex="noise", ts=3.0, amt=0.3); pole = M("pole", (34, 36, 42), rough=0.35)
        st.box(grass, (520, 520, 1), (0, 0, -0.5), bevel=0); st.box(road, (240, 12, 0.3), (-10, 0, -0.1), bevel=0)
        for sy in (-1, 1): st.box(walk, (240, 4, 0.5), (-10, sy * 8, 0.0), bevel=0.05)
        for x in range(-120, 100, 8): st.box(line, (3.2, 0.4, 0.06), (x, 0, 0.06), bevel=0)
        # houses
        k = 0
        for sy in (-1, 1):
            for i in range(-4, 4):
                x = i * 20 + (4 if sy > 0 else -4); y = sy * 21
                self._house(st, x, y, -sy, (k * 3 + (1 if sy > 0 else 0)) % len(HOUSE_COLS), len(self.win)); k += 1
                # second row far behind, plain
                bc, rc, _tx = HOUSE_COLS[(k * 5) % len(HOUSE_COLS)]
                st.box(M("house%d" % ((k * 5) % 8), bc, rough=0.75, tex=_tx), (15, 11, 10), (x + 9, sy * 47, 5), bevel=0.06)
                st.prism(M("roof%d" % ((k * 5) % 8), rc, rough=0.8, tex="shingle"), 16.5, 13, 5.5, (x + 9, sy * 47, 10))
        # trees, bushes, lamps
        for sy in (-1, 1):
            for i in range(-5, 5):
                x = i * 20 + (14 if sy > 0 else 6)
                self._tree(st, x, sy * 19.5, trunk, leaf if (i + sy) % 2 else leaf2, 0.8 + 0.1 * ((i * 7) % 3))
                self._tree(st, x + 5, sy * 34, trunk, leaf2 if (i + sy) % 2 else leaf, 1.4)
            for i in range(-5, 5):
                x = i * 20 - 2
                st.cyl(pole, 0.16, 8.4, (x, sy * 10.4, 4.2)); st.box(pole, (0.22, 2.4, 0.22), (x, sy * 9.3, 8.3), bevel=0.05)
                st.box(pole, (0.7, 1.0, 0.3), (x, sy * 8.3, 8.25), bevel=0.08)
                lm = M(f"lamp{len(self.lamps)}", (255, 244, 200), emit=(255, 226, 150), emit_k=0.0)
                part(f"lampglow{len(self.lamps)}", lm, c, (0.56, 0.84, 0.14), (x, sy * 8.3, 8.06), bevel=0.04).visible_shadow = False
                self.lamps.append((lm, (x, sy * 8.3, 7.6)))
        # far hills and pines
        hill = M("hill", (58, 132, 66), rough=0.95, tex="grass", ts=0.2); pine = M("pine", (30, 96, 58), rough=0.9, tex="noise", ts=2.0, amt=0.3)
        for i in range(14):
            a = i / 14 * 2 * math.pi; r = 210 + 20 * (i % 3)
            st.blob(hill, 60 + 12 * (i % 4), (math.cos(a) * r, math.sin(a) * r, -18), (1.5, 1.5, 0.75), sub=2)
        for i in range(40):
            a = i / 40 * 2 * math.pi + 0.07; r = 120 + 22 * ((i * 5) % 4)
            x, y = math.cos(a) * r, math.sin(a) * r
            if abs(y) < 60 and x > 0: continue
            st.cyl(pine, 5.5, 16, (x, y, 11), n=7, r2=0.2); st.cyl(trunk, 1.0, 4, (x, y, 2), n=6)
        # clouds
        cl = M("cloud", (250, 250, 255), rough=1.0, emit=(255, 255, 255), emit_k=0.15)
        for i, (x, y, z, s) in enumerate(((150, 60, 95, 1.3), (190, -80, 110, 1.6), (120, -10, 120, 1.0), (60, 140, 100, 1.5), (-40, -150, 105, 1.4), (-160, 40, 110, 1.6), (230, 20, 80, 1.2), (10, 170, 120, 1.2), (90, -170, 90, 1.5))):
            for j, (dx, dz, w) in enumerate(((0, 0, 22), (12, 3, 15), (-11, 2, 14))):
                st.box(cl, (w * s, 12 * s, 6.5 * s), (x + dx * s, y, z + dz * s), bevel=2.4 * s)
        # two parked cars
        self._car(st, -26, 4.2, (170, 36, 40)); self._car(st, 34, -4.2, (36, 60, 120), flip=True)
        # hydrant, mailbox, bench
        red = M("red", (230, 60, 54)); st.cyl(red, 0.34, 1.1, (9, 9.3, 0.8), bevel=0.06); st.ball(red, 0.36, (9, 9.3, 1.38)); st.box(red, (1.0, 0.24, 0.24), (9, 9.3, 1.0), bevel=0.06)
        bl = M("mailblue", (60, 110, 220)); st.box(bl, (0.9, 0.9, 1.5), (-14, -9.3, 1.0), bevel=0.2); st.box(pole, (0.7, 0.06, 0.12), (-14, -8.84, 1.35), bevel=0.02)
        wood = M("wood", (176, 120, 70), rough=0.7)
        for z, yy in ((1.0, 9.2), (1.7, 9.55)): st.box(wood, (3.4, 0.9 if z < 1.2 else 0.2, 0.2 if z < 1.2 else 0.9), (22, yy, z), bevel=0.05)
        for dx in (-1.4, 1.4): st.box(pole, (0.2, 0.8, 1.0), (22 + dx, 9.25, 0.5), bevel=0.04)
        self._tower(st, 92)
        st.done("street")
        # night lamp lights (only a few real lights; the rest just glow)
        self.lights = []
        for i, (lm, p) in enumerate(self.lamps):
            if -45 < p[0] < 65: self.lights.append(point_light(f"lampL{i}", c, p, (255, 214, 150), 0.0, radius=0.6, shadow=(abs(p[0]) < 25)))

    def _house(self, st, x, y, face, cols, idx):
        """face = -1 or +1: which way (in y) the front door looks."""
        body, roofc, wtex = HOUSE_COLS[cols]; w, d, h = 14.0, 11.0, 8.5
        mb = M("house%d" % cols, body, rough=0.75, tex=wtex); mr = M("roof%d" % cols, roofc, rough=0.8, tex="shingle"); white = M("white", (232, 232, 236), rough=0.6)
        door = M("door%d" % (idx % 4), [(120, 76, 50), (60, 90, 170), (190, 60, 60), (70, 130, 90)][idx % 4])
        st.box(mb, (w, d, h), (x, y, h / 2), bevel=0.12); st.prism(mr, w + 1.8, d + 2.2, 5.2, (x, y, h))
        st.box(M("brick", (130, 66, 54), rough=0.85, tex="brick"), (1.5, 1.5, 4.5), (x + 3.5, y - face * 2.0, h + 3.2), bevel=0.1)
        yf = y + face * d / 2                      # the front wall
        st.box(white, (3.0, 0.3, 5.0), (x - 3.2, yf + face * 0.05, 2.9), bevel=0.06); st.box(door, (2.4, 0.3, 4.5), (x - 3.2, yf + face * 0.16, 2.65), bevel=0.06)
        st.ball(M("gold", (250, 205, 80), rough=0.3), 0.16, (x - 2.4, yf + face * 0.38, 2.6))
        st.box(M("walk", (212, 214, 222)), (3.6, 1.6, 0.5), (x - 3.2, yf + face * 0.8, 0.15), bevel=0.06)
        y0 = yf + face * 1.6; y1 = 10.0 if y > 0 else -10.0
        st.box(M("path", (190, 182, 164), rough=0.85, tex="tiles", ts=0.5), (2.6, abs(y0 - y1), 0.12), (x - 3.2, (y0 + y1) / 2, 0.04), bevel=0)
        # big front window + a dormer window in the roof
        yd = yf - face * 1.2
        st.box(white, (4.2, 0.34, 3.8), (x + 3.2, yf + face * 0.02, 4.0), bevel=0.06)
        st.box(mb, (3.4, 4.0, 3.6), (x - 3.2, yd - face * 2.0, 11.2), bevel=0.08); st.prism(mr, 4.6, 4.2, 1.6, (x - 3.2, yd - face * 1.8, 13.0), (0, 0, 90))
        st.box(white, (2.2, 0.3, 2.2), (x - 3.2, yd + face * 0.02, 11.5), bevel=0.05)
        wm = M(f"win{idx}", (120, 170, 215), rough=0.08, emit=(255, 204, 110), emit_k=0.0, spec=0.8)
        ms = Mesher()                              # panes: one object per house so its glow can be switched
        ms.box((3.6, 0.3, 3.2), (x + 3.2, yf + face * 0.1, 4.0), bevel=0.03)
        ms.box((1.7, 0.3, 1.7), (x - 3.2, yd + face * 0.1, 11.5), bevel=0.03)
        ms.make(f"pane{idx}", wm, self.c, True).visible_shadow = False
        st.box(white, (0.18, 0.4, 3.2), (x + 3.2, yf + face * 0.12, 4.0), bevel=0.02); st.box(white, (3.6, 0.4, 0.18), (x + 3.2, yf + face * 0.12, 4.0), bevel=0.02)
        st.box(white, (4.6, 0.7, 0.3), (x + 3.2, yf + face * 0.3, 2.2), bevel=0.06)
        bush = M("leaf2", (78, 158, 62), rough=0.85)
        st.blob(bush, 1.3, (x + 1.2, yf + face * 1.3, 0.8), (1.2, 1, 0.9)); st.blob(bush, 1.5, (x + 5.0, yf + face * 1.4, 0.9), (1.3, 1, 0.9))
        self.win.append(wm); self.houses.append((x, y, face))

    def _tree(self, st, x, y, trunk, leaf, s=1.0):
        st.box(trunk, (1.0 * s, 1.0 * s, 5 * s), (x, y, 2.5 * s), bevel=0.15)
        st.blob(leaf, 3.4 * s, (x, y, 7.2 * s), (1, 1, 0.9)); st.blob(leaf, 2.5 * s, (x + 1.6 * s, y - 0.6 * s, 9.2 * s)); st.blob(leaf, 2.3 * s, (x - 1.7 * s, y + 0.5 * s, 8.6 * s))

    def _car(self, st, x, y, rgb, flip=False):
        b = M("car%d_%d_%d" % rgb, rgb, rough=0.22, spec=0.7); dk = M("tyre", (22, 22, 26), rough=0.7); gl = M("carglass", (40, 60, 80), rough=0.05, spec=0.9)
        st.box(b, (8.4, 3.8, 1.8), (x, y, 1.5), bevel=0.35); st.box(b, (4.6, 3.5, 1.6), (x - 0.4, y, 3.1), bevel=0.4)
        st.box(gl, (4.2, 3.56, 1.1), (x - 0.4, y, 3.15), bevel=0.2); st.box(gl, (4.66, 3.0, 1.1), (x - 0.4, y, 3.15), bevel=0.2)
        for dx in (-2.6, 2.6):
            for dy in (-1.9, 1.9): st.cyl(dk, 0.85, 0.5, (x + dx, y + dy, 0.85), (90, 0, 0), bevel=0.1)
        st.box(M("lampy", (255, 240, 170), emit=(255, 240, 170), emit_k=0.6), (0.1, 0.8, 0.4), (x + (4.2 if not flip else -4.2), y + 1.2, 1.7), bevel=0.03)
        st.box(M("lampy", (255, 240, 170)), (0.1, 0.8, 0.4), (x + (4.2 if not flip else -4.2), y - 1.2, 1.7), bevel=0.03)

    def _tower(self, st, x):
        br = M("towerbrick", (150, 66, 54), rough=0.85, tex="brick"); tr = M("towertrim", (222, 212, 192), rough=0.7, tex="noise"); rf = M("towerroof", (50, 60, 104), rough=0.6, tex="shingle")
        st.cyl(M("walk", (212, 214, 222)), 20, 0.5, (x, 0, 0.0), n=40)
        st.box(br, (11, 11, 34), (x, 0, 17), bevel=0.2); st.box(tr, (12.4, 12.4, 1.4), (x, 0, 22), bevel=0.2); st.box(tr, (12.4, 12.4, 1.4), (x, 0, 34.4), bevel=0.2)
        st.box(tr, (12.6, 12.6, 2.0), (x, 0, 1.0), bevel=0.2)
        st.cyl(rf, 9.4, 9, (x, 0, 39.6), (0, 0, 45), n=4, r2=0.3)
        st.cyl(M("gold", (250, 205, 80), rough=0.3), 0.3, 3, (x, 0, 45)); st.ball(M("gold", (250, 205, 80)), 0.7, (x, 0, 46.6))
        st.box(M("door0", (120, 76, 50)), (0.4, 3.4, 6), (x - 5.55, 0, 3.2), bevel=0.1)
        for z in (9, 14.5): st.box(M("towerwin", (60, 70, 110), rough=0.2), (0.3, 1.8, 3.2), (x - 5.5, 0, z), bevel=0.1)
        st.cyl(tr, 4.7, 0.5, (x - 5.6, 0, 28.2), (0, 90, 0), n=40)
        self.clock = picture("clockface", "clock", self.c, 8.6, 8.6, (x - 5.9, 0, 28.2), yaw=-90, thick=0)
        ink = M("ink", (26, 22, 32), rough=0.4)
        self.hand_h = part("hand_h", ink, self.c, (0.16, 0.5, 2.6), (x - 6.0, 0, 28.2), inner=(0, 0, 1.1), bevel=0.06)
        self.hand_m = part("hand_m", ink, self.c, (0.16, 0.34, 3.7), (x - 6.08, 0, 28.2), inner=(0, 0, 1.6), bevel=0.06)
        part("hand_hub", M("red", (230, 60, 54)), self.c, cyl=(0.4, 0.3), loc=(x - 6.1, 0, 28.2), rot=(0, 90, 0))

    def clock_time(self, hours):
        """hours as a float, e.g. 8.98 or 9.0."""
        self.hand_h.rotation_euler = (D((hours % 12) * 30), 0, 0); self.hand_m.rotation_euler = (D((hours % 1) * 360), 0, 0)

    def lights_set(self, windows=1.0, lamps=1.0, per=None):
        """Night glow. per = optional {house index: 0..1} to switch single houses."""
        for i, wm in enumerate(self.win):
            v = windows if per is None else per.get(i, windows)
            set_emit(wm, 6.0 * v, base=lerp3((10, 14, 32), (255, 204, 110), clamp(v)))
        for lm, _ in self.lamps: set_emit(lm, 9.0 * lamps)
        for l in self.lights: l.data.energy = 2600.0 * lamps

    def day(self):
        for wm in self.win: set_emit(wm, 0.0, base=(120, 170, 215))
        for lm, _ in self.lamps: set_emit(lm, 0.0)
        for l in self.lights: l.data.energy = 0.0


# ---------------------------------------------------------------- set: a room
class Room:
    """A box room, 16 x 14 x 10, with a big window in the far (+Y) wall. Walls can be hidden per shot."""
    def __init__(self, name, origin, wall=(150, 200, 240), floor=(196, 140, 86), trim=(236, 236, 238), yard=True):
        self.name = name; self.c = coll(name); self.o = Vector(origin); c = self.c
        W, Dp, H = 16.0, 14.0, 10.0; self.W, self.D, self.H = W, Dp, H
        mw = M(name + "_wall", wall, rough=0.9, tex="noise", ts=0.6, amt=0.12); mf = M(name + "_floor", floor, rough=0.32, tex="planks", spec=0.6); mt = M(name + "_trim", trim, rough=0.5)
        st = Static(c, origin)
        st.box(mf, (W, Dp, 0.4), (0, 0, -0.2), bevel=0)
        st.done(name + "_floor", shadow=False)
        self.walls = {}
        def wall_obj(key, boxes, trims):
            s2 = Static(c, origin)
            for size, loc in boxes: s2.box(mw, size, loc, bevel=0)
            for size, loc in trims: s2.box(mt, size, loc, bevel=0.04)
            self.walls[key] = s2.done(f"{name}_wall_{key}", shadow=False)
        # far wall (+Y) with a window hole x -3.2..3.2, z 4.2..8.4
        wall_obj("n", [((W, 0.5, 4.2), (0, Dp / 2 + 0.25, 2.1)), ((W, 0.5, H - 8.4), (0, Dp / 2 + 0.25, (H + 8.4) / 2)), ((W / 2 - 3.2, 0.5, 4.2), (-(W / 2 + 3.2) / 2, Dp / 2 + 0.25, 6.3)), ((W / 2 - 3.2, 0.5, 4.2), ((W / 2 + 3.2) / 2, Dp / 2 + 0.25, 6.3))],
                 [((W, 0.2, 0.7), (0, Dp / 2 - 0.05, 0.35)), ((7.2, 0.9, 0.36), (0, Dp / 2 + 0.1, 4.1)), ((7.2, 0.8, 0.36), (0, Dp / 2 + 0.2, 8.5)), ((0.4, 0.8, 4.5), (-3.4, Dp / 2 + 0.2, 6.3)), ((0.4, 0.8, 4.5), (3.4, Dp / 2 + 0.2, 6.3))])
        wall_obj("s", [((W, 0.5, H), (0, -Dp / 2 - 0.25, H / 2))], [((W, 0.2, 0.7), (0, -Dp / 2 + 0.05, 0.35))])
        wall_obj("e", [((0.5, Dp + 1, H), (W / 2 + 0.25, 0, H / 2))], [((0.2, Dp, 0.7), (W / 2 - 0.05, 0, 0.35))])
        wall_obj("w", [((0.5, Dp + 1, H), (-W / 2 - 0.25, 0, H / 2))], [((0.2, Dp, 0.7), (-W / 2 + 0.05, 0, 0.35))])
        s2 = Static(c, origin); s2.box(M(name + "_ceil", (250, 250, 250), rough=0.9), (W + 1, Dp + 1, 0.4), (0, 0, H + 0.2), bevel=0); self.walls["ceil"] = s2.done(name + "_ceil", shadow=False)
        if yard:
            s3 = Static(c, origin); g = M("grass", (66, 150, 56), rough=0.95, tex="grass")
            s3.box(g, (300, 200, 0.6), (0, Dp / 2 + 100.6, -0.3), bevel=0)
            wf = M("fence", (222, 222, 226), rough=0.7, tex="noise")
            for i in range(-12, 13):
                s3.box(wf, (1.0, 0.25, 4.2), (i * 1.5, Dp / 2 + 24, 2.1), bevel=0.1)
            s3.box(wf, (38, 0.2, 0.4), (0, Dp / 2 + 24.2, 3.0), bevel=0.05)
            tr = M("trunk", (96, 62, 40), rough=0.85); lf = M("leaf", (44, 128, 56), rough=0.85)
            s3.box(tr, (1.4, 1.4, 9), (-9, Dp / 2 + 19, 4.5), bevel=0.2); s3.blob(lf, 5.2, (-9, Dp / 2 + 19, 11.5)); s3.blob(lf, 3.8, (-6, Dp / 2 + 18, 14))
            s3.box(tr, (1.2, 1.2, 7), (11, Dp / 2 + 21, 3.5), bevel=0.2); s3.blob(lf, 4.4, (11, Dp / 2 + 21, 9.5))
            s3.done(name + "_yard")
            self.moon = part(name + "_moon", M("moon", (255, 250, 225), emit=(255, 248, 215), emit_k=3.0), c, ball=7.0, loc=self.o + Vector((14, Dp / 2 + 150, 62)))
            self.moon.visible_shadow = False

    def show(self, hide=()):
        for k, obs in self.walls.items():
            for o in obs: o.hide_render = k in hide

    def P(self, x, y, z=0.0): return tuple(self.o + Vector((x, y, z)))


    # ---- furniture (positions are relative to the room's own origin)
    def bed(self, cover=(44, 62, 128), frame=(92, 60, 40)):
        """Bed under the window: mattress top at z 2.2, head end at +Y. Returns the movable blanket."""
        c = self.c; st = Static(c, self.o); fr = M(self.name + "_bedframe", frame, rough=0.45, tex="noise", ts=3.0, amt=0.25); wh = M("sheet", (226, 226, 232), rough=0.9, tex="fabric")
        st.box(fr, (5.9, 9.0, 0.8), (0, 2.3, 0.9), bevel=0.12); st.box(fr, (5.9, 0.5, 3.6), (0, 6.75, 2.0), bevel=0.14); st.box(fr, (5.9, 0.4, 1.6), (0, -2.1, 1.3), bevel=0.12)
        for sx in (-1, 1):
            for sy in (-1.9, 6.6): st.box(fr, (0.5, 0.5, 0.6), (sx * 2.6, sy, 0.3), bevel=0.08)
        st.box(wh, (5.4, 8.6, 1.0), (0, 2.3, 1.7), bevel=0.2); st.box(wh, (3.8, 1.9, 0.6), (0, 5.5, 2.4), bevel=0.24)
        st.done(self.name + "_bed")
        self.blanket = part(self.name + "_blanket", M(self.name + "_blanket", cover, rough=0.9, tex="fabric"), c, (5.8, 5.8, 1.3), self.P(0, 0.95, 2.8), bevel=0.26)
        part(self.name + "_fold", M(self.name + "_fold", (200, 204, 216), rough=0.9, tex="fabric"), c, (5.84, 0.9, 1.34), parent=self.blanket, inner=(0, 2.5, 0.0), bevel=0.26)
        return self.blanket

    def nightstand(self, x=4.5, y=5.7, clock_tex="alarm_late"):
        c = self.c; st = Static(c, self.o); wd = M(self.name + "_stand", (104, 68, 44), rough=0.45, tex="noise", ts=3.0, amt=0.25)
        st.box(wd, (2.2, 2.0, 2.2), (x, y, 1.1), bevel=0.1); st.box(M("knob", (250, 205, 80), rough=0.3), (0.5, 0.12, 0.16), (x, y - 1.04, 1.5), bevel=0.04)
        st.cyl(M("lampbase", (90, 100, 130), rough=0.4), 0.3, 1.0, (x + 0.35, y + 0.3, 2.7)); st.cyl(M("lampbase", (90, 100, 130)), 0.5, 0.14, (x + 0.35, y + 0.3, 2.27))
        st.done(self.name + "_stand")
        self.shade_m = M(self.name + "_shade", (255, 236, 190), rough=0.8, emit=(255, 214, 140), emit_k=0.0)
        Mesher().cyl(0.95, 1.1, self.P(x + 0.35, y + 0.3, 3.7), n=20, r2=0.6).make(self.name + "_shade", self.shade_m, c, True).visible_shadow = False
        self.lamp = point_light(self.name + "_lamp", c, self.P(x - 1.2, y - 1.8, 5.0), (255, 200, 130), 0.0, radius=0.9, shadow=True)
        self.alarm = picture(self.name + "_alarm", clock_tex, c, 1.3, 0.65, self.P(x - 0.5, y - 0.75, 2.62), emit=2.0, thick=0.5, back=(40, 40, 50), tilt=-32)

    def lamp_on(self, k=1.0):
        set_emit(self.shade_m, 4.0 * k); self.lamp.data.energy = 1500.0 * k

    def bedroom_bits(self):
        c = self.c; st = Static(c, self.o)
        st.box(M("rug", (150, 44, 48), rough=0.95, tex="fabric", ts=0.5), (7.5, 4.6, 0.12), (-0.5, -4.2, 0.06), bevel=0.05); st.box(M("rug2", (206, 190, 150), rough=0.95, tex="fabric", ts=0.5), (6.3, 3.4, 0.14), (-0.5, -4.2, 0.07), bevel=0.05)
        wd = M("shelfwood", (120, 80, 50), rough=0.5, tex="noise", ts=3.0, amt=0.25)
        st.box(wd, (0.9, 4.6, 0.25), (-7.5, -1.0, 5.2), bevel=0.05); st.box(wd, (0.9, 4.6, 0.25), (-7.5, -1.0, 7.0), bevel=0.05)
        for i, (col, sz) in enumerate((((240, 80, 70), 0.9), ((80, 160, 240), 0.7), ((250, 205, 80), 1.0), ((110, 205, 130), 0.8))):
            st.box(M("toy%d" % i, col), (0.7, sz, sz), (-7.45, -2.6 + i * 1.05, 5.33 + sz / 2), bevel=0.08)
        for i, col in enumerate(((180, 110, 230), (255, 150, 60), (70, 200, 200))):
            st.box(M("book%d" % i, col), (0.75, 0.34, 1.1), (-7.45, -2.4 + i * 0.4, 7.68), bevel=0.04)
        st.ball(M("ball", (255, 255, 255)), 0.55, (-7.4, 0.4, 7.68))
        st.box(M("chest", (52, 84, 130), rough=0.5, tex="noise"), (2.6, 3.4, 1.8), (-6.4, -4.6, 0.9), bevel=0.08); st.box(M("chest2", (36, 58, 96), rough=0.5), (2.7, 3.5, 0.5), (-6.4, -4.6, 1.95), bevel=0.08)
        cu = M(self.name + "_curtain", (176, 60, 52), rough=0.95, tex="fabric", ts=0.6)
        for sx in (-1, 1): st.box(cu, (1.3, 0.3, 5.4), (sx * 4.3, self.D / 2 - 0.35, 6.3), bevel=0.14)
        st.cyl(M("rod", (90, 90, 100), rough=0.4), 0.1, 10.6, (0, self.D / 2 - 0.35, 9.0), (0, 90, 0))
        st.done(self.name + "_bits")
        picture(self.name + "_p1", "poster_rocket", c, 2.6, 3.6, self.P(-6.0, self.D / 2 - 0.08, 6.4), thick=0.1)
        picture(self.name + "_p2", "poster_sleep", c, 2.6, 3.6, self.P(self.W / 2 - 0.08, 0.5, 6.2), yaw=90, thick=0.1)

    def living_bits(self):
        c = self.c; st = Static(c, self.o)
        sf = M("sofa", (58, 84, 76), rough=0.95, tex="fabric", ts=0.6); sf2 = M("sofa2", (78, 108, 98), rough=0.95, tex="fabric", ts=0.6)
        st.box(sf, (8.4, 3.0, 1.5), (0, 5.2, 0.95), bevel=0.3); st.box(sf, (8.4, 0.9, 3.4), (0, 6.3, 1.9), bevel=0.35)
        for sx in (-1, 1): st.box(sf, (0.9, 3.0, 2.4), (sx * 4.3, 5.2, 1.4), bevel=0.35)
        for sx in (-1, 1): st.box(sf2, (3.4, 2.4, 0.6), (sx * 1.8, 5.0, 1.9), bevel=0.25)
        st.box(M("rug", (150, 44, 48), rough=0.95, tex="fabric", ts=0.5), (10, 6.4, 0.12), (0, 0.2, 0.06), bevel=0.05); st.box(M("rug3", (196, 180, 150), rough=0.95, tex="fabric", ts=0.5), (8.6, 5.0, 0.14), (0, 0.2, 0.07), bevel=0.05)
        wd = M("shelfwood", (120, 80, 50), rough=0.5, tex="noise", ts=3.0, amt=0.25)
        st.box(wd, (1.6, 5.2, 1.5), (-7.0, -1.0, 0.75), bevel=0.1); st.box(M("tv", (30, 30, 38), rough=0.3), (0.3, 4.6, 2.8), (-7.0, -1.0, 3.1), bevel=0.08)
        st.box(M("tvglow", (70, 110, 160), rough=0.2, emit=(90, 150, 255), emit_k=1.2), (0.32, 4.2, 2.4), (-6.98, -1.0, 3.1), bevel=0.04)
        st.cyl(M("rod", (90, 90, 100), rough=0.4), 0.12, 6.6, (6.4, 4.6, 3.3)); st.cyl(M("rod", (90, 90, 100)), 0.8, 0.2, (6.4, 4.6, 0.1))
        st.cyl(M("plantpot", (200, 110, 70)), 0.8, 1.3, (6.6, -5.4, 0.65), r2=1.0); st.blob(M("leaf", (64, 170, 72)), 1.5, (6.6, -5.4, 2.6), (1, 1, 1.3))
        cu = M(self.name + "_curtain", (70, 96, 120), rough=0.95, tex="fabric", ts=0.6)
        for sx in (-1, 1): st.box(cu, (1.3, 0.3, 5.4), (sx * 4.3, self.D / 2 - 0.35, 6.3), bevel=0.14)
        st.done(self.name + "_bits")
        self.shade_m = M(self.name + "_shade", (255, 236, 190), rough=0.8, emit=(255, 214, 140), emit_k=2.2)
        Mesher().cyl(1.2, 1.4, self.P(6.4, 4.6, 7.0), n=20, r2=0.8).make(self.name + "_shade", self.shade_m, c, True).visible_shadow = False
        self.lamp = point_light(self.name + "_lamp", c, self.P(5.2, 3.0, 6.4), (255, 205, 140), 900.0, radius=0.9)


def put(ob, loc, scale=1.0, rot=None):
    ob.location = loc; ob.scale = (scale,) * 3 if not isinstance(scale, (tuple, list)) else scale
    if rot is not None: ob.rotation_euler = tuple(D(a) for a in rot)


def gone(ob):
    """Take a prop out of the shot (props are single objects, so they are parked far away)."""
    ob.location = (0, 0, -500); ob.scale = (0.001,) * 3
