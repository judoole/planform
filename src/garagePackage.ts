import { garageAreaReport, garageAreas, garageFootprint } from "./garage";
import { garageViewNames, garageViews, garageViewSheet } from "./garageViews";
import type { Plan } from "./model";
import { floorPlanSheet } from "./planSheet";
import {
  defaultSheetOptions,
  layoutSheet,
  sheetPdf,
  type SheetDrawing,
  type SheetOptions,
} from "./sheets";

export const separatePermitDocuments = {
  applicationForm: "Municipal application form",
  neighbourNotice: "Neighbour notification evidence",
  dispensation: "Dispensation request",
  consent: "Required written consent",
  authorities: "Statements from other authorities",
  siteConsiderations: "Other site documentation",
} as const;

export type SeparatePermitDocument = keyof typeof separatePermitDocuments;
type SeparateStatus = "supplied" | "missing" | "notApplicable";

export type GaragePermitDetails = {
  propertyId?: string;
  address?: string;
  description?: string;
  separate?: Partial<Record<SeparatePermitDocument, SeparateStatus>>;
};

export type PermitDocumentStatus = "generated" | SeparateStatus;

export const permitStatusLabels: Record<PermitDocumentStatus, string> = {
  generated: "Generated",
  supplied: "Supplied separately",
  missing: "Missing",
  notApplicable: "Not applicable",
};

export const permitGuideUrl =
  "https://www.levanger.kommune.no/tjenester/arealplan-byggesak-kart-brann-og-eiendom/byggesak/soke-om-byggetiltak-pa-egenhand/";

type PermitFile = {
  filename: string;
} & ({ text: string } | { sheet: SheetDrawing; options: SheetOptions });
export type PermitEntry = {
  title: string;
  status: PermitDocumentStatus;
  detail?: string;
  file?: PermitFile;
};

export type PermitSiteSheet = (plan: Plan, propertyId: string) => SheetDrawing;

function proposedGaragePlan(plan: Plan): Plan {
  // Permit measurements and drawings use the proposed building. Visibility
  // still controls the architectural floor plan, which must show its outline.
  return plan.renovationView &&
    plan.renovationView !== "proposed" &&
    plan.renovationView !== "all"
    ? { ...plan, renovationView: "proposed" }
    : plan;
}

function scaledAttachment(
  title: string,
  build: () => SheetDrawing,
  options: SheetOptions,
): PermitEntry {
  try {
    const sheet = build();
    let settings = options;
    try {
      layoutSheet(sheet, options);
    } catch {
      // Keep the requested physical scale if the drawing needs larger paper.
      settings = { ...options, paper: "A3" };
      layoutSheet(sheet, settings);
    }
    return {
      title,
      status: "generated",
      detail: `${settings.paper} landscape, 1:${settings.scale}`,
      file: {
        filename: `${title} - ${settings.scale}.pdf`,
        sheet,
        options: settings,
      },
    };
  } catch (error) {
    return { title, status: "missing", detail: (error as Error).message };
  }
}

function applicationDraft(plan: Plan): PermitEntry {
  const permit = plan.garage?.permit;
  const propertyId = permit?.propertyId?.trim() || "";
  const description = permit?.description?.trim() || "";
  const missing = [
    !propertyId && "property identifier",
    !description && "project description",
  ].filter(Boolean);
  return {
    title: "Application draft",
    status: missing.length ? "missing" : "generated",
    detail: missing.length
      ? `Starter draft included. Enter the ${missing.join(" and ")}.`
      : undefined,
    file: {
      filename: "Garage permit - Application draft.txt",
      text: [
        "Garage permit application draft",
        "Municipality: Levanger",
        "",
        `Project: ${plan.name}`,
        `Property identifier: ${propertyId || "[Enter cadastral identifiers]"}`,
        `Property address: ${permit?.address?.trim() || "[Enter address]"}`,
        "",
        "Project description",
        description || "[Describe the proposed work]",
        "",
        "Review the attachment checklist and add any separately prepared documentation.",
        "",
      ].join("\n"),
    },
  };
}

