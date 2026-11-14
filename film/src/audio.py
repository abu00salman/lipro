#!/usr/bin/env python3
"""Builds the film soundtrack -> out/soundtrack.wav (48 kHz stereo, 77 s).

Layers
  1. Music     : audio/music.(mp3|wav) if present, otherwise an original synthesized score (this file).
  2. Voice-over: audio/vo.(mp3|wav) if present. The take is split at its pauses into the 7 narration
                 phrases and each phrase is placed on its picture cue (VO_CUES). Music ducks under it.
  3. Sound FX  : whooshes / impacts / risers synthesized here, locked to the cuts in film.html.

  python3 audio.py            # writes out/soundtrack.wav
"""
import os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR, DUR = 48000, 77.0
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)

VO_CUES = [7.2, 14.0, 18.6, 36.5, 51.0, 68.5, 70.7]          # start of each narration phrase (s)
SWEEPS = [6.6, 18.05, 29.6, 43.1, 60.6, 68.0]                  # light-sweep transitions
IMPACTS = [(2.55, .8), (6.6, .7), (18.05, .6), (29.6, .55), (39.3, 1.0), (43.1, .6),
           (50.6, .8), (52.9, .6), (55.2, .6), (57.7, .7), (60.6, .65), (68.0, .7), (70.8, 1.0)]
RISERS = [(4.9, 6.6), (37.6, 39.3), (66.2, 68.0)]

def t_(d): return np.arange(int(SR * d)) / SR
def filt(x, kind, f, order=2):
    return sosfilt(butter(order, np.array(f) / (SR / 2), kind, output="sos"), x)
