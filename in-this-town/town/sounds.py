"""The In This Town sound palette: short names -> (file under my-sounds/, credit line or None).
Everything is in the kit's sounds/ folder (see LICENSES.md): sfx-kit (CC0, GitHub
wyzowl/sfx-kit), the Sonniss GDC 2026 bundle (royalty-free, no credit) and incompetech music (CC BY 4.0, credit).
Add more: put the file under sounds/ and add a line here (only sounds you are allowed to use)."""
import os

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sounds")
KIT = "sfx/sfx-kit/sounds/"
GDC = "sfx/gdc26/Sonniss.com-GDC2026-GameAudioBundle/"
INC = "music/incompetech/"


def _mac(title):
    return (f'"{title}" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License '
            'http://creativecommons.org/licenses/by/4.0/')


SFX = {
    # cuts and energy
    "whoosh": (KIT + "whooshes/whoosh-fast-medium.wav", None),
    "whoosh_hard": (KIT + "whooshes/whoosh-fast-hard.wav", None),
    "swish": (KIT + "swishes-and-zips/swish-medium.wav", None),
    "rev_whoosh": (KIT + "reverse-whooshes/reverse-whoosh-medium-soft.wav", None),
    "boom": (KIT + "booms-and-bass/boom-hit-medium.wav", None),
    "hit": (KIT + "cinematic-hits/cinematic-drum-big.wav", None),
    "slam": (KIT + "cinematic-hits/cinematic-slam-big.wav", None),
    "sub_drop": (KIT + "booms-and-bass/bass-sub-drop-short.wav", None),
    "bass_down": (GDC + "Cinematic Sound Design - Cartoon & Animation Vol 2/Cartoon Transition Bass Down.wav", None),
    # floating / magic
    "float": (KIT + "shape-changes/transform-grow.wav", None),
    "rise": (KIT + "risers-and-fallers/riser-1s-soft.wav", None),
    "rise2": (KIT + "risers-and-fallers/riser-2s-soft.wav", None),
    "sparkle": (KIT + "shimmers/shimmer-medium-sparkle.wav", None),
    "sparkle_long": (KIT + "shimmers/shimmer-long-sparkle.wav", None),
    "magic": (GDC + "Alexander Kopeikin - Emotion and Magic/magic, energy flow, astonishment-001.wav", None),
    "power_up": (GDC + "Epic Stock Media - Anime Game/DSGNStngr_Power Up Bright Positive Successful Light Saturation "
                       "Crash Shimmer 05_ESM_AG.wav", None),
    # comedy
    "pop": (KIT + "pops/pop-small-in.wav", None),
    "pop2": (KIT + "pops/pop-medium-in.wav", None),
    "boing": (KIT + "bounce-spin-zoom/move-spring.wav", None),
    "dizzy": (GDC + "Cinematic Sound Design - Cartoon Bloopers/Cartoon Confused Dizzy.wav", None),
    "ding": (KIT + "tones/tone-ding-mid.wav", None),
    "deflate": (KIT + "shape-changes/transform-deflate.wav", None),
    "crickets": (GDC + "344 Audio - East Coast America Vol. 1/AMBSubn_Ambience, Forest Crickets, Birds, "
                       "Connecticut 02_344 Audio_East Coast America.wav", None),
    "wind": (GDC + "InMotionAudio - Chimney Wind/WINDInt_ChimneyWind05_InMotionAudio_ChimneyWind.wav", None),
    # robots / sci-fi
    "servo": (GDC + "Epic Stock Media - Tower Defense Game/ROBTMvmt_Tower Deploy Hitech Robot Motor Dark Thump Servo "
                    "Whine 04_ESM_TDG.wav", None),
    "blip": (KIT + "digital/digital-blip-clear.wav", None),
    "scan": (KIT + "digital/digital-scan-clear.wav", None),
    "power_on": (KIT + "digital/digital-power-up.wav", None),
    "glitch": (KIT + "digital/digital-glitch-clear.wav", None),
    # money and laughs (In This Town)
    "coin": (GDC + "Cinematic Sound Design - UI Interaction Elements/Ting Coins.wav", None),
    "coin_flip": (GDC + "Cinematic Sound Design - Hybrid Game & UI Elements/Foley Coin Flip Single Fast.wav", None),
    "laugh_f": (GDC + "SoundBits - Vox Hominis - Human Effort Voices/VOXLaff_Laughing Female 02 06_SNDBTS_VH.wav", None),
    "laugh_m": (GDC + "Epic Stock Media - AAA Game Character Police Officer/VOXLaff_Police Officer Laugh Vocal Male 1.wav", None),
    "kids_laugh": (GDC + "Epic Stock Media - Public Spaces - Crowds Walla and Everyday Ambiences/CRWDChld_Walla Children Kids "
                         "Daytime School Playing Laughing P_187.wav", None),
}

MUSIC = {
    "phantom": (INC + "mysterious/Phantom from Space.mp3", _mac("Phantom from Space")),       # sci-fi, theremin
    "schoolyard": (INC + "mysterious/Secrets of the Schoolyard.mp3", _mac("Secrets of the Schoolyard")),
    "overworld": (INC + "mysterious/Overworld.mp3", _mac("Overworld")),
    "cool_dude": (INC + "uplifting/Super Power Cool Dude.mp3", _mac("Super Power Cool Dude")),
    "riley": (INC + "uplifting/Life of Riley.mp3", _mac("Life of Riley")),                     # bouncy comedy
}


def path(rel):
    return os.path.normpath(os.path.join(ROOT, rel))


def missing():
    return [k for k, (p, _) in {**SFX, **MUSIC}.items() if not os.path.exists(path(p))]


if __name__ == "__main__":
    print("missing:", missing() or "none")
