# Frontend (Next.js)

Simple UI to submit 3 YouTube channel URLs, trigger backend ingest/grouping, and display grouped videos plus channel themes.

## Requirements
- Node.js (LTS recommended)
- npm

## Setup
```bash
cd frontend
npm install
```

## Run
```bash
set NEXT_PUBLIC_API_BASE=http://localhost:4000/api  # PowerShell example
set PORT=3001                                       # optional, avoid backend port
npm run dev
```
(Use your shell’s syntax for env vars.)

## Build/Start
```bash
npm run build
npm start
```

## Usage
1) Ensure backend is running (default `http://localhost:4000/api`).
2) Open the app (default `http://localhost:3001`).
3) Paste exactly 3 channel URLs (handles like `https://www.youtube.com/@handle` work best).
4) Click **Ingest & Group** to fetch, cluster, and display results.
5) Use **Refresh Saved Groups** to reload existing DB data.

## Features
- Form for 3 channel URLs with validation messaging.
- Calls backend ingest (`POST /videos/ingest`) and groups (`GET /videos/groups`).
- Displays topic groups, videos, and contributing channel themes.
- Shows backend base URL badge for quick verification.
