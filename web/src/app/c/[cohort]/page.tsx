import { normalizeCohortId } from "@/lib/cohorts";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default async function CohortWorkspacePage({
  params,
}: {
  params: Promise<{ cohort: string }>;
}) {
  const { cohort } = await params;
  const cohortId = normalizeCohortId(cohort);
  return <WorkspaceShell cohortId={cohortId} />;
}