def place(buf, x, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    x = x[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(x), 0] += x * gain * l * 1.414
    buf[i:i + len(x), 1] += x * gain * r * 1.414
def hz(semi): return 146.83 * 2 ** (semi / 12)                 # D3 = 0

# ---------------------------------------------------------------- sound design
def whoosh(d=0.9):
    t = t_(d); n = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    for k, (lo, hi) in enumerate([(300, 900), (900, 2600), (2600, 7000)]):
        env = np.exp(-((t / d - (0.38 + 0.12 * k)) ** 2) / 0.03)
        out += filt(n, "band", [lo, hi]) * env
    return out * 0.5
def impact(power=1.0):
    t = t_(2.6)
    sub = np.sin(2 * np.pi * (34 * t + 46 * (1 - np.exp(-t * 9)) / 9)) * np.exp(-t * 2.4)
    thud = filt(rng.standard_normal(len(t)), "low", 240) * np.exp(-t * 11) * 1.6
    air = filt(rng.standard_normal(len(t)), "band", [1500, 6000]) * np.exp(-t * 5) * 0.12
    return (sub + thud + air) * power
def riser(d):
    t = t_(d); p = t / d
    n = filt(rng.standard_normal(len(t)), "band", [500, 9000]) * p ** 2.2 * 0.35
    tone = np.sin(2 * np.pi * np.cumsum(180 + 620 * p ** 2) / SR) * p ** 2 * 0.16
    return n + tone
def shimmer(d=2.2):
    t = t_(d); out = np.zeros(len(t))
    for i, f in enumerate([hz(24), hz(31), hz(36), hz(43), hz(48)]):
        out += np.sin(2 * np.pi * f * t + i) * np.exp(-t * (1.4 + i * .3)) * np.clip(t / (.05 + .12 * i), 0, 1)
    return out * 0.07

# ---------------------------------------------------------------- synthesized score (fallback)
def pluck(f, d=2.2):                                            # felt-piano-like
    t = t_(d); x = np.zeros(len(t))
    for h, a in enumerate([1, .5, .28, .12, .06], 1):
        x += a * np.sin(2 * np.pi * f * h * t * (1 + .0006 * h * h)) * np.exp(-t * (1.6 + h * 1.1))
    return x * np.clip(t / .004, 0, 1)
def saw(f, d, cutoff, att=.04, rel=.12, harm=14):
    t = t_(d); x = np.zeros(len(t))
    for h in range(1, harm + 1):
        if f * h > cutoff * 2.2: break
        x += np.sin(2 * np.pi * f * h * t + h) / h / (1 + (f * h / cutoff) ** 4) ** .5
    env = np.clip(t / att, 0, 1) * np.clip((d - t) / rel, 0, 1)
    return x * env
def taiko(power=1.0):
    t = t_(1.4)
    body = np.sin(2 * np.pi * (52 * t + 70 * (1 - np.exp(-t * 26)) / 26)) * np.exp(-t * 5.5)
    skin = filt(rng.standard_normal(len(t)), "band", [120, 900]) * np.exp(-t * 22) * .8
    return (body + skin) * power

def synth_score():
    m = np.zeros((N, 2)); BEAT = 0.6; BAR = 2.4
    chords = [(0, 3, 7), (-4, 0, 3), (3, 7, 10), (-2, 2, 5)]     # Dm  Bb  F  C  (relative to D3)
    roots = [0, -4, 3, -2]
    def level(t, a, b, lo=0., hi=1.):                             # ramp helper
        return lo + (hi - lo) * np.clip((t - a) / max(b - a, 1e-6), 0, 1)
    nbars = int(DUR / BAR) + 1
    for b in range(nbars):
        t0 = 6.6 + (b - 3) * BAR
        if t0 < 0 or t0 > 73.5: continue
        ch, root = chords[b % 4], roots[b % 4]
        final = t0 >= 68.0
        if final: ch, root = (0, 4, 7), 0                         # resolve to D major
        # pad (always, swelling)
        g = level(t0, 0, 20, .25, .55) * (1.25 if 43 <= t0 < 60.6 or final else 1)
        for k, n_ in enumerate(ch):
            for det, pan in ((-.06, -.6), (.07, .6)):
                place(m, saw(hz(n_ + 12 + det), BAR + .5, 1500 + 60 * b, att=.7, rel=.9), t0, g * .085, pan)
        place(m, saw(hz(root - 12), BAR + .3, 260, att=.2, rel=.5), t0, level(t0, 16, 30, 0, .32))
        # piano arpeggio
        if t0 >= 6.5:
            pat = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12, ch[1] + 12, ch[0] + 24, ch[1] + 12]
            for i, n_ in enumerate(pat):
                place(m, pluck(hz(n_)), t0 + i * BEAT / 2, .2 * (1.25 if i % 4 == 0 else .9) * level(t0, 60, 70, 1, .75), (i % 3 - 1) * .35)
        # string ostinato
        if t0 >= 18.0:
            g = level(t0, 18, 30, .35, 1) * (.75 if 60.6 <= t0 < 68 else 1)
            for i in range(8):
                n_ = ch[(i * 2) % 3] + 12 + (12 if i % 4 == 3 else 0)
                place(m, saw(hz(n_), BEAT / 2 * .8, 2600, att=.012, rel=.06), t0 + i * BEAT / 2, .1 * g * (1.3 if i % 4 == 0 else 1), -.3 + .08 * i)
        # drums
        if t0 >= 29.5:
            g = level(t0, 29.5, 44, .5, 1) * (.6 if 60.6 <= t0 < 68 else 1)
            for beat, pw in ((0, 1.0), (1.5, .55), (2.5, .7), (3.0, .5), (3.5, .6)):
                if t0 < 43 and beat in (3.0, 3.5): continue
                place(m, taiko(pw), t0 + beat * BEAT, .5 * g)
        # brass + lead from the title scene on
        if 43 <= t0 < 60.6 or final:
            for n_ in ch:
                place(m, saw(hz(n_), BAR, 1100, att=.09, rel=.35), t0, .13)
            lead = [(19, 0, 2), (17, 2, 1), (15, 3, 1)] if b % 2 == 0 else [(22, 0, 2), (19, 2, 2)]
            for n_, beat, ln in lead:
                n_ = n_ + (0 if not final else 0)
                x = saw(hz(n_ + 12), ln * BEAT, 3200, att=.08, rel=.2) * (1 + .012 * np.sin(2 * np.pi * 5.4 * t_(ln * BEAT)))
                place(m, x, t0 + beat * BEAT, .085, .15)
    # intro drone + air
    t = t_(9.0)
    drone = (np.sin(2 * np.pi * hz(-12) * t) + .5 * np.sin(2 * np.pi * hz(-5) * t)) * np.clip(t / 2.5, 0, 1) * np.clip((9 - t) / 2.5, 0, 1)
    place(m, drone, 0.2, .2)
    place(m, filt(rng.standard_normal(len(t)), "band", [2500, 9000]) * np.clip(t / 4, 0, 1) * np.clip((9 - t) / 3, 0, 1), 0.2, .02)
    # final chord tail
    for n_ in (0, 4, 7, 12, 16):
        place(m, saw(hz(n_), 6.0, 1800, att=.05, rel=4.5), 70.8, .1, (n_ % 5 - 2) * .25)
    return m

