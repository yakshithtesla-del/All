"""Pictures for laugh_coin.json ("In this town, every laugh costs one coin"). build(S) makes the cast and props
once; each shot function stages one shot (absolute times a..b in seconds). Camera height and distance change
every shot. The action is on the road (y -6..6; the +y row of houses is behind the cast when the camera is at -y).
Coins are gold discs from a pool: pop() shoots one out of a laughing mouth, rain() drops them on a heap."""
import os, json, math, random
import bpy, bmesh
from mathutils import Vector, Matrix
import core
import planet_sets as PS

R = math.radians
RND = random.Random(11)
STAGE = (6.0, 4.5)             # where the hero tells his joke; the mic stand is just in front of him
CROWD = (("mom", 3.4), ("dad", 5.0), ("guy", 7.0), ("teen", 8.6), ("kid", 10.2))
HEAP_COMIC = (15.0, 3.0)
HEAP_DAD = (-15.0, 3.5)
HEAP_H = 1.5


# ---------------------------------------------------------------- helpers
def F(t):
    return int(round(t * 30))


def key(ob, path, f, value):
    setattr(ob, path, value)
    ob.keyframe_insert(path, frame=f)


def show(objs, a, b):
    for o in objs:
        for p in [o] + list(o.children_recursive):
            key(p, "hide_render", F(a), False)
            key(p, "hide_render", F(b), True)


def hide_all(objs):
    for o in objs:
        for p in [o] + list(o.children_recursive):
            key(p, "hide_render", 0, True)


def label(name, body, loc, size, mat, rot=(90, 0, 0)):
    bpy.ops.object.text_add(location=loc, rotation=tuple(R(v) for v in rot))
    o = bpy.context.object
    o.name = name
    o.data.body = body
    o.data.size = size
    o.data.extrude = size * 0.08
    o.data.align_x, o.data.align_y = "CENTER", "CENTER"
    o.data.materials.append(mat)
    return o


def rod(name, loc, r, depth, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=24, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def ball(name, loc, r, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


def gold():
    m = PS.plastic("Gold", "#FFC02E", 0.22)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Metallic"].default_value = 0.45          # fully metallic coins turn black with nothing to reflect
    b.inputs["Emission Color"].default_value = PS.hexcol("#FFB000")
    b.inputs["Emission Strength"].default_value = 1.1
    return m


def coin_obj(name, mat):
    """A coin standing up, its face toward -y (rotate about z to spin it). Built at the origin; the mesh keeps
    only the rotation (apply location too and the coin's mesh would sit wherever it was made)."""
    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.12, vertices=32, location=(0, 0, 0), rotation=(R(90), 0, 0))
    o = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.04, location=(0, 0, 0), rotation=(R(90), 0, 0))
    rim = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    rim.name = name + "_rim"
    rim.data.materials.append(mat)
    rim.parent = o
    rim.location = (0, -0.07, 0)
    o.location = (0, 0, -50)
    return o


def heap_gold():
    m = gold()
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Emission Strength"].default_value = 0.25
    return m


def heap(name, at, mat, n=110, r=2.3, h=HEAP_H):
    """A mound of coins: a gold dome with loose coins scattered over it, one mesh."""
    bm = bmesh.new()
    for i in range(n):
        u = RND.random()
        rr = r * math.sqrt(u)
        a = RND.random() * 2 * math.pi
        z = h * (1 - (rr / r) ** 1.6) + 0.03
        M = (Matrix.Translation((at[0] + math.cos(a) * rr, at[1] + math.sin(a) * rr, z))
             @ Matrix.Rotation(RND.uniform(-0.5, 0.5), 4, "X") @ Matrix.Rotation(RND.uniform(-0.5, 0.5), 4, "Y"))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.42, radius2=0.42, depth=0.1, matrix=M)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    dome = ball(name + "_dome", (at[0], at[1], 0.0), 1.0, mat, (r * 0.92, r * 0.92, h * 0.95))
    return [o, dome]


def mic_stand(name):
    black = PS.plastic("MicBlack", "#16161A", 0.35)
    steel = PS.plastic("MicSteel", "#9AA0AA", 0.25)
    base = rod(name + "_base", (0, 0, 0.05), 0.55, 0.1, black)
    pole = rod(name + "_pole", (0, 0, 1.9), 0.06, 3.7, steel)
    head = ball(name + "_head", (0, -0.05, 3.85), 0.22, black, (1, 1, 1.25))
    for o in (pole, head):
        o.parent = base
        o.matrix_parent_inverse = base.matrix_world.inverted()
    return base, [base, pole, head]


