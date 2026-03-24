import type { FlavorValidationReferenceCatalog } from "@/lib/flavor-health";
import type { NormalizedFlavorPipelineStep } from "@/lib/flavor-pipeline";

export type ResolvedStepModel = {
  stepId: string;
  order: number;
  resolvedModelId: number | null;
  resolvedModelName: string | null;
};

export type StepModelValidationIssue = {
  code: "missing_model" | "placeholder_model" | "unsupported_model";
  severity: "fatal" | "warning";
  message: string;
  stepId: string;
  order: number;
  resolvedModelId: number | null;
  resolvedModelName: string | null;
};

const SUPPORTED_MODEL_NAMES = new Set(
  [
    "gpt-4.1-2025-04-14",
    "gpt-4.1-mini-2025-04-14",
    "gpt-4.1-nano-2025-04-14",
    "gpt-4.5-preview-2025-02-27",
    "gpt-4o-2024-08-06",
    "gpt-4o-mini-2024-07-18",
    "gpt-4o",
    "o1-2024-12-17",
    "gpt-5-2025-08-07",
    "gpt-5-mini-2025-08-07",
    "gpt-5-nano-2025-08-07",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "grok-2-vision",
    "grok-3-latest",
    "grok-4-latest",
  ].map((modelName) => modelName.toLowerCase()),
);

const BLOCKED_EXACT_MODEL_NAMES = new Set(["admin-test-model"]);
const PLACEHOLDER_MODEL_NAME_PATTERN = /(^|[-_:\s])(test|placeholder|dummy|fake)([-_:\s]|$)/i;
const BLOCKED_MODEL_NAME_PATTERN = /\bdo[-_\s]*not[-_\s]*use\b/i;

function normalizeModelName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isPlaceholderModelName(normalizedModelName: string): boolean {
  if (!normalizedModelName) {
    return false;
  }

  return (
    BLOCKED_EXACT_MODEL_NAMES.has(normalizedModelName) ||
    PLACEHOLDER_MODEL_NAME_PATTERN.test(normalizedModelName) ||
    BLOCKED_MODEL_NAME_PATTERN.test(normalizedModelName)
  );
}

export function resolveStepModels(
  normalizedSteps: NormalizedFlavorPipelineStep[],
  referenceCatalog: FlavorValidationReferenceCatalog,
): ResolvedStepModel[] {
  const modelById = new Map(referenceCatalog.llmModels.map((model) => [model.id, model]));

  return normalizedSteps
    .slice()
    .sort((a, b) => a.orderBy - b.orderBy)
    .map((step) => {
      const model = modelById.get(step.llmModelId);
      const modelName = model?.providerModelId?.trim() ?? "";

      return {
        stepId: step.id,
        order: step.orderBy,
        resolvedModelId: Number.isInteger(step.llmModelId) ? step.llmModelId : null,
        resolvedModelName: modelName.length > 0 ? modelName : null,
      };
    });
}

export function validateResolvedStepModels(stepModels: ResolvedStepModel[]): StepModelValidationIssue[] {
  const issues: StepModelValidationIssue[] = [];

  for (const stepModel of stepModels) {
    const normalizedModelName = normalizeModelName(stepModel.resolvedModelName);

    if (!stepModel.resolvedModelId || !normalizedModelName) {
      issues.push({
        code: "missing_model",
        severity: "fatal",
        message: `Step ${stepModel.stepId} (order ${stepModel.order}) is missing a resolved model.`,
        stepId: stepModel.stepId,
        order: stepModel.order,
        resolvedModelId: stepModel.resolvedModelId,
        resolvedModelName: stepModel.resolvedModelName,
      });
      continue;
    }

    if (isPlaceholderModelName(normalizedModelName)) {
      issues.push({
        code: "placeholder_model",
        severity: "warning",
        message: `Step ${stepModel.stepId} (order ${stepModel.order}) resolves to placeholder/test model \`${stepModel.resolvedModelName}\`.`,
        stepId: stepModel.stepId,
        order: stepModel.order,
        resolvedModelId: stepModel.resolvedModelId,
        resolvedModelName: stepModel.resolvedModelName,
      });
      continue;
    }

    if (!SUPPORTED_MODEL_NAMES.has(normalizedModelName)) {
      issues.push({
        code: "unsupported_model",
        severity: "warning",
        message: `Step ${stepModel.stepId} (order ${stepModel.order}) resolves to unsupported model \`${stepModel.resolvedModelName}\`.`,
        stepId: stepModel.stepId,
        order: stepModel.order,
        resolvedModelId: stepModel.resolvedModelId,
        resolvedModelName: stepModel.resolvedModelName,
      });
    }
  }

  return issues;
}
