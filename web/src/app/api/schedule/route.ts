import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const participantId = request.nextUrl.searchParams.get("participantId");
    if (!participantId) {
      return NextResponse.json({ error: "participantId required" }, { status: 400 });
    }
    const rs = await db.execute(
      "SELECT id, participant_id, subject, number, days, start, duration, lab, lab_days, lab_start, lab_duration FROM schedule_rows WHERE participant_id = ? ORDER BY subject, number",
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
    const { participantId, rows } = body as { participantId: string; rows: { subject: string; number: string; days: string; start: string; duration: number; lab?: string; labDays?: string; labStart?: string; labDuration?: number }[] };
    if (!participantId || !Array.isArray(rows)) {
      return NextResponse.json({ error: "participantId and rows required" }, { status: 400 });
    }
    await db.execute("DELETE FROM schedule_rows WHERE participant_id = ?", [participantId]);
    for (const r of rows) {
      await db.execute({
        sql: "INSERT INTO schedule_rows (participant_id, subject, number, days, start, duration, lab, lab_days, lab_start, lab_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          participantId,
          r.subject,
          r.number,
          r.days,
          r.start,
          r.duration,
          r.lab ?? null,
          r.labDays ?? null,
          r.labStart ?? null,
          r.labDuration ?? null,
        ],
      });
    }
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
