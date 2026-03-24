import { useEffect } from "react";

import { StepForm, type StepLookupOption } from "@/components/dashboard/step-form";
import { STEP_TEMPLATE_BY_KEY } from "@/lib/flavor-step-templates";
import type { FlavorStepDraft, FlavorStepDraftErrors, HumorFlavor } from "@/lib/flavor-types";

type SelectedFlavorBinding = {
  id: number;
  name: string;
  slug: string | null;
  summary: string;
};

function toPreviewText(value: string | null, fallback: string, maxLength = 180) {
  if (!value) {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

type StepsPanelProps = {
  flavor: HumorFlavor | null;
  selectedFlavorNumericId: number | null;
  selectedFlavorBinding: SelectedFlavorBinding | null;
  editorMode: "idle" | "create" | "edit";
  editingStepId: string | null;
  draft: FlavorStepDraft;
  errors: FlavorStepDraftErrors;
  actionMessage: string | null;
  actionTone: "info" | "success" | "error";
  isSavingStep: boolean;
  isLoadingSteps: boolean;
  stepTypeOptions: StepLookupOption[];
  llmModelOptions: StepLookupOption[];
  llmInputTypeOptions: StepLookupOption[];
  llmOutputTypeOptions: StepLookupOption[];
  onCreateStep: () => void;
  onEditStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onMoveStep: (stepId: string, direction: "up" | "down") => void;
  onSaveStep: (value: FlavorStepDraft) => void | Promise<void>;
  onCancelStep: () => void;
};

export function StepsPanel({
  flavor,
  selectedFlavorNumericId,
  selectedFlavorBinding,
  editorMode,
  editingStepId,
  draft,
  errors,
  actionMessage,
  actionTone,
  isSavingStep,
  isLoadingSteps,
  stepTypeOptions,
  llmModelOptions,
  llmInputTypeOptions,
  llmOutputTypeOptions,
  onCreateStep,
  onEditStep,
  onDeleteStep,
  onMoveStep,
  onSaveStep,
  onCancelStep,
}: StepsPanelProps) {
  const hasSelectedFlavor = Boolean(flavor);
  const selectedFlavorForPanel = flavor;
  const hasValidSelectedFlavorId =
    typeof selectedFlavorNumericId === "number" &&
    Number.isInteger(selectedFlavorNumericId) &&
    selectedFlavorNumericId > 0;
  const helperMessage = !hasSelectedFlavor
    ? "Select a humor flavor first"
    : actionMessage ?? (hasValidSelectedFlavorId ? null : "Selected flavor has an invalid id.");
  const stepTypeLabelById = new Map(stepTypeOptions.map((option) => [option.value, option.label]));
  const modelLabelById = new Map(llmModelOptions.map((option) => [option.value, option.label]));
  const helperMessageClassName =
    actionTone === "error"
      ? "text-red-700 dark:text-red-300"
      : actionTone === "success"
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-zinc-600 dark:text-zinc-400";

  useEffect(() => {
    console.info("[steps-panel] selected flavor id received", {
      selectedFlavorId: selectedFlavorNumericId,
      selectedFlavorDbRowId: flavor?.sourceRow.id ?? null,
      selectedFlavorBinding,
      rawSelectedFlavorRow: flavor?.sourceRow ?? null,
      selectedFlavor: flavor,
      hasSelectedFlavor,
      foreignKeyField: "public.humor_flavor_steps.humor_flavor_id",
    });
  }, [flavor, hasSelectedFlavor, selectedFlavorBinding, selectedFlavorNumericId]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={!hasSelectedFlavor || !hasValidSelectedFlavorId || isLoadingSteps}
        onClick={onCreateStep}
        className="rounded-lg border border-dashed border-zinc-400 px-3 py-2 text-sm font-medium text-zinc-700 transition enabled:hover:border-zinc-600 enabled:hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:enabled:hover:border-zinc-400 dark:enabled:hover:text-zinc-100"
      >
        Create Humor Flavor Step
      </button>
      {isLoadingSteps ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading steps...</p>
      ) : null}
      {helperMessage ? <p className={`text-sm ${helperMessageClassName}`}>{helperMessage}</p> : null}

      {!selectedFlavorForPanel ? null : (
        <>
          {hasValidSelectedFlavorId ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Steps for: {selectedFlavorBinding?.name ?? selectedFlavorForPanel.displayLabel} (#{selectedFlavorNumericId})
            </p>
          ) : null}
          {selectedFlavorForPanel.steps.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No steps yet for this flavor.</p>
          ) : (
            <ol className="space-y-3">
              {selectedFlavorForPanel.steps.map((step, index) => {
                const isEditing = editorMode === "edit" && editingStepId === step.id;

                return (
                  <li
                    key={step.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                          {step.description || `Step ${step.orderBy}`}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          Order {step.orderBy} · Step Type{" "}
                          {step.humorFlavorStepTypeId
                            ? (stepTypeLabelById.get(String(step.humorFlavorStepTypeId)) ?? step.humorFlavorStepTypeId)
                            : "-"}{" "}
                          · Model{" "}
                          {step.llmModelId ? (modelLabelById.get(String(step.llmModelId)) ?? step.llmModelId) : "-"} · Input{" "}
                          {step.llmInputTypeId ?? "-"} · Output {step.llmOutputTypeId ?? "-"} · Temp{" "}
                          {step.llmTemperature ?? "-"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Pattern:{" "}
                          {step.stepTemplateKey
                            ? STEP_TEMPLATE_BY_KEY.get(step.stepTemplateKey)?.label ?? step.stepTemplateKey
                            : "Custom"}
                        </p>
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          <span className="font-medium">User:</span>{" "}
                          {toPreviewText(step.llmUserPrompt, "No user prompt set.", 120)}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          <span className="font-medium">System:</span>{" "}
                          {toPreviewText(step.llmSystemPrompt, "No system prompt set.", 120)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onMoveStep(step.id, "up")}
                          disabled={index === 0 || isSavingStep || isLoadingSteps}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition enabled:hover:border-zinc-500 enabled:hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:border-zinc-500 dark:enabled:hover:text-zinc-100"
                        >
                          Move Up
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveStep(step.id, "down")}
                          disabled={index === selectedFlavorForPanel.steps.length - 1 || isSavingStep || isLoadingSteps}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition enabled:hover:border-zinc-500 enabled:hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:border-zinc-500 dark:enabled:hover:text-zinc-100"
                        >
                          Move Down
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditStep(step.id)}
                          disabled={isSavingStep || isLoadingSteps}
                          className="rounded-lg bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-50 transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                        >
                          Edit Humor Flavor Step
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteStep(step.id)}
                          disabled={isSavingStep || isLoadingSteps}
                          className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition hover:border-red-500 hover:text-red-900 dark:border-red-900 dark:text-red-300 dark:hover:border-red-700 dark:hover:text-red-100"
                        >
                          Delete Humor Flavor Step
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-4">
                        {selectedFlavorBinding ? (
                          <StepForm
                            initialValue={draft}
                            errors={errors}
                            isSaving={isSavingStep}
                            submitLabel="Save Humor Flavor Step"
                            flavorId={selectedFlavorBinding.id}
                            flavorSummary={selectedFlavorBinding.summary}
                            stepTypeOptions={stepTypeOptions}
                            llmModelOptions={llmModelOptions}
                            llmInputTypeOptions={llmInputTypeOptions}
                            llmOutputTypeOptions={llmOutputTypeOptions}
                            onSubmit={onSaveStep}
                            onCancel={onCancelStep}
                          />
                        ) : (
                          <p className="text-xs text-red-700 dark:text-red-300">
                            Could not resolve `humor_flavor_id` for this selected flavor.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}

          {editorMode === "create" ? (
            selectedFlavorBinding ? (
              <StepForm
                initialValue={draft}
                errors={errors}
                isSaving={isSavingStep}
                submitLabel="Create Humor Flavor Step"
                flavorId={selectedFlavorBinding.id}
                flavorSummary={selectedFlavorBinding.summary}
                stepTypeOptions={stepTypeOptions}
                llmModelOptions={llmModelOptions}
                llmInputTypeOptions={llmInputTypeOptions}
                llmOutputTypeOptions={llmOutputTypeOptions}
                onSubmit={onSaveStep}
                onCancel={onCancelStep}
              />
            ) : (
              <p className="text-xs text-red-700 dark:text-red-300">
                Could not resolve `humor_flavor_id` for this selected flavor.
              </p>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
