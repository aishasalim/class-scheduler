import { createClient } from "@libsql/client";
import path from "path";

const url = process.env.TURSO_DATABASE_URL ?? `file:${path.join(process.cwd(), ".data", "zlp.db")}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url,
  authToken: authToken || undefined,
});

let initPromise: Promise<void> | null = null;

export async function ensureDb(): Promise<void> {
  if (!initPromise) initPromise = initDb();
  await initPromise;
}

export async function initDb(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cohorts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      semester TEXT NOT NULL,
      current_semester TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try {
    await db.execute(`ALTER TABLE cohorts ADD COLUMN current_semester TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* column already exists */
  }
  try {
    await db.execute(`ALTER TABLE cohorts ADD COLUMN password TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* column already exists */
  }
  // Ensure the built-in Cohort K always exists.
  await db.execute({
    sql: "INSERT OR IGNORE INTO cohorts (id, name, semester) VALUES (?, ?, ?)",
    args: ["K", "Cohort K", "Fall 2026"],
  });
  // One-time correction for DBs seeded before the Fall 2026 default.
  await db.execute(
    "UPDATE cohorts SET semester = 'Fall 2026' WHERE id = 'K' AND semester = 'Spring 2026'"
  );
  // Default Cohort K's current semester to Fall 2026 if unset.
  await db.execute(
    "UPDATE cohorts SET current_semester = 'Fall 2026' WHERE id = 'K' AND current_semester = ''"
  );
  await db.execute(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      cohort_id TEXT NOT NULL DEFAULT 'K',
      name TEXT NOT NULL,
      major TEXT NOT NULL,
      gender TEXT NOT NULL,
      birthday TEXT NOT NULL,
      phone TEXT NOT NULL
    )
  `);
  try {
    await db.execute(`ALTER TABLE participants ADD COLUMN cohort_id TEXT NOT NULL DEFAULT 'K'`);
  } catch {
    /* column already exists */
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schedule_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      number TEXT NOT NULL,
      days TEXT NOT NULL,
      start TEXT NOT NULL,
      duration INTEGER NOT NULL,
      lab TEXT,
      lab_days TEXT,
      lab_start TEXT,
      lab_duration INTEGER,
      priority TEXT NOT NULL DEFAULT 'movable',
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )
  `);
  try {
    await db.execute(`ALTER TABLE schedule_rows ADD COLUMN priority TEXT NOT NULL DEFAULT 'movable'`);
  } catch {
    /* column already exists */
  }
}

export type Participant = {
  id: string;
  cohort_id: string;
  name: string;
  major: string;
  gender: string;
  birthday: string;
  phone: string;
};

export type ScheduleRow = {
  id: number;
  participant_id: string;
  subject: string;
  number: string;
  days: string;
  start: string;
  duration: number;
  lab?: string | null;
  lab_days?: string | null;
  lab_start?: string | null;
  lab_duration?: number | null;
  priority: string;
};
