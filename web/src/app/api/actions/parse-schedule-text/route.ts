import { NextRequest, NextResponse } from "next/server";
import { normalizeExtractedSchedule } from "@/lib/normalize-extracted-schedule";
import { parseScheduleText } from "@/lib/parse-schedule-text";
import {
  findScheduleConflicts,
  formatScheduleConflictError,
} from "@/lib/schedule-conflicts";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ rows: [], error: "Paste your schedule text first." });
    }

    const raw = parseScheduleText(text);
    if (raw.length === 0) {
      return NextResponse.json({
        rows: [],
        error:
          "No classes found in the text. Copy the rows from 'Course sections' / 'Current Schedule' (the part with days and times).",
      });
    }

    // Exact times from text — no snapping, no AI.
    const rows = normalizeExtractedSchedule(raw, "auto", { snapStart: false });
    const conflicts = findScheduleConflicts(rows);
    if (conflicts.length > 0) {
      return NextResponse.json({
        rows: [],
        error: formatScheduleConflictError(conflicts),
        conflicts,
      });
    }

    return NextResponse.json({ rows, rawCount: raw.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ rows: [], error: message });
  }
}