export function prepareGaragePackage(
  input: Plan,
  makeSiteSheet: PermitSiteSheet,
) {
  const plan = proposedGaragePlan(input);
  const name = plan.name.trim() || "Garage";
  const propertyId = plan.garage?.permit?.propertyId?.trim() ?? "";
  const options = { ...defaultSheetOptions, name };
  const entries: PermitEntry[] = [
    applicationDraft(plan),
    scaledAttachment(
      "Floor plan - Ground floor",
      () => {
        // Require a garage footprint, even if an ordinary calibrated plan could
        // be plotted by the general purpose sheet tool.
        garageFootprint(plan);
        return floorPlanSheet(plan);
      },
      options,
    ),
    ...garageViews.map((view) =>
      scaledAttachment(
        garageViewNames[view],
        () => garageViewSheet(plan, view),
        options,
      ),
    ),
    scaledAttachment(
      "Site plan",
      () => {
        if (!propertyId)
          throw Error("Enter the property identifier for the site plan.");
        return makeSiteSheet(plan, propertyId);
      },
      { ...options, scale: 500 },
    ),
  ];
  try {
    const { bra, bya } = garageAreas(plan);
    entries.push({
      title: "Area calculation",
      status: "generated",
      detail:
        bra.notes.length || bya.notes.length
          ? "Provisional values. Review unresolved area inputs in the calculation."
          : undefined,
      file: {
        filename: "Garage area calculation - BRA and BYA.txt",
        text: garageAreaReport(plan),
      },
    });
  } catch (error) {
    entries.push({
      title: "Area calculation",
      status: "missing",
      detail: (error as Error).message,
    });
  }
  for (const key of Object.keys(
    separatePermitDocuments,
  ) as SeparatePermitDocument[]) {
    entries.push({
      title: separatePermitDocuments[key],
      status: plan.garage?.permit?.separate?.[key] ?? "missing",
    });
  }
  return { name, propertyId, entries };
}

const checklistFilename = "Garage permit - Attachment checklist.txt";

function attachmentChecklist(
  name: string,
  propertyId: string,
  entries: PermitEntry[],
) {
  return [
    "Garage permit attachment checklist",
    `Project: ${name}`,
    `Property identifier: ${propertyId || "Missing"}`,
    "",
    ...entries.flatMap((entry) => [
      `[${permitStatusLabels[entry.status]}] ${entry.title}`,
      ...(entry.file ? [`  ${entry.file.filename}`] : []),
      ...(entry.detail ? [`  ${entry.detail}`] : []),
    ]),
    `[Generated] Attachment checklist\n  ${checklistFilename}`,
    "",
    `Levanger documentation guide: ${permitGuideUrl}`,
    "",
  ].join("\n");
}

function zipFilename(name: string) {
  const safeName = name
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 120);
  return `${safeName || "Garage"} - Permit application.zip`;
}

export async function garagePackageZip(
  value: ReturnType<typeof prepareGaragePackage>,
) {
  const { strToU8, zipSync } = await import("fflate");
  const { name, propertyId, entries } = value;
  const files: Record<string, Uint8Array> = {};
  const written: PermitEntry[] = [];
  for (const entry of entries) {
    const file = entry.file;
    if (file) {
      try {
        files[file.filename] =
          "text" in file
            ? strToU8(file.text)
            : new Uint8Array(
                await (await sheetPdf(file.sheet, file.options)).arrayBuffer(),
              );
      } catch (error) {
        written.push({
          ...entry,
          status: "missing",
          file: undefined,
          detail: (error as Error).message,
        });
        continue;
      }
    }
    written.push(entry);
  }
  files[checklistFilename] = strToU8(
    attachmentChecklist(name, propertyId, written),
  );
  const bytes = zipSync(files, { level: 0 });
  return {
    blob: new Blob([Uint8Array.from(bytes).buffer], {
      type: "application/zip",
    }),
    name: zipFilename(name),
    missing: written.filter((entry) => entry.status === "missing"),
  };
}