def sign(name):
    red = PS.plastic("SignRed", "#D81E2A", 0.4)
    white = PS.plastic("SignWhite", "#F4F4F4", 0.5)
    grey = PS.plastic("SignPole", "#6A6E78", 0.3)
    pole = rod(name + "_pole", (0, 0.1, 2.3), 0.09, 4.6, grey)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 4.4))
    plate = bpy.context.object
    plate.name = name + "_plate"
    plate.scale = (3.6, 0.12, 1.7)
    plate.data.materials.append(red)
    bpy.ops.object.modifier_add(type="BEVEL")
    plate.modifiers["Bevel"].width = 0.08
    t1 = label(name + "_t1", "NO", (0, -0.1, 4.82), 0.62, white)
    t2 = label(name + "_t2", "CLOWNS", (0, -0.1, 4.05), 0.62, white)
    parts = [pole, plate, t1, t2]
    for o in parts[1:]:
        o.parent = pole
        o.matrix_parent_inverse = pole.matrix_world.inverted()
    return pole, parts


def place_group(root, a, loc):
    key(root, "location", F(a), Vector(loc))
    for fc in root.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"


# ---------------------------------------------------------------- coins in motion
class Pool:
    def __init__(self, coins):
        self.coins, self.i = coins, 0

    def take(self):
        c = self.coins[self.i % len(self.coins)]
        self.i += 1
        return c


def mouth(S, who, t, deg):
    f = core.facing(deg)
    return S.head(who, t) + f * 0.72 + Vector((0, 0, -0.42))


def pop(C, S, who, t, deg, end, side=0.0, out=1.2, up=2.4, land=None):
    """One coin shoots out of `who`'s mouth at t, spins, arcs and falls (to `land`, or out of frame)."""
    c = C["pool"].take()
    f = core.facing(deg)
    right = Vector((-f.y, f.x, 0.0))
    m = mouth(S, who, t, deg)
    peak = m + f * out * 0.55 + right * side * 0.6 + Vector((0, 0, up))
    fin = Vector(land) if land else m + f * out + right * side + Vector((0, 0, -4.5))
    show([c], t, end)
    key(c, "location", F(t), m)
    key(c, "location", F(t + 0.35), peak)
    key(c, "location", F(t + 0.7), peak + (fin - peak) * 0.15 + Vector((0, 0, 0.15)))
    key(c, "location", F(t + 1.25), fin)
    key(c, "scale", F(t), (0.3, 0.3, 0.3))
    key(c, "scale", F(t + 0.3), (1.25, 1.25, 1.25))
    key(c, "rotation_euler", F(t), (0, 0, 0))
    key(c, "rotation_euler", F(t + 1.25), (R(20), 0, R(720)))
    return c


def rain(C, a, b, at, n=8, top=HEAP_H, r=1.6):
    """Coins drop from above onto a heap all through the shot."""
    for i in range(n):
        c = C["pool"].take()
        t0 = a + (b - a - 0.5) * i / max(1, n - 1)
        x, y = at[0] + RND.uniform(-r, r), at[1] + RND.uniform(-r * 0.6, r * 0.6)
        show([c], t0, b)
        key(c, "location", F(t0), Vector((x, y, 9.5)))
        key(c, "location", F(t0 + 0.65), Vector((x, y, top + 0.2)))
        key(c, "rotation_euler", F(t0), (0, 0, 0))
        key(c, "rotation_euler", F(t0 + 0.65), (R(70), 0, R(360)))
        key(c, "scale", F(t0), (1, 1, 1))


def word_times(sid):
    """Start of each spoken word in a shot (from words.json), to time the 'Ha' coins."""
    try:
        build = os.environ.get("PLANET_BUILD")
        story = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cake_lamp.json"), encoding="utf-8"))
        i = [s["id"] for s in story["shots"]].index(sid)
        ws = json.load(open(os.path.join(build, "words.json"), encoding="utf-8"))["words"]
        return [w["t0"] for w in ws if w["shot"] == i]
    except Exception:
        return []


