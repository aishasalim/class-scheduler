"use client";

import { useMemo } from "react";
import { conflictBlockKeySet, findScheduleConflicts } from "@/lib/schedule-conflicts";
import { toMinutes } from "@/lib/zlpCore";
import type { ClientScheduleRow } from "@/lib/schedule-types";
import { courseCode, formatMeetingRange, parseScheduleTime } from "@/lib/schedule-types";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_LETTERS = ["M", "T", "W", "R", "F"];
const GRID_START = 8 * 60;
const GRID_END = 17 * 60 + 30;
const PX_PER_HOUR = 60;
const HOUR_COUNT = (GRID_END - GRID_START) / 60;
const GRID_HEIGHT = HOUR_COUNT * PX_PER_HOUR;
const COL_PAD = 3;

type CalendarBlock = {
  key: string;
  day: string;
  label: string;
  start: string;
  duration: number;
  startMin: number;
  isLab: boolean;
};

type PlacedBlock = CalendarBlock & {
  top: number;
  height: number;
  conflict: boolean;
};

function blockRefKey(course: string, day: string, start: string, part: "main" | "lab"): string {
  return `${course}|${day}|${parseScheduleTime(start)}|${part}`;
}

function hourMarkers(): number[] {
  const out: number[] = [];
  for (let m = GRID_START; m <= GRID_END; m += 60) out.push(m);
  return out;
}

function formatTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m !== 0) return "";
  if (h === 12) return "12 PM";
  if (h > 12) return `${h - 12} PM`;
  if (h === 0) return "12 AM";
  return `${h} AM`;
}

function topPx(minutes: number): number {
  return ((minutes - GRID_START) / 60) * PX_PER_HOUR;
}

function heightPx(minutes: number): number {
  return (minutes / 60) * PX_PER_HOUR;
}

function clampToGrid(startMin: number, duration: number): { top: number; height: number } | null {
  const endMin = startMin + duration;
  const visStart = Math.max(startMin, GRID_START);
  const visEnd = Math.min(endMin, GRID_END);
  if (visEnd <= visStart) return null;
  return {
    top: topPx(visStart),
    height: heightPx(visEnd - visStart),
  };
}

function blocksFromRows(rows: ClientScheduleRow[]): CalendarBlock[] {
  const out: CalendarBlock[] = [];

  for (const row of rows) {
    const label = courseCode(row);
    const startMin = toMinutes(parseScheduleTime(row.start));

    for (const day of row.days) {
      out.push({
        key: blockRefKey(label, day, row.start, "main"),
        day,
        label,
        start: row.start,
        duration: row.duration,
        startMin,
        isLab: row.duration >= 100,
      });
    }

    if (row.lab === "Y" && row.lab_days && row.lab_start && row.lab_duration) {
      const labStartMin = toMinutes(parseScheduleTime(row.lab_start));
      for (const day of row.lab_days) {
        out.push({
          key: blockRefKey(label, day, row.lab_start, "lab"),
          day,
          label,
          start: row.lab_start,
          duration: row.lab_duration,
          startMin: labStartMin,
          isLab: true,
        });
      }
    }
  }

  return out;
}

function layoutDayBlocks(blocks: CalendarBlock[], conflictKeys: Set<string>): PlacedBlock[] {
  const sorted = [...blocks].sort(
    (a, b) => a.startMin - b.startMin || b.duration - a.duration
  );

  return sorted.flatMap((block) => {
    const geom = clampToGrid(block.startMin, block.duration);
    if (!geom) return [];
    return [{ ...block, ...geom, conflict: conflictKeys.has(block.key) }];
  });
}

export function WeekGrid({ myRows }: { myRows: ClientScheduleRow[] }) {
  const hours = hourMarkers();
  const conflictKeys = useMemo(
    () => conflictBlockKeySet(findScheduleConflicts(myRows)),
    [myRows]
  );
  const blocksByDay = useMemo(() => {
    const all = blocksFromRows(myRows);
    const map = new Map<string, CalendarBlock[]>();
    for (const day of DAY_LETTERS) map.set(day, []);
    for (const b of all) {
      map.get(b.day)?.push(b);
    }
    const placed = new Map<string, PlacedBlock[]>();
    for (const day of DAY_LETTERS) {
      placed.set(day, layoutDayBlocks(map.get(day) ?? [], conflictKeys));
    }
    return placed;
  }, [myRows, conflictKeys]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-background shadow-sm">
      <div
        className="grid min-w-[560px]"
        style={{ gridTemplateColumns: "52px repeat(5, minmax(0, 1fr))" }}
      >
        {/* Header */}
        <div className="border-b border-border/60 bg-muted/20" />
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="border-b border-l border-border/60 bg-muted/20 py-2.5 text-center text-xs font-semibold tracking-wide text-foreground/80"
          >
            {d}
          </div>
        ))}

        {/* Body: time gutter + day columns share one row height */}
        <div
          className="relative border-r border-border/60 bg-muted/10"
          style={{ height: GRID_HEIGHT }}
        >
          {hours.slice(0, -1).map((hourStart) => (
            <div
              key={hourStart}
              className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-muted-foreground"
              style={{ top: topPx(hourStart) }}
            >
              {formatTimeLabel(hourStart)}
            </div>
          ))}
        </div>

        {DAY_LETTERS.map((dayLetter) => (
          <div
            key={dayLetter}
            className="relative border-l border-border/60 bg-background"
            style={{ height: GRID_HEIGHT }}
          >
            {hours.map((hourStart) => (
              <div
                key={hourStart}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/50"
                style={{ top: topPx(hourStart) }}
              />
            ))}

            {(blocksByDay.get(dayLetter) ?? []).map((block) => (
              <div
                key={block.key}
                className={cn(
                  "absolute z-10 overflow-hidden rounded-md px-1.5 py-1 shadow-sm",
                  "border bg-card text-card-foreground",
                  block.conflict
                    ? "border-destructive bg-destructive/10 ring-2 ring-destructive/40"
                    : block.isLab
                      ? "border-dashed border-muted-foreground/35"
                      : "border-border/70",
                  !block.isLab && !block.conflict && "border-l-[3px] border-l-primary"
                )}
                style={{
                  top: block.top,
                  height: Math.max(block.height, 22),
                  left: COL_PAD,
                  right: COL_PAD,
                }}
                title={
                  block.conflict
                    ? `Conflict · ${block.label} · ${block.start} · ${block.duration}m`
                    : `${block.label} · ${block.start} · ${block.duration}m`
                }
              >
                <p className="truncate text-[11px] font-semibold leading-tight">
                  {block.conflict ? "⚠ " : ""}
                  {block.label}
                </p>
                {block.height >= 36 ? (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {formatMeetingRange(block.start, block.duration)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
