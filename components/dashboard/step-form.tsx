import { useEffect, useState } from "react";

import {
  STEP_TEMPLATE_LIBRARY,
  type StepTemplateDefinition,
} from "@/lib/flavor-step-templates";
import type { FlavorStepDraft, FlavorStepDraftErrors } from "@/lib/flavor-types";

export type StepLookupOption = {
  value: string;
  label: string;
  description?: string | null;
};

type StepFormProps = {
  initialValue: FlavorStepDraft;
  errors: FlavorStepDraftErrors;
  isSaving: boolean;
  submitLabel: string;
  flavorId: number;
  flavorSummary: string;
  stepTypeOptions: StepLookupOption[];
  llmModelOptions: StepLookupOption[];
  llmInputTypeOptions: StepLookupOption[];
  llmOutputTypeOptions: StepLookupOption[];
  onSubmit: (value: FlavorStepDraft) => void | Promise<void>;
  onCancel: () => void;
};

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
      {children} <span className="text-red-700 dark:text-red-300">*</span>
    </span>
  );
}

function LookupField({
  label,
  value,
  options,
  error,
  onChange,
}: {
  label: string;
  value: string;
  options: StepLookupOption[];
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <RequiredLabel>{label}</RequiredLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:aria-[invalid=true]:border-red-400"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
    </label>
  );
}

export function StepForm({
  initialValue,
  errors,
  isSaving,
  submitLabel,
  flavorId,
  flavorSummary,
  stepTypeOptions,
  llmModelOptions,
  llmInputTypeOptions,
  llmOutputTypeOptions,
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
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(draft);
      }}
    >
      <div className="rounded-lg border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Bound Flavor
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{flavorSummary}</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">humor_flavor_id: {flavorId}</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          This step is assigned automatically to the selected humor flavor.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Basic
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Fields marked with * are required.</p>
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
          <RequiredLabel>Description</RequiredLabel>
          <textarea
            rows={2}
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
            aria-invalid={Boolean(errors.description)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:aria-[invalid=true]:border-red-400"
          />
          {errors.description ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.description}</p>
          ) : null}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <RequiredLabel>Order</RequiredLabel>
            <input
              type="number"
              min={1}
              value={draft.orderBy}
              onChange={(event) =>
                setDraft((current) => ({ ...current, orderBy: event.target.value }))
              }
              aria-invalid={Boolean(errors.orderBy)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:aria-[invalid=true]:border-red-400"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Prefilled to the next available sequence number for this flavor.
            </p>
            {errors.orderBy ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.orderBy}</p>
            ) : null}
          </label>
          <LookupField
            label="Step Type"
            value={draft.humorFlavorStepTypeId}
            options={stepTypeOptions}
            error={errors.humorFlavorStepTypeId}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                humorFlavorStepTypeId: value,
              }))
            }
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          LLM Config
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <LookupField
            label="Model"
            value={draft.llmModelId}
            options={llmModelOptions}
            error={errors.llmModelId}
            onChange={(value) => setDraft((current) => ({ ...current, llmModelId: value }))}
          />
          <label className="block">
            <RequiredLabel>Temperature</RequiredLabel>
            <input
              type="number"
              step="0.1"
              value={draft.llmTemperature}
              onChange={(event) =>
                setDraft((current) => ({ ...current, llmTemperature: event.target.value }))
              }
              aria-invalid={Boolean(errors.llmTemperature)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:aria-[invalid=true]:border-red-400"
            />
            {errors.llmTemperature ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmTemperature}</p>
            ) : null}
          </label>
          <LookupField
            label="Input Type"
            value={draft.llmInputTypeId}
            options={llmInputTypeOptions}
            error={errors.llmInputTypeId}
            onChange={(value) => setDraft((current) => ({ ...current, llmInputTypeId: value }))}
          />
          <LookupField
            label="Output Type"
            value={draft.llmOutputTypeId}
            options={llmOutputTypeOptions}
            error={errors.llmOutputTypeId}
            onChange={(value) => setDraft((current) => ({ ...current, llmOutputTypeId: value }))}
          />
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
          <RequiredLabel>LLM System Prompt</RequiredLabel>
          <textarea
            rows={4}
            value={draft.llmSystemPrompt}
            onChange={(event) =>
              setDraft((current) => ({ ...current, llmSystemPrompt: event.target.value }))
            }
            aria-invalid={Boolean(errors.llmSystemPrompt)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:aria-[invalid=true]:border-red-400"
          />
          {errors.llmSystemPrompt ? (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.llmSystemPrompt}</p>
          ) : null}
        </label>

        <label className="block">
          <RequiredLabel>LLM User Prompt</RequiredLabel>
          <textarea
            rows={4}
            value={draft.llmUserPrompt}
            onChange={(event) =>
              setDraft((current) => ({ ...current, llmUserPrompt: event.target.value }))
            }
            aria-invalid={Boolean(errors.llmUserPrompt)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:aria-[invalid=true]:border-red-400"
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
