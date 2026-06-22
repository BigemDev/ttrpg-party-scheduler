# Self-hosted party scheduler

Campaign-based weekly availability scheduler for your TTRPG group (or any group). Password-gated, no accounts, no external services. Data lives in a single JSON file on disk.

## Features
- **Password login** — one shared password keeps random visitors out, sessions last 30 days
- **Campaigns menu** — manage multiple campaigns (D&D group, board game night, etc.)
- **Roster** — players pick their name from the campaign's list, no free-text entry
- **Calendar week picker** — you pick which week is active, it highlights for everyone
- **Click-drag grid** — mark availability across a real calendar week (Mon–Sun with dates)
- **Notes** — each player can leave a short note with their availability
- **Group overlap view** — heatmap showing when the most people are free, hover to see who, click a name to spotlight just them

## Running it

**Quick start (no Docker):**
```bash
npm install
APP_PASSWORD=yourpassword node server.js
# open http://localhost:3000
```

**With Docker:**
```bash
docker build -t scheduler .
docker run -p 3000:3000 -e APP_PASSWORD=yourpassword -v $(pwd)/data:/app/data scheduler
```

## Data backup

Everything is in `data/db.json`. Back that file up and you have everything.
