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

export const MAX_PROPOSALS = 10;

export type ProjectDrawing = {
  id: string;
  name: string;
  role: "existing" | "proposal";
  plan: Plan;
};

export type MultiPlanProject = {
  format: "planform";
  version: 4;
  name: string;
  active: string;
  drawings: ProjectDrawing[];
};

// v3 remains an input format; readers migrate validated v3 files to v4.
export type Project = Plan | ComparisonProject | MultiPlanProject;

export function projectDrawings(project: Project): ProjectDrawing[] {
  if (project.version === 4) return project.drawings;
  if (project.version === 3)
    return planVersions.map((id) => ({
      id,
      name: versionNames[id],
      role: id === "existing" ? "existing" : "proposal",
      plan: project.plans[id],
    }));
  return [
    { id: "existing", name: "Existing", role: "existing", plan: project },
  ];
}

export function activeDrawingId(project: Project): string {
  return project.version === 2 ? "existing" : project.active;
}

export function asMultiProject(project: Project): MultiPlanProject {
  if (project.version === 4) return project;
  return {
    format: "planform",
    version: 4,
    name: project.name,
    active: activeDrawingId(project),
    drawings: projectDrawings(project),
  };
}

export function selectDrawing(project: Project, id: string): MultiPlanProject {
  const next = asMultiProject(project);
  if (!next.drawings.some((drawing) => drawing.id === id))
    throw Error(`Unknown drawing ID "${id}".`);
  return { ...next, active: id };
}

export function addProposal(
  project: Project,
  plan: Plan,
  id: string = crypto.randomUUID(),
): MultiPlanProject {
  const next = asMultiProject(project);
  if (
    next.drawings.filter((d) => d.role === "proposal").length >= MAX_PROPOSALS
  )
    throw Error(`Projects allow up to ${MAX_PROPOSALS} proposals.`);
  if (next.drawings.some((d) => d.id === id))
    throw Error(`Drawing ID "${id}" already exists.`);
  let number = 1;
  while (next.drawings.some((d) => d.name === `Proposal ${number}`)) number++;
  return {
    ...next,
    active: id,
    drawings: [
      ...next.drawings,
      {
        id,
        name: `Proposal ${number}`,
        role: "proposal",
        plan: structuredClone(plan),
      },
    ],
  };
}

export function renameProposal(
  project: Project,
  id: string,
  name: string,
): MultiPlanProject {
  const next = selectDrawing(project, id);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200)
    throw Error("Use a name of 1–200 characters.");
  if (next.drawings.find((d) => d.id === id)!.role !== "proposal")
    throw Error("Only proposals can be renamed.");
  return {
    ...next,
    active: activeDrawingId(project),
    drawings: next.drawings.map((d) =>
      d.id === id ? { ...d, name: trimmed } : d,
    ),
  };
}

export function removeProposal(project: Project, id: string): MultiPlanProject {
  const next = selectDrawing(project, id);
  if (next.drawings.find((d) => d.id === id)!.role !== "proposal")
    throw Error("Existing cannot be deleted.");
  return {
    ...next,
    active:
      activeDrawingId(project) === id
        ? next.drawings.find((d) => d.role === "existing")!.id
        : activeDrawingId(project),
    drawings: next.drawings.filter((d) => d.id !== id),
  };
}

export function activePlan(project: Project): Plan {
  if (project.version === 4) {
    const drawing = project.drawings.find((d) => d.id === project.active);
    if (!drawing) throw Error(`Unknown drawing ID "${project.active}".`);
    return drawing.plan;
  }
  return project.version === 3 ? project.plans[project.active] : project;
}

export function replaceActivePlan(project: Project, plan: Plan): Project {
  if (project.version === 4)
    return {
      ...project,
      drawings: project.drawings.map((d) =>
        d.id === project.active ? { ...d, plan } : d,
      ),
    };
  return project.version === 3
    ? { ...project, plans: { ...project.plans, [project.active]: plan } }
    : plan;
}

export function replaceDrawingPlan(
  project: Project,
  id: string,
  plan: Plan,
): Project {
  const selected = selectDrawing(project, id);
  if (project.version === 2) return plan;
  return {
    ...selected,
    active: activeDrawingId(project),
    drawings: selected.drawings.map((d) => (d.id === id ? { ...d, plan } : d)),
  };
}
