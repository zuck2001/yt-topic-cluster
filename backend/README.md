# Backend (NestJS + SQLite)

API for ingesting YouTube channels, storing videos, clustering by topic, and exposing grouped results.

## Requirements
- Node.js (LTS recommended)
- npm

## Setup
```bash
cd backend
npm install
```

## Run
```bash
npm run start:dev   # default port 4000
```
Environment:
- `PORT` (optional): override listening port (default `4000`).

Database:
- SQLite file at `backend/yt-topic-cluster.db` (auto-created). Delete it to reset data.

## API
All routes are prefixed with `/api`.

- `POST /api/videos/ingest`
  - Body (JSON): `{"urls":["<channelUrl1>","<channelUrl2>","<channelUrl3>"]}` (exactly 3 channel URLs; use `/@handle`, `/channel/<id>`, `/c/<name>`, or `/user/<name>`).
  - Behavior: resolves channel IDs, fetches feeds, upserts videos, clusters topics (keyword overlap), infers per-channel themes, returns grouped videos.
  - Success 200: array of groups
    ```json
    [
      {
        "label": "some topic",
        "videos": [
          {
            "id": 1,
            "videoId": "abc123",
            "title": "Example title",
            "description": "...",
            "createdAt": "2025-01-01T00:00:00.000Z",
            "publishedAt": "2025-01-01T00:00:00.000Z",
            "topicLabel": "some topic",
            "channelId": 1
          }
        ],
        "channels": [
          {
            "id": 1,
            "url": "https://www.youtube.com/@example",
            "themeSummary": "keyword1, keyword2, keyword3"
          }
        ]
      }
    ]
    ```
  - Errors: 400 if URLs invalid/unresolvable or feed fetch fails.

- `GET /api/videos/groups`
  - No body.
  - Returns current grouped videos with contributing channels and themes (same shape as above).

## Notes
- Topic grouping uses simple keyword overlap (threshold 3); singletons become `No Match`.
- Channel themes are top keywords across that channel’s titles/descriptions.
- Ingest expects channel URLs, not individual video links.
