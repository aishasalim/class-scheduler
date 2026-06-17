import { NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { COHORTS, normalizeCohortId } from "@/lib/cohorts";

/** Wipe all schedules and participant rows, then re-seed from cohorts.ts (no test pollution). */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json().catch(() => ({}))) as { cohort?: string };
    const cohortId = normalizeCohortId(body.cohort ?? "K");
    const cohort = COHORTS[cohortId];
    if (!cohort) {
      return NextResponse.json({ error: "Unknown cohort" }, { status: 400 });
    }

    await db.execute("DELETE FROM schedule_rows");
    await db.execute("DELETE FROM participants WHERE cohort_id = ?", [cohortId]);
    // Legacy rows without cohort_id or old roster entries
    await db.execute("DELETE FROM participants WHERE id = ?", ["rishika-sikka"]);

    for (const p of cohort.participants) {
      await db.execute({
        sql: "INSERT INTO participants (id, cohort_id, name, major, gender, birthday, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [p.id, cohortId, p.name, p.major, p.gender, p.birthday, p.phone],
      });
    }

    return NextResponse.json({
      ok: true,
      cohortId,
      participants: cohort.participants.length,
      schedulesCleared: true,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
