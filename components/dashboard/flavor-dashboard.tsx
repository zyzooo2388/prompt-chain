'use client';

import { useCallback, useEffect, useState } from "react";

import type { StepLookupOption } from "@/components/dashboard/step-form";
import { FlavorDetails } from "@/components/dashboard/flavor-details";
import { FlavorList } from "@/components/dashboard/flavor-list";
import { Panel } from "@/components/dashboard/panel";
import { StepsPanel } from "@/components/dashboard/steps-panel";
import { TestPanel } from "@/components/dashboard/test-panel";
import { getFlavorAuditById } from "@/lib/flavor-audit";
import {
  parseStepTemplateKey,
  STEP_TEMPLATE_BY_KEY,
  stripStepTemplateMarker,
  withStepTemplateMarker,
} from "@/lib/flavor-step-templates";
import type {
  FlavorDataSource,
  FlavorStepDraft,
  FlavorStepDraftErrors,
  FlavorValidationReferenceCatalog,
  HumorFlavor,
  HumorFlavorRecord,
  HumorFlavorDraft,
} from "@/lib/flavor-types";
import { supabase } from "@/lib/supabase/client";
import type {
  HumorFlavorInsert,
  HumorFlavorStepInsert,
  HumorFlavorStepRow,
  HumorFlavorStepUpdate,
  HumorFlavorUpdate,
} from "@/lib/supabase/types";

type FlavorDashboardProps = {
  initialFlavors: HumorFlavor[];
  initialSelectedFlavorId: string | null;
  flavorSource: FlavorDataSource;
  referenceCatalog: FlavorValidationReferenceCatalog;
};

const emptyFlavorDraft: HumorFlavorDraft = {
  name: "",
  tone: "",
  description: "",
};

const emptyStepDraft: FlavorStepDraft = {
  stepTemplateKey: "",
  orderBy: "",
  humorFlavorStepTypeId: "",
  llmInputTypeId: "",
  llmOutputTypeId: "",
  llmModelId: "",
  llmTemperature: "",
  llmSystemPrompt: "",
  llmUserPrompt: "",
  description: "",
};

type StepPanelRow = Pick<
  HumorFlavorStepRow,
  | "id"
  | "humor_flavor_id"
  | "order_by"
  | "humor_flavor_step_type_id"
  | "llm_input_type_id"
  | "llm_output_type_id"
  | "llm_model_id"
  | "llm_temperature"
  | "llm_system_prompt"
  | "llm_user_prompt"
  | "description"
>;

type StepPayload = {
  stepTemplateKey: string | null;
  orderBy: number;
  humorFlavorStepTypeId: number;
  llmInputTypeId: number;
  llmOutputTypeId: number;
  llmModelId: number;
  llmTemperature: number;
  llmSystemPrompt: string;
  llmUserPrompt: string;
  description: string;
};

type SelectedFlavorBinding = {
  id: number;
  name: string;
  slug: string | null;
  summary: string;
};

type StepActionFeedback = {
  tone: "info" | "success" | "error";
  message: string;
};

type FlavorActionFeedback = {
  tone: "info" | "success" | "error";
  message: string;
};

const stepPanelSelect =
  "id, humor_flavor_id, order_by, humor_flavor_step_type_id, llm_input_type_id, llm_output_type_id, llm_model_id, llm_temperature, llm_system_prompt, llm_user_prompt, description";

const duplicateFlavorExcludedFields = new Set([
  "id",
  "created_datetime_utc",
  "modified_datetime_utc",
  "validation_cache",
  "validation_cache_json",
  "validation_cache_updated_at",
  "last_validated_at",
]);

const duplicateStepExcludedFields = new Set([
  "id",
  "created_datetime_utc",
  "modified_datetime_utc",
]);

function humanizeSlug(slug: string | null) {
  if (!slug) {
    return null;
  }

  return slug
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildLookupLabel(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" - ");
}

function slugifyFlavorName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function shouldExcludeDuplicateFlavorField(key: string) {
  if (duplicateFlavorExcludedFields.has(key)) {
    return true;
  }

  return /validation.*cache|cache.*validation/i.test(key);
}

function stripCopySuffix(value: string) {
  return value.replace(/-copy(?:-\d+)?$/i, "");
}

function buildDuplicateFlavorBaseName(sourceFlavorRow: Record<string, unknown>, selectedFlavor: HumorFlavor | null) {
  const candidates = [
    typeof sourceFlavorRow.slug === "string" ? sourceFlavorRow.slug : null,
    selectedFlavor?.slug ?? null,
    typeof sourceFlavorRow.description === "string" ? sourceFlavorRow.description : null,
    selectedFlavor?.description ?? null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = slugifyFlavorName(candidate);
    if (normalized) {
      return stripCopySuffix(normalized) || "flavor";
    }
  }

  const sourceFlavorId = typeof sourceFlavorRow.id === "number" ? sourceFlavorRow.id : Number(sourceFlavorRow.id);
  if (Number.isInteger(sourceFlavorId) && sourceFlavorId > 0) {
    return `flavor-${sourceFlavorId}`;
  }

  return "flavor";
}

function collectExistingFlavorSlugs(flavorRows: Record<string, unknown>[]) {
  const existingSlugs = new Set<string>();

  for (const row of flavorRows) {
    if (typeof row.slug !== "string") {
      continue;
    }

    const normalized = slugifyFlavorName(row.slug);
    if (normalized) {
      existingSlugs.add(normalized);
    }
  }

  return existingSlugs;
}

function buildUniqueDuplicateFlavorSlug(
  sourceFlavorRow: Record<string, unknown>,
  flavorRows: Record<string, unknown>[],
  selectedFlavor: HumorFlavor | null,
) {
  const existingSlugs = collectExistingFlavorSlugs(flavorRows);
  const baseName = buildDuplicateFlavorBaseName(sourceFlavorRow, selectedFlavor);
  const initialCandidate = `${baseName}-copy`;

  if (!existingSlugs.has(initialCandidate)) {
    return initialCandidate;
  }

  let suffix = 2;
  while (existingSlugs.has(`${baseName}-copy-${suffix}`)) {
    suffix += 1;
  }

  return `${baseName}-copy-${suffix}`;
}