# ---------------------------------------------------------------- build
def build(S):
    C = {}
    C["hero"] = S.add("hero", "hero", (0.0, 2.0), "smirk")
    C["kid"] = S.add("kid", "kid", (-3.0, 3.0), "smile")
    C["dad"] = S.add("dad", "dad", (4.0, 3.0), "deadpan")
    C["mom"] = S.add("mom", "mom", (-6.0, 4.0), "smile")
    C["comic"] = S.add("comic", "comic", (15.0, 3.0), "grin")
    C["clown"] = S.add("clown", "clown", (-10.0, 3.0), "grin")
    C["guy"] = S.add("guy", "guy", (4.5, 4.5), "smile")
    C["teen"] = S.add("teen", "teen", (-8.0, 5.0), "smile")
    # Birthday prop: a tall streetlamp-shaped cake with candles hidden in the frosting.
    # Its parts are staged in the final reveal shots; keep the silhouette readable on a phone.
    cake = PS.plastic("LampCake_Frosting", "#F5B8D4", 0.38)
    cake_dark = PS.plastic("LampCake_Shadow", "#9B526C", 0.5)
    icing = PS.plastic("LampCake_Icing", "#FFF0B3", 0.28)
    candle_mat = PS.plastic("LampCake_Candle", "#FF6B6B", 0.35)
    flame_mat = PS.emit("LampCake_Flame", "#FFE36E", 3.0)
    root = bpy.data.objects.new("LampCake_Root", None)
    bpy.context.scene.collection.objects.link(root)
    C["lampcake_root"] = root
    parts = []
    # Main pole and broad base; all built at the origin and parented to one keyed root.
    parts.append(rod("LampCake_Pole", (0, 0, 0), 0.34, 7.1, cake))
    parts.append(rod("LampCake_Base", (0, 0, 0), 0.72, 0.25, cake_dark))
    # Decorative icing bands and a big rounded lamp-head cake.
    parts.append(rod("LampCake_Band1", (0, 0, 0), 0.39, 0.18, icing))
    parts.append(rod("LampCake_Band2", (0, 0, 0), 0.39, 0.18, icing))
    parts.append(ball("LampCake_Head", (0, 0, 0), 0.95, cake, (1.0, 1.0, 0.7)))
    parts.append(ball("LampCake_Glaze", (0, 0, 0), 0.97, icing, (1.0, 1.0, 0.25)))
    # Mini candles on the cake head.
    candles = []
    for i, x in enumerate((-0.47, 0.0, 0.47)):
        candle = rod(f"LampCake_Candle{i}", (0, 0, 0), 0.09, 0.38, candle_mat)
        flame = ball(f"LampCake_Flame{i}", (0, 0, 0), 0.12, flame_mat)
        candles.extend((candle, flame))
    parts.extend(candles)
    for o in parts:
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
    C["lampcake"] = parts
    hide_all(parts)
    # A small icing blob that lands on Dad's nose in the punchline.
    C["icing_blob"] = ball("BirthdayIcingBlob", (0, 0, -50), 0.24, icing, (1.2, 0.8, 0.65))
    hide_all([C["icing_blob"]])
    g = gold()
    coins = [coin_obj(f"coin{i}", g) for i in range(34)]
    hide_all(coins)
    C["pool"] = Pool(coins)
    hg = heap_gold()
    C["heap_comic"] = heap("heap_comic", HEAP_COMIC, hg)
    C["heap_dad"] = heap("heap_dad", HEAP_DAD, hg)
    hide_all(C["heap_comic"] + C["heap_dad"])
    C["mic"], C["mic_parts"] = mic_stand("mic")
    hide_all(C["mic_parts"])
    C["sign"], C["sign_parts"] = sign("noclown")
    hide_all(C["sign_parts"])
    return C


# ---------------------------------------------------------------- shots
def hook(S, C, a, b):
    S.only("hook", "hero", "mom", "guy", "teen", "kid")
    C["hero"].place(a, (0.0, 1.5), 0)
    C["mom"].place(a, (-4.2, 4.0), 15)
    C["guy"].place(a, (4.0, 4.4), -20)
    C["teen"].place(a, (-7.5, 5.0), 30)
    C["kid"].place(a, (6.8, 3.2), -35)
    C["hero"].at(a + 0.05, "wave", "smirk")
    C["mom"].at(a + 0.05, "idle", "smile")
    C["guy"].at(a + 0.05, "crossarms", "smile")
    C["teen"].at(a + 0.05, "phone", "smile")
    C["kid"].at(a + 0.05, "wave", "grin")
    S.camera("hook", (1.0, -13.5, 10.5), (0.0, 3.5, 3.2), 24, to=(0.8, -11.0, 7.0))


