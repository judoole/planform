import type { Plan } from "./model";

export const planVersions = ["existing", "proposed"] as const;
export type PlanVersion = (typeof planVersions)[number];

export const versionNames = { existing: "Existing", proposed: "Proposed" };

export type ComparisonProject = {
  format: "planform";
  version: 3;
  name: string;
  active: PlanVersion;
  plans: Record<PlanVersion, Plan>;
};

export type Project = Plan | ComparisonProject;

export function activePlan(project: Project): Plan {
  return project.version === 3 ? project.plans[project.active] : project;
}

export function replaceActivePlan(project: Project, plan: Plan): Project {
  return project.version === 3
    ? { ...project, plans: { ...project.plans, [project.active]: plan } }
    : plan;
}