function omitFields(row: Record<string, unknown>, shouldOmit: (key: string) => boolean) {
  const nextRow: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (!shouldOmit(key)) {
      nextRow[key] = value;
    }
  }

  return nextRow;
}

const stepFieldLabels: Record<keyof FlavorStepDraft, string> = {
  stepTemplateKey: "Step template",
  orderBy: "Order",
  humorFlavorStepTypeId: "Step type",
  llmInputTypeId: "LLM input type",
  llmOutputTypeId: "LLM output type",
  llmModelId: "LLM model",
  llmTemperature: "LLM temperature",
  llmSystemPrompt: "LLM system prompt",
  llmUserPrompt: "LLM user prompt",
  description: "Description",
};

function fieldIsRequiredMessage(field: keyof FlavorStepDraft) {
  return `${stepFieldLabels[field]} is required.`;
}

function mapStepRowToFlavorStep(step: StepPanelRow): HumorFlavor["steps"][number] {
  const description = step.description?.trim() ?? null;
  const llmUserPrompt = step.llm_user_prompt?.trim() ?? null;
  const llmSystemPrompt = step.llm_system_prompt?.trim() ?? null;
  const stepTemplateKey = parseStepTemplateKey(description);
  const cleanedDescription = stripStepTemplateMarker(description);

  return {
    id: String(step.id),
    humorFlavorId: step.humor_flavor_id,
    orderBy: step.order_by,
    humorFlavorStepTypeId: step.humor_flavor_step_type_id,
    llmInputTypeId: step.llm_input_type_id,
    llmOutputTypeId: step.llm_output_type_id,
    llmModelId: step.llm_model_id,
    llmTemperature: step.llm_temperature,
    description: cleanedDescription || null,
    llmUserPrompt,
    llmSystemPrompt,
    stepTemplateKey: stepTemplateKey as HumorFlavor["steps"][number]["stepTemplateKey"],
    title: cleanedDescription || `Step ${step.order_by}`,
    instruction: llmUserPrompt || llmSystemPrompt || "",
  };
}

function parsePositiveInteger(value: string, field: keyof FlavorStepDraft, errors: FlavorStepDraftErrors) {
  const normalized = value.trim();
  if (!normalized) {
    errors[field] = fieldIsRequiredMessage(field);
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors[field] = "Enter a positive whole number.";
    return null;
  }

  return parsed;
}

function parseNumber(value: string, field: keyof FlavorStepDraft, errors: FlavorStepDraftErrors) {
  const normalized = value.trim();
  if (!normalized) {
    errors[field] = fieldIsRequiredMessage(field);
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    errors[field] = "Enter a valid number.";
    return null;
  }

  return parsed;
}

function parseText(value: string, field: keyof FlavorStepDraft, errors: FlavorStepDraftErrors) {
  const normalized = value.trim();
  if (!normalized) {
    errors[field] = fieldIsRequiredMessage(field);
    return null;
  }

  return normalized;
}

function validateStepDraft(value: FlavorStepDraft): { errors: FlavorStepDraftErrors; payload: StepPayload | null } {
  const errors: FlavorStepDraftErrors = {};

  const orderBy = parsePositiveInteger(value.orderBy, "orderBy", errors);
  const humorFlavorStepTypeId = parsePositiveInteger(
    value.humorFlavorStepTypeId,
    "humorFlavorStepTypeId",
    errors,
  );
  const llmInputTypeId = parsePositiveInteger(value.llmInputTypeId, "llmInputTypeId", errors);
  const llmOutputTypeId = parsePositiveInteger(value.llmOutputTypeId, "llmOutputTypeId", errors);
  const llmModelId = parsePositiveInteger(value.llmModelId, "llmModelId", errors);
  const llmTemperature = parseNumber(value.llmTemperature, "llmTemperature", errors);
  const llmSystemPrompt = parseText(value.llmSystemPrompt, "llmSystemPrompt", errors);
  const llmUserPrompt = parseText(value.llmUserPrompt, "llmUserPrompt", errors);
  const description = parseText(value.description, "description", errors);
  const stepTemplateKey = value.stepTemplateKey.trim();
  if (stepTemplateKey && !STEP_TEMPLATE_BY_KEY.has(stepTemplateKey)) {
    errors.form = `Unknown step template key: ${stepTemplateKey}`;
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      payload: null,
    };
  }

  return {
    errors,
    payload: {
      orderBy: orderBy!,
      stepTemplateKey: stepTemplateKey || null,
      humorFlavorStepTypeId: humorFlavorStepTypeId!,
      llmInputTypeId: llmInputTypeId!,
      llmOutputTypeId: llmOutputTypeId!,
      llmModelId: llmModelId!,
      llmTemperature: llmTemperature!,
      llmSystemPrompt: llmSystemPrompt!,
      llmUserPrompt: llmUserPrompt!,
      description: description!,
    },
  };
}

function toStepDraft(step: HumorFlavor["steps"][number]): FlavorStepDraft {
  return {
    stepTemplateKey: step.stepTemplateKey ?? "",
    orderBy: String(step.orderBy),
    humorFlavorStepTypeId: step.humorFlavorStepTypeId ? String(step.humorFlavorStepTypeId) : "",
    llmInputTypeId: step.llmInputTypeId ? String(step.llmInputTypeId) : "",
    llmOutputTypeId: step.llmOutputTypeId ? String(step.llmOutputTypeId) : "",
    llmModelId: step.llmModelId ? String(step.llmModelId) : "",
    llmTemperature: step.llmTemperature !== null ? String(step.llmTemperature) : "",
    llmSystemPrompt: step.llmSystemPrompt ?? "",
    llmUserPrompt: step.llmUserPrompt ?? "",
    description: step.description ?? "",
  };
}

function createNewStepDraft(flavor: HumorFlavor): FlavorStepDraft {
  const nextOrderBy =
    flavor.steps.reduce((maxOrder, step) => Math.max(maxOrder, step.orderBy), 0) + 1;

  return {
    ...emptyStepDraft,
    stepTemplateKey: "",
    orderBy: String(nextOrderBy),
    llmTemperature: "0.7",
  };
}

