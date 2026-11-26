"""In This Planet sets (runs inside Blender): the violet neon living room with a ringed planet outside the window,
its lights, and the render settings shared by the look tests and the episode renderer."""
import bpy, os, math
from mathutils import Vector

MILO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(MILO, "assets", "textures")


def hexcol(h):
    h = h.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4)) + (1.0,)


def plastic(name, col, rough=0.42, tex=None, tint=None, scale=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Base Color"].default_value = hexcol(col)
    if tex:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, scale)
        nt.links.new(tc.outputs["Generated" if tex == "gen" else "UV"], mp.inputs["Vector"])
    return m


def textured(name, folder, scale=1.0, tint=None, rough_mul=1.0, box=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object" if box else "UV"], mp.inputs["Vector"])

    def img(fn, non_color=False):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(TEX, folder, fn))
        if non_color:
            n.image.colorspace_settings.name = "Non-Color"
        if box:
            n.projection, n.projection_blend = "BOX", 0.2
        nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
        return n
    d = img("diff.jpg")
    if tint:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(d.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = hexcol(tint)
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    else:
        nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
    r = img("rough.jpg", True)
    rm = nt.nodes.new("ShaderNodeMath")
    rm.operation, rm.inputs[1].default_value = "MULTIPLY", rough_mul
    nt.links.new(r.outputs["Color"], rm.inputs[0])
    nt.links.new(rm.outputs[0], b.inputs["Roughness"])
    n = img("nor.jpg", True)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def emit(name, col, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = hexcol(col)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m


def grad_emit(name, cols, strength):
    """Emission that runs bottom-to-top through `cols` (a neon sky)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.25, hexcol(cols[0])
    els[1].position, els[1].color = 0.95, hexcol(cols[-1])
    for i, c in enumerate(cols[1:-1]):
        e = els.new(0.25 + 0.7 * (i + 1) / (len(cols) - 1))
        e.color = hexcol(c)
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Strength"].default_value = strength
    nt.links.new(ramp.outputs["Color"], e.inputs["Color"])
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m


def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    if bevel:
        bm = o.modifiers.new("bev", "BEVEL")
        bm.width, bm.segments = bevel, 3
    return o




def room(fy=1):
    """The living room: back wall at y = 7*fy with a window (x = -3.2) onto the planet, sofa on the right."""
    FLOOR = textured("Floor", "brown_planks_05", 0.18, tint="#8A78B0")
    WALL = textured("Wall", "painted_plaster_wall", 0.25, tint="#9B7BE0")
    TRIM = emit("Neon", "#FF3DDB", 6.0)
    box("floor", (0, 0, -0.1), (26, 26, 0.2), FLOOR)

    BY = 7.0 * fy
    wx, wz, ww, wh = -3.2, 6.0, 5.0, 5.0   # window centre x, z and size
    box("wall_l", (-13, 0, 6), (0.4, 26, 12), WALL)
    box("wall_r", (13, 0, 6), (0.4, 26, 12), WALL)
    box("back_a", ((-13 + wx - ww / 2) / 2, BY, 6), (wx - ww / 2 + 13, 0.4, 12), WALL)
    box("back_b", ((13 + wx + ww / 2) / 2, BY, 6), (13 - wx - ww / 2, 0.4, 12), WALL)
    box("back_c", (wx, BY, (wz - wh / 2) / 2), (ww, 0.4, wz - wh / 2), WALL)
    box("back_d", (wx, BY, (12 + wz + wh / 2) / 2), (ww, 0.4, 12 - wz - wh / 2), WALL)
    for dz in (-wh / 2, wh / 2):
        box("sill", (wx, BY - 0.15 * fy, wz + dz), (ww + 0.5, 0.6, 0.25), TRIM, 0.04)
    for dx in (-ww / 2, 0, ww / 2):
        box("mullion", (wx + dx, BY - 0.15 * fy, wz), (0.22, 0.5, wh), TRIM, 0.03)
    box("skirting", (0, BY - 0.25 * fy, 0.25), (26, 0.15, 0.5), TRIM)
    SOFA = textured("Sofa", "denim_fabric", 2.0, tint="#5B2BB0", rough_mul=1.3)
    box("sofa_seat", (5.5, BY - 2.2 * fy, 0.9), (6.5, 2.8, 1.4), SOFA, 0.25)
    box("sofa_back", (5.5, BY - 0.9 * fy, 2.1), (6.5, 0.8, 2.6), SOFA, 0.3)
    for sx in (2.4, 8.6):
        box("sofa_arm", (sx, BY - 2.0 * fy, 1.5), (0.8, 3.2, 1.8), SOFA, 0.3)

    # outside: alien sky, ground, a ringed planet and two moons
    SKY = grad_emit("Sky", ["#FF4FD8", "#7A2BE8", "#1A0848"], 2.0)
    box("sky", (wx, BY + 40 * fy, 10), (120, 0.5, 70), SKY)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=7, location=(wx - 4, BY + 32 * fy, 16), segments=64, ring_count=32)
    pl = bpy.context.object
    pl.data.materials.append(emit("Planet", "#59E8FF", 2.4))
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_torus_add(major_radius=11, minor_radius=1.2, location=pl.location)
    ring = bpy.context.object
    ring.scale.z = 0.12
    ring.rotation_euler = (math.radians(70), math.radians(15), 0)
    ring.data.materials.append(emit("Ring", "#FF4FD8", 3.0))
    for (mx, mz, r) in ((wx + 6, 22, 1.5), (wx + 9, 17, 0.8)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(mx, BY + 30 * fy, mz))
        bpy.context.object.data.materials.append(emit("Moon", "#D8E6FF", 3.0))
        bpy.ops.object.shade_smooth()
    box("alien_ground", (wx, BY + 18 * fy, -2), (120, 30, 6), plastic("Dune", "#2B0F55", 0.8))



def lights(sc, fy=1):

    w = bpy.data.worlds.new("W")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = hexcol("#8A5CE0")
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 20))
    sun = bpy.context.object
    sun.data.energy, sun.data.angle = 3.2, math.radians(6)
    sun.data.color = (1.0, 0.72, 0.95)
    sun.rotation_euler = (math.radians(55), 0, math.radians(200 if fy > 0 else 20))
    bpy.ops.object.light_add(type="AREA", location=(0, -2 * fy, 11.5))
    ar = bpy.context.object
    ar.data.energy, ar.data.size = 900, 8
    bpy.ops.object.light_add(type="AREA", location=(2, -9 * fy, 5))
    fill = bpy.context.object
    fill.data.energy, fill.data.size, fill.data.color = 420, 5, (0.35, 0.9, 1.0)
    fill.rotation_euler = ((Vector((0, 0, 3)) - fill.location).to_track_quat("-Z", "Y").to_euler())



def render_settings(sc, pct=100):
    PCT = pct
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    ee = sc.eevee
    for a, v in (("taa_render_samples", 64), ("use_shadows", True), ("use_raytracing", True), ("use_gtao", True)):
        if hasattr(ee, a):
            setattr(ee, a, v)
    sc.render.use_motion_blur = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1080, 1920, PCT
    vs = sc.view_settings
    vs.view_transform = "AgX"
    try:
        vs.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    vs.exposure = 0.2