def rule(S, C, a, b):
    S.only("rule", "guy")
    C["guy"].place(a, (2.0, 2.0), 10)
    C["guy"].at(a + 0.05, "idle", "smile")
    C["guy"].at(a + 0.3, "cheer", "laugh")
    pop(C, S, "guy", a + 0.5, 10, b, side=-1.9)
    pop(C, S, "guy", a + 0.95, 10, b, side=1.8)
    S.on("rule", "guy", dist=5.6, h=0.3, ang=18, lens=32, push=0.8)


def comic(S, C, a, b):
    S.only("comic", "comic")
    show(C["heap_comic"], a, b)
    x, y = HEAP_COMIC
    C["comic"].place(a, (x, y, HEAP_H - 0.1), 0)
    C["comic"].at(a + 0.05, "king", "smug")
    C["comic"].at(a + 0.9, "akimbo", "grin")
    rain(C, a, b, HEAP_COMIC, n=9)
    S.camera("comic", (x + 2.6, y - 7.5, 1.6), (x, y, 4.6), 24, to=(x + 2.2, y - 6.6, 1.9))


def clown(S, C, a, b):
    S.only("clown", "clown")
    show(C["sign_parts"], a, b)
    place_group(C["sign"], a, (-12.4, 5.6, 0.0))
    C["clown"].place(a, (-9.4, 2.4), -15)
    C["clown"].at(a + 0.05, "wave", "grin")
    C["clown"].at(a + 0.55, "sad", "cry")
    S.camera("clown", (-10.4, -9.0, 4.8), (-10.6, 3.8, 3.6), 26, to=(-10.3, -7.8, 4.5))


def dad(S, C, a, b):
    S.only("dad", "dad", "kid")
    C["dad"].place(a, (4.0, 3.0), 0)
    C["dad"].at(a + 0.05, "akimbo", "deadpan")
    C["kid"].place(a, (1.0, 4.4), 67)
    C["kid"].at(a + 0.05, "ballet", "wink")
    C["kid"].at(a + 0.6, "twitch", "evil")
    S.camera("dad", (2.6, -7.0, 4.4), (3.0, 3.4, 3.9), 30, to=(2.8, -6.0, 4.3))


def rich(S, C, a, b):
    S.only("rich", "dad")
    show(C["heap_dad"], a, b)
    x, y = HEAP_DAD
    C["dad"].place(a, (x, y, HEAP_H - 0.1), 0)
    C["dad"].at(a + 0.05, "king", "smug")
    rain(C, a, b, HEAP_DAD, n=7)
    S.camera("rich", (x - 1.5, y - 9.5, 9.5), (x, y, 4.0), 28, to=(x - 1.0, y - 7.5, 8.0))


def tickle(S, C, a, b):
    S.only("tickle", "guy", "kid")
    C["guy"].place(a, (-4.0, 3.2), 25)
    C["guy"].at(a + 0.05, "ahh2", "laugh")
    C["kid"].place(a, (-6.1, 3.7), 65)
    C["kid"].at(a + 0.05, "holdout", "evil")
    hand = Vector((-5.0, 3.0, 2.7))
    for i, t in enumerate((a + 0.35, a + 0.7, a + 1.05)):
        pop(C, S, "guy", t, 25, b, side=-0.5 + 0.3 * i, out=1.6, up=1.0, land=hand + Vector((0.15 * i, 0, 0.1 * i)))
    S.camera("tickle", (-7.2, -5.2, 4.6), (-5.0, 3.1, 3.4), 28, to=(-7.0, -4.3, 4.4))


def crowd(C, a, face, faces=None, pose="idle"):
    for n, x in CROWD:
        C[n].place(a, (x, -1.6 - 0.4 * (n in ("dad", "teen"))), 180)
        C[n].at(a + 0.05, pose, (faces or {}).get(n, face))


def mic_on(C, a, b):
    show(C["mic_parts"], a, b)
    place_group(C["mic"], a, (STAGE[0], STAGE[1] - 1.05, 0.0))


def joke(S, C, a, b):
    S.only("joke", "hero", *[n for n, _ in CROWD])
    mic_on(C, a, b)
    C["hero"].place(a, STAGE, 0)
    C["hero"].at(a + 0.05, "point", "grin")
    crowd(C, a, "smile")
    S.camera("joke", (STAGE[0] + 0.8, -6.5, 8.6), (STAGE[0], STAGE[1], 4.0), 30, to=(STAGE[0] + 0.6, -5.6, 8.0))


