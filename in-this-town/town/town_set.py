"""The In This Town set (runs inside Blender): the kit's textured street (rt_engine.Street) with the kit's sky,
sun and moods, for the R15 cast.

Layout (from rt_engine.Street; units are studs, a standing R15 is 5 tall):
  road       along x, 12 wide, centre line at y = 0; sidewalks at y = -8 and y = +8 (top at z 0.25)
  houses     front walls at y = -15.5 (facing +y) and y = +15.5 (facing -y), every 20 along x
             (+y row at x = -76, -56, ..., 64; -y row at x = -84, -64, ..., 56); front lawns between
  lamps      every 20 along x at y = +-10.4; trees at y = +-19.5 and +-34
  props      red car at (-26, 4.2), blue car at (34, -4.2), hydrant (9, 9.3), mailbox (-14, -9.3),
             bench at (22, 9.3); clock tower at x = 92
Camera at -y looking +y sees the +y row of houses behind the cast."""
import bpy, math
import rt_engine as E

D = math.radians


def sky_and_sun(sc):
    """The kit's two-colour sky, sun and fill (rt_engine.new_scene without the reset and camera)."""
    wd = bpy.data.worlds.new("sky")
    sc.world = wd
    wd.use_nodes = True
    nt = wd.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sp = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Generated"], sp.inputs[0])
    nt.links.new(sp.outputs["Z"], mr.inputs[0])
    mr.inputs[1].default_value = -0.05
    mr.inputs[2].default_value = 0.55
    amb = nt.nodes.new("ShaderNodeBackground")
    lp = nt.nodes.new("ShaderNodeLightPath")
    ms = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mr.outputs[0], mix.inputs[0])
    nt.links.new(mix.outputs[2], bg.inputs[0])
    nt.links.new(lp.outputs["Is Camera Ray"], ms.inputs[0])
    nt.links.new(amb.outputs[0], ms.inputs[1])
    nt.links.new(bg.outputs[0], ms.inputs[2])
    nt.links.new(ms.outputs[0], out.inputs[0])
    E.G.world_mix, E.G.world_bg, E.G.world_amb = mix, bg, amb
    sd = bpy.data.lights.new("sun", "SUN")
    sd.angle = D(3.0)
    E.G.sun = bpy.data.objects.new("sun", sd)
    sc.collection.objects.link(E.G.sun)
    fd = bpy.data.lights.new("fill", "SUN")
    fd.angle = D(20.0)
    fd.use_shadow = False
    E.G.fill = bpy.data.objects.new("fill", fd)
    sc.collection.objects.link(E.G.fill)


STREET = None


def build(sc, mood="day"):
    global STREET
    sky_and_sun(sc)
    STREET = E.Street()
    if mood in ("night", "dusk"):
        STREET.lights_set(1.0 if mood == "night" else 0.5, 1.0)
    else:
        STREET.day()
    STREET.clock_time(3.25)
    E.mood(mood)
    return STREET


def render_settings(sc, pct=100):
    import planet_sets
    planet_sets.render_settings(sc, pct)            # EEVEE, shadows, AO, motion blur, 1080x1920
    vs = sc.view_settings
    try:
        vs.view_transform = "AgX"
        vs.look = "AgX - Punchy"
    except TypeError:
        pass
    vs.exposure = 0.35
