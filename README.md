# Shukr — source backup

This repository is the source-code backup of the Shukr PWA (live at https://shukr-1467.roarai.app).
It is **not** a website — the app is served by Roar AI, not GitHub Pages.

## What is here
- `server.js`, `lib/` — Express + PGlite server and feature plug-ins
- `public/` — the web app (JS, CSS, data files, icons, videos)
- `scripts/`, `tests/`, `build.sh`

## What is NOT here
- Secrets (`.env*`) — re-enter them in Roar → Environment after a restore
- User data (accounts, posts, progress) — stored in the app's private S3 bucket

## Restore
1. `npm install && bash build.sh`
2. Deploy to Roar AI (deploy from this GitHub repo, or upload the folder).
3. Add storage to the app (S3 bucket) and set the environment variables.
4. Point your domain at the new app.