function resolveNumericFlavorId(flavor: HumorFlavor | null, selectedFlavorId: string | null = null): number | null {
  if (flavor && Number.isInteger(flavor.sourceRow.id) && flavor.sourceRow.id > 0) {
    return flavor.sourceRow.id;
  }

  if (flavor && Number.isInteger(flavor.rowId) && (flavor.rowId ?? 0) > 0) {
    return flavor.rowId;
  }

  const candidates = [flavor?.id ?? null, selectedFlavorId];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const parsedId = Number(candidate.trim());
    if (Number.isInteger(parsedId) && parsedId > 0) {
      return parsedId;
    }
  }

  return null;
}

function resolveSelectedFlavorBinding(
  flavor: HumorFlavor | null,
  numericFlavorId: number | null,
): SelectedFlavorBinding | null {
  if (!flavor || !numericFlavorId) {
    return null;
  }

  const displayName = flavor.slug?.trim() || flavor.name.trim() || `Flavor ${numericFlavorId}`;

  return {
    id: numericFlavorId,
    name: displayName,
    slug: flavor.slug,
    summary: `Humor Flavor: ${displayName} (#${numericFlavorId})`,
  };
}

function mapFlavorRecordToDashboardFlavor(
  flavorRow: HumorFlavorRecord,
  existingSteps: HumorFlavor["steps"] = [],
): HumorFlavor {
  const description = flavorRow.description?.trim() ?? "";
  const slugLabel = humanizeSlug(flavorRow.slug);
  const slugIdentifier = flavorRow.slug?.trim() || null;
  const displayName = slugLabel || slugIdentifier || description || `Flavor ${flavorRow.id}`;
  const tone = slugLabel || slugIdentifier || description || `Flavor ${flavorRow.id}`;

  return {
    id: String(flavorRow.id),
    rowId: flavorRow.id,
    sourceRow: flavorRow,
    name: displayName,
    slug: flavorRow.slug,
    tone,
    description,
    displayLabel: slugIdentifier || displayName,
    steps: existingSteps,
  };
}

function toFlavorRecord(rawValue: Record<string, unknown>): HumorFlavorRecord | null {
  const idValue = rawValue.id;
  const numericId = typeof idValue === "number" ? idValue : Number(idValue);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return {
    id: numericId,
    slug: typeof rawValue.slug === "string" ? rawValue.slug : null,
    description: typeof rawValue.description === "string" ? rawValue.description : "",
    created_datetime_utc:
      typeof rawValue.created_datetime_utc === "string" ? rawValue.created_datetime_utc : "",
    created_by_user_id:
      typeof rawValue.created_by_user_id === "string" ? rawValue.created_by_user_id : null,
    modified_by_user_id:
      typeof rawValue.modified_by_user_id === "string" ? rawValue.modified_by_user_id : null,
    modified_datetime_utc:
      typeof rawValue.modified_datetime_utc === "string" ? rawValue.modified_datetime_utc : null,
  };
}

function createFlavorSlug(value: HumorFlavorDraft, currentSlug: string | null = null) {
  const baseSource = value.name.trim() || value.tone.trim() || currentSlug || "humor-flavor";
  const baseSlug = baseSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  return (baseSlug || "humor-flavor").slice(0, 80);
}

async function insertFlavorWithFallback(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fullInsertResult = await supabase
    .schema("public")
    .from("humor_flavors")
    .insert(payload as HumorFlavorInsert)
    .select("*")
    .single();

  if (!fullInsertResult.error && fullInsertResult.data) {
    return fullInsertResult.data as Record<string, unknown>;
  }

  const fallbackPayload = {
    description: typeof payload.description === "string" ? payload.description : "",
    slug: typeof payload.slug === "string" ? payload.slug : null,
    created_by_user_id: payload.created_by_user_id,
    modified_by_user_id: payload.modified_by_user_id,
    created_datetime_utc: payload.created_datetime_utc,
    modified_datetime_utc: payload.modified_datetime_utc,
  } satisfies Record<string, unknown>;

  const fallbackInsertResult = await supabase
    .schema("public")
    .from("humor_flavors")
    .insert(fallbackPayload as HumorFlavorInsert)
    .select("*")
    .single();

  if (fallbackInsertResult.error || !fallbackInsertResult.data) {
    throw new Error(
      fallbackInsertResult.error?.message ??
        fullInsertResult.error?.message ??
        "Failed creating humor flavor.",
    );
  }

  return fallbackInsertResult.data as Record<string, unknown>;
}

async function updateFlavorWithFallback(
  numericFlavorId: number,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fullUpdateResult = await supabase
    .schema("public")
    .from("humor_flavors")
    .update(payload as HumorFlavorUpdate)
    .eq("id", numericFlavorId)
    .select("*")
    .single();

  if (!fullUpdateResult.error && fullUpdateResult.data) {
    return fullUpdateResult.data as Record<string, unknown>;
  }

  const fallbackPayload = {
    description: typeof payload.description === "string" ? payload.description : "",
    slug: typeof payload.slug === "string" ? payload.slug : null,
    modified_by_user_id: payload.modified_by_user_id,
    modified_datetime_utc: payload.modified_datetime_utc,
  } satisfies Record<string, unknown>;

  const fallbackUpdateResult = await supabase
    .schema("public")
    .from("humor_flavors")
    .update(fallbackPayload as HumorFlavorUpdate)
    .eq("id", numericFlavorId)
    .select("*")
    .single();

  if (fallbackUpdateResult.error || !fallbackUpdateResult.data) {
    throw new Error(
      fallbackUpdateResult.error?.message ??
        fullUpdateResult.error?.message ??
        "Failed updating humor flavor.",
    );
  }

  return fallbackUpdateResult.data as Record<string, unknown>;
}

