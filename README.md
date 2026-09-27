# Hyphaneural

See the strand, not the spreadsheet.

Quiet Protomol: a fungal genetics demo where you land **inside baker's yeast**, follow a gene DNA → mRNA → protein, and compare conserved families across organisms — genetics as living hyphae, not a paper dump or cultivation guide.

## Live demo

**No login.** Open the static chamber on GitHub Pages:

**https://frank-dixon.github.io/hyphaneural/**

Start here → follow **SUC2** (invertase) → watch the recipe become the enzyme. Compare ACT1 across yeasts. Seed data is embedded (Django is not required for the demo).

## Stack

- **Django** — session auth, thin JSON API (`/api/organisms/`, gene stub) for the full local app
- **Vanilla canvas + CSS** — Quiet Protomol tokens; Pages demo under `docs/`
- **GitHub Pages** — self-contained static demo from `/docs` on `main`

## Run locally

```bash
cd hyphaneural
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_organisms
python manage.py createsuperuser   # or use /signup/
python manage.py runserver
```

Open http://127.0.0.1:8000/ — sign up or log in, then explore.

Static Pages demo (no server): open `docs/index.html` via any static file server, or use the live URL above.

## What works

| Feature | Status |
|--------|--------|
| Pages chamber inside baker's yeast | Working |
| Gene follow DNA→mRNA→protein (SUC2, ACT1, HO, TEF1) | Working |
| Guided “Start here” tour (~60s) | Working |
| Compare dual-strand (shared teal / divergent ember) | Working |
| Login / Django map app | Working (local) |
| Live NCBI fetch | Stubbed — mock-first |

## Anti-goals

Not a paper dump. Not a cultivation guide. Sequences labeled mock / simplified where abbreviated.

## Deploy

- **Public demo:** GitHub Pages from `/docs` on `main` → https://frank-dixon.github.io/hyphaneural/
- Full Django app stays local / your own host; Pages cannot run Django.
