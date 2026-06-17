# ZLP Scheduler

Scheduling tool for **Zachry Leadership Program (ZLP)** cohorts at Texas A&M. Students share their class schedules; the app finds the best **100‑minute weekly window** when the whole cohort can meet — and shows which classmates would have to re‑register (movable classes) vs. which windows are blocked by protected classes (unmovable).

The system has two surfaces:

| Surface | Who | What |
| --- | --- | --- |
| 🖥️ **Web app** (`web/`) | Facilitators **and** students | Cohort login, add/edit schedule, shared sections, best meeting windows, cohort pulse |
| 🧩 **Browser extension** (`extension/`) | Students | One‑click import of a TAMU **Aggie Schedule Builder** schedule into the web app |

---

## Repository layout

```
ZLP-Scheduler/
├── web/                       # Next.js 16 app (App Router) — the main app
│   ├── src/app/               # pages + API routes
│   │   ├── page.tsx           # landing: pick / create a cohort
│   │   ├── c/[cohort]/        # cohort workspace + login
│   │   └── api/               # REST endpoints (see API reference)
│   ├── src/lib/               # core logic (DB, scheduling algorithm, parsers)
│   └── src/components/        # UI (shadcn/ui + workspace shell, week grid)
├── extension/                 # Manifest V3 browser extension (see extension/README.md)
│   ├── manifest.json
│   ├── config.js              # ⭐ endpoint URL + Aggie Schedule Builder selectors
│   ├── content.js             # schedule extraction
│   ├── popup.js / popup.html  # identity + import UI
│   └── mock/                  # offline demo schedule page
└── README.md
```

---

## Quick start (web app)

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3000** → choose **Cohort K** → pick your name from the roster.

Build for production:

```bash
npm run build && npm start
```

### Environment

Schedules persist to **SQLite** by default — a local file at `web/.data/zlp.db`, created automatically. To use a hosted **Turso** database instead, set these in `web/.env.local`:

```bash
# web/.env.local — optional; omit entirely to use the local SQLite file
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...
```

The schema is created/migrated on first request (`ensureDb()`), and **Cohort K is seeded automatically**. No manual migration step.

---

## How it works — the 100‑minute window

The scheduling logic lives in `web/src/lib/zlpCore.ts` (ported from the original `zlp_scheduler.py`).

- Time is measured in minutes from midnight. The search grid runs **08:00–16:10**, sliding a **100‑minute** block in **5‑minute** steps across each weekday (M–F).
- For every candidate block on every day, the app scores how many cohort members have a class overlapping it.
- Each class a student adds is tagged **movable** or **unmovable**:
  - **Unmovable** 🔒 — a protected class. A cohort window must *never* overlap it; any window that does is disqualified for that student.
  - **Movable** 🔓 — the student could re‑register elsewhere. A window may overlap it, counted as a "would re‑register" cost.
- Windows are ranked: zero overlaps ("everyone free") first, then fewest re‑registers, with windows that block unmovable classes pushed down. The API returns the ranked ranges per day, with the names behind each count.

---

## Web app surfaces

### Landing — `/`
Lists cohorts and lets anyone **add a cohort** (code + name + semester). A footer link leads to **admin login**.

### Cohort login — `/c/[cohort]/login`
Roster search — a student picks their name to enter the workspace. (Cohort K ships with a 31‑student roster.)

### Admin — `/admin`
Single hardcoded admin (**username `Sullivan`**, **password `adminpassword`**), checked server‑side; a successful login sets an httpOnly cookie that gates the admin API routes. The admin can **add/delete cohorts**, **rename/delete members**, and view each cohort's **best meeting times** in a week outline. Each cohort shows its derived import password (read‑only) to share with students.

### Cohort workspace — `/c/[cohort]`
- **My schedule** — add classes by **pasting** your Aggie *Current Schedule* text (exact, no AI), or **add manually**. Toggle each class **movable / unmovable**.
- **Your week** — a week grid of your classes plus the **best cohort meeting windows** below it.
- **Shared sections** — classes you share with classmates (same subject + number); join or leave a section in one click.
- **Cohort pulse** — live "N/total schedules in" and the current best window.

> **Importing your schedule:** open **Current Schedule** in Aggie Schedule Builder, copy the course rows (the part with CRNs, days, and times), and paste into *My schedule*. A deterministic parser reads exact times — no screenshots, no AI guessing.

---

## API reference

