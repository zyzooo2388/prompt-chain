'use client';

import { useEffect, useState } from "react";

import { FlavorDetails } from "@/components/dashboard/flavor-details";
import { FlavorList } from "@/components/dashboard/flavor-list";
import { Panel } from "@/components/dashboard/panel";
import { StepsPanel } from "@/components/dashboard/steps-panel";
import { TestPanel } from "@/components/dashboard/test-panel";
import { getFlavorAuditById } from "@/lib/flavor-audit";
import { getFlavorHealth } from "@/lib/flavor-health";
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
  HumorFlavorDraft,
} from "@/lib/flavor-types";
import { supabase } from "@/lib/supabase/client";
import type { HumorFlavorStepInsert, HumorFlavorStepRow, HumorFlavorStepUpdate } from "@/lib/supabase/types";

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

const stepPanelSelect =
  "id, humor_flavor_id, order_by, humor_flavor_step_type_id, llm_input_type_id, llm_output_type_id, llm_model_id, llm_temperature, llm_system_prompt, llm_user_prompt, description";

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
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

export function FlavorDashboard({
  initialFlavors,
  initialSelectedFlavorId,
  flavorSource,
  referenceCatalog,
}: FlavorDashboardProps) {
  const supabaseImportReady = Boolean(supabase);
  const [flavors, setFlavors] = useState(initialFlavors);
  const [selectedFlavorId, setSelectedFlavorId] = useState<string | null>(
    initialSelectedFlavorId ?? initialFlavors[0]?.id ?? null,
  );
  const [flavorEditorMode, setFlavorEditorMode] = useState<"idle" | "create" | "edit">("idle");
  const [stepEditorMode, setStepEditorMode] = useState<"idle" | "create" | "edit">("idle");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepFormErrors, setStepFormErrors] = useState<FlavorStepDraftErrors>({});
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [flavorActionError, setFlavorActionError] = useState<string | null>(null);
  const [isDuplicatingFlavor, setIsDuplicatingFlavor] = useState(false);

  const selectedFlavor =
    flavors.find((flavor) => flavor.id === selectedFlavorId) ?? flavors[0] ?? null;
  const flavorAuditById = getFlavorAuditById(flavors, referenceCatalog);

  async function getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) {
      throw new Error("You must be logged in to create or edit humor flavor steps.");
    }

    return data.user.id;
  }

  async function loadFlavorSteps(flavorId: string) {
    const numericFlavorId = Number(flavorId);
    if (!Number.isFinite(numericFlavorId)) {
      return;
    }

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
      return;
    }

    const rows = (data ?? []) as StepPanelRow[];
    const mappedSteps = rows.map(mapStepRowToFlavorStep);

    setFlavors((current) =>
      current.map((flavor) => (flavor.id === flavorId ? { ...flavor, steps: mappedSteps } : flavor)),
    );
  }

  useEffect(() => {
    if (!selectedFlavorId) {
      return;
    }

    const selectedFlavorIdValue = selectedFlavorId;

    async function loadSelectedFlavorSteps() {
      await loadFlavorSteps(selectedFlavorIdValue);
    }

    void loadSelectedFlavorSteps();
  }, [selectedFlavorId]);

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

  const stepsFlavor = flavorEditorMode === "create" ? null : selectedFlavor;

  function resetStepEditor() {
    setStepEditorMode("idle");
    setEditingStepId(null);
    setStepFormErrors({});
  }

  function handleSelectFlavor(id: string) {
    setFlavorActionError(null);
    setSelectedFlavorId(id);
    setFlavorEditorMode("idle");
    resetStepEditor();
  }

  function handleCreateFlavor() {
    setFlavorActionError(null);
    setFlavorEditorMode("create");
    resetStepEditor();
  }

  function handleEditFlavor() {
    if (!selectedFlavor) {
      return;
    }

    setFlavorActionError(null);
    setFlavorEditorMode("edit");
    resetStepEditor();
  }

  function handleDeleteFlavor() {
    if (!selectedFlavor) {
      return;
    }

    setFlavorActionError(null);
    setFlavors((current) => {
      const next = current.filter((flavor) => flavor.id !== selectedFlavor.id);
      setSelectedFlavorId(next[0]?.id ?? null);
      return next;
    });
    setFlavorEditorMode("idle");
    resetStepEditor();
  }

  function handleSaveFlavor(value: HumorFlavorDraft) {
    setFlavorActionError(null);

    if (flavorEditorMode === "create") {
      const newFlavor: HumorFlavor = {
        id: createId("flavor"),
        slug: null,
        ...value,
        displayLabel: value.name || value.description,
        steps: [],
      };

      setFlavors((current) => [...current, newFlavor]);
      setSelectedFlavorId(newFlavor.id);
      setFlavorEditorMode("idle");
      return;
    }

    if (flavorEditorMode === "edit" && selectedFlavor) {
      setFlavors((current) =>
        current.map((flavor) =>
          flavor.id === selectedFlavor.id
            ? {
                ...flavor,
                ...value,
                displayLabel: value.name || flavor.slug || value.description || flavor.id,
              }
            : flavor,
        ),
      );
    }

    setFlavorEditorMode("idle");
  }

  function handleCancelFlavor() {
    setFlavorActionError(null);
    setFlavorEditorMode("idle");
  }

  async function handleDuplicateFlavor() {
    if (!selectedFlavor) {
      return;
    }

    const selectedHealth = getFlavorHealth(selectedFlavor.id, flavors, referenceCatalog);
    if (!selectedHealth?.valid) {
      setFlavorActionError("Only working flavors can be duplicated.");
      return;
    }

    const numericSourceFlavorId = Number(selectedFlavor.id);
    if (!Number.isFinite(numericSourceFlavorId)) {
      setFlavorActionError("Selected flavor id is invalid.");
      return;
    }

    setIsDuplicatingFlavor(true);
    setFlavorActionError(null);

    try {
      const userId = await getCurrentUserId();
      const nowIso = new Date().toISOString();
      const slugBase = (selectedFlavor.slug?.trim().toLowerCase() || `flavor-${selectedFlavor.id}`)
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-|-$/g, "");
      const suffix = Date.now().toString().slice(-6);
      const cloneSlug = `${slugBase || "flavor"}-clone-${suffix}`.slice(0, 80);

      const fullFlavorPayload: Record<string, unknown> = {
        name: `${selectedFlavor.name} Copy`,
        tone: selectedFlavor.tone,
        description: selectedFlavor.description,
        slug: cloneSlug,
        created_datetime_utc: nowIso,
        modified_datetime_utc: nowIso,
        created_by_user_id: userId,
        modified_by_user_id: userId,
      };

      let insertFlavorData: { id: number | string; slug: string | null } | null = null;
      let insertFlavorErrorMessage = "";

      const fullInsertResult = await supabase
        .schema("public")
        .from("humor_flavors")
        .insert(fullFlavorPayload as never)
        .select("id, slug")
        .limit(1);

      if (!fullInsertResult.error && fullInsertResult.data?.[0]) {
        insertFlavorData = fullInsertResult.data[0] as { id: number | string; slug: string | null };
      } else {
        insertFlavorErrorMessage = fullInsertResult.error?.message ?? "Unknown insert error.";
        const fallbackFlavorPayload: Record<string, unknown> = {
          description: selectedFlavor.description,
          slug: cloneSlug,
          created_datetime_utc: nowIso,
          modified_datetime_utc: nowIso,
          created_by_user_id: userId,
          modified_by_user_id: userId,
        };

        const fallbackInsertResult = await supabase
          .schema("public")
          .from("humor_flavors")
          .insert(fallbackFlavorPayload as never)
          .select("id, slug")
          .limit(1);

        if (fallbackInsertResult.error || !fallbackInsertResult.data?.[0]) {
          throw new Error(
            fallbackInsertResult.error?.message ??
              `Could not create clone flavor row. First error: ${insertFlavorErrorMessage}`,
          );
        }

        insertFlavorData = fallbackInsertResult.data[0] as { id: number | string; slug: string | null };
      }

      const numericCloneFlavorId = Number(insertFlavorData.id);
      if (!Number.isFinite(numericCloneFlavorId)) {
        throw new Error("Cloned flavor id is invalid.");
      }

      const sourceStepsResult = await supabase
        .schema("public")
        .from("humor_flavor_steps")
        .select(stepPanelSelect)
        .eq("humor_flavor_id", numericSourceFlavorId)
        .order("order_by", { ascending: true });

      if (sourceStepsResult.error) {
        throw new Error(sourceStepsResult.error.message);
      }

      const sourceStepRows = (sourceStepsResult.data ?? []) as StepPanelRow[];
      if (sourceStepRows.length === 0) {
        throw new Error("Cannot clone a flavor with zero steps.");
      }

      const cloneStepRows: HumorFlavorStepInsert[] = sourceStepRows.map((step) => ({
        humor_flavor_id: numericCloneFlavorId,
        order_by: step.order_by,
        humor_flavor_step_type_id: step.humor_flavor_step_type_id,
        llm_input_type_id: step.llm_input_type_id,
        llm_output_type_id: step.llm_output_type_id,
        llm_model_id: step.llm_model_id,
        llm_temperature: step.llm_temperature,
        llm_system_prompt: step.llm_system_prompt,
        llm_user_prompt: step.llm_user_prompt,
        description: step.description,
        created_by_user_id: userId,
        modified_by_user_id: userId,
        created_datetime_utc: nowIso,
        modified_datetime_utc: nowIso,
      }));

      const cloneStepsResult = await supabase
        .schema("public")
        .from("humor_flavor_steps")
        .insert(cloneStepRows);

      if (cloneStepsResult.error) {
        throw new Error(cloneStepsResult.error.message);
      }

      const cloneFlavorId = String(insertFlavorData.id);
      const cloneFlavor: HumorFlavor = {
        id: cloneFlavorId,
        name: `${selectedFlavor.name} Copy`,
        slug: insertFlavorData.slug ?? cloneSlug,
        tone: selectedFlavor.tone,
        description: selectedFlavor.description,
        displayLabel: `${selectedFlavor.name} Copy`,
        steps: [],
      };

      setFlavors((current) => [...current, cloneFlavor]);
      setSelectedFlavorId(cloneFlavorId);
      setFlavorEditorMode("edit");
      resetStepEditor();
      await loadFlavorSteps(cloneFlavorId);
    } catch (error) {
      setFlavorActionError(
        error instanceof Error ? error.message : "Failed to duplicate humor flavor.",
      );
    } finally {
      setIsDuplicatingFlavor(false);
    }
  }

  function handleCreateStep() {
    if (!selectedFlavor) {
      return;
    }

    setStepEditorMode("create");
    setEditingStepId(null);
    setStepFormErrors({});
  }

  function handleEditStep(stepId: string) {
    setStepEditorMode("edit");
    setEditingStepId(stepId);
    setStepFormErrors({});
  }

  async function deleteStep(stepId: string) {
    if (!selectedFlavor) {
      return;
    }

    const numericStepId = Number(stepId);
    const numericFlavorId = Number(selectedFlavor.id);
    if (!Number.isFinite(numericStepId) || !Number.isFinite(numericFlavorId)) {
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
      return;
    }

    await loadFlavorSteps(selectedFlavor.id);

    if (editingStepId === stepId) {
      resetStepEditor();
    }
  }

  function handleDeleteStep(stepId: string) {
    void deleteStep(stepId);
  }

  async function moveStep(stepId: string, direction: "up" | "down") {
    if (!selectedFlavor) {
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
      return;
    }

    await loadFlavorSteps(selectedFlavor.id);
  }

  function handleMoveStep(stepId: string, direction: "up" | "down") {
    void moveStep(stepId, direction);
  }

  async function handleSaveStep(value: FlavorStepDraft) {
    if (!selectedFlavor) {
      return;
    }

    const { errors, payload } = validateStepDraft(value);
    if (!payload) {
      setStepFormErrors(errors);
      return;
    }

    const numericFlavorId = Number(selectedFlavor.id);
    if (!Number.isFinite(numericFlavorId)) {
      setStepFormErrors({
        form: "Selected humor flavor id is invalid.",
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
      resetStepEditor();
    } catch (error) {
      setStepFormErrors({
        form: error instanceof Error ? error.message : "Failed saving humor flavor step.",
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
                actionError={flavorActionError}
                isDuplicating={isDuplicatingFlavor}
                onCreateFlavor={handleCreateFlavor}
                onEditFlavor={handleEditFlavor}
                onDuplicateFlavor={handleDuplicateFlavor}
                onDeleteFlavor={handleDeleteFlavor}
                onCancel={handleCancelFlavor}
                onSave={handleSaveFlavor}
              />
            </Panel>

            <Panel title="Steps" subtitle="How this flavor is applied">
              <StepsPanel
                flavor={stepsFlavor}
                editorMode={stepEditorMode}
                editingStepId={editingStepId}
                draft={stepDraft}
                errors={stepFormErrors}
                isSavingStep={isSavingStep}
                onCreateStep={handleCreateStep}
                onEditStep={handleEditStep}
                onDeleteStep={handleDeleteStep}
                onMoveStep={handleMoveStep}
                onSaveStep={handleSaveStep}
                onCancelStep={resetStepEditor}
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
