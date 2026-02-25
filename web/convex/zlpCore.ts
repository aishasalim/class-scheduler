/**
 * ZLP 100-minute window logic (ported from zlp_scheduler.py).
 * All times in minutes from midnight. BLOCK_LEN = 100, STEP_MIN = 5.
 */

const DAY_LETTERS = "MTWRF";
const GRID_START = 8 * 60;
const GRID_END = 16 * 60 + 10;
const BLOCK_LEN = 100;
const STEP_MIN = 5;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHhmm(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return Math.max(a[0], b[0]) < Math.min(a[1], b[1]);
}

export interface Meeting {
  days: string;
  start: number;
  dur: number;
  label: string;
}

export interface Option {
  course: string;
  meetings: Meeting[];
}

function optionOverlapsBlock(opt: Option, day: string, blk: [number, number]): boolean {
  for (const m of opt.meetings) {
    if (m.days.includes(day)) {
      if (overlaps([m.start, m.start + m.dur], blk)) return true;
    }
  }
  return false;
}

export function bestConflictsAndBlockedForBlock(
  day: string,
  st: number,
  sectionsAll: Record<string, Option[]>
): { score: number; conflicts: string[]; blocked: string[] } {
  const blk: [number, number] = [st, st + BLOCK_LEN];
  const conflicts: string[] = [];
  const blocked: string[] = [];

  for (const [course, opts] of Object.entries(sectionsAll)) {
    const anyOverlap = opts.some((opt) => optionOverlapsBlock(opt, day, blk));
    const anyClear = opts.some((opt) => !optionOverlapsBlock(opt, day, blk));
    if (!anyClear) conflicts.push(course);
    else if (anyOverlap) blocked.push(course);
  }

  return {
    score: conflicts.length,
    conflicts: [...new Set(conflicts)].sort(),
    blocked: [...new Set(blocked)].sort(),
  };
}

export interface ScheduleRowInput {
  subject: string;
  number: string;
  days: string;
  start: string;
  duration: number;
  lab?: string;
  labDays?: string;
  labStart?: string;
  labDuration?: number;
}

/** Build sections_all (course -> options) from flat schedule rows. Each row = one Option. */
export function buildSectionsFromRows(rows: ScheduleRowInput[]): Record<string, Option[]> {
  const sectionsAll: Record<string, Option[]> = {};
  for (const r of rows) {
    const code = `${r.subject} ${r.number}`.trim();
    const meetings: Meeting[] = [
      { days: r.days, start: toMinutes(r.start), dur: r.duration, label: code },
    ];
    if (r.lab && (r.lab === "Y" || r.lab === "YES" || r.lab === "TRUE" || r.lab === "1")) {
      if (r.labDays && r.labStart != null && r.labDuration != null) {
        meetings.push({
          days: r.labDays,
          start: toMinutes(r.labStart),
          dur: r.labDuration,
          label: `${code} (Lab)`,
        });
      }
    }
    const opt: Option = { course: code, meetings };
    if (!sectionsAll[code]) sectionsAll[code] = [];
    sectionsAll[code].push(opt);
  }
  return sectionsAll;
}

export interface BestTimeRange {
  day: string;
  dayName: string;
  firstStart: number;
  lastStart: number;
  firstStartHhmm: string;
  lastStartHhmm: string;
  score: number;
  conflicts: string[];
  blocked: string[];
  blockedCount: number;
}

const DAY_NAMES: Record<string, string> = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
};

export function computeBestMeetingTimes(rows: ScheduleRowInput[]): {
  ranges: BestTimeRange[];
  heatmap: { start: string; day: string; score: number }[];
} {
  const sectionsAll = buildSectionsFromRows(rows);
  const starts: number[] = [];
  for (let s = GRID_START; s <= GRID_END; s += STEP_MIN) starts.push(s);

  const conflictMap: Record<string, string[]> = {};
  const blockedMap: Record<string, string[]> = {};
  const scoreMap: Record<string, number> = {};
  const heatmap: { start: string; day: string; score: number }[] = [];

  for (const d of DAY_LETTERS) {
    for (const s of starts) {
      const key = `${d}-${s}`;
      const { score, conflicts, blocked } = bestConflictsAndBlockedForBlock(d, s, sectionsAll);
      conflictMap[key] = conflicts;
      blockedMap[key] = blocked;
      scoreMap[key] = score;
      heatmap.push({ start: toHhmm(s), day: d, score });
    }
  }

  const byScore: Record<string, number[]> = {};
  for (const d of DAY_LETTERS) {
    byScore[d] = [];
    for (const s of starts) {
      byScore[d].push(s);
    }
  }

  const ranges: BestTimeRange[] = [];
  for (const d of DAY_LETTERS) {
    const byScoreDay: Record<number, number[]> = {};
    for (const s of starts) {
      const sc = scoreMap[`${d}-${s}`];
      if (!byScoreDay[sc]) byScoreDay[sc] = [];
      byScoreDay[sc].push(s);
    }
    for (const [scStr, stList] of Object.entries(byScoreDay)) {
      const score = Number(scStr);
      const sorted = [...stList].sort((a, b) => a - b);
      let first = sorted[0];
      let last = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === last + STEP_MIN) {
          last = sorted[i];
        } else {
          const key = `${d}-${first}`;
          ranges.push({
            day: d,
            dayName: DAY_NAMES[d],
            firstStart: first,
            lastStart: last,
            firstStartHhmm: toHhmm(first),
            lastStartHhmm: toHhmm(last),
            score,
            conflicts: conflictMap[key] ?? [],
            blocked: blockedMap[key] ?? [],
            blockedCount: (blockedMap[key] ?? []).length,
          });
          first = sorted[i];
          last = sorted[i];
        }
      }
      const key = `${d}-${first}`;
      ranges.push({
        day: d,
        dayName: DAY_NAMES[d],
        firstStart: first,
        lastStart: last,
        firstStartHhmm: toHhmm(first),
        lastStartHhmm: toHhmm(last),
        score,
        conflicts: conflictMap[key] ?? [],
        blocked: blockedMap[key] ?? [],
        blockedCount: (blockedMap[key] ?? []).length,
      });
    }
  }

  ranges.sort((a, b) => a.score - b.score || a.blockedCount - b.blockedCount || a.firstStart - b.firstStart || DAY_LETTERS.indexOf(a.day) - DAY_LETTERS.indexOf(b.day));
  const topRanges = ranges.filter((r) => r.score <= 2);
  const rest = ranges.filter((r) => r.score > 2);
  const selected = topRanges.length >= 10 ? topRanges.slice(0, 10) : [...topRanges, ...rest].slice(0, 10);

  return { ranges: selected, heatmap };
}