def nobody(S, C, a, b):
    S.only("nobody", "hero", *[n for n, _ in CROWD])
    mic_on(C, a, b)
    C["hero"].place(a, STAGE, 0)
    C["hero"].at(a + 0.05, "shrug", "grin")
    crowd(C, a, "deadpan", {"mom": "sideeye", "teen": "sleepy", "kid": "deadpan", "guy": "sideeye"}, "crossarms")
    S.camera("nobody", (STAGE[0] + 2.5, STAGE[1] + 5.0, 7.5), (STAGE[0] + 0.8, -1.8, 4.0), 28,
             to=(STAGE[0] + 2.3, STAGE[1] + 4.4, 7.2))


def myself(S, C, a, b):
    S.only("myself", "hero")
    mic_on(C, a, b)
    C["hero"].place(a, STAGE, 0)
    C["hero"].at(a + 0.05, "shrug", "smirk")
    C["hero"].at(a + 0.5, "ahh2", "laugh")
    S.on("myself", "hero", dist=4.4, h=0.2, ang=-22, lens=34, push=0.6)


def haha(S, C, a, b):
    S.only("haha", "hero")
    mic_on(C, a, b)
    C["hero"].place(a, STAGE, 0)
    C["hero"].at(a + 0.05, "ahh2", "laugh")
    ts = [t for t in word_times("haha") if a - 0.1 <= t < b][:4]
    if len(ts) < 4:
        ts = [a + 0.1 + (b - a - 0.4) * i / 3 for i in range(4)]
    for i, t in enumerate(ts):
        C["hero"].at(t, "ahh2" if i % 2 else "cheer", "laugh")
        pop(C, S, "hero", t, 0, b, side=(-2.2, 2.0, -1.5, 1.6)[i], out=1.4, up=2.4)
    S.on("haha", "hero", dist=7.4, h=0.8, ang=28, lens=30, push=1.6)


def broke(S, C, a, b):
    S.only("broke", "hero")
    mic_on(C, a, b)
    C["hero"].place(a, STAGE, 0)
    C["hero"].at(a + 0.05, "shrug", "sad")
    C["hero"].at(a + 0.7, "sad", "sad")
    S.camera("broke", (STAGE[0] - 1.2, STAGE[1] - 6.0, 6.0), (STAGE[0], STAGE[1], 3.6), 30,
             to=(STAGE[0] - 1.0, STAGE[1] - 5.2, 5.7))


def loop(S, C, a, b):
    S.only("loop", "hero")
    mic_on(C, a, b)
    C["hero"].place(a, STAGE, 0)
    C["hero"].at(a + 0.05, "point", "smirk")
    C["hero"].at(b - 0.45, "ahh", "laugh")
    pop(C, S, "hero", b - 0.3, 0, b + 0.5, side=1.8, out=0.8)
    S.on("loop", "hero", dist=5.0, h=-0.4, ang=6, lens=32, push=1.2)


def mailbox(S, C, a, b):
    S.only("mailbox", "hero")
    C["hero"].place(a, (-14.0, -6.0), 0)
    C["hero"].at(a + 0.05, "thinkchin", "smirk")
    C["hero"].at(a + 0.5, "point", "happy")
    S.camera("mailbox", (-15.5, -13.0, 4.8), (-14.0, -8.9, 2.6), 34,
             to=(-15.1, -12.0, 4.5))


def bench(S, C, a, b):
    S.only("bench", "dad")
    C["dad"].place(a, (22.0, 5.7), 0)
    C["dad"].at(a + 0.05, "point", "deadpan")
    C["dad"].at(a + 0.55, "nod", "smug")
    S.camera("bench", (24.0, -2.0, 4.6), (22.0, 8.8, 2.7), 32,
             to=(23.5, -1.1, 4.4))


def cake(S, C, a, b):
    S.only("cake", "mom", "hero")
    C["mom"].place(a, (-2.0, 2.6), 0)
    C["mom"].at(a + 0.05, "show", "smile")
    C["hero"].place(a, (1.0, 3.7), 15)
    C["hero"].at(a + 0.05, "cheer", "happy")
    S.on("cake", "mom", dist=6.0, h=0.3, ang=18, lens=32, push=0.5)


