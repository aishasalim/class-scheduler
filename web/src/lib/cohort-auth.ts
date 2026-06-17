import { db } from "@/lib/db";
import { cohortImportPassword, normalizeCohortId } from "@/lib/cohorts";

export type CohortAuthResult =
  | { ok: true; cohortId: string }
  | { ok: false; status: 401 | 404; error: string };

/**
 * Validate that the cohort exists and the submitted password matches the
 * hardcoded value derived from the cohort code (cohort-<code>-superpassword).
 */
export async function validateCohortPassword(
  cohortIdRaw: string,
  password: string
): Promise<CohortAuthResult> {
  const cohortId = normalizeCohortId(cohortIdRaw);
  if (!cohortId) {
    return { ok: false, status: 404, error: "Cohort is required." };
  }

  const rs = await db.execute("SELECT id FROM cohorts WHERE id = ?", [cohortId]);
  if (rs.rows.length === 0) {
    return { ok: false, status: 404, error: `Cohort "${cohortId}" does not exist.` };
  }

  const expected = cohortImportPassword(cohortId);
  const submitted = String(password ?? "").trim();

  if (submitted !== expected) {
    return { ok: false, status: 401, error: "Wrong cohort password." };
  }

  return { ok: true, cohortId };
}
