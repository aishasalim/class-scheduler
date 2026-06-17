import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { computeBestMeetingTimesFromParticipants } from "@/lib/zlpCore";
import type { ScheduleRowInput } from "@/lib/zlpCore";
import { normalizeCohortId } from "@/lib/cohorts";
import { isZlpCourse } from "@/lib/zlp-courses";

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const cohortId = normalizeCohortId(request.nextUrl.searchParams.get("cohort") ?? "K");
    const rs = await db.execute(
      `SELECT s.participant_id, p.name AS participant_name, s.subject, s.number, s.days, s.start, s.duration,
              s.lab, s.lab_days, s.lab_start, s.lab_duration, s.priority
       FROM schedule_rows s
       INNER JOIN participants p ON p.id = s.participant_id
       WHERE p.cohort_id = ?`,
      [cohortId]
    );
    type DbRow = {
      participant_id: string;
      participant_name: string;
      subject: string;
      number: string;
      days: string;
      start: string;
      duration: number;
      lab?: string | null;
      lab_days?: string | null;
      lab_start?: string | null;
      lab_duration?: number | null;
      priority?: string | null;
    };
    const byParticipant = new Map<string, { name: string; rows: ScheduleRowInput[] }>();
    for (const r of rs.rows as unknown as DbRow[]) {
      // The ZLP course itself is what we're scheduling — never let it block a window.
      if (isZlpCourse(r.subject, r.number)) continue;
      const row: ScheduleRowInput = {
        subject: r.subject,
        number: r.number,
        days: r.days,
        start: r.start,
        duration: r.duration,
        lab: r.lab ?? undefined,
        labDays: r.lab_days ?? undefined,
        labStart: r.lab_start ?? undefined,
        labDuration: r.lab_duration ?? undefined,
        priority: r.priority === "unmovable" ? "unmovable" : "movable",
      };
      if (!byParticipant.has(r.participant_id)) {
        byParticipant.set(r.participant_id, { name: r.participant_name, rows: [] });
      }
      byParticipant.get(r.participant_id)!.rows.push(row);
    }
    const entries = [...byParticipant.values()];
    const result = computeBestMeetingTimesFromParticipants(
      entries.map((e) => e.rows),
      entries.map((e) => e.name)
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
