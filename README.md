# Hyphaneural

See the strand, not the spreadsheet.

Quiet Protomol / Slow Ombre: a fungal genetics demo where four immersive **spaces** share one pulsed purple–blue–green shell — Hex Reach, Strand Zoom, Fungal Atlas, Void Breath. Land inside baker’s yeast, follow a gene DNA → mRNA → protein, compare conserved families, and open a Genome panel for multi-organism linear tracks.

## Live demo

**No login.** Open the static chamber on GitHub Pages:

**https://frank-dixon.github.io/hyphaneural/**

**Start here** → opens **Strand Zoom** on **SUC2** (invertase). Swipe / drag horizontally (or use the dial ticks / ← →) to enter another space. Seed data is static JSON under `docs/data/` (Django is not required for the demo).

## Spaces

| Space | Feel |
|-------|------|
| **Hex Reach** | Hex lattice + hyphal genetics · observe / connect · Genome panel secondary |
| **Strand Zoom** | Camera zoom field → lattice → strand · DNA→mRNA→protein teaching |
| **Fungal Atlas** | Immersive atlas of ~36 fungi (mushrooms, yeasts, molds, pathogens) |
| **Void Breath** | Living field-dominant calm · growing hyphae across the void |

Main shell: Slow Ombre purple–blue–green pulse, sparse white accents, SNES-style parallax while panning. HTML chrome is **Tailwind utility classes**; canvas stays JS.

## Stack

- **Tailwind CSS 3** — `npm run build:css` → committed `docs/css/hyphaneural.css` (+ copy to `static/css/` for Django). Pages needs no Node at runtime.
- **Django** — session auth, thin JSON API for the full local app
- **Vanilla canvas + CSS** — Slow Ombre shell; Pages demo under `docs/`
- **GitHub Pages** — self-contained static demo from `/docs` on `main`

## CSS build

```bash
npm install
npm run build:css   # writes docs/css/hyphaneural.css + static/css/hyphaneural.css
```

Source tokens / minimal custom: `src/input.css` + `tailwind.config.js`. Prefer utilities in HTML; keep `@layer` custom only for ombre gradients, dial track, and JS-toggled states.

## Run locally

```bash
cd hyphaneural
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_organisms
python manage.py createsuperuser
python manage.py runserver
```

Static Pages demo: `cd docs && python3 -m http.server 8765` → http://127.0.0.1:8765/

## Anti-goals

Not a paper dump. Not a cultivation guide. Sequences labeled mock / simplified where abbreviated. Fungi only.

## Deploy

- **Public demo:** GitHub Pages from `/docs` on `main` → https://frank-dixon.github.io/hyphaneural/
- Mood boards under `docs/moodboards/` are local visual reference only (gitignored).
