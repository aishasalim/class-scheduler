import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { normalizeCohortId } from "@/lib/cohorts";
import { findOrCreateParticipant, slugifyName } from "@/lib/participant-db";

export async function GET(request: NextRequest) {
  try {
    await ensureDb();
    const cohortId = normalizeCohortId(request.nextUrl.searchParams.get("cohort") ?? "K");
    const rs = await db.execute(
      "SELECT id, cohort_id, name, major, gender, birthday, phone FROM participants WHERE cohort_id = ? ORDER BY name",
      [cohortId]
    );
    return NextResponse.json(rs.rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function slugify(name: string): string {
  return slugifyName(name);
}

async function uniqueId(base: string): Promise<string> {
  const safeBase = base || "member";
  let candidate = safeBase;
  let n = 1;
  while (true) {
    const existing = await db.execute("SELECT id FROM participants WHERE id = ?", [candidate]);
    if (existing.rows.length === 0) return candidate;
    n += 1;
    candidate = `${safeBase}-${n}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const body = (await request.json().catch(() => ({}))) as {
      cohort?: string;
      name?: string;
      major?: string;
      gender?: string;
      birthday?: string;
      phone?: string;
      findOrCreate?: boolean;
    };

    const cohortId = normalizeCohortId(String(body.cohort ?? ""));
    const name = String(body.name ?? "").trim();

    if (!cohortId) {
      return NextResponse.json({ error: "Cohort is required." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const cohort = await db.execute("SELECT id FROM cohorts WHERE id = ?", [cohortId]);
    if (cohort.rows.length === 0) {
      return NextResponse.json({ error: `Cohort "${cohortId}" does not exist.` }, { status: 404 });
    }

    if (body.findOrCreate) {
      const participant = await findOrCreateParticipant(cohortId, name);
      return NextResponse.json({
        id: participant.id,
        cohort_id: cohortId,
        name: participant.name,
        created: participant.created,
      });
    }

    const id = await uniqueId(slugify(name));
    const major = String(body.major ?? "").trim();
    const gender = String(body.gender ?? "").trim();
    const birthday = String(body.birthday ?? "").trim();
    const phone = String(body.phone ?? "").trim();

    await db.execute({
      sql: "INSERT INTO participants (id, cohort_id, name, major, gender, birthday, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [id, cohortId, name, major, gender, birthday, phone],
    });

    return NextResponse.json({ id, cohort_id: cohortId, name, major, gender, birthday, phone });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
