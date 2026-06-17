import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { normalizeCohortId } from "@/lib/cohorts";

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const cohortId = normalizeCohortId(request.nextUrl.searchParams.get("cohort") ?? "K");

    const totalRs = await db.execute(
      "SELECT COUNT(*) as count FROM participants WHERE cohort_id = ?",
      [cohortId]
    );
    const submittedRs = await db.execute(
      `SELECT COUNT(DISTINCT p.id) as count
       FROM participants p
       INNER JOIN schedule_rows s ON s.participant_id = p.id
       WHERE p.cohort_id = ?`,
      [cohortId]
    );

    const total = Number((totalRs.rows[0] as unknown as { count: number }).count ?? 0);
    const submitted = Number((submittedRs.rows[0] as unknown as { count: number }).count ?? 0);

    return NextResponse.json({ cohortId, total, submitted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
