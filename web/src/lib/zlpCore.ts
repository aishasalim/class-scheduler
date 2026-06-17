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

export type ClassPriority = "movable" | "unmovable";

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
  priority?: ClassPriority;
}

/** One meeting block a participant is busy with, tagged with the class priority. */
interface BusyBlock {
  days: string;
  start: number;
  dur: number;
  course: string;
  priority: ClassPriority;
}

function rowPriority(r: ScheduleRowInput): ClassPriority {
  return r.priority === "unmovable" ? "unmovable" : "movable";
}

/** Expand one participant's rows into priority-tagged busy blocks (main + lab). */
export function buildBusyBlocksFromRows(rows: ScheduleRowInput[]): BusyBlock[] {
  const blocks: BusyBlock[] = [];
  for (const r of rows) {
    const code = `${r.subject} ${r.number}`.trim();
    const priority = rowPriority(r);
    for (const m of meetingsForRow(r, code)) {
      blocks.push({ days: m.days, start: m.start, dur: m.dur, course: code, priority });
    }
  }
  return blocks;
}

interface ParticipantBlocks {
  name: string;
  blocks: BusyBlock[];
}

interface BlockStats {
  unmovableCount: number;
  movableCount: number;
  unmovableCourses: string[];
  movableCourses: string[];
  unmovableNames: string[];
  reRegisterNames: string[];
}

/**
 * Two-tier classification of a single 100-minute window across all participants.
 * A participant is an "unmovable conflict" if any of their unmovable classes
 * overlaps the window (a hard block). They are a "movable conflict" (would
 * re-register) if a movable class overlaps but they have no unmovable overlap.
 */
function blockStatsForParticipants(
  day: string,
  st: number,
  participants: ParticipantBlocks[]
): BlockStats {
  const blk: [number, number] = [st, st + BLOCK_LEN];
  let unmovableCount = 0;
  let movableCount = 0;
  const unmovableCourses = new Set<string>();
  const movableCourses = new Set<string>();
  const unmovableNames: string[] = [];
  const reRegisterNames: string[] = [];

  for (const p of participants) {
    let hasUnmovable = false;
    let hasMovable = false;
    for (const b of p.blocks) {
      if (!b.days.includes(day)) continue;
      if (!overlaps([b.start, b.start + b.dur], blk)) continue;
      if (b.priority === "unmovable") {
        hasUnmovable = true;
        unmovableCourses.add(b.course);
      } else {
        hasMovable = true;
        movableCourses.add(b.course);
      }
    }
    if (hasUnmovable) {
      unmovableCount += 1;
      unmovableNames.push(p.name);
    } else if (hasMovable) {
      movableCount += 1;
      reRegisterNames.push(p.name);
    }
  }

  return {
    unmovableCount,
    movableCount,
    unmovableCourses: [...unmovableCourses].sort(),
    movableCourses: [...movableCourses].sort(),
    unmovableNames,
    reRegisterNames,
  };
}

function meetingsForRow(r: ScheduleRowInput, code: string): Meeting[] {
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
  return meetings;
}

/** One participant's rows → one Option per course (all meeting times combined). */
export function buildSectionsFromParticipantRows(rows: ScheduleRowInput[]): Record<string, Option[]> {
  const byCourse = new Map<string, ScheduleRowInput[]>();
  for (const r of rows) {
    const code = `${r.subject} ${r.number}`.trim();
    if (!byCourse.has(code)) byCourse.set(code, []);
    byCourse.get(code)!.push(r);
  }

  const sectionsAll: Record<string, Option[]> = {};
  for (const [code, courseRows] of byCourse) {
    const meetings: Meeting[] = [];
    for (const r of courseRows) {
      meetings.push(...meetingsForRow(r, code));
    }
    if (!sectionsAll[code]) sectionsAll[code] = [];
    sectionsAll[code].push({ course: code, meetings });
  }
  return sectionsAll;
}

/** Merge options from many participants (cohort-wide). */
export function mergeSectionMaps(maps: Record<string, Option[]>[]): Record<string, Option[]> {
  const sectionsAll: Record<string, Option[]> = {};
  for (const map of maps) {
    for (const [course, opts] of Object.entries(map)) {
      if (!sectionsAll[course]) sectionsAll[course] = [];
      sectionsAll[course].push(...opts);
    }
  }
  return sectionsAll;
}

