#!/usr/bin/env python3
"""Frame-accurate renderer for film.html (headless Chromium via Playwright).

  python3 render.py --format wide --scale 2 --out /path/frames_wide     # 3840x2160 frames
  python3 render.py --format tall --scale 1 --out /path/frames_tall     # 1080x1920 frames
  python3 render.py --format wide --stills 3,9,21 --out /path/stills    # quick check of single seconds

Frames are rendered by N parallel workers (--jobs); each frame is a pure function of its index,
so shards can be rendered in any order and re-run individually.
"""
import argparse, functools, http.server, os, socketserver, sys, threading, time
from concurrent.futures import ProcessPoolExecutor
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CHROME = os.environ.get("CHROME_PATH") or ("/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None)

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]

def worker(fmt, scale, out, frames):
    port = serve()
    w, h = (1080, 1920) if fmt == "tall" else (1920, 1080)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--force-color-profile=srgb", "--font-render-hinting=none"])
        page = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)
        page.goto(f"http://127.0.0.1:{port}/film/src/film.html?format={fmt}")
        page.evaluate("window.ready")
        for f in frames:
            path = os.path.join(out, f"{f:05d}.jpg")
            if os.path.exists(path):
                continue
            page.evaluate("f => renderFrame(f)", f)
            page.screenshot(path=path + ".tmp", type="jpeg", quality=96)
            os.replace(path + ".tmp", path)
        b.close()
    return len(frames)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", choices=["wide", "tall"], default="wide")
    ap.add_argument("--scale", type=float, default=1)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--stills", help="comma-separated seconds to render as single frames")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--duration", type=float, default=77)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    if a.stills:
        frames = [round(float(s) * a.fps) for s in a.stills.split(",")]
    else:
        frames = list(range(int(a.duration * a.fps)))
    shards = [frames[i::a.jobs] for i in range(a.jobs)]
    t0 = time.time()
    with ProcessPoolExecutor(a.jobs) as ex:
        n = sum(ex.map(worker, [a.format] * a.jobs, [a.scale] * a.jobs, [a.out] * a.jobs, shards))
    print(f"rendered {n} frames in {time.time() - t0:.0f}s -> {a.out}")
