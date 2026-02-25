import { NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";

export async function GET() {
  try {
    await ensureDb();
    const rs = await db.execute(
      "SELECT participant_id, subject, number, days, start, duration, lab, lab_days, lab_start, lab_duration FROM schedule_rows"
    );
    return NextResponse.json(rs.rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
