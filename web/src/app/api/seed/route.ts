import { NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { COHORTS } from "@/lib/cohorts";

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json().catch(() => ({}))) as { cohort?: string };
    const cohortId = (body.cohort ?? "K").toUpperCase();
    const cohort = COHORTS[cohortId];
    if (!cohort) {
      // Dynamically-created cohorts have no built-in roster to seed.
      return NextResponse.json({ ok: true, seeded: false, count: 0 });
    }

    const existing = await db.execute(
      "SELECT 1 FROM participants WHERE cohort_id = ? LIMIT 1",
      [cohortId]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, seeded: false, message: "Already seeded" });
    }

    await db.execute("DELETE FROM participants WHERE id = ?", ["rishika-sikka"]);

    for (const p of cohort.participants) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO participants (id, cohort_id, name, major, gender, birthday, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [p.id, cohortId, p.name, p.major, p.gender, p.birthday, p.phone],
      });
    }
    return NextResponse.json({ ok: true, seeded: true, count: cohort.participants.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