def flicker(S, C, a, b):
    S.only("flicker", "hero", "dad")
    C["hero"].place(a, (3.0, 3.0), 0)
    C["hero"].at(a + 0.05, "shock", "shock")
    C["dad"].place(a, (5.5, 4.6), 12)
    C["dad"].at(a + 0.05, "lookdown", "sideeye")
    # A real street lamp sits at x= -2, y=+10.4: camera stays outside it.
    S.camera("flicker", (1.0, -7.0, 7.2), (-2.0, 9.9, 6.0), 26,
             to=(0.0, -6.0, 6.8))


def lamp(S, C, a, b):
    S.only("lamp", "hero", "dad")
    C["hero"].place(a, (-4.2, 1.5), 0)
    C["hero"].at(a + 0.05, "scared", "shock")
    C["dad"].place(a, (-1.0, 3.0), 0)
    C["dad"].at(a + 0.05, "point", "shock")
    # Reveal the cake-lamp prop in a phone-friendly medium close shot.
    show(C["lampcake"], a, b)
    key(C["lampcake_root"], "location", F(a), Vector((-2.0, 8.8, 0.0)))
    C["lampcake_root"].keyframe_insert("location", frame=F(a))
    S.camera("lamp", (-7.0, -7.0, 8.8), (-2.0, 8.6, 6.1), 33,
             to=(-6.4, -6.0, 8.2))


def icing(S, C, a, b):
    S.only("icing", "dad")
    C["dad"].place(a, (-1.0, 3.0), 0)
    C["dad"].at(a + 0.05, "shock", "scared")
    show([C["icing_blob"]], a, b)
    key(C["icing_blob"], "location", F(a), Vector((-0.75, 1.0, 8.7)))
    key(C["icing_blob"], "location", F(a + 0.38), Vector((-0.6, 2.3, 4.4)))
    key(C["icing_blob"], "location", F(a + 0.72), Vector((-0.15, 2.65, 4.6)))
    key(C["icing_blob"], "scale", F(a), (0.5, 0.5, 0.5))
    key(C["icing_blob"], "scale", F(a + 0.32), (1.0, 1.0, 1.0))
    S.on("icing", "dad", dist=4.8, h=0.2, ang=8, lens=36, push=0.5)


def fork(S, C, a, b):
    S.only("fork", "hero", "dad")
    C["dad"].place(a, (-1.0, 3.0), 0)
    C["dad"].at(a + 0.05, "holdout", "smug")
    C["hero"].place(a, (-4.0, 4.4), 15)
    C["hero"].at(a + 0.05, "facepalm", "smirk")
    show(C["lampcake"], a, b)
    key(C["lampcake_root"], "location", F(a), Vector((-2.0, 8.8, 0.0)))
    S.camera("fork", (-7.0, -6.5, 7.3), (-2.0, 8.4, 5.8), 31,
             to=(-6.3, -5.8, 7.0))


def tall(S, C, a, b):
    S.only("tall", "dad", "hero")
    C["dad"].place(a, (-1.0, 3.0), 0)
    C["dad"].at(a + 0.05, "holdout", "grin")
    C["hero"].place(a, (-4.0, 4.4), 15)
    C["hero"].at(a + 0.05, "shrug", "smirk")
    show(C["lampcake"], a, b)
    key(C["lampcake_root"], "location", F(a), Vector((-2.0, 8.8, 0.0)))
    S.camera("tall", (-6.4, -6.0, 6.5), (-2.0, 8.4, 5.0), 32,
             to=(-5.8, -5.3, 6.2))


def loop(S, C, a, b):
    # A wide little birthday tableau that cuts directly back to the opening hook.
    S.only("loop", "hero", "dad", "mom", "kid")
    C["hero"].place(a, (0.0, 1.5), 0)
    C["hero"].at(a + 0.05, "wave", "smirk")
    C["dad"].place(a, (4.0, 3.0), 0)
    C["dad"].at(a + 0.05, "holdout", "grin")
    C["mom"].place(a, (-4.0, 4.0), 15)
    C["mom"].at(a + 0.05, "cheer", "smile")
    C["kid"].place(a, (6.0, 4.0), -15)
    C["kid"].at(a + 0.05, "wave", "grin")
    S.camera("loop", (0.0, -13.0, 10.0), (0.0, 3.0, 3.2), 24,
             to=(0.7, -11.0, 8.0))


SHOTS = {"hook": hook, "rule": rule, "mailbox": mailbox, "bench": bench, "cake": cake,
         "flicker": flicker, "lamp": lamp, "icing": icing, "fork": fork, "tall": tall, "loop": loop}
