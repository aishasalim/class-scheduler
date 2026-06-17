import { db } from "@/lib/db";
import { normalizeCohortId } from "@/lib/cohorts";

export type CohortAuthResult =
  | { ok: true; cohortId: string }
  | { ok: false; status: 401 | 404; error: string };

/** Validate cohort exists and submitted password matches stored value. */
export async function validateCohortPassword(
  cohortIdRaw: string,
  password: string
): Promise<CohortAuthResult> {
  const cohortId = normalizeCohortId(cohortIdRaw);
  if (!cohortId) {
    return { ok: false, status: 404, error: "Cohort is required." };
  }

  const rs = await db.execute("SELECT id, password FROM cohorts WHERE id = ?", [cohortId]);
  if (rs.rows.length === 0) {
    return { ok: false, status: 404, error: `Cohort "${cohortId}" does not exist.` };
  }

  const stored = String(rs.rows[0].password ?? "").trim();
  const submitted = String(password ?? "").trim();

  if (!stored) {
    return {
      ok: false,
      status: 401,
      error: "This cohort has no import password yet. Ask your facilitator to set one.",
    };
  }
  if (submitted !== stored) {
    return { ok: false, status: 401, error: "Wrong cohort password." };
  }

  return { ok: true, cohortId };
}
