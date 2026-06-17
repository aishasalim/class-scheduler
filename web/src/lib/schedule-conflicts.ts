import { courseCode, parseScheduleTime, type ClientScheduleRow } from "@/lib/schedule-types";
import { toMinutes } from "@/lib/zlpCore";
import type { ScheduleRowInput } from "@/lib/zlpCore";

const DAY_NAMES: Record<string, string> = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

export type CalendarBlockRef = {
  key: string;
  day: string;
  course: string;
  label: string;
  startMin: number;
  endMin: number;
};

export type ScheduleConflict = {
  day: string;
  dayName: string;
  start: string;
  end: string;
  courses: string[];
  blockKeys: string[];
};

function blockKey(course: string, day: string, start: string, part: "main" | "lab"): string {
  return `${course}|${day}|${parseScheduleTime(start)}|${part}`;
}

function labFields(row: ClientScheduleRow | ScheduleRowInput) {
  const r = row as ClientScheduleRow & ScheduleRowInput;
  const lab = r.lab;
  const labDays = r.lab_days ?? r.labDays;
  const labStart = r.lab_start ?? r.labStart;
  const labDuration = r.lab_duration ?? r.labDuration;
  if (lab !== "Y" || !labDays || !labStart || labDuration == null) return null;
  return { labDays, labStart, labDuration: Number(labDuration) };
}

export function expandScheduleToBlocks(rows: ClientScheduleRow[] | ScheduleRowInput[]): CalendarBlockRef[] {
  const out: CalendarBlockRef[] = [];

  for (const row of rows) {
    const course = courseCode(row);
    const start = parseScheduleTime(row.start);
    const startMin = toMinutes(start);
    const endMin = startMin + Number(row.duration);

    for (const day of row.days) {
      out.push({
        key: blockKey(course, day, start, "main"),
        day,
        course,
        label: course,
        startMin,
        endMin,
      });
    }

    const lab = labFields(row);
    if (lab) {
      const labStart = parseScheduleTime(lab.labStart);
      const labStartMin = toMinutes(labStart);
      const labEndMin = labStartMin + lab.labDuration;
      for (const day of lab.labDays) {
        out.push({
          key: blockKey(course, day, labStart, "lab"),
          day,
          course,
          label: `${course} (lab)`,
          startMin: labStartMin,
          endMin: labEndMin,
        });
      }
    }
  }

  return out;
}

function timeRangesOverlap(a: CalendarBlockRef, b: CalendarBlockRef): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function findScheduleConflicts(rows: ClientScheduleRow[] | ScheduleRowInput[]): ScheduleConflict[] {
  const blocks = expandScheduleToBlocks(rows);
  const seen = new Set<string>();
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.day !== b.day || !timeRangesOverlap(a, b)) continue;

      const pairKey = [a.key, b.key].sort().join("::");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const overlapStart = Math.max(a.startMin, b.startMin);
      const overlapEnd = Math.min(a.endMin, b.endMin);
      conflicts.push({
        day: a.day,
        dayName: DAY_NAMES[a.day] ?? a.day,
        start: `${Math.floor(overlapStart / 60).toString().padStart(2, "0")}:${(overlapStart % 60).toString().padStart(2, "0")}`,
        end: `${Math.floor(overlapEnd / 60).toString().padStart(2, "0")}:${(overlapEnd % 60).toString().padStart(2, "0")}`,
        courses: [...new Set([a.course, b.course])].sort(),
        blockKeys: [a.key, b.key],
      });
    }
  }

  return conflicts;
}

export function conflictBlockKeySet(conflicts: ScheduleConflict[]): Set<string> {
  const keys = new Set<string>();
  for (const c of conflicts) {
    for (const key of c.blockKeys) keys.add(key);
  }
  return keys;
}

export function formatScheduleConflictError(conflicts: ScheduleConflict[]): string {
  if (conflicts.length === 0) return "";
  const lines = conflicts.slice(0, 3).map(
    (c) => `${c.dayName} ${c.start}–${c.end}: ${c.courses.join(" vs ")}`
  );
  const suffix =
    conflicts.length > 3 ? ` (+${conflicts.length - 3} more)` : "";
  return `Impossible schedule — Aggie Schedule Builder does not allow overlapping classes. ${lines.join("; ")}${suffix}`;
}

/** For vision retry: tell the model which overlaps prove a misread. */
export function formatConflictsForRetry(conflicts: ScheduleConflict[]): string {
  return conflicts
    .map(
      (c, i) =>
        `${i + 1}. ${c.dayName} ${c.start}–${c.end}: ${c.courses.join(" overlaps with ")}`
    )
    .join("\n");
}
