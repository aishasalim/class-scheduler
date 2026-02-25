# ZLP Scheduler — Web App

Full cohort web app: sign in by name, upload schedule screenshots (extracted via TAMU/OpenAI API), see who has the same classes, and get best 100-minute ZLP meeting times.

**Stack:** Next.js (App Router) + **Turso** (SQLite) + REST API. No WebSockets — works on locked-down networks (e.g. campus).

## Setup

1. **Install and run**

   ```bash
   cd web
   npm install
   npm run dev
   ```

2. **Database (choose one)**

   - **Local SQLite (default):** No env needed. The app uses a file at `web/.data/zlp.db` (created on first request).
   - **Turso (optional):** Create a DB at [turso.tech](https://turso.tech), then in `.env.local`:
     ```env
     TURSO_DATABASE_URL=libsql://your-db-name-your-username.turso.io
     TURSO_AUTH_TOKEN=your-token
     ```

3. **Seed participants (one-time)**

   Open [http://localhost:3000/login](http://localhost:3000/login). If the list is empty, click **Seed participants** to load the 32 cohort members.

4. **Schedule extraction (optional)**

   Add to `.env.local` for “Upload schedule screenshot”:
   ```env
   OPENAI_API_KEY=your-openai-or-tamu-api-key
   ```

## Env summary

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | No | Turso DB URL. Omit to use local SQLite (`.data/zlp.db`). |
| `TURSO_AUTH_TOKEN` | If using Turso | Turso auth token. |
| `OPENAI_API_KEY` | For upload | TAMU or OpenAI API key for image extraction. |

## API routes

- `GET /api/init` — Create tables (idempotent).
- `GET /api/participants` — List participants.
- `POST /api/seed` — Seed 32 participants (one-time).
- `GET /api/schedule?participantId=...` — Get schedule for participant.
- `POST /api/schedule` — Save schedule (body: `{ participantId, rows }`).
- `GET /api/cohort/courses` — Courses with participant names.
- `POST /api/actions/extract-schedule` — Extract schedule from image (FormData `image`).
- `GET /api/meeting-times` — Best 100-minute meeting times (ZLP logic).

## Features

- **Login:** Select or type name (from 32 participants); stored in `localStorage`.
- **Dashboard:** Upload a schedule screenshot → AI extracts courses → saved to DB; links to cohort and meeting times.
- **Who has same classes:** Lists each course and which cohort members have it.
- **Best meeting times:** ZLP 100-minute logic over all cohort schedules (score = unavoidable conflicts).
