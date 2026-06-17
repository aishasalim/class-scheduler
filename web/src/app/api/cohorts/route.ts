import { NextRequest, NextResponse } from "next/server";
import { db, ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export type CohortSummary = {
  id: string;
  name: string;
  semesters: string[];
  // Always populated by the API (GET); optional so other callers that build
  // CohortSummary literals (e.g. workspace-shell) stay valid.
  currentSemester?: string;
  participantCount: number;
};

// Semesters are stored in the `semester` text column as a JSON array.
// Older rows may hold a single plain string (e.g. "Fall 2026") — handle both.
function parseSemesters(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return [s];
}

function serializeSemesters(list: string[]): string {
  const clean = list.map((x) => String(x).trim()).filter(Boolean);
  return JSON.stringify(clean);
}

export async function GET() {
  try {
    await ensureDb();
    const rs = await db.execute(
      `SELECT c.id, c.name, c.semester, c.current_semester, COUNT(p.id) AS participant_count
       FROM cohorts c
       LEFT JOIN participants p ON p.cohort_id = c.id
       GROUP BY c.id, c.name, c.semester, c.current_semester
       ORDER BY c.id`
    );
    const cohorts: CohortSummary[] = rs.rows.map((r) => {
      const semesters = parseSemesters(r.semester);
      const stored = String(r.current_semester ?? "").trim();
      const currentSemester = stored || (semesters.length > 0 ? semesters[0] : "");
      return {
        id: String(r.id),
        name: String(r.name),
        semesters,
        currentSemester,
        participantCount: Number(r.participant_count ?? 0),
      };
    });
    return NextResponse.json(cohorts);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDb();
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      semester?: string;
      password?: string;
    };

    const id = String(body.id ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const semester = String(body.semester ?? "").trim();
    const password = body.password !== undefined ? String(body.password).trim() : undefined;

    if (!id || !/^[A-Z0-9]{1,8}$/.test(id)) {
      return NextResponse.json(
        { error: "Cohort code must be 1–8 letters or numbers (e.g. L, M, 2027)." },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: "Cohort name is required." }, { status: 400 });
    }

    const existing = await db.execute("SELECT id FROM cohorts WHERE id = ?", [id]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: `Cohort "${id}" already exists.` },
        { status: 409 }
      );
    }

    const semesters = semester ? [semester] : [];
    await db.execute({
      sql: "INSERT INTO cohorts (id, name, semester, password) VALUES (?, ?, ?, ?)",
      args: [id, name, serializeSemesters(semesters), password ?? ""],
    });

    return NextResponse.json({ ok: true, id, name, semesters });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureDb();
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      semesters?: unknown;
      currentSemester?: unknown;
      password?: unknown;
    };
    const id = String(body.id ?? "").trim().toUpperCase();

    if (!id) {
      return NextResponse.json({ error: "Cohort id is required." }, { status: 400 });
    }

    const hasSemesters = body.semesters !== undefined;
    const hasCurrentSemester = body.currentSemester !== undefined;
    const hasPassword = body.password !== undefined;

    if (hasSemesters && !Array.isArray(body.semesters)) {
      return NextResponse.json({ error: "semesters must be an array." }, { status: 400 });
    }
    if (!hasSemesters && !hasCurrentSemester && !hasPassword) {
      return NextResponse.json(
        { error: "Provide semesters, currentSemester, and/or password." },
        { status: 400 }
      );
    }

    const existing = await db.execute("SELECT id FROM cohorts WHERE id = ?", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: `Cohort "${id}" does not exist.` }, { status: 404 });
    }

    let semesters: string[] | undefined;
    if (hasSemesters && Array.isArray(body.semesters)) {
      semesters = body.semesters.map((x) => String(x).trim()).filter(Boolean);
      await db.execute({
        sql: "UPDATE cohorts SET semester = ? WHERE id = ?",
        args: [serializeSemesters(semesters), id],
      });
    }

    let currentSemester: string | undefined;
    if (hasCurrentSemester) {
      currentSemester = String(body.currentSemester ?? "").trim();
      await db.execute({
        sql: "UPDATE cohorts SET current_semester = ? WHERE id = ?",
        args: [currentSemester, id],
      });
    }

    if (hasPassword) {
      const password = String(body.password ?? "").trim();
      await db.execute({
        sql: "UPDATE cohorts SET password = ? WHERE id = ?",
        args: [password, id],
      });
    }

    return NextResponse.json({ ok: true, id, semesters, currentSemester, passwordSet: hasPassword });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Admin-only: delete a cohort and cascade its participants + schedule rows.
export async function DELETE(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    await ensureDb();
    const id = String(request.nextUrl.searchParams.get("id") ?? "").trim().toUpperCase();
    if (!id) {
      return NextResponse.json({ error: "Cohort id is required." }, { status: 400 });
    }

    const existing = await db.execute("SELECT id FROM cohorts WHERE id = ?", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: `Cohort "${id}" does not exist.` }, { status: 404 });
    }

    await db.execute(
      `DELETE FROM schedule_rows WHERE participant_id IN
         (SELECT id FROM participants WHERE cohort_id = ?)`,
      [id]
    );
    await db.execute("DELETE FROM participants WHERE cohort_id = ?", [id]);
    await db.execute("DELETE FROM cohorts WHERE id = ?", [id]);

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
