import { NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { PARTICIPANTS } from "@/lib/participants-data";

export async function POST() {
  try {
    await ensureDb();
    const existing = await db.execute("SELECT 1 FROM participants LIMIT 1");
    if (existing.rows.length > 0) {
      return NextResponse.json({ ok: true, seeded: false, message: "Already seeded" });
    }
    for (const p of PARTICIPANTS) {
      await db.execute({
        sql: "INSERT INTO participants (id, name, major, gender, birthday, phone) VALUES (?, ?, ?, ?, ?, ?)",
        args: [p.id, p.name, p.major, p.gender, p.birthday, p.phone],
      });
    }
    return NextResponse.json({ ok: true, seeded: true, count: PARTICIPANTS.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
