import { db } from "@/lib/db";
import { normalizeCohortId } from "@/lib/cohorts";

export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueParticipantId(base: string): Promise<string> {
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

/** Find participant by exact name in cohort, or create a minimal roster entry. */
export async function findOrCreateParticipant(
  cohortIdRaw: string,
  fullName: string
): Promise<{ id: string; name: string; created: boolean }> {
  const cohortId = normalizeCohortId(cohortIdRaw);
  const name = fullName.trim();
  if (!cohortId || !name) {
    throw new Error("Cohort and full name are required.");
  }

  const existing = await db.execute(
    "SELECT id, name FROM participants WHERE cohort_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1",
    [cohortId, name]
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return { id: String(row.id), name: String(row.name), created: false };
  }

  const id = await uniqueParticipantId(slugifyName(name));
  await db.execute({
    sql: "INSERT INTO participants (id, cohort_id, name, major, gender, birthday, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, cohortId, name, "", "", "", ""],
  });
  return { id, name, created: true };
}
