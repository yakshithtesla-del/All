"""Step 2. Render an In This Town story (run by Blender, not plain Python):
  blender -b --factory-startup --python town/render.py -- town/stories/<story>.json [--stills] [--scale 50]
                                                                                      [--from 3.5 --to 5] [--only id,id]
Timing comes from town/build/words.json: every shot starts just before its first spoken word (as in the kit).
The story's .py stages it on our engine: R15 cast (engine/cast.py), the actor timeline (rbx_actor), the kit's street
(town_set) and one camera per shot. --stills renders three moments per shot into build/stills for checking."""
import sys, os, json, time, math, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
MILO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(MILO, "engine"))
sys.path.insert(0, HERE)                      # town_set, town_cast, rt_engine live next to this file
import bpy
import core                                   # the engine core resets the scene on import: it must come first
bpy.ops.wm.read_factory_settings(use_empty=True)
from mathutils import Vector
import cast as planet_cast                    # the town cast (engine/cast.py)
import planet_sets, rbx_actor

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
story_path = argv[0] if os.path.isabs(argv[0]) else os.path.join(os.getcwd(), argv[0])


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


STILLS = "--stills" in argv
SCALE = int(opt("--scale", 100))
T_FROM, T_TO = float(opt("--from", 0)), float(opt("--to", 1e9))
ONLY = opt("--only")
BUILD = os.environ.get("PLANET_BUILD", os.path.join(HERE, "build"))
story = json.load(open(story_path, encoding="utf-8"))
words = json.load(open(os.path.join(BUILD, "words.json"), encoding="utf-8"))["words"]
FPS = int(story.get("fps", 30))
TOTAL = float(story.get("seconds", 20))
NF = int(round(TOTAL * FPS))
LEAD = float(story.get("cut_lead", 0.07))


def shot_times():
    out = []
    for i, s in enumerate(story["shots"]):
        ws = [w for w in words if w["shot"] == i]
        out.append([s["id"], max(0.0, ws[0]["t0"] - LEAD) if ws else None])
    out[0][1] = 0.0
    for i, o in enumerate(out):
        if o[1] is None:
            o[1] = out[i - 1][1]
    res = []
    for i, (sid, t0) in enumerate(out):
        t1 = out[i + 1][1] if i + 1 < len(out) else TOTAL
        res.append((sid, round(t0 * FPS) / FPS, round(t1 * FPS) / FPS))
    return res


TIMES = shot_times()
json.dump([{"id": a, "t0": b, "t1": c} for a, b, c in TIMES], open(os.path.join(BUILD, "shots.json"), "w"), indent=1)


class Stage:
    """What a story's .py talks to."""
    HEAD = 4.4                                   # head centre height of a standing R15 (height 5)

    def __init__(self):
        self.sc = bpy.context.scene
        self.times = {sid: (a, b) for sid, a, b in TIMES}
        self.cast = {}
        bpy.ops.object.camera_add()
        self.cam = bpy.context.object
        self.sc.camera = self.cam

    def t(self, sid):
        return self.times[sid]

    def add(self, name, who, pos=(0.0, 0.0), face=None, hd=0.0):
        face = face or (planet_cast.CAST[who]["face"] if who in planet_cast.CAST else "neutral")
        ch = planet_cast.spawn(who, pos, face=face)
        a = rbx_actor.Actor(name, ch["arm"], rbx_actor.face_atlas(ch["face"], ch["faces"]), face,
                            hover_bob=0.1 if ch["hover"] else 0.0, pos=(pos[0], pos[1], 0.0), hd=hd)
        a.who, a.hover = who, ch["hover"]
        a.head_z = ch["face_center"].z           # head centre height when standing at pos (hover included)
        self.cast[name] = a
        return a

    def _key_cam(self, f, pos, look, lens):
        c = self.cam
        c.location = pos
        c.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        c.data.lens = lens
        c.keyframe_insert("location", frame=f)
        c.keyframe_insert("rotation_euler", frame=f)
        c.data.keyframe_insert("lens", frame=f)

    def camera(self, sid, pos, look, lens=35, to=None, look_to=None, lens_to=None):
        """One camera for the shot: starts at pos looking at look; optionally drifts to `to` / `look_to` by the end."""
        a, b = self.times[sid]
        f0, f1 = int(round(a * FPS)), max(int(round(a * FPS)), int(round(b * FPS)) - 1)
        self._key_cam(f0, pos, look, lens)
        self._key_cam(f1, to or pos, look_to or look, lens_to or lens)

    def head(self, name, t):
        a = self.cast[name]
        p, _, _ = a.base(t)
        return Vector((p.x, p.y, a.head_z + p.z + a.lift_at(t)))

    def on(self, sid, name, dist=6.0, h=0.0, ang=0.0, lens=35, push=0.0, aim=(0, 0, 0)):
        """Frame a character: camera `dist` in front (ang degrees round to its right), `h` above head height,
        dollying in by `push` over the shot."""
        a, b = self.times[sid]
        tgt = self.head(name, a) + Vector(aim)
        r = math.radians(ang)
        d = Vector((math.sin(r), -math.cos(r), 0))
        pos = tgt + d * dist + Vector((0, 0, h))
        self.camera(sid, pos, tgt, lens, to=tgt + d * max(0.8, dist - push) + Vector((0, 0, h)) if push else None)

    def only(self, sid, *names):
        """Send everyone else off stage for this shot."""
        a, b = self.times[sid]
        frames = set(range(int(round(a * FPS)), int(round(b * FPS))))
        for n, act in self.cast.items():
            if n not in names:
                act.hidden |= frames


spec = importlib.util.spec_from_file_location("story_file", os.path.splitext(story_path)[0] + ".py")
story_file = importlib.util.module_from_spec(spec)
spec.loader.exec_module(story_file)

