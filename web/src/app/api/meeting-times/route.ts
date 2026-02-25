import { NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { computeBestMeetingTimes } from "@/lib/zlpCore";
import type { ScheduleRowInput } from "@/lib/zlpCore";

export async function GET() {
  try {
    await ensureDb();
    const rs = await db.execute(
      "SELECT subject, number, days, start, duration, lab, lab_days, lab_start, lab_duration FROM schedule_rows"
    );
    const rows: ScheduleRowInput[] = (rs.rows as unknown as { subject: string; number: string; days: string; start: string; duration: number; lab?: string | null; lab_days?: string | null; lab_start?: string | null; lab_duration?: number | null }[]).map((r) => ({
      subject: r.subject,
      number: r.number,
      days: r.days,
      start: r.start,
      duration: r.duration,
      lab: r.lab ?? undefined,
      labDays: r.lab_days ?? undefined,
      labStart: r.lab_start ?? undefined,
      labDuration: r.lab_duration ?? undefined,
    }));
    const result = computeBestMeetingTimes(rows);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
