import { useEffect, useState } from "react";

import {
  STEP_TEMPLATE_LIBRARY,
  type StepTemplateDefinition,
} from "@/lib/flavor-step-templates";
import type { FlavorStepDraft, FlavorStepDraftErrors } from "@/lib/flavor-types";

type StepFormProps = {
  initialValue: FlavorStepDraft;
  errors: FlavorStepDraftErrors;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: (value: FlavorStepDraft) => void | Promise<void>;
  onCancel: () => void;
};

export function StepForm({
  initialValue,
  errors,
  isSaving,
  submitLabel,
  onSubmit,
  onCancel,
}: StepFormProps) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  function applyTemplate(template: StepTemplateDefinition) {
    setDraft((current) => ({
      ...current,
      stepTemplateKey: template.key,
      humorFlavorStepTypeId:
        template.defaults.humorFlavorStepTypeId || current.humorFlavorStepTypeId,
      llmInputTypeId: template.defaults.llmInputTypeId,
      llmOutputTypeId: template.defaults.llmOutputTypeId,
      llmTemperature: template.defaults.llmTemperature,
      description: template.defaults.description,
      llmSystemPrompt: template.defaults.llmSystemPrompt,
      llmUserPrompt: template.defaults.llmUserPrompt,
    }));
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(draft);
      }}
    >
      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Basic
        </p>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reusable Step Pattern
          </span>
          <select
            value={draft.stepTemplateKey}
            onChange={(event) => {
              const nextTemplateKey = event.target.value;
              const template = STEP_TEMPLATE_LIBRARY.find((item) => item.key === nextTemplateKey);
              if (!template) {
                setDraft((current) => ({ ...current, stepTemplateKey: nextTemplateKey }));
                return;
              }

              applyTemplate(template);
            }}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Custom (no template)</option>
            {STEP_TEMPLATE_LIBRARY.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
          {draft.stepTemplateKey ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {STEP_TEMPLATE_LIBRARY.find((template) => template.key === draft.stepTemplateKey)?.description}
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Choose a proven pattern to prefill prompt/config fields.
            </p>
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</span>
          <textarea
            required
            rows={2}
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {errors.description ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.description}</p>
          ) : null}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Order</span>
            <input
              required
              type="number"
              min={1}
              value={draft.orderBy}
              onChange={(event) =>
                setDraft((current) => ({ ...current, orderBy: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {errors.orderBy ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.orderBy}</p>
            ) : null}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Step Type ID
            </span>
            <input
              required
              type="number"
              min={1}
              value={draft.humorFlavorStepTypeId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  humorFlavorStepTypeId: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {errors.humorFlavorStepTypeId ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                {errors.humorFlavorStepTypeId}
              </p>
            ) : null}
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          LLM Config
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Model ID</span>
            <input
              required
              type="number"
              min={1}
              value={draft.llmModelId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, llmModelId: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {errors.llmModelId ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmModelId}</p>
            ) : null}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Temperature
            </span>
            <input
              required
              type="number"
              step="0.1"
              value={draft.llmTemperature}
              onChange={(event) =>
                setDraft((current) => ({ ...current, llmTemperature: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {errors.llmTemperature ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmTemperature}</p>
            ) : null}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Input Type ID
            </span>
            <input
              required
              type="number"
              min={1}
              value={draft.llmInputTypeId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, llmInputTypeId: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {errors.llmInputTypeId ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmInputTypeId}</p>
            ) : null}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Output Type ID
            </span>
            <input
              required
              type="number"
              min={1}
              value={draft.llmOutputTypeId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, llmOutputTypeId: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            {errors.llmOutputTypeId ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmOutputTypeId}</p>
            ) : null}
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Prompts
        </p>
        {draft.stepTemplateKey ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Contract:{" "}
            {STEP_TEMPLATE_LIBRARY.find((template) => template.key === draft.stepTemplateKey)?.contract
              .requiredOutputJsonSchema ?? "No strict JSON schema required."}
          </p>
        ) : null}
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            LLM System Prompt
          </span>
          <textarea
            required
            rows={4}
            value={draft.llmSystemPrompt}
            onChange={(event) =>
              setDraft((current) => ({ ...current, llmSystemPrompt: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {errors.llmSystemPrompt ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmSystemPrompt}</p>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            LLM User Prompt
          </span>
          <textarea
            required
            rows={4}
            value={draft.llmUserPrompt}
            onChange={(event) =>
              setDraft((current) => ({ ...current, llmUserPrompt: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {errors.llmUserPrompt ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmUserPrompt}</p>
          ) : null}
        </label>
      </div>

      {errors.form ? (
        <p className="text-sm text-red-700 dark:text-red-300">{errors.form}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isSaving ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
