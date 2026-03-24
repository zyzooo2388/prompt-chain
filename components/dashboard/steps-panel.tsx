import { StepForm } from "@/components/dashboard/step-form";
import { STEP_TEMPLATE_BY_KEY } from "@/lib/flavor-step-templates";
import type { FlavorStepDraft, FlavorStepDraftErrors, HumorFlavor } from "@/lib/flavor-types";

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
  editorMode: "idle" | "create" | "edit";
  editingStepId: string | null;
  draft: FlavorStepDraft;
  errors: FlavorStepDraftErrors;
  isSavingStep: boolean;
  onCreateStep: () => void;
  onEditStep: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onMoveStep: (stepId: string, direction: "up" | "down") => void;
  onSaveStep: (value: FlavorStepDraft) => void | Promise<void>;
  onCancelStep: () => void;
};

export function StepsPanel({
  flavor,
  editorMode,
  editingStepId,
  draft,
  errors,
  isSavingStep,
  onCreateStep,
  onEditStep,
  onDeleteStep,
  onMoveStep,
  onSaveStep,
  onCancelStep,
}: StepsPanelProps) {
  if (!flavor) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Select or create a humor flavor before managing its steps.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCreateStep}
        className="rounded-lg border border-dashed border-zinc-400 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-600 hover:text-zinc-950 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-zinc-400 dark:hover:text-zinc-100"
      >
        Create Humor Flavor Step
      </button>

      <ol className="space-y-3">
        {flavor.steps.map((step, index) => {
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
                    Order {step.orderBy} · Model {step.llmModelId ?? "-"} · Input{" "}
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
                    disabled={index === 0}
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition enabled:hover:border-zinc-500 enabled:hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:border-zinc-500 dark:enabled:hover:text-zinc-100"
                  >
                    Move Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveStep(step.id, "down")}
                    disabled={index === flavor.steps.length - 1}
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition enabled:hover:border-zinc-500 enabled:hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:border-zinc-500 dark:enabled:hover:text-zinc-100"
                  >
                    Move Down
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditStep(step.id)}
                    className="rounded-lg bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-50 transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Edit Humor Flavor Step
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteStep(step.id)}
                    className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition hover:border-red-500 hover:text-red-900 dark:border-red-900 dark:text-red-300 dark:hover:border-red-700 dark:hover:text-red-100"
                  >
                    Delete Humor Flavor Step
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div className="mt-4">
                  <StepForm
                    initialValue={draft}
                    errors={errors}
                    isSaving={isSavingStep}
                    submitLabel="Save Humor Flavor Step"
                    onSubmit={onSaveStep}
                    onCancel={onCancelStep}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {editorMode === "create" ? (
        <StepForm
          initialValue={draft}
          errors={errors}
          isSaving={isSavingStep}
          submitLabel="Create Humor Flavor Step"
          onSubmit={onSaveStep}
          onCancel={onCancelStep}
        />
      ) : null}
    </div>
  );
}