All routes live under `web/src/app/api`. Cohort is passed as `?cohort=K` (some accept `?cohortId=K`).

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/cohorts` | List cohorts (id, name, semesters, participant count). |
| `POST` | `/api/cohorts` | Create a cohort (`{ id, name, semester }`). |
| `PATCH` | `/api/cohorts` | Update a cohort's `semesters` / `currentSemester`. |
| `DELETE` | `/api/cohorts?id=K` | **Admin** — delete a cohort + its members and schedules. |
| `GET` | `/api/participants?cohort=K` | Cohort roster. |
| `POST` | `/api/participants` | Add a participant. |
| `PATCH` | `/api/participants` | **Admin** — rename a participant (`{ id, name }`). |
| `DELETE` | `/api/participants?id=…` | **Admin** — delete a participant + their schedule. |
| `GET` | `/api/schedule?participantId=…` | A participant's schedule rows. |
| `POST` | `/api/schedule` | Save a participant's schedule rows. |
| `GET` | `/api/schedule/all?cohort=K` | All schedules in a cohort. |
| `GET` | `/api/cohort/courses?cohort=K` | Shared sections (who's in what). |
| `GET` | `/api/cohort/stats?cohort=K` | `{ total, submitted }`. |
| `GET` | `/api/meeting-times?cohort=K` | Ranked best 100‑min windows per day. |
| `POST` | `/api/actions/parse-schedule-text` | Parse pasted Aggie *Current Schedule* text into normalized rows. |
| `POST` / `OPTIONS` | `/api/actions/import` | Extension entry point — auth + upsert + normalize + conflict‑check + save (CORS‑enabled). |
| `POST` | `/api/admin/login` · `/api/admin/logout` | Admin sign in/out (sets/clears an httpOnly cookie). |
| `GET` | `/api/admin/session` | `{ admin: boolean }` for the current request. |
| `GET` | `/api/init` · `POST` `/api/seed` · `POST` `/api/reset` | DB init / seed roster / reset (admin/dev). |

Admin‑only routes require the `zlp_admin` cookie set by `POST /api/admin/login`; without it they return **401**.

### Extension import contract — `POST /api/actions/import`

```jsonc
{
  "cohortId": "K",
  "fullName": "Jane Doe",
  "password": "cohort-k-superpassword",
  "priorities": { "CSCE 313": "unmovable", "MATH 251": "movable" },
  "meetings": [
    { "subject": "CSCE", "number": "313", "days": "TR", "start": "12:45", "end": "14:00", "duration": 75, "meetingType": "lecture" }
  ]
}
```

Success → `{ ok: true, participantId, rows, saved, courses, conflicts: [] }` · wrong password → **401** · schedule conflicts → **400** with `warning` + `conflicts`.

---

## Data model

SQLite/Turso, three tables (auto‑created and migrated in `web/src/lib/db.ts`):

- **`cohorts`** — `id` (PK, e.g. `K`), `name`, `semester` (JSON array), `current_semester`, `created_at`. (The extension import password is **not** stored — it's derived from the code as `cohort-<code>-superpassword`.)
- **`participants`** — `id` (PK), `cohort_id`, `name`, `major`, `gender`, `birthday`, `phone`.
- **`schedule_rows`** — `id`, `participant_id` (FK), `subject`, `number`, `days`, `start`, `duration`, optional `lab`/`lab_days`/`lab_start`/`lab_duration`, `priority` (`movable` | `unmovable`).

---

## Student extension

A Manifest V3 extension that imports a schedule straight from **Aggie Schedule Builder** into the web app. Full setup, demo, and "adapting to the real site" notes are in **[`extension/README.md`](extension/README.md)**.

**Student flow:** student installs the extension, enters their name + cohort code + the cohort **import password** (`cohort-<code>-superpassword`, e.g. `cohort-k-superpassword`) → opens Aggie Schedule Builder → **Import my schedule** → toggles movable/unmovable per class.

### Run in dev — Chrome (fastest)
1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. For the bundled mock page on disk: **Details** → enable **Allow access to file URLs**.

### Run in dev — Safari
Safari needs the extension wrapped as a native **Safari Web Extension**, which requires **full Xcode** (the Command Line Tools alone are not enough):

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcrun safari-web-extension-converter extension/   # generates an Xcode project
```

Open the generated project, **Build & Run**, then in Safari: **Settings → Advanced → Show features for web developers**, **Develop → Allow Unsigned Extensions** (resets each launch), and enable the extension under **Settings → Extensions**.

> The extension is identical across browsers — for day‑to‑day development, Chrome's "Load unpacked" is the lowest‑friction loop.

---

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 + shadcn/ui · SQLite / Turso via `@libsql/client` · Manifest V3 browser extension.
