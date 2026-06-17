import { snapLabDuration, snapMeetingDuration } from "@/lib/tamu-schedule-blocks";
import { toMinutes, toHhmm } from "@/lib/zlpCore";

export type ClassPriority = "movable" | "unmovable";

export type ClientScheduleRow = {
  subject: string;
  number: string;
  days: string;
  start: string;
  duration: number;
  lab?: string | null;
  lab_days?: string | null;
  lab_start?: string | null;
  lab_duration?: number | null;
  priority?: ClassPriority;
};

export type SharedCourseTime = {
  days: string;
  start: string;
  duration: number;
  count: number;
  names: string;
};

/** A class (subject+number) taken by 2+ people in the cohort. */
export type SharedCourse = {
  course: string;
  subject: string;
  number: string;
  count: number;
  names: string;
  mine: boolean;
  times: SharedCourseTime[];
};

export type MeetingTimesResult = {
  ranges: {
    day: string;
    dayName: string;
    firstStartHhmm: string;
    lastStartHhmm: string;
    /**
     * Soft "would re-register" cost: number of participants whose movable
     * class overlaps this window. For windows with no unmovable conflict this
     * is the primary thing to minimize; 0 means everyone is free.
     */
    score: number;
    /**
     * Hard-block count: number of participants with an unmovable class
     * overlapping this window. Any window with unmovableCount > 0 ranks worse
     * than every window without one.
     */
    unmovableCount: number;
    /** Names of participants who would have to re-register (movable overlap). */
    reRegisterNames: string[];
    /** Names of participants hard-blocked by an unmovable class. */
    unmovableNames: string[];
    conflicts: string[];
    blocked: string[];
    blockedCount: number;
  }[];
  heatmap: { start: string; day: string; score: number }[];
};

export function rowToPayload(r: ClientScheduleRow) {
  const days = r.days.trim();
  const durationRaw = Number(r.duration);
  const duration = Number.isFinite(durationRaw)
    ? snapMeetingDuration(durationRaw, days, durationRaw >= 100)
    : 50;
  const labRaw = r.lab_duration == null ? null : Number(r.lab_duration);
  const labDuration =
    labRaw != null && Number.isFinite(labRaw) ? snapLabDuration(labRaw) : undefined;
  return {
    subject: r.subject,
    number: r.number,
    days,
    start: r.start,
    duration,
    lab: r.lab ?? undefined,
    labDays: r.lab_days ?? undefined,
    labStart: r.lab_start ?? undefined,
    labDuration,
    priority: r.priority === "unmovable" ? "unmovable" : "movable",
  };
}

export function formatDays(days: string): string {
  return days ? days.split("").join("/") : "";
}

export function courseCode(row: Pick<ClientScheduleRow, "subject" | "number">): string {
  return `${row.subject} ${row.number}`.trim();
}

export function sectionLabel(row: ClientScheduleRow): string {
  return `${courseCode(row)} ${formatDays(row.days)} ${row.start}`;
}

export function parseScheduleTime(raw: string): string {
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

export function endTimeFromStartDuration(start: string, duration: number): string {
  return toHhmm(toMinutes(parseScheduleTime(start)) + duration);
}

export function durationFromStartEnd(start: string, end: string, days: string): number {
  const startMin = toMinutes(parseScheduleTime(start));
  const endMin = toMinutes(parseScheduleTime(end));
  const raw = endMin - startMin;
  if (raw <= 0) return snapMeetingDuration(50, days, false);
  return snapMeetingDuration(raw, days, raw >= 100);
}

export type CourseMeeting = {
  rowIndex: number;
  row: ClientScheduleRow;
  part: "main" | "lab";
};

export type CourseGroup = {
  code: string;
  meetings: CourseMeeting[];
};

/** One card per subject+number; lists every lecture/lab session. */
export function groupRowsByCourse(rows: ClientScheduleRow[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>();

  rows.forEach((row, rowIndex) => {
    const code = courseCode(row);
    if (!map.has(code)) map.set(code, { code, meetings: [] });
    const group = map.get(code)!;
    group.meetings.push({ rowIndex, row, part: "main" });

    if (row.lab === "Y" && row.lab_days && row.lab_start && row.lab_duration) {
      group.meetings.push({ rowIndex, row, part: "lab" });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function formatMeetingRange(start: string, duration: number): string {
  return `${parseScheduleTime(start)}–${endTimeFromStartDuration(start, duration)}`;
}

export function formatMeetingLine(meeting: CourseMeeting): string {
  if (meeting.part === "lab" && meeting.row.lab_days && meeting.row.lab_start && meeting.row.lab_duration) {
    return `Lab · ${formatDays(meeting.row.lab_days)} · ${formatMeetingRange(meeting.row.lab_start, meeting.row.lab_duration)}`;
  }
  return `${formatDays(meeting.row.days)} · ${formatMeetingRange(meeting.row.start, meeting.row.duration)}`;
}
