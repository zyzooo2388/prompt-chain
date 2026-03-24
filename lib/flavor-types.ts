import type { FlavorValidationReferenceCatalog } from "@/lib/flavor-health";
import type { StepTemplateKey } from "@/lib/flavor-step-templates";
import type { HumorFlavorRow } from "@/lib/supabase/types";
export type { FlavorValidationReferenceCatalog } from "@/lib/flavor-health";

export type HumorFlavorRecord = HumorFlavorRow & {
  name?: string | null;
  tone?: string | null;
  title?: string | null;
};

export type FlavorStep = {
  id: string;
  humorFlavorId: number;
  orderBy: number;
  humorFlavorStepTypeId: number | null;
  llmInputTypeId: number | null;
  llmOutputTypeId: number | null;
  llmModelId: number | null;
  llmTemperature: number | null;
  description: string | null;
  llmSystemPrompt: string | null;
  llmUserPrompt: string | null;
  stepTemplateKey: StepTemplateKey | null;
  title: string;
  instruction: string;
};

export type HumorFlavor = {
  id: string;
  rowId: number | null;
  sourceRow: HumorFlavorRecord;
  name: string;
  slug: string | null;
  tone: string;
  description: string;
  displayLabel: string;
  steps: FlavorStep[];
};

export type HumorFlavorDraft = Pick<HumorFlavor, "name" | "tone" | "description">;
export type FlavorStepDraft = {
  stepTemplateKey: string;
  orderBy: string;
  humorFlavorStepTypeId: string;
  llmInputTypeId: string;
  llmOutputTypeId: string;
  llmModelId: string;
  llmTemperature: string;
  llmSystemPrompt: string;
  llmUserPrompt: string;
  description: string;
};

export type FlavorStepDraftErrors = Partial<Record<keyof FlavorStepDraft, string>> & {
  form?: string;
};

export type FlavorDataSource = "supabase" | "supabase_error";

export type DashboardFlavorData = {
  flavors: HumorFlavor[];
  source: FlavorDataSource;
  referenceCatalog: FlavorValidationReferenceCatalog;
};
