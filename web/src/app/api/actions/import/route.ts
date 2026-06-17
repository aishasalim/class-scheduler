import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  normalizeExtractedSchedule,
  type RawExtractedMeeting,
} from "@/lib/normalize-extracted-schedule";
import { parseScheduleText } from "@/lib/parse-schedule-text";
import { validateCohortPassword } from "@/lib/cohort-auth";
import { findOrCreateParticipant } from "@/lib/participant-db";
import {
  applyCoursePriorities,
  saveScheduleRows,
  scheduleInputToPayload,
} from "@/lib/save-schedule";
import {
  findScheduleConflicts,
  formatScheduleConflictError,
} from "@/lib/schedule-conflicts";

/**
 * Schedule import endpoint used by the browser extension.
 *
 * Accepts:
 *   - meetings | rawText — schedule data
 *   - cohortId, fullName, password — identity + cohort auth
 *   - priorities?: Record<"SUBJ NUM", "movable"|"unmovable">
 *
 * Validates cohort password, finds/creates participant, normalizes rows,
 * applies per-course priority, checks conflicts, and saves to DB.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type ImportBody = {
  rawText?: string;
  meetings?: RawExtractedMeeting[];
  cohortId?: string;
  fullName?: string;
  password?: string;
  priorities?: Record<string, "movable" | "unmovable">;
};

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const body = (await request.json().catch(() => ({}))) as ImportBody;

    const cohortId = String(body.cohortId ?? "").trim();
    const fullName = String(body.fullName ?? "").trim();
    const password = String(body.password ?? "");

    if (!cohortId || !fullName) {
      return json(
        { ok: false, error: "cohortId and fullName are required.", rows: [], conflicts: [] },
        400
      );
    }

    const auth = await validateCohortPassword(cohortId, password);
    if (!auth.ok) {
      return json({ ok: false, error: auth.error, rows: [], conflicts: [] }, auth.status);
    }

    let raw: RawExtractedMeeting[];

    if (Array.isArray(body.meetings) && body.meetings.length > 0) {
      raw = body.meetings;
    } else if (typeof body.rawText === "string" && body.rawText.trim()) {
      raw = parseScheduleText(body.rawText);
    } else {
      return json(
        {
          ok: false,
          rows: [],
          conflicts: [],
          error:
            "Provide either `meetings` (structured rows) or `rawText` (schedule text to parse).",
        },
        400
      );
    }

    if (raw.length === 0) {
      return json({
        ok: false,
        rows: [],
        conflicts: [],
        error:
          "No classes found. Make sure the schedule has weekday codes (M/T/W/R/F) and time ranges.",
      });
    }

    const normalized = normalizeExtractedSchedule(raw, "auto", { snapStart: false });
    const rows = applyCoursePriorities(normalized, body.priorities);
    const conflicts = findScheduleConflicts(rows);
    const payloadRows = rows.map(scheduleInputToPayload);

    if (conflicts.length > 0) {
      const warning = formatScheduleConflictError(conflicts);
      return json(
        {
          ok: false,
          rows: payloadRows,
          conflicts,
          warning,
          error: warning,
        },
        400
      );
    }

    const participant = await findOrCreateParticipant(auth.cohortId, fullName);
    const saved = await saveScheduleRows(participant.id, payloadRows);

    return json({
      ok: true,
      participantId: participant.id,
      participantCreated: participant.created,
      rows: payloadRows,
      conflicts: [],
      saved,
      courses: [...new Set(rows.map((r) => `${r.subject} ${r.number}`.trim()))].sort(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, rows: [], conflicts: [], error: message }, 500);
  }
}
