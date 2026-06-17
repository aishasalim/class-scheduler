import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { findScheduleConflicts, formatScheduleConflictError } from "@/lib/schedule-conflicts";
import { saveScheduleRows, type SchedulePayloadRow } from "@/lib/save-schedule";

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const participantId = request.nextUrl.searchParams.get("participantId");
    if (!participantId) {
      return NextResponse.json({ error: "participantId required" }, { status: 400 });
    }
    const rs = await db.execute(
      "SELECT id, participant_id, subject, number, days, start, duration, lab, lab_days, lab_start, lab_duration, priority FROM schedule_rows WHERE participant_id = ? ORDER BY subject, number, days, start",
      [participantId]
    );
    return NextResponse.json(rs.rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const body = await request.json();
    const { participantId, rows } = body as { participantId: string; rows: SchedulePayloadRow[] };
    if (!participantId || !Array.isArray(rows)) {
      return NextResponse.json({ error: "participantId and rows required" }, { status: 400 });
    }

    const participant = await db.execute("SELECT id FROM participants WHERE id = ?", [participantId]);
    if (participant.rows.length === 0) {
      return NextResponse.json(
        { error: "Participant not found. Log out and sign in again." },
        { status: 404 }
      );
    }

    const conflicts = findScheduleConflicts(rows);
    if (conflicts.length > 0) {
      return NextResponse.json({ error: formatScheduleConflictError(conflicts) }, { status: 400 });
    }

    const saved = await saveScheduleRows(participantId, rows);
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
