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
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      major TEXT NOT NULL,
      gender TEXT NOT NULL,
      birthday TEXT NOT NULL,
      phone TEXT NOT NULL
    )
  `);
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
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    )
  `);
}

export type Participant = {
  id: string;
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
};
