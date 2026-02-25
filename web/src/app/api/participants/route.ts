import { NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";

export async function GET() {
  try {
    await ensureDb();
    const rs = await db.execute("SELECT id, name, major, gender, birthday, phone FROM participants ORDER BY name");
    const rows = rs.rows as unknown as { id: string; name: string; major: string; gender: string; birthday: string; phone: string }[];
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
