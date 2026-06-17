import type { RawExtractedMeeting } from "@/lib/normalize-extracted-schedule";

/**
 * Deterministic parser for the Aggie "Course sections" / "Current Schedule"
 * text that students can copy-paste. No AI — exact times, zero misreads.
 *
 * Recognizes two things per course:
 *  - a header line with CRN + subject + course + section + credits, e.g.
 *      "Enrolled  37713  CSCE  313  511  4  Traditional Face-to-Face (F2F)"
 *  - meeting lines with a compact day code + time range, e.g.
 *      "TTh 12:45pm - 2:00pm 08/25/2026 - 12/10/2026 ZACH 310"
 */

const HEADER_RE =
  /(\d{5})\s+([A-Za-z]{2,4})\s+(\d{3,4})\s+(\d{3,4})\s+(\d+)\b/;

// day-code (M T W R F, Th=Thursday) + "h:mm am - h:mm pm" + optional date range.
// A day code is only ever the run of day-letters immediately followed by a time,
// so we don't need a lookbehind (locations like "ZACH 310" aren't followed by times).
const MEETING_RE =
  /([MTWRFH]{1,8})\s+(\d{1,2}):(\d{2})\s*([ap]m)\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap]m)(?:\s+(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4}))?/gi;

function daysFromCode(code: string): string {
  const up = code.toUpperCase().replace(/TH/g, "R");
  const seen = new Set<string>();
  let out = "";
  for (const ch of up) {
    if ("MTWRF".includes(ch) && !seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  return out;
}

function to24(h: number, m: number, mer: string): string {
  let hour = h;
  const lower = mer.toLowerCase();
  if (lower === "pm" && hour < 12) hour += 12;
  if (lower === "am" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function parseScheduleText(text: string): RawExtractedMeeting[] {
  const meetings: RawExtractedMeeting[] = [];
  const lines = text.split(/\r?\n/);
  let current: { subject: string; number: string; credits: number } | null = null;

  for (const line of lines) {
    const header = line.match(HEADER_RE);
    if (header) {
      current = {
        subject: header[2].toUpperCase(),
        number: header[3],
        credits: Number(header[5]),
      };
    }

    if (!current) continue;

    MEETING_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MEETING_RE.exec(line)) !== null) {
      const days = daysFromCode(m[1]);
      if (!days) continue;

      const start = to24(Number(m[2]), Number(m[3]), m[4]);
      const end = to24(Number(m[5]), Number(m[6]), m[7]);

      // Skip one-time sessions (single-date ranges, e.g. 08/20 - 08/20).
      const d1 = m[8];
      const d2 = m[9];
      if (d1 && d2 && d1 === d2) continue;

      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const duration = eh * 60 + em - (sh * 60 + sm);
      if (duration <= 0) continue;

      meetings.push({
        subject: current.subject,
        number: current.number,
        days,
        start,
        end,
        duration,
        meetingType: duration >= 110 ? "lab" : "lecture",
      });
    }
  }

  return meetings;
}