export function FlavorDashboard({
  initialFlavors,
  initialSelectedFlavorId,
  flavorSource,
  referenceCatalog,
}: FlavorDashboardProps) {
  const supabaseImportReady = Boolean(supabase);
  const [flavors, setFlavors] = useState(initialFlavors);
  const [selectedFlavor, setSelectedFlavor] = useState<HumorFlavor | null>(
    initialFlavors.find((flavor) => flavor.id === (initialSelectedFlavorId ?? initialFlavors[0]?.id ?? "")) ??
      initialFlavors[0] ??
      null,
  );
  const [flavorEditorMode, setFlavorEditorMode] = useState<"idle" | "create" | "edit">("idle");
  const [stepEditorMode, setStepEditorMode] = useState<"idle" | "create" | "edit">("idle");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepFormErrors, setStepFormErrors] = useState<FlavorStepDraftErrors>({});
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);
  const [flavorActionFeedback, setFlavorActionFeedback] = useState<FlavorActionFeedback | null>(null);
  const [isDuplicatingFlavor, setIsDuplicatingFlavor] = useState(false);
  const [stepActionFeedback, setStepActionFeedback] = useState<StepActionFeedback | null>(null);

  const selectedFlavorId = selectedFlavor?.id ?? null;
  const selectedFlavorNumericId = resolveNumericFlavorId(selectedFlavor, selectedFlavorId);
  const flavorAuditById = getFlavorAuditById(flavors, referenceCatalog);
  const stepTypeOptions: StepLookupOption[] = referenceCatalog.humorFlavorStepTypes.map((stepType) => ({
    value: String(stepType.id),
    label: `${buildLookupLabel(humanizeSlug(stepType.slug), stepType.description) || `Step Type`} (#${stepType.id})`,
    description: stepType.description,
  }));
  const llmModelOptions: StepLookupOption[] = referenceCatalog.llmModels.map((model) => ({
    value: String(model.id),
    label: `${buildLookupLabel(model.name, model.providerModelId) || "Model"} (#${model.id})`,
  }));
  const llmInputTypeOptions: StepLookupOption[] = referenceCatalog.llmInputTypes.map((inputType) => ({
    value: String(inputType.id),
    label: `${buildLookupLabel(inputType.description, humanizeSlug(inputType.slug)) || "Input Type"} (#${inputType.id})`,
    description: inputType.description,
  }));
  const llmOutputTypeOptions: StepLookupOption[] = referenceCatalog.llmOutputTypes.map((outputType) => ({
    value: String(outputType.id),
    label: `${buildLookupLabel(outputType.description, humanizeSlug(outputType.slug)) || "Output Type"} (#${outputType.id})`,
    description: outputType.description,
  }));

  const refreshFlavorsFromSupabase = useCallback(
    async (preferredFlavorId: string | null = null) => {
      const { data: flavorData, error: flavorError } = await supabase
        .schema("public")
        .from("humor_flavors")
        .select("*")
        .order("created_datetime_utc", { ascending: true });

      if (flavorError) {
        throw new Error(flavorError.message);
      }

      const { data: stepData, error: stepError } = await supabase
        .schema("public")
        .from("humor_flavor_steps")
        .select(stepPanelSelect)
        .order("humor_flavor_id", { ascending: true })
        .order("order_by", { ascending: true });

      if (stepError) {
        throw new Error(stepError.message);
      }

      const flavorRows = ((flavorData ?? []) as Record<string, unknown>[])
        .map(toFlavorRecord)
        .filter((row): row is HumorFlavorRecord => Boolean(row));
      const stepRowsByFlavorId = new Map<string, HumorFlavor["steps"]>();

      for (const row of (stepData ?? []) as StepPanelRow[]) {
        const key = String(row.humor_flavor_id);
        const rows = stepRowsByFlavorId.get(key) ?? [];
        rows.push(mapStepRowToFlavorStep(row));
        stepRowsByFlavorId.set(key, rows);
      }

      const latestFlavors = flavorRows.map((row) =>
        mapFlavorRecordToDashboardFlavor(row, stepRowsByFlavorId.get(String(row.id)) ?? []),
      );

      setFlavors(latestFlavors);
      setSelectedFlavor((current) => {
        const nextTargetFlavorId = preferredFlavorId?.trim() || current?.id || "";
        return latestFlavors.find((flavor) => flavor.id === nextTargetFlavorId) ?? latestFlavors[0] ?? null;
      });
    },
    [],
  );

  async function getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) {
      throw new Error("You must be logged in to create or edit humor flavor steps.");
    }

    return data.user.id;
  }

  async function loadFlavorSteps(flavorId: string, numericFlavorIdFromBinding?: number | null) {
    setIsLoadingSteps(true);

    try {
      const numericFlavorId =
        typeof numericFlavorIdFromBinding === "number" && Number.isInteger(numericFlavorIdFromBinding)
          ? numericFlavorIdFromBinding
          : Number(flavorId);
      if (!Number.isFinite(numericFlavorId) || numericFlavorId <= 0) {
        console.warn("[flavor-dashboard] could not resolve selected flavor id for step query", {
          selectedFlavorId: flavorId,
          numericFlavorIdFromBinding,
        });
        setStepActionFeedback({
          tone: "error",
          message: "Could not resolve the selected humor flavor id.",
        });
        return;
      }

      console.info("[flavor-dashboard] step query payload/filter", {
        table: "public.humor_flavor_steps",
        select: stepPanelSelect,
        filter: { humor_flavor_id: numericFlavorId },
        orderBy: "order_by asc",
      });
      const { data, error } = await supabase
        .schema("public")
        .from("humor_flavor_steps")
        .select(stepPanelSelect)
        .eq("humor_flavor_id", numericFlavorId)
        .order("order_by", { ascending: true });

      if (error) {
        console.error("[flavor-dashboard] failed querying selected flavor steps", {
          table: "public.humor_flavor_steps",
          selectedFlavorId: flavorId,
          select: stepPanelSelect,
          foreignKeyField: "humor_flavor_id",
          orderClause: "order_by asc",
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setStepActionFeedback({
          tone: "error",
          message: "Failed loading humor flavor steps.",
        });
        return;
      }

      const rows = (data ?? []) as StepPanelRow[];
      console.info("[flavor-dashboard] queried selected flavor step count", {
        table: "public.humor_flavor_steps",
        selectedFlavorId: flavorId,
        numericFlavorId,
        queriedStepCount: rows.length,
      });
      const mappedSteps = rows.map(mapStepRowToFlavorStep);

      setFlavors((current) =>
        current.map((flavor) => (flavor.id === flavorId ? { ...flavor, steps: mappedSteps } : flavor)),
      );
    } finally {
      setIsLoadingSteps(false);
    }
  }

  async function saveFlavorToSupabase(value: HumorFlavorDraft) {
    const userId = await getCurrentUserId();
    const nowIso = new Date().toISOString();
    const slug = createFlavorSlug(value, selectedFlavor?.slug ?? null);
    const fullPayload = {
      name: value.name.trim(),
      title: value.name.trim(),
      tone: value.tone.trim(),
      description: value.description.trim(),
      slug,
      created_by_user_id: userId,
      modified_by_user_id: userId,
      created_datetime_utc: nowIso,
      modified_datetime_utc: nowIso,
    } satisfies Record<string, unknown>;

    if (flavorEditorMode === "create") {
      const data = await insertFlavorWithFallback(fullPayload);
      const flavorRow = toFlavorRecord(data);
      if (!flavorRow) {
        throw new Error("Created humor flavor row is invalid.");
      }

      return mapFlavorRecordToDashboardFlavor(flavorRow);
    }

    if (!selectedFlavorNumericId) {
      throw new Error("Could not determine the selected humor flavor id.");
    }

    const updatePayload = {
      name: value.name.trim(),
      title: value.name.trim(),
      tone: value.tone.trim(),
      description: value.description.trim(),
      slug,
      modified_by_user_id: userId,
      modified_datetime_utc: nowIso,
    } satisfies Record<string, unknown>;

    const data = await updateFlavorWithFallback(selectedFlavorNumericId, updatePayload);
    const flavorRow = toFlavorRecord(data);
    if (!flavorRow) {
      throw new Error("Updated humor flavor row is invalid.");
    }

    return mapFlavorRecordToDashboardFlavor(flavorRow, selectedFlavor?.steps ?? []);
  }

  useEffect(() => {
    if (!selectedFlavorId) {
      setIsLoadingSteps(false);
      return;
    }

    const selectedFlavorIdValue = selectedFlavorId;
    const numericSelectedFlavorId = selectedFlavorNumericId;

    async function loadSelectedFlavorSteps() {
      await loadFlavorSteps(selectedFlavorIdValue, numericSelectedFlavorId);
    }

    void loadSelectedFlavorSteps();
  }, [selectedFlavorId, selectedFlavorNumericId]);

  useEffect(() => {
    void refreshFlavorsFromSupabase(initialSelectedFlavorId ?? null);
  }, [initialSelectedFlavorId, refreshFlavorsFromSupabase]);

  useEffect(() => {
    const channel = supabase
      .channel("flavor-dashboard-live-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "humor_flavors" },
        () => {
          void refreshFlavorsFromSupabase();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "humor_flavor_steps" },
        () => {
          void refreshFlavorsFromSupabase();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshFlavorsFromSupabase]);

  useEffect(() => {
    if (!selectedFlavor) {
      return;
    }

    const selectedFlavorMatch = flavors.find((flavor) =>
      selectedFlavor.rowId
        ? flavor.rowId === selectedFlavor.rowId
        : flavor.id === selectedFlavor.id,
    );

    if (selectedFlavorMatch && selectedFlavorMatch !== selectedFlavor) {
      setSelectedFlavor(selectedFlavorMatch);
    }

    if (!selectedFlavorMatch && flavors.length === 0) {
      setSelectedFlavor(null);
    }
  }, [flavors, selectedFlavor]);

  useEffect(() => {
    console.info("[flavor-dashboard] raw selected flavor row from query", selectedFlavor?.sourceRow ?? null);
    console.info("[flavor-dashboard] selected flavor state object", selectedFlavor);
  }, [selectedFlavor]);

  const flavorDraft: HumorFlavorDraft =
    flavorEditorMode === "edit" && selectedFlavor
      ? {
          name: selectedFlavor.name,
          tone: selectedFlavor.tone,
          description: selectedFlavor.description,
        }
      : emptyFlavorDraft;

  const stepDraft: FlavorStepDraft =
    stepEditorMode === "edit" && selectedFlavor && editingStepId
      ? (() => {
          const step = selectedFlavor.steps.find((item) => item.id === editingStepId);
          return step ? toStepDraft(step) : emptyStepDraft;
        })()
      : stepEditorMode === "create" && selectedFlavor
        ? createNewStepDraft(selectedFlavor)
        : emptyStepDraft;

  const selectedStepFlavorBinding = resolveSelectedFlavorBinding(selectedFlavor, selectedFlavorNumericId);

  function resetStepEditor(clearFeedback = false) {
    setStepEditorMode("idle");
    setEditingStepId(null);
    setStepFormErrors({});
    if (clearFeedback) {
      setStepActionFeedback(null);
    }
  }

  function handleSelectFlavor(id: string) {
    const clickedFlavor = flavors.find((flavor) => flavor.id === id) ?? null;
    console.info("[flavor-dashboard] selected flavor from flavor card click", {
      rawSelectedFlavorRow: clickedFlavor?.sourceRow ?? null,
      selectedFlavor: clickedFlavor,
    });

    setFlavorActionFeedback(null);
    setStepActionFeedback(null);
    setSelectedFlavor(clickedFlavor);
    setFlavorEditorMode("idle");
    resetStepEditor(true);
  }

  function handleCreateFlavor() {
    setFlavorActionFeedback(null);
    setStepActionFeedback(null);
    setFlavorEditorMode("create");
    resetStepEditor(true);
  }

  function handleEditFlavor() {
    if (!selectedFlavor) {
      return;
    }

    setFlavorActionFeedback(null);
    setStepActionFeedback(null);
    setFlavorEditorMode("edit");
    resetStepEditor(true);
  }

  async function handleDeleteFlavor() {
    if (!selectedFlavor) {
      return;
    }

    setFlavorActionFeedback(null);
    if (selectedFlavorNumericId) {
      const { error } = await supabase
        .schema("public")
        .from("humor_flavors")
        .delete()
        .eq("id", selectedFlavorNumericId);

      if (error) {
        setFlavorActionFeedback({
          tone: "error",
          message: error.message,
        });
        return;
      }
    }

    try {
      await refreshFlavorsFromSupabase(null);
    } catch (error) {
      setFlavorActionFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed refreshing humor flavors.",
      });
      return;
    }
    setFlavorEditorMode("idle");
    resetStepEditor(true);
  }

  async function handleSaveFlavor(value: HumorFlavorDraft) {
    setFlavorActionFeedback(null);

    try {
      const persistedFlavor = await saveFlavorToSupabase(value);
      await refreshFlavorsFromSupabase(persistedFlavor.id);
      setFlavorEditorMode("idle");
    } catch (error) {
      setFlavorActionFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed saving humor flavor.",
      });
    }
  }

  function handleCancelFlavor() {
    setFlavorActionFeedback(null);
    setFlavorEditorMode("idle");
  }

  async function duplicateHumorFlavor(flavorId: number) {
    const userId = await getCurrentUserId();

    const sourceFlavorResult = await supabase
      .schema("public")
      .from("humor_flavors")
      .select("*")
      .eq("id", flavorId)
      .single();

    if (sourceFlavorResult.error) {
      throw new Error(sourceFlavorResult.error.message);
    }

    if (!sourceFlavorResult.data) {
      throw new Error("Selected humor flavor could not be found.");
    }

    const sourceFlavorRow = sourceFlavorResult.data as Record<string, unknown>;
    const existingFlavorsResult = await supabase
      .schema("public")
      .from("humor_flavors")
      .select("*");

    if (existingFlavorsResult.error) {
      throw new Error(existingFlavorsResult.error.message);
    }

    const existingFlavorRows = (existingFlavorsResult.data ?? []) as Record<string, unknown>[];
    const duplicateFlavorBaseSlug = buildUniqueDuplicateFlavorSlug(
      sourceFlavorRow,
      existingFlavorRows,
      selectedFlavor,
    ).slice(0, 80);
    let duplicateFlavorSlug = duplicateFlavorBaseSlug;
    let duplicateSlugSuffix = 2;

    for (;;) {
      const slugExistsResult = await supabase
        .schema("public")
        .from("humor_flavors")
        .select("id")
        .eq("slug", duplicateFlavorSlug)
        .limit(1);

      if (slugExistsResult.error) {
        throw new Error(slugExistsResult.error.message);
      }

      if ((slugExistsResult.data ?? []).length === 0) {
        break;
      }

      duplicateFlavorSlug = `${stripCopySuffix(duplicateFlavorBaseSlug)}-copy-${duplicateSlugSuffix}`.slice(0, 80);
      duplicateSlugSuffix += 1;
    }

    const duplicateFlavorPayload = omitFields(sourceFlavorRow, shouldExcludeDuplicateFlavorField);

    duplicateFlavorPayload.slug = duplicateFlavorSlug;
    duplicateFlavorPayload.is_pinned = false;
    duplicateFlavorPayload.created_by_user_id = userId;
    duplicateFlavorPayload.modified_by_user_id = userId;

    const insertFlavorResult = await supabase
      .schema("public")
      .from("humor_flavors")
      .insert(duplicateFlavorPayload as HumorFlavorInsert)
      .select("*")
      .single();

    if (insertFlavorResult.error || !insertFlavorResult.data) {
      throw new Error(insertFlavorResult.error?.message ?? "Failed creating duplicated humor flavor.");
    }

    const insertedFlavorRow = insertFlavorResult.data as Record<string, unknown>;
    const insertedFlavorId = typeof insertedFlavorRow.id === "number" ? insertedFlavorRow.id : Number(insertedFlavorRow.id);
    if (!Number.isInteger(insertedFlavorId) || insertedFlavorId <= 0) {
      throw new Error("Duplicated humor flavor id is invalid.");
    }

    try {
      const sourceStepsResult = await supabase
        .schema("public")
        .from("humor_flavor_steps")
        .select("*")
        .eq("humor_flavor_id", flavorId)
        .order("order_by", { ascending: true });

      if (sourceStepsResult.error) {
        throw new Error(sourceStepsResult.error.message);
      }

      const sourceStepRows = (sourceStepsResult.data ?? []) as Record<string, unknown>[];
      if (sourceStepRows.length > 0) {
        const duplicateStepRows = sourceStepRows.map((stepRow) => {
          const duplicateStepPayload = omitFields(
            stepRow,
            (key) => duplicateStepExcludedFields.has(key),
          );
          duplicateStepPayload.humor_flavor_id = insertedFlavorId;
          duplicateStepPayload.created_by_user_id = userId;
          duplicateStepPayload.modified_by_user_id = userId;
          return duplicateStepPayload;
        });

        const duplicateStepsResult = await supabase
          .schema("public")
          .from("humor_flavor_steps")
          .insert(duplicateStepRows as HumorFlavorStepInsert[]);

        if (duplicateStepsResult.error) {
          throw new Error(duplicateStepsResult.error.message);
        }
      }

      return {
        duplicatedFlavorId: String(insertedFlavorId),
        duplicatedFlavorName: duplicateFlavorSlug,
        duplicatedStepCount: sourceStepRows.length,
      };
    } catch (error) {
      await supabase
        .schema("public")
        .from("humor_flavor_steps")
        .delete()
        .eq("humor_flavor_id", insertedFlavorId);
      await supabase
        .schema("public")
        .from("humor_flavors")
        .delete()
        .eq("id", insertedFlavorId);

      throw error;
    }
  }

  async function handleDuplicateFlavor() {
    if (!selectedFlavor) {
      setFlavorActionFeedback({
        tone: "error",
        message: "Select a humor flavor first.",
      });
      return;
    }

    const numericSourceFlavorId = resolveNumericFlavorId(selectedFlavor);
    if (typeof numericSourceFlavorId !== "number" || !Number.isFinite(numericSourceFlavorId)) {
      setFlavorActionFeedback({
        tone: "error",
        message: "Selected flavor id is invalid.",
      });
      return;
    }

    setIsDuplicatingFlavor(true);
    setFlavorActionFeedback(null);

    try {
      const result = await duplicateHumorFlavor(numericSourceFlavorId);
      await refreshFlavorsFromSupabase(result.duplicatedFlavorId);
      setFlavorEditorMode("idle");
      resetStepEditor();
      setFlavorActionFeedback({
        tone: "success",
        message:
          result.duplicatedStepCount > 0
            ? `Duplicated humor flavor as "${result.duplicatedFlavorName}".`
            : `Duplicated humor flavor as "${result.duplicatedFlavorName}" with no steps to copy.`,
      });
    } catch (error) {
      setFlavorActionFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to duplicate humor flavor.",
      });
    } finally {
      setIsDuplicatingFlavor(false);
    }
  }

  function handleCreateStep() {
    console.info("[flavor-dashboard] opening create step form", {
      selectedFlavor,
      selectedFlavorNumericId,
    });

    if (!selectedFlavor) {
      setStepActionFeedback({
        tone: "error",
        message: "Select a humor flavor first",
      });
      return;
    }

    setStepActionFeedback(null);
    setStepEditorMode("create");
    setEditingStepId(null);
    setStepFormErrors({});
  }

  function handleEditStep(stepId: string) {
    if (!selectedFlavor) {
      setStepActionFeedback({
        tone: "error",
        message: "Select a humor flavor first",
      });
      return;
    }

    setStepActionFeedback(null);
    setStepEditorMode("edit");
    setEditingStepId(stepId);
    setStepFormErrors({});
  }

  async function deleteStep(stepId: string) {
    if (!selectedFlavor) {
      setStepActionFeedback({
        tone: "error",
        message: "Select a humor flavor first",
      });
      return;
    }

    const numericStepId = Number(stepId);
    const numericFlavorId = resolveNumericFlavorId(selectedFlavor);
    if (!Number.isFinite(numericStepId) || !Number.isFinite(numericFlavorId)) {
      setStepActionFeedback({
        tone: "error",
        message: "The selected step id or flavor id is invalid.",
      });
      return;
    }

    const { error } = await supabase
      .schema("public")
      .from("humor_flavor_steps")
      .delete()
      .eq("id", numericStepId)
      .eq("humor_flavor_id", numericFlavorId);

    if (error) {
      console.error("[flavor-dashboard] failed deleting humor flavor step", {
        table: "public.humor_flavor_steps",
        stepId,
        flavorId: selectedFlavor.id,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setStepActionFeedback({
        tone: "error",
        message: `Failed deleting step: ${error.message}`,
      });
      return;
    }

    console.info("[flavor-dashboard] deleted step id", {
      deletedStepId: stepId,
      flavorId: selectedFlavor.id,
      foreignKeyField: "humor_flavor_id",
    });

    await loadFlavorSteps(selectedFlavor.id);
    setStepActionFeedback({
      tone: "success",
      message: "Humor flavor step deleted.",
    });

    if (editingStepId === stepId) {
      resetStepEditor(false);
    }
  }

  function handleDeleteStep(stepId: string) {
    if (typeof window !== "undefined") {
      const shouldDelete = window.confirm("Delete this humor flavor step?");
      if (!shouldDelete) {
        return;
      }
    }
    void deleteStep(stepId);
  }

  async function moveStep(stepId: string, direction: "up" | "down") {
    if (!selectedFlavor) {
      setStepActionFeedback({
        tone: "error",
        message: "Select a humor flavor first",
      });
      return;
    }

    const currentIndex = selectedFlavor.steps.findIndex((step) => step.id === stepId);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetStep = selectedFlavor.steps[targetIndex];
    const currentStep = selectedFlavor.steps[currentIndex];

    if (!targetStep || !currentStep) {
      return;
    }

    const currentStepId = Number(currentStep.id);
    const targetStepId = Number(targetStep.id);
    if (!Number.isFinite(currentStepId) || !Number.isFinite(targetStepId)) {
      return;
    }

    const nowIso = new Date().toISOString();
    let userId: string;

    try {
      userId = await getCurrentUserId();
    } catch (error) {
      console.error(error);
      return;
    }

    const currentUpdate: HumorFlavorStepUpdate = {
      order_by: targetStep.orderBy,
      modified_by_user_id: userId,
      modified_datetime_utc: nowIso,
    };

    const targetUpdate: HumorFlavorStepUpdate = {
      order_by: currentStep.orderBy,
      modified_by_user_id: userId,
      modified_datetime_utc: nowIso,
    };

    const [{ error: currentError }, { error: targetError }] = await Promise.all([
      supabase
        .schema("public")
        .from("humor_flavor_steps")
        .update(currentUpdate)
        .eq("id", currentStepId),
      supabase
        .schema("public")
        .from("humor_flavor_steps")
        .update(targetUpdate)
        .eq("id", targetStepId),
    ]);

    if (currentError || targetError) {
      console.error("[flavor-dashboard] failed moving humor flavor step", {
        table: "public.humor_flavor_steps",
        stepId,
        direction,
        currentError,
        targetError,
      });
      setStepActionFeedback({
        tone: "error",
        message: "Failed reordering humor flavor steps.",
      });
      return;
    }

    await loadFlavorSteps(selectedFlavor.id);
    setStepActionFeedback({
      tone: "success",
      message: "Humor flavor step order updated.",
    });
  }

  function handleMoveStep(stepId: string, direction: "up" | "down") {
    void moveStep(stepId, direction);
  }

  async function handleSaveStep(value: FlavorStepDraft) {
    if (!selectedFlavor) {
      setStepActionFeedback({
        tone: "error",
        message: "Select a humor flavor first",
      });
      return;
    }

    const { errors, payload } = validateStepDraft(value);
    if (!payload) {
      setStepFormErrors(errors);
      return;
    }

    console.info("[flavor-dashboard] selected flavor id before submit", {
      selectedFlavorId: selectedStepFlavorBinding?.id ?? null,
      selectedFlavor,
    });

    const numericFlavorId = selectedStepFlavorBinding?.id;
    if (typeof numericFlavorId !== "number" || !Number.isInteger(numericFlavorId) || numericFlavorId <= 0) {
      setStepFormErrors({
        form: "Could not determine the selected humor flavor. Please re-select a flavor and try again.",
      });
      setStepActionFeedback({
        tone: "error",
        message: "Could not determine the selected humor flavor id.",
      });
      return;
    }

    setIsSavingStep(true);
    setStepFormErrors({});

    try {
      const userId = await getCurrentUserId();
      const nowIso = new Date().toISOString();

      if (stepEditorMode === "create") {
        const insertPayload: HumorFlavorStepInsert = {
          humor_flavor_id: numericFlavorId,
          order_by: payload.orderBy,
          humor_flavor_step_type_id: payload.humorFlavorStepTypeId,
          llm_input_type_id: payload.llmInputTypeId,
          llm_output_type_id: payload.llmOutputTypeId,
          llm_model_id: payload.llmModelId,
          llm_temperature: payload.llmTemperature,
          llm_system_prompt: payload.llmSystemPrompt,
          llm_user_prompt: payload.llmUserPrompt,
          description: withStepTemplateMarker(payload.description, payload.stepTemplateKey),
          created_by_user_id: userId,
          modified_by_user_id: userId,
          created_datetime_utc: nowIso,
          modified_datetime_utc: nowIso,
        };

        console.info("[flavor-dashboard] insert payload for public.humor_flavor_steps", {
          table: "public.humor_flavor_steps",
          insertPayload,
        });

        const { error } = await supabase
          .schema("public")
          .from("humor_flavor_steps")
          .insert(insertPayload);

        if (error) {
          throw new Error(error.message);
        }
      }

      if (stepEditorMode === "edit") {
        if (!editingStepId) {
          setStepFormErrors({ form: "No step is selected for editing." });
          return;
        }

        const numericStepId = Number(editingStepId);
        if (!Number.isFinite(numericStepId)) {
          setStepFormErrors({ form: "The selected step id is invalid." });
          return;
        }

        const updatePayload: HumorFlavorStepUpdate = {
          humor_flavor_id: numericFlavorId,
          order_by: payload.orderBy,
          humor_flavor_step_type_id: payload.humorFlavorStepTypeId,
          llm_input_type_id: payload.llmInputTypeId,
          llm_output_type_id: payload.llmOutputTypeId,
          llm_model_id: payload.llmModelId,
          llm_temperature: payload.llmTemperature,
          llm_system_prompt: payload.llmSystemPrompt,
          llm_user_prompt: payload.llmUserPrompt,
          description: withStepTemplateMarker(payload.description, payload.stepTemplateKey),
          modified_by_user_id: userId,
          modified_datetime_utc: nowIso,
        };

        console.info("[flavor-dashboard] update payload for public.humor_flavor_steps", {
          table: "public.humor_flavor_steps",
          updatePayload,
        });

        const { error } = await supabase
          .schema("public")
          .from("humor_flavor_steps")
          .update(updatePayload)
          .eq("id", numericStepId)
          .eq("humor_flavor_id", numericFlavorId);

        if (error) {
          throw new Error(error.message);
        }
      }

      await loadFlavorSteps(selectedFlavor.id);
      setStepActionFeedback({
        tone: "success",
        message:
          stepEditorMode === "create"
            ? "Humor flavor step created."
            : "Humor flavor step updated.",
      });
      resetStepEditor(false);
    } catch (error) {
      setStepFormErrors({
        form: error instanceof Error ? error.message : "Failed saving humor flavor step.",
      });
      setStepActionFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed saving humor flavor step.",
      });
    } finally {
      setIsSavingStep(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 text-gray-900 transition-colors duration-200 dark:bg-gray-900 dark:text-gray-100 lg:p-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-[320px]">
          <Panel title="Flavor List" subtitle="Choose a humor flavor">
            <FlavorList
              flavors={flavors}
              selectedFlavorId={selectedFlavor?.id ?? ""}
              auditById={flavorAuditById}
              onSelectFlavor={handleSelectFlavor}
              onCreateFlavor={handleCreateFlavor}
            />
          </Panel>
        </aside>

        <main className="min-h-[600px] flex-1 space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-colors duration-200 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex justify-end">
            <p className="text-xs text-gray-500 transition-colors duration-200 dark:text-gray-400">
              Supabase client import check: {supabaseImportReady ? "ready" : "not ready"}
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="Flavor Details"
              titleClassName="text-xl font-semibold text-gray-900 transition-colors duration-200 dark:text-white"
              subtitle={
                flavorEditorMode === "create" ? "Add a new humor flavor" : "Selected flavor info"
              }
            >
              <FlavorDetails
                flavor={selectedFlavor}
                audit={selectedFlavor ? flavorAuditById.get(selectedFlavor.id) ?? null : null}
                mode={flavorEditorMode}
                draft={flavorDraft}
                actionMessage={flavorActionFeedback?.message ?? null}
                actionTone={flavorActionFeedback?.tone ?? "info"}
                isDuplicating={isDuplicatingFlavor}
                onCreateFlavor={handleCreateFlavor}
                onEditFlavor={handleEditFlavor}
                onDuplicateFlavor={handleDuplicateFlavor}
                onDeleteFlavor={() => void handleDeleteFlavor()}
                onCancel={handleCancelFlavor}
                onSave={(value) => void handleSaveFlavor(value)}
              />
            </Panel>

            <Panel title="Steps" subtitle="How this flavor is applied">
            <StepsPanel
              flavor={selectedFlavor}
              selectedFlavorNumericId={selectedFlavorNumericId}
              selectedFlavorBinding={selectedStepFlavorBinding}
              editorMode={stepEditorMode}
                editingStepId={editingStepId}
                draft={stepDraft}
                errors={stepFormErrors}
                actionMessage={stepActionFeedback?.message ?? null}
                actionTone={stepActionFeedback?.tone ?? "info"}
                isSavingStep={isSavingStep}
                isLoadingSteps={isLoadingSteps}
                stepTypeOptions={stepTypeOptions}
                llmModelOptions={llmModelOptions}
                llmInputTypeOptions={llmInputTypeOptions}
                llmOutputTypeOptions={llmOutputTypeOptions}
                onCreateStep={handleCreateStep}
                onEditStep={handleEditStep}
                onDeleteStep={handleDeleteStep}
                onMoveStep={handleMoveStep}
                onSaveStep={handleSaveStep}
                onCancelStep={() => resetStepEditor(false)}
              />
            </Panel>

            <div className="xl:col-span-2">
              <Panel title="Test Panel" subtitle="Generate caption candidates from an uploaded image">
                <TestPanel
                  flavors={flavors}
                  initialFlavorId={selectedFlavor?.id ?? null}
                  flavorSource={flavorSource}
                  referenceCatalog={referenceCatalog}
                />
              </Panel>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