/** Build sections_all from flat rows (legacy: each row = separate option). */
export function buildSectionsFromRows(rows: ScheduleRowInput[]): Record<string, Option[]> {
  const sectionsAll: Record<string, Option[]> = {};
  for (const r of rows) {
    const code = `${r.subject} ${r.number}`.trim();
    const opt: Option = { course: code, meetings: meetingsForRow(r, code) };
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
  /** Soft re-register cost = number of participants with a movable overlap. */
  score: number;
  /** Hard block count = number of participants with an unmovable overlap. */
  unmovableCount: number;
  /** Participants who would have to re-register (movable overlap, not hard-blocked). */
  reRegisterNames: string[];
  /** Participants hard-blocked by an unmovable class. */
  unmovableNames: string[];
  /** Course codes that hard-block this window (unmovable overlaps). */
  conflicts: string[];
  /** Course codes softly overlapping this window (movable overlaps). */
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
  return computeBestMeetingTimesFromParticipants([rows]);
}

/**
 * Rank cohort meeting windows with a two-tier, priority-aware score.
 *
 * Primary key: number of participants hard-blocked by an UNMOVABLE class
 * (`unmovableCount`) — minimized first, ideally zero. Any window that overlaps
 * an unmovable class sorts strictly after every window that does not.
 * Secondary key: number of participants who'd have to re-register because a
 * MOVABLE class overlaps (`score`) — the soft "overlap list" cost.
 *
 * `participantNames` (optional, index-aligned with `participantSchedules`) is
 * used only to populate the human-readable name lists.
 */
export function computeBestMeetingTimesFromParticipants(
  participantSchedules: ScheduleRowInput[][],
  participantNames?: string[]
): {
  ranges: BestTimeRange[];
  heatmap: { start: string; day: string; score: number }[];
} {
  const participants: ParticipantBlocks[] = participantSchedules.map((rows, i) => ({
    name: participantNames?.[i] ?? `Participant ${i + 1}`,
    blocks: buildBusyBlocksFromRows(rows),
  }));

  const starts: number[] = [];
  for (let s = GRID_START; s <= GRID_END; s += STEP_MIN) starts.push(s);

  const statsMap: Record<string, BlockStats> = {};
  const heatmap: { start: string; day: string; score: number }[] = [];

  for (const d of DAY_LETTERS) {
    for (const s of starts) {
      const stats = blockStatsForParticipants(d, s, participants);
      statsMap[`${d}-${s}`] = stats;
      // Heatmap: total participants busy (hard + soft) — higher = worse.
      heatmap.push({ start: toHhmm(s), day: d, score: stats.unmovableCount + stats.movableCount });
    }
  }

  // Group consecutive start times that share BOTH the hard and soft counts.
  const groupKey = (st: BlockStats) => `${st.unmovableCount}-${st.movableCount}`;

  const ranges: BestTimeRange[] = [];
  const pushRange = (d: string, first: number, last: number) => {
    const stats = statsMap[`${d}-${first}`];
    ranges.push({
      day: d,
      dayName: DAY_NAMES[d],
      firstStart: first,
      lastStart: last,
      firstStartHhmm: toHhmm(first),
      lastStartHhmm: toHhmm(last),
      score: stats.movableCount,
      unmovableCount: stats.unmovableCount,
      reRegisterNames: stats.reRegisterNames,
      unmovableNames: stats.unmovableNames,
      conflicts: stats.unmovableCourses,
      blocked: stats.movableCourses,
      blockedCount: stats.movableCount,
    });
  };

  for (const d of DAY_LETTERS) {
    const byKeyDay: Record<string, number[]> = {};
    for (const s of starts) {
      const key = groupKey(statsMap[`${d}-${s}`]);
      if (!byKeyDay[key]) byKeyDay[key] = [];
      byKeyDay[key].push(s);
    }
    for (const stList of Object.values(byKeyDay)) {
      const sorted = [...stList].sort((a, b) => a - b);
      let first = sorted[0];
      let last = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === last + STEP_MIN) {
          last = sorted[i];
        } else {
          pushRange(d, first, last);
          first = sorted[i];
          last = sorted[i];
        }
      }
      pushRange(d, first, last);
    }
  }

  // Two-tier ordering: never let an unmovable conflict outrank a clean window.
  ranges.sort(
    (a, b) =>
      a.unmovableCount - b.unmovableCount ||
      a.score - b.score ||
      a.firstStart - b.firstStart ||
      DAY_LETTERS.indexOf(a.day) - DAY_LETTERS.indexOf(b.day)
  );
  const clean = ranges.filter((r) => r.unmovableCount === 0);
  const blockedRanges = ranges.filter((r) => r.unmovableCount > 0);
  const selected =
    clean.length >= 10 ? clean.slice(0, 10) : [...clean, ...blockedRanges].slice(0, 10);

  return { ranges: selected, heatmap };
}