t_build = time.time()
sc = bpy.context.scene
if story.get("set", "town") == "town":            # the kit's textured street, lit by the kit's moods
    import town_set
    town_set.build(sc, story.get("mood", "day"))
    town_set.render_settings(sc, SCALE)
else:
    raise SystemExit(f"unknown set {story.get('set')!r}: this kit has the 'town' set")
sc.eevee.taa_render_samples = int(story.get("samples", 32))
# Prefer Cycles CUDA on a Colab T4 when explicitly requested and available; otherwise
# keep the story's tested EEVEE look and print the actual selected backend.
GPU_BACKEND = os.environ.get("PLANET_GPU_BACKEND", "auto").upper()
if GPU_BACKEND in ("AUTO", "CUDA", "OPTIX"):
    try:
        import addon_utils
        addon_utils.enable("cycles", default_set=False, persistent=False)
        prefs = bpy.context.preferences.addons["cycles"].preferences
        candidates = (GPU_BACKEND,) if GPU_BACKEND in ("CUDA", "OPTIX") else ("CUDA", "OPTIX")
        selected = None
        for backend in candidates:
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
                gpu_devices = [d for d in prefs.devices if d.type == backend]
                if gpu_devices:
                    for d in prefs.devices:
                        d.use = d.type != "CPU"
                    selected = backend
                    break
            except Exception as exc:
                print(f"[gpu] {backend} unavailable: {exc}", flush=True)
        if selected:
            sc.render.engine = "CYCLES"
            sc.cycles.device = "GPU"
            sc.cycles.samples = int(os.environ.get("PLANET_CYCLES_SAMPLES", "16"))
            sc.cycles.use_denoising = True
            print(f"[gpu] Cycles {selected}; devices: " + ", ".join(d.name for d in gpu_devices), flush=True)
        else:
            print("[gpu] No Cycles GPU backend available; using EEVEE", flush=True)
    except Exception as exc:
        print(f"[gpu] Cycles GPU setup failed; using EEVEE: {exc}", flush=True)
else:
    if GPU_BACKEND == "CPU":
        import addon_utils
        addon_utils.enable("cycles", default_set=False, persistent=False)
        sc.render.engine = "CYCLES"
        sc.cycles.device = "CPU"
        sc.cycles.samples = int(os.environ.get("PLANET_CYCLES_SAMPLES", "8"))
        sc.cycles.use_denoising = True
        print(f"[render] Cycles CPU; samples={sc.cycles.samples}", flush=True)
    else:
        print(f"[gpu] Requested backend {GPU_BACKEND}; EEVEE configured", flush=True)
if sc.render.engine == "CYCLES":
    threads = int(os.environ.get("PLANET_CPU_THREADS", "0"))
    sc.render.threads_mode = "FIXED" if threads > 0 else "AUTO"
    if threads > 0:
        sc.render.threads = threads
sc.render.fps = FPS
S = Stage()
C = story_file.build(S)
for sid, a, b in TIMES:
    story_file.SHOTS[sid](S, C, a, b)
for act in S.cast.values():
    act.write(NF, FPS)
    rbx_actor.sway(act.arm, NF, FPS)
for c in (S.cam.animation_data.action.fcurves if S.cam.animation_data else []):
    for k in c.keyframe_points:
        k.interpolation = "BEZIER"
# No motion blur on the last frame of a shot and the first frame of the next: the shutter would otherwise
# smear the camera and the cast across the cut (ghosted frames).
SHUT = sc.render.motion_blur_shutter
cuts = sorted({int(round(t0 * FPS)) for _, t0, _ in TIMES[1:]})
for c in cuts:
    for f, v in ((c - 2, SHUT), (c - 1, 0.0), (c, 0.0), (c + 1, SHUT)):
        if 0 <= f < NF:
            sc.render.motion_blur_shutter = v
            sc.render.keyframe_insert("motion_blur_shutter", frame=f)
if sc.animation_data and sc.animation_data.action:
    for c in sc.animation_data.action.fcurves:
        for k in c.keyframe_points:
            k.interpolation = "CONSTANT"
print(f"[town] built in {time.time() - t_build:.1f}s; {len(TIMES)} shots, {NF} frames", flush=True)

sc.frame_start, sc.frame_end = 0, NF - 1
sc.frame_set(0)
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 92


def still(path, f):
    sc.frame_set(f)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


warm = os.path.join(BUILD, "_warm.jpg")       # the first render after start can come out blank: throw one away
sc.render.resolution_percentage = 20
still(warm, 0)
sc.render.resolution_percentage = SCALE
t0 = time.time()
if STILLS:
    out = os.path.join(BUILD, "stills")
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))
    for i, (sid, a, b) in enumerate(TIMES):
        if ONLY and sid not in ONLY.split(","):
            continue
        for j, fr in enumerate((0.05, 0.5, 0.95)):
            still(os.path.join(out, f"{i:02d}_{sid}_{j}.jpg"), int(round((a + (b - a) * fr) * FPS)))
    print(f"[town] stills in {time.time() - t0:.1f}s", flush=True)
else:
    out = os.path.join(BUILD, "frames")
    os.makedirs(out, exist_ok=True)
    sc.frame_start = max(0, int(round(T_FROM * FPS)))
    sc.frame_end = min(NF - 1, int(round(T_TO * FPS)))
    sc.render.filepath = os.path.join(out, "f_#####")
    sc.render.use_overwrite = "--keep" not in argv       # --keep: skip frames that already exist (make.py checks them)
    bpy.ops.render.render(animation=True)
    print(f"[town] frames {sc.frame_start}-{sc.frame_end} in {time.time() - t0:.1f}s", flush=True)
