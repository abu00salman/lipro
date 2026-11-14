# Lipro Sports Academy — Official Promotional Film

77-second film built entirely from the academy's own material (training footage, championship and
branch photos, the official logo and site colours/fonts) plus motion graphics rendered frame by frame.

## Deliverables (this folder)

| File | Format | Use |
|---|---|---|
| `Lipro_Academy_Cinematic_4K.mp4` | 3840×2160, 30 fps, H.264 + AAC | 16:9 master (YouTube, screens) |
| `Lipro_Academy_Reels_9x16.mp4` | 1080×1920, 30 fps | Reels / TikTok / Shorts / Snapchat |
| `lipro-film-web-16x9.mp4`, `lipro-film-web-9x16.mp4` | 720p, fast-start | Website player (loaded on click) |
| `poster-16x9.jpg`, `poster-9x16.jpg` | 720p | Poster frames for the website player |
| `Lipro_Logo_Intro.mp4`, `Lipro_Logo_Outro.mp4` | 1920×1080 | Reusable animated logo intro / outro |
| `src/` | — | Complete source + render pipeline |

**About "4K":** typography, logo and graphics are rendered natively at 3840×2160. The academy's
footage is 720×1280 phone video and the photos are ≤1280 px wide, so the live-action areas are
upscaled — they cannot be sharper than the originals. Supplying higher-resolution footage and
re-running the build is all that is needed to improve that.

## Content rules followed

Every claim on screen is taken from liproacademy.com: licensed by the Ministry of Sport, member of
the Saudi Football Federation, AFC/CAF-licensed coaches, champions of the SAFF Jazan regional
tournament (U11), 7 branches across Jazan / Asir / Al-Baha, 3 training days a week, ages 5–18.
Nothing was invented, and no AI-generated people or footage are used.

## Storyboard / shot list

| # | Time | Picture | On-screen text (= narration) |
|---|---|---|---|
| 1 | 0:00–0:07 | Stadium floodlights switch on; 3D logo assembles (shield halves fly in, gold bar drops, letters rise, light sweep) | أكاديمية ليبرو الرياضية · LIPRO SPORTS ACADEMY |
| 2 | 0:07–0:13 | Night pitch wide → young player's first touches on the ball (slow motion) | كل حلم كبير… يبدأ بخطوة |
| 3 | 0:13–0:18 | Dribbling → agility jump | وكل بطل… كانت له بداية |
| 4 | 0:18–0:30 | Triptych: hurdles / cone dribbling / passing | في أكاديمية ليبرو الرياضية نصنع بيئةً — ينمو فيها الشغف · تتطوّر فيها المهارات · تُبنى فيها الثقة |
| 5 | 0:30–0:36 | Coaches at work | مدربون معتمدون آسيويًا وأفريقيًا · مرخّصة من وزارة الرياضة · عضوية الاتحاد السعودي لكرة القدم |
| 6 | 0:36–0:43 | Training jump → flash → trophy-lift photo | من أوّل لمسة… إلى أوّل إنجاز |
| 7 | 0:43–0:51 | Championship photos (crowning, medals) | بطل بطولة الاتحاد السعودي لكرة القدم — منطقة جازان · فئة براعم ١١ |
| 8 | 0:51–1:01 | Four fast beats: drills / hurdles / team line-up / coach with players | تدريب · انضباط · روح الفريق · وطموح لا يتوقّف |
| 9 | 1:01–1:08 | Branch photo wall | ٧ فروع — جازان · عسير · الباحة · ٣ أيام تدريب أسبوعيًا · من عمر ٥ إلى ١٨ سنة |
| 10 | 1:08–1:17 | Logo outro, call to action | أكاديمية ليبرو الرياضية — هنا تبدأ رحلة الأبطال · سجّل ابنك الآن · liproacademy.com · 0530634750 |

Footage source: `promo-video.mp4` (repo root), cropped to remove the editing-app watermark and
retimed with frame blending. Photos: `banner-1/3/4.jpg`, `branch-*.jpg`.

## Narration script (Arabic)

> كلُّ حلمٍ كبير… يبدأ بخطوة.
> وكلُّ بطل… كانت له بداية.
> في أكاديمية ليبرو الرياضية، نصنع بيئةً ينمو فيها الشغف، وتتطوّر فيها المهارات، وتُبنى فيها الثقة.
> من أوّل لمسة… إلى أوّل إنجاز.
> تدريب، انضباط، روح الفريق، وطموحٌ لا يتوقّف.
> أكاديمية ليبرو الرياضية…
> هنا تبدأ رحلة الأبطال.

## Source layout (`src/`)

- `film.html` — the whole film: scenes, layout for both aspect ratios (`?format=wide|tall`), and a
  small deterministic animation engine (`renderFrame(n)` draws frame *n*; no real-time playback
  involved). Open `film.html?play=1` (or `?format=tall&play=1&from=40`) from a local web server
  rooted at the repo to preview.
- `prepare.sh` — extracts the training shots into `src/frames/` (ignored by git, ~140 MB).
- `render.py` — headless-Chromium frame renderer (Playwright), parallel workers.
- `audio.py` — builds `out/soundtrack.wav`: music + narration + synthesized whooshes/impacts.
- `build.sh` — runs everything and encodes all deliverables with FFmpeg.
- `assets/` — the logo re-mastered at 4× from `logo-lipro.png`, split into layers for animation.
- `fonts/` — Changa and IBM Plex Sans Arabic (the website's fonts, SIL Open Font License).

## Rebuilding

Requirements: `ffmpeg`, Python 3 with `playwright`, `numpy`, `scipy`, `pillow`, and a Chromium for
Playwright (`CHROME_PATH=/path/to/chrome` if it is not the Playwright default).

```bash
cd film/src
./build.sh /some/scratch/dir     # ~30–40 min on 4 cores; frame dumps need ~4 GB
```

### Audio: narration and music

`audio.py` uses these files when they exist, and falls back gracefully when they do not:

- `src/audio/vo.mp3` (or `.wav`) — one take of the narration above. It is split at its pauses into
  the seven phrases, each placed on its picture cue (`VO_CUES` in `audio.py`); the music ducks under it.
- `src/audio/music.mp3` (or `.wav`) — a licensed/royalty-free track of at least 77 s.

Without them the soundtrack is an original score synthesized by `audio.py` itself (no third-party
audio, so no licensing concerns) and the film has no spoken narration — the on-screen typography
carries the script. After adding either file, re-run `python3 audio.py` and the encode steps at the
bottom of `build.sh` (the picture frames do not need re-rendering).

To change timing or wording, edit the `data-t0 / data-t1 / data-at` attributes in `film.html`;
all times are in seconds.
