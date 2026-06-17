import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { normalizeCohortId } from "@/lib/cohorts";

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const cohortId = normalizeCohortId(request.nextUrl.searchParams.get("cohort") ?? "K");
    const excludeParticipantId = request.nextUrl.searchParams.get("excludeParticipantId") ?? undefined;

    const participantsRs = await db.execute(
      "SELECT id, name FROM participants WHERE cohort_id = ?",
      [cohortId]
    );
    const rowsRs = await db.execute(
      `SELECT s.participant_id, s.subject, s.number, s.days, s.start, s.duration
       FROM schedule_rows s
       INNER JOIN participants p ON p.id = s.participant_id
       WHERE p.cohort_id = ?`,
      [cohortId]
    );

    const idToName = new Map(
      (participantsRs.rows as unknown as { id: string; name: string }[]).map((p) => [p.id, p.name])
    );

    type Row = {
      participant_id: string;
      subject: string;
      number: string;
      days: string;
      start: string;
      duration: number;
    };
    const rows = rowsRs.rows as unknown as Row[];

    type TimeBucket = {
      days: string;
      start: string;
      duration: number;
      others: Map<string, string>; // id -> name (excludes current user)
    };
    type CourseBucket = {
      course: string;
      subject: string;
      number: string;
      participants: Set<string>; // every distinct person, including current user
      others: Map<string, string>; // id -> name, excludes current user
      times: Map<string, TimeBucket>;
    };

    const courses = new Map<string, CourseBucket>();

    for (const r of rows) {
      const name = idToName.get(r.participant_id);
      if (!name) continue;
      const courseKey = `${r.subject}|${r.number}`;
      if (!courses.has(courseKey)) {
        courses.set(courseKey, {
          course: `${r.subject} ${r.number}`,
          subject: r.subject,
          number: r.number,
          participants: new Set(),
          others: new Map(),
          times: new Map(),
        });
      }
      const bucket = courses.get(courseKey)!;
      bucket.participants.add(r.participant_id);

      const isMe = excludeParticipantId && r.participant_id === excludeParticipantId;
      if (!isMe) {
        bucket.others.set(r.participant_id, name);
        const timeKey = `${r.days}|${r.start}`;
        if (!bucket.times.has(timeKey)) {
          bucket.times.set(timeKey, {
            days: r.days,
            start: r.start,
            duration: r.duration,
            others: new Map(),
          });
        }
        bucket.times.get(timeKey)!.others.set(r.participant_id, name);
      }
    }

    // A class is "shared" only when 2+ distinct people are taking the same subject+number.
    const result = Array.from(courses.values())
      .filter((c) => c.participants.size >= 2)
      .map((c) => ({
        course: c.course,
        subject: c.subject,
        number: c.number,
        count: c.participants.size,
        names: Array.from(c.others.values()).sort().join(", "),
        mine: excludeParticipantId ? c.participants.has(excludeParticipantId) : false,
        times: Array.from(c.times.values())
          .map((t) => ({
            days: t.days,
            start: t.start,
            duration: t.duration,
            count: t.others.size,
            names: Array.from(t.others.values()).sort().join(", "),
          }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count || a.course.localeCompare(b.course));

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
