import { db } from "@/lib/db";
import { snapLabDuration, snapMeetingDuration } from "@/lib/tamu-schedule-blocks";
import type { ClassPriority } from "@/lib/schedule-types";
import type { ScheduleRowInput } from "@/lib/zlpCore";

export type SchedulePayloadRow = {
  subject: string;
  number: string;
  days: string;
  start: string;
  duration: number;
  lab?: string;
  labDays?: string;
  labStart?: string;
  labDuration?: number;
  priority?: ClassPriority;
};

function sqlPriority(value: unknown): "movable" | "unmovable" {
  return sqlText(value).toLowerCase() === "unmovable" ? "unmovable" : "movable";
}

function sqlText(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value).trim();
}

function sqlOptionalText(value: unknown): string | null {
  const text = sqlText(value);
  return text ? text : null;
}

function sqlDuration(value: unknown, days: string): number {
  const n = Number(value);
  const raw = Number.isFinite(n) ? Math.round(n) : 50;
  return snapMeetingDuration(raw, days, raw >= 100);
}

function rowInsertArgs(participantId: string, r: SchedulePayloadRow): (string | number | null)[] {
  const days = sqlText(r.days);
  return [
    participantId,
    sqlText(r.subject),
    sqlText(r.number),
    days,
    sqlText(r.start),
    sqlDuration(r.duration, days),
    sqlOptionalText(r.lab),
    sqlOptionalText(r.labDays),
    sqlOptionalText(r.labStart),
    r.labDuration == null ? null : snapLabDuration(Number(r.labDuration) || 120),
    sqlPriority(r.priority),
  ];
}

export function scheduleInputToPayload(row: ScheduleRowInput): SchedulePayloadRow {
  return {
    subject: row.subject,
    number: row.number,
    days: row.days,
    start: row.start,
    duration: row.duration,
    lab: row.lab || undefined,
    labDays: row.labDays || undefined,
    labStart: row.labStart || undefined,
    labDuration: row.labDuration ?? undefined,
    priority: row.priority ?? "movable",
  };
}

export function applyCoursePriorities(
  rows: ScheduleRowInput[],
  priorities?: Record<string, "movable" | "unmovable">
): ScheduleRowInput[] {
  if (!priorities || Object.keys(priorities).length === 0) {
    return rows.map((r) => ({ ...r, priority: r.priority ?? "movable" }));
  }
  return rows.map((r) => {
    const code = `${r.subject} ${r.number}`.trim();
    const key = Object.keys(priorities).find((k) => k.toUpperCase() === code.toUpperCase());
    const p = key ? priorities[key] : undefined;
    return { ...r, priority: p === "unmovable" ? "unmovable" : "movable" };
  });
}

/** Replace all schedule rows for a participant. Skips incomplete rows. */
export async function saveScheduleRows(
  participantId: string,
  rows: SchedulePayloadRow[]
): Promise<number> {
  await db.execute("DELETE FROM schedule_rows WHERE participant_id = ?", [participantId]);
  let saved = 0;
  for (const r of rows) {
    if (!sqlText(r.subject) || !sqlText(r.number) || !sqlText(r.days) || !sqlText(r.start)) {
      continue;
    }
    await db.execute({
      sql: "INSERT INTO schedule_rows (participant_id, subject, number, days, start, duration, lab, lab_days, lab_start, lab_duration, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: rowInsertArgs(participantId, r),
    });
    saved += 1;
  }
  return saved;
}