def reverb(x, secs=2.4, mix=.28):
    t = t_(secs)
    ir = rng.standard_normal((len(t), 2)) * np.exp(-t * 3.2)[:, None]
    ir = np.stack([filt(ir[:, c], "low", 6500) for c in (0, 1)], 1); ir /= np.sqrt((ir ** 2).sum(0))
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in (0, 1)], 1)
    return x * (1 - mix * .4) + wet * mix

# ---------------------------------------------------------------- helpers for real assets
def find(name):
    for ext in ("wav", "mp3", "m4a"):
        p = os.path.join(HERE, "audio", f"{name}.{ext}")
        if os.path.exists(p): return p
def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
def split_phrases(vo, count):
    """Cut the narration take at its `count-1` longest pauses."""
    env = np.abs(vo).max(1); win = int(.03 * SR)
    rms = np.sqrt(np.convolve(env ** 2, np.ones(win) / win, "same"))
    loud = rms > rms.max() * .03
    idx = np.flatnonzero(loud); start, end = idx[0], idx[-1]
    gaps, i = [], start
    while i < end:
        if not loud[i]:
            j = i
            while j < end and not loud[j]: j += 1
            gaps.append((j - i, i, j)); i = j
        else: i += 1
    cuts = sorted(sorted(gaps, reverse=True)[:count - 1], key=lambda g: g[1])
    bounds = [start] + [c for g in cuts for c in (g[1], g[2])] + [end]
    return [vo[max(0, bounds[k] - int(.03 * SR)): bounds[k + 1] + int(.12 * SR)] for k in range(0, len(bounds), 2)]

# ---------------------------------------------------------------- build
def main():
    mpath, vpath = find("music"), find("vo")
    if mpath:
        music = np.zeros((N, 2)); src = load(mpath)[:N]; music[:len(src)] = src
        music /= max(1e-9, np.abs(music).max()) / .8
        print("music :", os.path.relpath(mpath, HERE))
    else:
        music = reverb(synth_score()); music /= np.abs(music).max() / .8
        print("music : synthesized score (no audio/music.* found)")
    fade = np.ones(N); k = int(1.8 * SR); fade[-k:] = np.linspace(1, 0, k) ** 2; fade[: int(.4 * SR)] = np.linspace(0, 1, int(.4 * SR))

    voice = np.zeros((N, 2))
    if vpath:
        phrases = split_phrases(load(vpath), len(VO_CUES))
        peak = max(np.abs(p).max() for p in phrases)
        for k, (p, cue) in enumerate(zip(phrases, VO_CUES)):
            p = p / peak * .95
            f = int(.02 * SR); p[:f] *= np.linspace(0, 1, f)[:, None]; p[-f:] *= np.linspace(1, 0, f)[:, None]
            nxt = VO_CUES[k + 1] if k + 1 < len(VO_CUES) else DUR
            flag = "  <-- runs into the next cue, move VO_CUES / picture" if cue + len(p) / SR > nxt else ""
            print(f"voice : phrase {k + 1} {len(p) / SR:5.2f}s at {cue:5.1f}s{flag}")
            voice[int(cue * SR): int(cue * SR) + len(p)] += p[: N - int(cue * SR)]
        env = np.abs(voice).max(1); w = int(.25 * SR)
        duck = np.clip(np.convolve((env > .02).astype(float), np.ones(w) / w, "same") * 1.6, 0, 1)
        music *= (1 - .58 * duck)[:, None]                         # ~ -7.5 dB under narration
    else:
        print("voice : none (no audio/vo.* found) - the on-screen typography carries the script")

    sfx = np.zeros((N, 2))
    for i, s in enumerate(SWEEPS): place(sfx, whoosh(), s - .5, .5, (-1) ** i * .5)
    for at, pw in IMPACTS: place(sfx, impact(pw), at - .01, .42)
    for a, b in RISERS: place(sfx, riser(b - a), a, .55)
    for at in (2.9, 39.4, 70.9): place(sfx, shimmer(), at, 1.0)
    sfx = reverb(sfx, 1.6, .2)

    mix = music * .78 * fade[:, None] + sfx * (.8 if vpath else .9) * fade[:, None] + voice * 1.0
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)                      # gentle limiter
    mix /= max(1.0, np.abs(mix).max() / .97)
    os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
    tmp = os.path.join(HERE, "out", "_mix.f32"); mix.astype(np.float32).tofile(tmp)
    out = os.path.join(HERE, "out", "soundtrack.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", tmp,
                    "-af", "loudnorm=I=-15:TP=-1.2:LRA=11", "-ar", str(SR), "-c:a", "pcm_s24le", out], check=True)
    os.remove(tmp); print("wrote :", out)

if __name__ == "__main__":
    main()
