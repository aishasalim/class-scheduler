import type { ScheduleRowInput } from "@/lib/zlpCore";
import { toMinutes } from "@/lib/zlpCore";
import {
  normalizeDayPattern,
  pickBestCampus,
  snapLabDuration,
  snapMeetingDuration,
  snapToTamuBlock,
  type TamuCampus,
} from "@/lib/tamu-schedule-blocks";

export type RawExtractedMeeting = {
  subject: string;
  number: string;
  days: string;
  start: string;
  /** Exact end time when read from a text list — far more reliable than duration. */
  end?: string;
  duration: number;
  meetingType?: string;
  component?: string;
  linkedCourse?: string;
  lab?: string;
  labDays?: string;
  labStart?: string;
  labDuration?: number;
};

/** Exact duration from a start–end text range, or null when not derivable. */
function durationFromEnd(start: string, end?: string): number | null {
  if (!end) return null;
  const startMin = toMinutes(parseTime(start));
  const endMin = toMinutes(parseTime(end));
  const d = endMin - startMin;
  if (d > 0 && d < 600) return d;
  return null;
}

function parseTime(raw: string): string {
  const t = raw.trim().toUpperCase();
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!ampm) return raw.trim();
  let h = Number(ampm[1]);
  const m = Number(ampm[2]);
  const mer = ampm[3]?.toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function courseKey(subject: string, number: string): string {
  const base = number.replace(/L$/i, "").trim();
  return `${subject} ${base}`.trim();
}

function rowKey(row: Pick<ScheduleRowInput, "subject" | "number" | "days" | "start">): string {
  return `${courseKey(row.subject, row.number)}|${normalizeDayPattern(row.days)}|${row.start}`;
}

function isLabMeeting(item: RawExtractedMeeting): boolean {
  const type = `${item.meetingType ?? ""} ${item.component ?? ""}`.toLowerCase();
  if (type.includes("lab") && !type.includes("lec")) return true;
  const dur = Number(item.duration) || 0;
  if (dur >= 100 && !type.includes("lec")) return true;
  return false;
}

function normalizeMeeting(
  item: RawExtractedMeeting,
  campus: TamuCampus,
  asLab = false,
  snapStart = true
) {
  const subject = item.subject.trim().toUpperCase();
  const number = item.number.trim().replace(/\s+/g, "");
  const days = normalizeDayPattern(item.days);
  const start = parseTime(item.start);
  const exactDuration = durationFromEnd(item.start, item.end);
  const rawDuration = exactDuration ?? (Number(item.duration) || (asLab ? 120 : 50));
  const lab = asLab || isLabMeeting(item);
  // Exact text times (start–end) are authoritative: never snap them to a grid.
  if (exactDuration != null || !snapStart) {
    return {
      subject,
      number: number.replace(/L$/i, ""),
      days,
      start,
      duration: snapMeetingDuration(rawDuration, days, lab),
    };
  }
  const snapped = snapToTamuBlock(days, start, rawDuration, campus);
  return {
    subject,
    number: number.replace(/L$/i, ""),
    days: snapped.days,
    start: snapped.start,
    duration: snapMeetingDuration(rawDuration, snapped.days, lab),
  };
}

function normalizeLabFields(
  labDays: string,
  labStart: string,
  labDuration: number,
  campus: TamuCampus,
  snapStart = true
) {
  const days = normalizeDayPattern(labDays);
  const start = parseTime(labStart);
  const duration = snapLabDuration(Number(labDuration) || 120);
  if (!snapStart) {
    return {
      lab: "Y" as const,
      labDays: days,
      labStart: start,
      labDuration: duration,
    };
  }
  const snapped = snapToTamuBlock(days, start, duration, campus);
  return {
    lab: "Y" as const,
    labDays: snapped.days,
    labStart: snapped.start,
    labDuration: snapLabDuration(snapped.duration),
  };
}

function pushUnique(rows: ScheduleRowInput[], row: ScheduleRowInput) {
  const key = rowKey(row);
  if (rows.some((r) => rowKey(r) === key)) return;
  rows.push(row);
}

/**
 * Turn raw vision JSON into scheduler rows.
 * Keeps every calendar block (courses with MWF + TR meet twice).
 * Merges explicit lab rows onto the matching course when possible.
 */
export type NormalizeOptions = {
  /** When false, keep the model's read times instead of snapping to standard blocks. */
  snapStart?: boolean;
};

export function normalizeExtractedSchedule(
  raw: RawExtractedMeeting[],
  campus: TamuCampus = "auto",
  options: NormalizeOptions = {}
): ScheduleRowInput[] {
  const snapStart = options.snapStart ?? true;
  // A student is on one campus; resolve "auto" to a single grid so two
  // valid classes can't snap onto interleaved East/West overlapping blocks.
  const resolvedCampus: TamuCampus =
    campus === "auto" && snapStart
      ? pickBestCampus(
          raw
            .filter((m) => m.days && m.start)
            .map((m) => ({ days: m.days, start: parseTime(m.start) }))
        )
      : campus;

  const lectureRows: ScheduleRowInput[] = [];
  const labRows: RawExtractedMeeting[] = [];

  for (const item of raw) {
    if (!item.subject || !item.number || !item.days || !item.start) continue;

    if (isLabMeeting(item)) {
      labRows.push(item);
      continue;
    }

    const base = normalizeMeeting(item, resolvedCampus, false, snapStart);
    const row: ScheduleRowInput = { ...base };

    if (item.lab === "Y" && item.labDays && item.labStart) {
      Object.assign(
        row,
        normalizeLabFields(item.labDays, item.labStart, item.labDuration ?? 120, resolvedCampus, snapStart)
      );
    }

    pushUnique(lectureRows, row);
  }

  for (const lab of labRows) {
    const base = normalizeMeeting(lab, resolvedCampus, true, snapStart);
    const key = lab.linkedCourse?.trim().toUpperCase() ?? courseKey(base.subject, base.number);
    // If the lab carried an exact end time, base.start is already correct — don't snap.
    const labSnap = snapStart && durationFromEnd(lab.start, lab.end) == null;
    const labFields = normalizeLabFields(base.days, base.start, base.duration, resolvedCampus, labSnap);

    const target = lectureRows.find(
      (r) => courseKey(r.subject, r.number) === key && r.lab !== "Y"
    );

    if (target) {
      Object.assign(target, labFields);
    } else {
      pushUnique(lectureRows, {
        subject: base.subject,
        number: base.number,
        days: base.days,
        start: base.start,
        duration: base.duration,
      });
    }
  }

  mergeMisclassifiedLabRows(lectureRows, campus);

  return lectureRows.sort((a, b) =>
    `${a.subject} ${a.number}`.localeCompare(`${b.subject} ${b.number}`)
  );
}

/** When vision labels a lab block as a lecture row, attach it as lab fields instead of a second meeting. */
function mergeMisclassifiedLabRows(rows: ScheduleRowInput[], campus: TamuCampus) {
  const remove = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    if (remove.has(i)) continue;
    const candidate = rows[i];
    if (candidate.duration < 100) continue;

    const key = courseKey(candidate.subject, candidate.number);
    const target = rows.find(
      (r, j) =>
        j !== i &&
        !remove.has(j) &&
        courseKey(r.subject, r.number) === key &&
        r.duration < 100 &&
        r.lab !== "Y"
    );

    if (!target) continue;

    Object.assign(
      target,
      normalizeLabFields(candidate.days, candidate.start, candidate.duration, campus)
    );
    remove.add(i);
  }

  if (remove.size === 0) return;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (remove.has(i)) rows.splice(i, 1);
  }
}
