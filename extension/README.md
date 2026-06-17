# ZLP Schedule Importer (browser extension)

A Manifest V3 Chrome extension that imports a TAMU **Aggie Schedule Builder**
class schedule into the **ZLP Scheduler** app. Students set their identity once,
import from the schedule page, then toggle **movable / unmovable** per class.

```
extension/
├── manifest.json   # MV3: content script + popup, host permissions
├── config.js       # ⭐ endpoint URL + site selectors (edit for production)
├── content.js      # layered extraction (embedded JSON → DOM scrape)
├── popup.html      # setup, import, priority toggles
├── popup.js        # identity → extract → POST → save priorities
└── mock/
    └── aggie-schedule-builder.html   # local demo page
```

## Student setup (one time)

1. **Facilitator** creates the cohort in the web app and sets an **import password**
   (landing page “Add cohort” or cohort login page → “Extension import password”).
2. **Install the extension** (see below).
3. Click the extension icon and enter:
   - **Full name** (must match how you appear in the cohort roster)
   - **Cohort code** (e.g. `K`, `J`)
   - **Cohort password** (from your facilitator)
4. Open **Aggie Schedule Builder** (or the bundled mock page for testing).
5. Click **Import my schedule**.
6. After import, use **Movable / Unmovable** toggles per class. Each toggle
   re-saves your schedule to the app.

Use **Settings** in the popup anytime to edit name, cohort, or password.

## Demo: end-to-end in ~2 minutes

### 1. Run the web app

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

### 2. Set a cohort password

- Open http://localhost:3000 → pick cohort **K** (or create one).
- On the cohort login page, set **Extension import password** (e.g. `demo123`).

### 3. Load the extension (unpacked) in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. For the mock page on disk: **Details** → enable **Allow access to file URLs**.

### 4. Configure & import

1. Extension popup → enter your name, cohort `K`, password `demo123` → **Save**.
2. Open `extension/mock/aggie-schedule-builder.html` in Chrome.
3. **Import my schedule** → you should see saved classes and priority toggles.
4. In the web app, open the cohort workspace — your schedule should appear under your name.

### Verify with curl (no browser)

```bash
# Set password first via PATCH /api/cohorts or the facilitator UI, then:
curl -s -X POST http://localhost:3000/api/actions/import \
  -H 'Content-Type: application/json' \
  -d '{
    "cohortId":"K",
    "fullName":"Test Student",
    "password":"demo123",
    "meetings":[{"subject":"CSCE","number":"313","days":"TR","start":"12:45","end":"14:00","duration":75,"meetingType":"lecture"}]
  }'
```

## Architecture

```
Aggie Schedule Builder page
        │ content.js extracts meetings[]
        ▼
   popup.js POST /api/actions/import
        │ { meetings, cohortId, fullName, password, priorities? }
        ▼
   validate cohort password → find/create participant → normalize rows
        → apply priorities → conflict check → save schedule_rows
        ▼
   Facilitator web app (cohort workspace, meeting times, shared sections)
```

- **One POST** from the extension handles auth, participant upsert, normalization,
  priority, and DB save.
- **CORS** is enabled on the import endpoint for cross-origin extension calls.
- **GET /api/cohorts** never returns passwords; facilitators set them via POST/PATCH.

## Adapting to the real Aggie Schedule Builder

Edit **`config.js`** only:

1. Set `IMPORT_ENDPOINT` to your production URL.
2. Add `JSON_SOURCES` and implement `mapJsonSections()` in `content.js` (preferred).
3. Or update `SELECTORS` for DOM scraping fallback.

## Data contract

```jsonc
{
  "cohortId": "K",
  "fullName": "Jane Doe",
  "password": "cohort-secret",
  "priorities": { "CSCE 313": "unmovable", "MATH 251": "movable" },
  "meetings": [
    { "subject": "CSCE", "number": "313", "days": "TR", "start": "12:45", "end": "14:00", "duration": 75, "meetingType": "lecture" }
  ]
}
```

Response on success: `{ ok: true, participantId, rows, saved, courses, conflicts: [] }`.

Wrong password → HTTP 401. Schedule conflicts → HTTP 400 with `warning` and `conflicts`.
