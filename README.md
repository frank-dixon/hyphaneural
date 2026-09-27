# Hyphaneural

See the strand, not the spreadsheet.

Quiet Protomol prototype: an interactive fungal organism map where hyphal threads **expand as you pan and zoom** — genetics as living structure, not a paper dump or cultivation guide.

## Stack

- **Django** — session auth, thin JSON API (`/api/organisms/`, gene stub)
- **Vanilla canvas + CSS** — tiny frontend (no React); Quiet Protomol tokens (Tailwind-shaped config in `tailwind.config.js`, runtime stylesheet `static/css/hyphaneural.css`)

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

Open http://127.0.0.1:8000/ — sign up or log in, then explore the map.

Optional admin: http://127.0.0.1:8000/admin/

No frontend build step is required for the prototype. Tokens live in `tailwind.config.js` for future Tailwind CLI use; the shipped UI reads `static/css/hyphaneural.css`.

## What works (v0)

| Feature | Status |
|--------|--------|
| Login / logout / signup | Working |
| Full-viewport pan + zoom map | Working |
| Expanding hyphal network (procedural nodes/threads at edges) | Working |
| ~12 seeded organisms (yeast, oyster, public-genome Psilocybe annotation, …) | Working |
| Chamber panel + gene chips | Working |
| Follow a gene → DNA→RNA→protein stepped glow | Stub API + animation |
| Compare two organisms (shared-gene highlight) | Working |
| `GET /api/organisms/` | Working (DB JSON) |
| Live NCBI fetch | Stubbed — mock-first; structure ready |

## Anti-goals

Not a paper dump. Not a cultivation guide. Public-genome entries note annotation-only framing.

## Deploy

Do **not** enable GitHub Pages or any public deploy until Frank explicitly asks.
