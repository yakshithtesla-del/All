"""Milo's character timeline driving an R15 rig (runs inside Blender).
The Actor is a core.Char without Milo's own mesh: the same place / run / turn / at(t, pose, face) / flail / lift
calls and all of Milo's POSES, written as keyframes onto the R15 pose bones. Each Milo joint rotation is given in
the character's frame and conjugated into the bone's own rest orientation, so every pose means the same thing.
Import core BEFORE building the scene: importing it resets the scene."""
import bpy, math, os, random
import numpy as np
from mathutils import Vector, Euler
import core

R = math.radians
BONES = ["UpperTorso", "Head", "LeftUpperArm", "RightUpperArm", "LeftLowerArm", "RightLowerArm",
         "LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg"]
RIGID = ("leg", "foot", "knee", "toe", "hub", "horn", "bell", "mantle", "spot", "cup", "jet", "dome", "brain",
         "mound", "puddle", "halo", "sh", "crown", "cap")


class Actor(core.Char):
    def __init__(self, name, arm, face_ctl=None, face="neutral", hover_bob=0.0, pos=None, hd=0.0):
        self.name, self.scale, self.crowd = name, 1.0, False
        p = pos if pos is not None else (arm.location.x, arm.location.y, 0.0)
        self.pos0, self.hd0 = Vector((p[0], p[1], p[2] if len(p) > 2 else 0.0)), hd
        self.moves, self.poses, self.faces, self.wears = [], [(-10.0, "idle")], [(-10.0, face)], [(-10.0, "own")]
        self.flails, self.bob_windows, self.extra, self.sizes, self.lifts = [], [], [], [], []
        self.phase = random.random() * 10
        self.idle_hz, self.bob_hz = 0.7, 1.6
        self.jbias, self.freeze, self.variants, self.hide_shots = {}, set(), None, set()
        self.hidden = set()          # frames when this actor is off stage (not in the shot)
        self.arm, self.face_ctl, self.hover_bob = arm, face_ctl, hover_bob
        self.base_z = arm.location.z
        self.rest_rot = arm.rotation_euler.copy()
        A = arm.matrix_world.to_3x3().normalized()
        self.C = {b: (A @ arm.data.bones[b].matrix_local.to_3x3()).normalized() for b in BONES if b in arm.data.bones}
        for pb in arm.pose.bones:
            pb.rotation_mode = "QUATERNION"

    def at(self, t, pose=None, face=None, lead=core.LEAD):
        if pose and pose not in core.POSES:
            raise KeyError(f"unknown pose {pose}")
        if pose:
            self.poses.append((t - lead, pose))
        if face:
            self.faces.append((t - lead, face))

    def _rot(self, bone, eul, f):
        if bone not in self.C:
            return
        C = self.C[bone]
        pb = self.arm.pose.bones[bone]
        pb.rotation_quaternion = (C.inverted() @ eul.to_matrix() @ C).to_quaternion()
        pb.keyframe_insert("rotation_quaternion", frame=f)

    def write(self, nf, fps=core.FPS):
        a = self.arm
        for f in range(nf):
            t = f / fps
            pos, hd, j, bounce = self.channels(t)
            z = self.base_z + pos.z + self.lift_at(t) + j["crouch"] + bounce
            if self.hover_bob:
                z += self.hover_bob * math.sin(2 * math.pi * 0.55 * t + self.phase)
            a.location = (pos.x, pos.y, -1000.0 if f in self.hidden else z)
            a.rotation_euler = (self.rest_rot.x, self.rest_rot.y, self.rest_rot.z + R(hd))
            a.keyframe_insert("location", frame=f)
            a.keyframe_insert("rotation_euler", frame=f)
            self._rot("UpperTorso", Euler((R(j["lean"]), R(j["tilt"]), R(j["twist"]))), f)
            self._rot("Head", Euler((R(j["nod"]), R(j["roll"]), R(j["turnh"]))), f)
            self._rot("LeftUpperArm", Euler((R(j["shp"]), R(-j["spp"]), R(-j["szp"]))), f)
            self._rot("RightUpperArm", Euler((R(j["shn"]), R(j["spn"]), R(j["szn"]))), f)
            self._rot("LeftLowerArm", Euler((R(j["elp"]), 0, 0)), f)
            self._rot("RightLowerArm", Euler((R(j["eln"]), 0, 0)), f)
            self._rot("LeftUpperLeg", Euler((R(j["hipp"]), 0, 0)), f)
            self._rot("RightUpperLeg", Euler((R(j["hipn"]), 0, 0)), f)
            self._rot("LeftLowerLeg", Euler((R(max(0.0, j["hipp"]) * 0.9), 0, 0)), f)    # knee folds as the leg swings back
            self._rot("RightLowerLeg", Euler((R(max(0.0, j["hipn"]) * 0.9), 0, 0)), f)
        if self.face_ctl:
            node, cells = self.face_ctl
            loc = node.inputs["Location"]
            for t, name in sorted(self.faces):
                fr = max(0, core.frame(t))
                loc.default_value = (cells[name][0], cells[name][1], 0)
                loc.keyframe_insert("default_value", frame=fr)
            _constant(node.id_data)
        for c in a.animation_data.action.fcurves if a.animation_data and a.animation_data.action else []:
            for k in c.keyframe_points:
                k.interpolation = "LINEAR"


def _constant(idblock):
    ad = idblock.animation_data
    if ad and ad.action:
        for c in ad.action.fcurves:
            for k in c.keyframe_points:
                k.interpolation = "CONSTANT"


def face_atlas(face_obj, folder, cell=512):
    """Pack every face PNG in `folder` into one atlas on the face plane; returns (mapping node, {name: offset})."""
    names = sorted(f[:-4] for f in os.listdir(folder) if f.endswith(".png") and f != "sheet.png")
    g = math.ceil(math.sqrt(len(names)))
    atlas = np.zeros((g * cell, g * cell, 4), dtype="float32")
    cells = {}
    for i, n in enumerate(names):
        im = bpy.data.images.load(os.path.join(folder, n + ".png"), check_existing=False)
        im.scale(cell, cell)
        px = np.array(im.pixels[:], dtype="float32").reshape(cell, cell, 4)
        col, row = i % g, i // g
        atlas[row * cell:(row + 1) * cell, col * cell:(col + 1) * cell] = px
        cells[n] = (col / g, row / g)
        bpy.data.images.remove(im)
    img = bpy.data.images.new(f"atlas_{face_obj.name}", g * cell, g * cell, alpha=True)
    img.pixels = atlas.ravel()
    img.pack()
    nt = face_obj.data.materials[0].node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
    tex.image = img
    tex.extension = "CLIP"
    uv = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / g, 1 / g, 1)
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    return mp, cells


def sway(arm, nf, fps=core.FPS, amp=7.0):
    """Extra limbs, tentacles, strands and antennae drift on their own (each with its own rhythm)."""
    rnd = random.Random(len(arm.name))
    for o in bpy.data.objects:
        if o.parent != arm or o.type != "CURVE" or any(k in o.name.lower() for k in RIGID):
            continue
        base = o.rotation_euler.copy()
        hz, ph, a = 0.4 + rnd.random() * 0.5, rnd.random() * 6.28, R(amp * (0.6 + rnd.random() * 0.8))
        for f in range(0, nf, 2):
            t = f / fps
            o.rotation_euler = (base.x + a * math.sin(2 * math.pi * hz * t + ph),
                                base.y + a * 0.7 * math.sin(2 * math.pi * hz * 1.3 * t + ph + 1.7), base.z)
            o.keyframe_insert("rotation_euler", frame=f)
