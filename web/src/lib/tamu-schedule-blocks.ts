/**
 * Texas A&M standard lecture time blocks (East / West campus).
 * Source: registrar lecture time templates.
 */

export type TamuCampus = "east" | "west" | "auto";

export type TamuBlock = {
  campus: "east" | "west";
  days: string;
  start: string;
  duration: number;
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function toHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export const TAMU_EAST_BLOCKS: TamuBlock[] = [
  { campus: "east", days: "MWF", start: "08:00", duration: 50 },
  { campus: "east", days: "MWF", start: "09:10", duration: 50 },
  { campus: "east", days: "MWF", start: "10:20", duration: 50 },
  { campus: "east", days: "MWF", start: "11:30", duration: 50 },
  { campus: "east", days: "MWF", start: "12:40", duration: 50 },
  { campus: "east", days: "MWF", start: "13:50", duration: 50 },
  { campus: "east", days: "MWF", start: "15:00", duration: 50 },
  { campus: "east", days: "MW", start: "16:10", duration: 75 },
  { campus: "east", days: "MW", start: "17:45", duration: 75 },
  { campus: "east", days: "TR", start: "08:00", duration: 75 },
  { campus: "east", days: "TR", start: "09:35", duration: 75 },
  { campus: "east", days: "TR", start: "11:10", duration: 75 },
  { campus: "east", days: "TR", start: "12:45", duration: 75 },
  { campus: "east", days: "TR", start: "14:20", duration: 75 },
  { campus: "east", days: "TR", start: "15:55", duration: 75 },
  { campus: "east", days: "TR", start: "17:30", duration: 75 },
];

export const TAMU_WEST_BLOCKS: TamuBlock[] = [
  { campus: "west", days: "MWF", start: "08:30", duration: 50 },
  { campus: "west", days: "MWF", start: "09:40", duration: 50 },
  { campus: "west", days: "MWF", start: "10:50", duration: 50 },
  { campus: "west", days: "MWF", start: "12:00", duration: 50 },
  { campus: "west", days: "MWF", start: "13:10", duration: 50 },
  { campus: "west", days: "MWF", start: "14:20", duration: 50 },
  { campus: "west", days: "MWF", start: "15:30", duration: 50 },
  { campus: "west", days: "MW", start: "16:40", duration: 75 },
  { campus: "west", days: "MW", start: "18:15", duration: 75 },
  { campus: "west", days: "TR", start: "08:30", duration: 75 },
  { campus: "west", days: "TR", start: "10:05", duration: 75 },
  { campus: "west", days: "TR", start: "11:40", duration: 75 },
  { campus: "west", days: "TR", start: "13:15", duration: 75 },
  { campus: "west", days: "TR", start: "14:50", duration: 75 },
  { campus: "west", days: "TR", start: "16:25", duration: 75 },
  { campus: "west", days: "TR", start: "18:00", duration: 75 },
];

/** TAMU allowed meeting lengths (minutes). */
export const TAMU_CLASS_DURATIONS = [50, 75] as const;
export const TAMU_LAB_DURATIONS = [120, 170] as const;

export type TamuClassDuration = (typeof TAMU_CLASS_DURATIONS)[number];
export type TamuLabDuration = (typeof TAMU_LAB_DURATIONS)[number];
export type TamuMeetingDuration = TamuClassDuration | TamuLabDuration;

export const TAMU_DURATION_OPTIONS: { value: TamuMeetingDuration; label: string }[] = [
  { value: 50, label: "50 min — MWF lecture" },
  { value: 75, label: "75 min — TR / MW lecture" },
  { value: 120, label: "120 min — lab" },
  { value: 170, label: "170 min — lab" },
];

export function snapClassDuration(duration: number, days = ""): TamuClassDuration {
  const pattern = dayPatternKey(days);
  let preferred: TamuClassDuration | null = null;
  if (pattern === "MWF") preferred = 50;
  else if (pattern === "TR" || pattern === "MW") preferred = 75;
  if (preferred != null && Math.abs(duration - preferred) <= 20) return preferred;
  return Math.abs(duration - 50) <= Math.abs(duration - 75) ? 50 : 75;
}

export function snapLabDuration(duration: number): TamuLabDuration {
  if (duration === 120 || duration === 170) return duration;
  return Math.abs(duration - 120) <= Math.abs(duration - 170) ? 120 : 170;
}

/** Pick class (50/75) or lab (120/170) length from raw minutes. */
export function snapMeetingDuration(duration: number, days: string, isLab: boolean): TamuMeetingDuration {
  if (isLab) return snapLabDuration(duration);
  if (duration >= 100) return snapLabDuration(duration);
  return snapClassDuration(duration, days);
}

export function isTamuMeetingDuration(value: number): value is TamuMeetingDuration {
  return (TAMU_CLASS_DURATIONS as readonly number[]).includes(value)
    || (TAMU_LAB_DURATIONS as readonly number[]).includes(value);
}

export function normalizeDayPattern(days: string): string {
  return days
    .toUpperCase()
    .replace(/[^MTWRF]/g, "")
    .replace(/TH/g, "R")
    .split("")
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .sort((a, b) => "MTWRF".indexOf(a) - "MTWRF".indexOf(b))
    .join("");
}

/** Match canonical day patterns like MWF, TR, MW regardless of letter order. */
export function dayPatternKey(days: string): string {
  const n = normalizeDayPattern(days);
  if (n === "MWF") return "MWF";
  if (n === "TR") return "TR";
  if (n === "MW") return "MW";
  if (n === "M") return "M";
  if (n === "T") return "T";
  if (n === "W") return "W";
  if (n === "R") return "R";
  if (n === "F") return "F";
  return n;
}

function blocksForCampus(campus: TamuCampus): TamuBlock[] {
  if (campus === "east") return TAMU_EAST_BLOCKS;
  if (campus === "west") return TAMU_WEST_BLOCKS;
  return [...TAMU_EAST_BLOCKS, ...TAMU_WEST_BLOCKS];
}

/**
 * A student attends ONE campus, so their classes follow ONE start-time grid.
 * Mixing East+West grids lets two valid classes snap onto overlapping blocks.
 * Pick the single campus whose grid best fits all the read meetings.
 */
export function pickBestCampus(
  meetings: { days: string; start: string }[]
): "east" | "west" {
  const distanceFor = (blocks: TamuBlock[]): number => {
    let total = 0;
    for (const m of meetings) {
      const pattern = dayPatternKey(m.days);
      const startMin = toMinutes(m.start);
      const candidates = blocks.filter((b) => dayPatternKey(b.days) === pattern);
      if (candidates.length === 0) continue;
      let best = Math.abs(toMinutes(candidates[0].start) - startMin);
      for (const b of candidates) {
        best = Math.min(best, Math.abs(toMinutes(b.start) - startMin));
      }
      total += best;
    }
    return total;
  };

  return distanceFor(TAMU_EAST_BLOCKS) <= distanceFor(TAMU_WEST_BLOCKS)
    ? "east"
    : "west";
}

export function snapToTamuBlock(
  days: string,
  start: string,
  duration: number,
  campus: TamuCampus = "auto"
): { days: string; start: string; duration: number; campus: "east" | "west" | null } {
  const startMin = toMinutes(start);
  const pattern = dayPatternKey(days);
  const candidates = blocksForCampus(campus).filter((b) => dayPatternKey(b.days) === pattern);

  if (candidates.length === 0) {
    return { days: normalizeDayPattern(days), start: toHhmm(startMin), duration, campus: null };
  }

  let best = candidates[0];
  let bestDist = Math.abs(toMinutes(best.start) - startMin);

  for (const block of candidates) {
    const dist = Math.abs(toMinutes(block.start) - startMin);
    if (dist < bestDist) {
      best = block;
      bestDist = dist;
    }
  }

  if (bestDist <= 20) {
    return { days: best.days, start: best.start, duration: best.duration, campus: best.campus };
  }

  return {
    days: normalizeDayPattern(days),
    start: toHhmm(startMin),
    duration: snapClassDuration(duration, days),
    campus: null,
  };
}
