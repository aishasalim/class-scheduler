import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const excludeParticipantId = request.nextUrl.searchParams.get("excludeParticipantId") ?? undefined;

    const participantsRs = await db.execute("SELECT id, name FROM participants");
    const rowsRs = await db.execute(
      "SELECT participant_id, subject, number, days, start, duration FROM schedule_rows"
    );

    const idToName = new Map(
      (participantsRs.rows as unknown as { id: string; name: string }[]).map((p) => [p.id, p.name])
    );

    type Row = { participant_id: string; subject: string; number: string; days: string; start: string; duration: number };
    const rows = rowsRs.rows as unknown as Row[];

    const map = new Map<string, { name: string; days: string; start: string; duration: number }[]>();

    for (const r of rows) {
      if (excludeParticipantId && r.participant_id === excludeParticipantId) continue;
      const name = idToName.get(r.participant_id);
      if (!name) continue;
      const course = `${r.subject} ${r.number}`;
      if (!map.has(course)) map.set(course, []);
      map.get(course)!.push({
        name,
        days: r.days,
        start: r.start,
        duration: r.duration,
      });
    }

    const result = Array.from(map.entries(), ([course, others]) => ({ course, others }));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
