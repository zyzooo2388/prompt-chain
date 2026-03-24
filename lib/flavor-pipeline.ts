import type { FlavorStep, HumorFlavor } from "@/lib/flavor-types";
import type { FlavorValidationReferenceCatalog } from "@/lib/flavor-health";
import {
  STRING_OUTPUT_TYPE_ID,
  getInputKindFromTypeId,
  getOutputKindFromTypeIdAndSlug,
  IMAGE_AND_TEXT_INPUT_TYPE_ID,
  TEXT_ONLY_INPUT_TYPE_ID,
} from "@/lib/flavor-step-templates";

export type ValidationSeverity = "fatal" | "warning" | "info";

export type FlavorPipelineIssue = {
  severity: ValidationSeverity;
  code:
    | "missing_steps"
    | "duplicate_order"
    | "non_contiguous_order"
    | "order_must_start_at_1"
    | "missing_required_field"
    | "empty_step"
    | "excluded_step";
  message: string;
  orderBy?: number;
  stepId?: string;
  field?: string;
};

export type NormalizedFlavorPipelineStep = {
  id: string;
  orderBy: number;
  humorFlavorStepTypeId: number;
  llmInputTypeId: number;
  llmOutputTypeId: number;
  llmModelId: number;
  llmTemperature: number;
  llmSystemPrompt: string;
  llmUserPrompt: string;
  description: string | null;
};

export type FlavorPipelineValidationResult = {
  valid: boolean;
  issues: FlavorPipelineIssue[];
  normalizedSteps: NormalizedFlavorPipelineStep[];
  orderValues: number[];
};

function asTrimmedString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMarkedDeletedOrDisabled(step: FlavorStep): boolean {
  const raw = step as unknown as Record<string, unknown>;
  return Boolean(raw.deleted || raw.is_deleted || raw.disabled || raw.is_disabled);
}

function hasAllRequiredScalarIds(step: FlavorStep): boolean {
  return (
    Number.isInteger(step.orderBy) &&
    (step.humorFlavorStepTypeId ?? 0) > 0 &&
    (step.llmInputTypeId ?? 0) > 0 &&
    (step.llmOutputTypeId ?? 0) > 0 &&
    (step.llmModelId ?? 0) > 0
  );
}

function buildNormalizedStep(step: FlavorStep): NormalizedFlavorPipelineStep | null {
  if (!hasAllRequiredScalarIds(step)) {
    return null;
  }

  const llmSystemPrompt = asTrimmedString(step.llmSystemPrompt);
  const llmUserPrompt = asTrimmedString(step.llmUserPrompt);
  if (!llmSystemPrompt || !llmUserPrompt) {
    return null;
  }

  return {
    id: step.id,
    orderBy: step.orderBy,
    humorFlavorStepTypeId: step.humorFlavorStepTypeId!,
    llmInputTypeId: step.llmInputTypeId!,
    llmOutputTypeId: step.llmOutputTypeId!,
    llmModelId: step.llmModelId!,
    llmTemperature: step.llmTemperature ?? 0.7,
    llmSystemPrompt,
    llmUserPrompt,
    description: asTrimmedString(step.description) || null,
  };
}

export function validateAndNormalizeFlavorPipelineSteps(
  steps: FlavorStep[],
): FlavorPipelineValidationResult {
  const issues: FlavorPipelineIssue[] = [];
  const orderedSteps = steps.slice().sort((a, b) => a.orderBy - b.orderBy);
  const normalizedSteps: NormalizedFlavorPipelineStep[] = [];

  if (orderedSteps.length === 0) {
    return {
      valid: false,
      issues: [
        {
          severity: "fatal",
          code: "missing_steps",
          message: "This humor flavor has no steps.",
        },
      ],
      normalizedSteps: [],
      orderValues: [],
    };
  }

  const orderValues = orderedSteps.map((step) => step.orderBy);
  const duplicateOrders = orderValues.filter((value, index) => orderValues.indexOf(value) !== index);
  if (duplicateOrders.length > 0) {
    issues.push({
      severity: "fatal",
      code: "duplicate_order",
      message: `Duplicate step order values found: ${Array.from(new Set(duplicateOrders)).join(", ")}.`,
    });
  }

  if (orderValues[0] !== 1) {
    issues.push({
      severity: "fatal",
      code: "order_must_start_at_1",
      message: `Step order must start at 1, found ${orderValues[0]}.`,
    });
  }

  for (let i = 0; i < orderValues.length; i += 1) {
    const expected = i + 1;
    if (orderValues[i] !== expected) {
      issues.push({
        severity: "fatal",
        code: "non_contiguous_order",
        message: `Step order has a gap or mismatch at position ${expected} (found ${orderValues[i]}).`,
      });
      break;
    }
  }

  for (const step of orderedSteps) {
    if (isMarkedDeletedOrDisabled(step)) {
      issues.push({
        severity: "warning",
        code: "excluded_step",
        message: `Step ${step.id} was excluded because it is marked deleted/disabled.`,
        orderBy: step.orderBy,
        stepId: step.id,
      });
      continue;
    }

    const normalized = buildNormalizedStep(step);
    if (!normalized) {
      if (!hasAllRequiredScalarIds(step)) {
        if (!Number.isInteger(step.orderBy)) {
          issues.push({
            severity: "fatal",
            code: "missing_required_field",
            message: `Step ${step.id} is missing a valid order.`,
            orderBy: step.orderBy,
            stepId: step.id,
            field: "orderBy",
          });
        }
        if ((step.humorFlavorStepTypeId ?? 0) <= 0) {
          issues.push({
            severity: "fatal",
            code: "missing_required_field",
            message: `Step ${step.id} is missing humor flavor step type id.`,
            orderBy: step.orderBy,
            stepId: step.id,
            field: "humorFlavorStepTypeId",
          });
        }
        if ((step.llmInputTypeId ?? 0) <= 0) {
          issues.push({
            severity: "fatal",
            code: "missing_required_field",
            message: `Step ${step.id} is missing LLM input type id.`,
            orderBy: step.orderBy,
            stepId: step.id,
            field: "llmInputTypeId",
          });
        }
        if ((step.llmOutputTypeId ?? 0) <= 0) {
          issues.push({
            severity: "fatal",
            code: "missing_required_field",
            message: `Step ${step.id} is missing LLM output type id.`,
            orderBy: step.orderBy,
            stepId: step.id,
            field: "llmOutputTypeId",
          });
        }
        if ((step.llmModelId ?? 0) <= 0) {
          issues.push({
            severity: "fatal",
            code: "missing_required_field",
            message: `Step ${step.id} is missing LLM model id.`,
            orderBy: step.orderBy,
            stepId: step.id,
            field: "llmModelId",
          });
        }
      }

      if (!asTrimmedString(step.llmSystemPrompt) || !asTrimmedString(step.llmUserPrompt)) {
        issues.push({
          severity: "fatal",
          code: "missing_required_field",
          message: `Step ${step.id} is missing required prompt text.`,
          orderBy: step.orderBy,
          stepId: step.id,
          field: "llmSystemPrompt/llmUserPrompt",
        });
      }

      if (!asTrimmedString(step.llmSystemPrompt) && !asTrimmedString(step.llmUserPrompt) && !hasAllRequiredScalarIds(step)) {
        issues.push({
          severity: "warning",
          code: "empty_step",
          message: `Step ${step.id} appears empty and was excluded from payload construction.`,
          orderBy: step.orderBy,
          stepId: step.id,
        });
      }
      continue;
    }

    normalizedSteps.push(normalized);
  }

  if (normalizedSteps.length === 0) {
    issues.push({
      severity: "fatal",
      code: "missing_steps",
      message: "No usable steps remain after validation.",
    });
  }

  return {
    valid: issues.every((issue) => issue.severity !== "fatal"),
    issues,
    normalizedSteps: normalizedSteps.sort((a, b) => a.orderBy - b.orderBy),
    orderValues,
  };
}

export type ExternalPromptConfigStepPayload = {
  order: number;
  stepType: {
    id: number;
  };
  inputType: {
    id: number;
  };
  outputType: {
    id: number;
    slug: string | null;
  };
  model: {
    id: number;
    provider: {
      id: number;
    };
    providerModelId: string;
  };
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
  description: string | null;
};

export type ExternalPromptConfigPayload = {
  specificationVersion: string;
  steps: ExternalPromptConfigStepPayload[];
};

type StepOutputSemanticKind = "text" | "json" | "unknown";
type StepInputSemanticKind = "image_and_text" | "text" | "unknown";

export type StepCompatibilityIssueCode =
  | "first_step_must_accept_image_and_text"
  | "json_output_downgraded_to_text"
  | "json_input_depends_on_non_json_output"
  | "text_input_depends_on_json_output_without_json_instruction";

export type StepCompatibilityIssue = {
  severity: ValidationSeverity;
  code: StepCompatibilityIssueCode;
  message: string;
  stepId: string;
  orderBy: number;
  relatedStepId?: string;
  relatedOrderBy?: number;
};

export type StepCompatibilitySnapshot = {
  stepId: string;
  orderBy: number;
  llmModelId: number;
  resolvedModelName: string | null;
  inputTypeId: number;
  outputTypeId: number;
  outputTypeSlug: string | null;
  inputKind: StepInputSemanticKind;
  configuredOutputKind: StepOutputSemanticKind;
  effectiveOutputKind: StepOutputSemanticKind;
  outputKind: StepOutputSemanticKind;
  expectsJsonInput: boolean;
  jsonRequiredDownstream: boolean;
  jsonRequiredByBackend: boolean;
  jsonIsRequired: boolean;
  isJsonOutputStep: boolean;
  downgradedFromJsonToText: boolean;
  passesCompatibilityValidation: boolean;
  severity: ValidationSeverity | null;
  summaryReason: string | null;
  generationAllowed: boolean;
  fatalCount: number;
  warningCount: number;
  infoCount: number;
  issues: StepCompatibilityIssue[];
};

export type FlavorStepCompatibilityResult = {
  valid: boolean;
  steps: StepCompatibilitySnapshot[];
  issues: StepCompatibilityIssue[];
  fatalIssues: StepCompatibilityIssue[];
  warnings: StepCompatibilityIssue[];
  infoIssues: StepCompatibilityIssue[];
};

export const CAPTION_JSON_SHAPE_REQUIREMENT =
  'Return this shape exactly: ["caption 1","caption 2","caption 3","caption 4","caption 5"]';

export function isFatalValidationSeverity(severity: ValidationSeverity): boolean {
  return severity === "fatal";
}

function getHighestSeverity(issues: StepCompatibilityIssue[]): ValidationSeverity | null {
  if (issues.some((issue) => issue.severity === "fatal")) {
    return "fatal";
  }
  if (issues.some((issue) => issue.severity === "warning")) {
    return "warning";
  }
  if (issues.some((issue) => issue.severity === "info")) {
    return "info";
  }
  return null;
}

function normalizePromptText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function promptExpectsJsonInput(promptText: string): boolean {
  const normalized = normalizePromptText(promptText);
  const hasInputSignal =
    normalized.includes("from the json") ||
    normalized.includes("given json") ||
    normalized.includes("using json") ||
    normalized.includes("parse the json") ||
    normalized.includes("json input");
  const hasOutputOnlySignal =
    normalized.includes("return only valid json") ||
    normalized.includes("return a json array") ||
    normalized.includes("return json");
  return hasInputSignal && !hasOutputOnlySignal;
}

function getOutputSlugById(referenceCatalog: FlavorValidationReferenceCatalog): Map<number, string | null> {
  return new Map(referenceCatalog.llmOutputTypes.map((row) => [row.id, row.slug ?? null]));
}

function getModelNameById(referenceCatalog: FlavorValidationReferenceCatalog): Map<number, string | null> {
  return new Map(
    referenceCatalog.llmModels.map((row) => [row.id, row.providerModelId?.trim() || null]),
  );
}

function toInputSemanticKind(inputTypeId: number): StepInputSemanticKind {
  const kind = getInputKindFromTypeId(inputTypeId);
  if (kind === "image_and_text") {
    return "image_and_text";
  }
  if (kind === "text") {
    return "text";
  }
  return "unknown";
}

function toOutputSemanticKind(outputTypeId: number, outputSlug: string | null): StepOutputSemanticKind {
  const kind = getOutputKindFromTypeIdAndSlug(outputTypeId, outputSlug);
  if (kind === "string") {
    return "text";
  }
  if (kind === "caption_json") {
    return "json";
  }
  return "unknown";
}

function buildStrictJsonSystemPrompt(systemPrompt: string): string {
  const normalized = systemPrompt.trim();
  const additions = [
    "Return only valid JSON.",
    "No markdown.",
    "No explanation.",
    "No prose before or after JSON.",
  ];

  const merged = [normalized, ...additions.filter((line) => !normalizePromptText(normalized).includes(line.toLowerCase()))]
    .filter((part) => part.length > 0)
    .join("\n");
  return merged.trim();
}

function buildStrictJsonUserPrompt(userPrompt: string): string {
  const normalized = userPrompt.trim();
  const additions = [
    "Return only valid JSON.",
    "No markdown.",
    "No explanation.",
    "No prose before or after JSON.",
    "Return a JSON array of caption strings only.",
    CAPTION_JSON_SHAPE_REQUIREMENT,
  ];

  const merged = [normalized, ...additions.filter((line) => !normalizePromptText(normalized).includes(line.toLowerCase()))]
    .filter((part) => part.length > 0)
    .join("\n");
  return merged.trim();
}

export function validateFlavorStepCompatibility(
  steps: NormalizedFlavorPipelineStep[],
  referenceCatalog: FlavorValidationReferenceCatalog,
): FlavorStepCompatibilityResult {
  const sortedSteps = steps.slice().sort((a, b) => a.orderBy - b.orderBy);
  const outputSlugById = getOutputSlugById(referenceCatalog);
  const modelNameById = getModelNameById(referenceCatalog);
  const stepSnapshots = new Map<string, StepCompatibilitySnapshot>();
  const issues: StepCompatibilityIssue[] = [];

  function pushIssue(issue: StepCompatibilityIssue) {
    issues.push(issue);
    const snapshot = stepSnapshots.get(issue.stepId);
    if (snapshot) {
      snapshot.issues.push(issue);
    }
  }

  for (const step of sortedSteps) {
    const outputSlug = outputSlugById.get(step.llmOutputTypeId) ?? null;
    const systemPrompt = step.llmSystemPrompt ?? "";
    const userPrompt = step.llmUserPrompt ?? "";
    const combinedPrompt = `${systemPrompt}\n${userPrompt}`;
    const outputKind = toOutputSemanticKind(step.llmOutputTypeId, outputSlug);
    const isJsonOutputStep = outputKind === "json";
    const expectsJsonInput = promptExpectsJsonInput(combinedPrompt);

    const snapshot: StepCompatibilitySnapshot = {
      stepId: step.id,
      orderBy: step.orderBy,
      llmModelId: step.llmModelId,
      resolvedModelName: modelNameById.get(step.llmModelId) ?? null,
      inputTypeId: step.llmInputTypeId,
      outputTypeId: step.llmOutputTypeId,
      outputTypeSlug: outputSlug,
      inputKind: toInputSemanticKind(step.llmInputTypeId),
      configuredOutputKind: outputKind,
      effectiveOutputKind: outputKind,
      outputKind,
      expectsJsonInput,
      jsonRequiredDownstream: false,
      jsonRequiredByBackend: false,
      jsonIsRequired: false,
      isJsonOutputStep,
      downgradedFromJsonToText: false,
      passesCompatibilityValidation: true,
      severity: null,
      summaryReason: null,
      generationAllowed: true,
      fatalCount: 0,
      warningCount: 0,
      infoCount: 0,
      issues: [],
    };
    stepSnapshots.set(step.id, snapshot);

    if (step.orderBy === 1 && step.llmInputTypeId !== IMAGE_AND_TEXT_INPUT_TYPE_ID) {
      pushIssue({
        severity: "fatal",
        code: "first_step_must_accept_image_and_text",
        message: `Step ${step.id} must use input type ${IMAGE_AND_TEXT_INPUT_TYPE_ID} as the first step.`,
        stepId: step.id,
        orderBy: step.orderBy,
      });
    }
  }

  const lastStep = sortedSteps[sortedSteps.length - 1] ?? null;

  for (let index = 0; index < sortedSteps.length; index += 1) {
    const step = sortedSteps[index];
    const snapshot = stepSnapshots.get(step.id);
    const next = sortedSteps[index + 1] ?? null;
    const nextSnapshot = next ? stepSnapshots.get(next.id) : null;
    if (!snapshot) {
      continue;
    }

    snapshot.jsonRequiredDownstream = Boolean(nextSnapshot?.expectsJsonInput);
    snapshot.jsonRequiredByBackend =
      Boolean(lastStep && step.id === lastStep.id && snapshot.configuredOutputKind === "json");
    snapshot.jsonIsRequired = snapshot.jsonRequiredDownstream || snapshot.jsonRequiredByBackend;

    if (snapshot.configuredOutputKind === "json" && !snapshot.jsonIsRequired) {
      snapshot.effectiveOutputKind = "text";
      snapshot.outputKind = "text";
      snapshot.downgradedFromJsonToText = true;
    } else if (snapshot.configuredOutputKind !== "json") {
      continue;
    }
  }

  for (let index = 0; index < sortedSteps.length - 1; index += 1) {
    const current = sortedSteps[index];
    const next = sortedSteps[index + 1];
    const currentSnapshot = stepSnapshots.get(current.id);
    const nextSnapshot = stepSnapshots.get(next.id);
    if (!currentSnapshot || !nextSnapshot) {
      continue;
    }

    if (next.llmInputTypeId === TEXT_ONLY_INPUT_TYPE_ID) {
      if (nextSnapshot.expectsJsonInput && currentSnapshot.effectiveOutputKind !== "json") {
        pushIssue({
          severity: "warning",
          code: "json_input_depends_on_non_json_output",
          message:
            `Step ${next.id} expects JSON input but previous step ${current.id} outputs ${currentSnapshot.effectiveOutputKind}. Generation may still continue, but this boundary is less reliable.`,
          stepId: next.id,
          orderBy: next.orderBy,
          relatedStepId: current.id,
          relatedOrderBy: current.orderBy,
        });
      }

      if (
        !nextSnapshot.expectsJsonInput &&
        currentSnapshot.configuredOutputKind === "json"
      ) {
        pushIssue({
          severity: "warning",
          code: "text_input_depends_on_json_output_without_json_instruction",
          message:
            `Step ${next.id} consumes text input while previous step ${current.id} is configured as JSON. This is allowed because JSON is not required at this boundary.`,
          stepId: next.id,
          orderBy: next.orderBy,
          relatedStepId: current.id,
          relatedOrderBy: current.orderBy,
        });
      }
    }
  }

  const fatalIssues: StepCompatibilityIssue[] = [];
  const warnings: StepCompatibilityIssue[] = [];
  const infoIssues: StepCompatibilityIssue[] = [];
  for (const issue of issues) {
    if (issue.severity === "fatal") {
      fatalIssues.push(issue);
    } else if (issue.severity === "warning") {
      warnings.push(issue);
    } else {
      infoIssues.push(issue);
    }
  }

  for (const snapshot of stepSnapshots.values()) {
    snapshot.fatalCount = snapshot.issues.filter((issue) => issue.severity === "fatal").length;
    snapshot.warningCount = snapshot.issues.filter((issue) => issue.severity === "warning").length;
    snapshot.infoCount = snapshot.issues.filter((issue) => issue.severity === "info").length;
    snapshot.passesCompatibilityValidation = snapshot.fatalCount === 0;
    snapshot.generationAllowed = snapshot.fatalCount === 0;
    snapshot.severity = getHighestSeverity(snapshot.issues);
    snapshot.summaryReason = snapshot.issues[0]?.message ?? null;
  }

  return {
    valid: fatalIssues.length === 0,
    steps: sortedSteps
      .map((step) => stepSnapshots.get(step.id))
      .filter((snapshot): snapshot is StepCompatibilitySnapshot => Boolean(snapshot)),
    issues,
    fatalIssues,
    warnings,
    infoIssues,
  };
}

export function toExternalPromptConfigStepPayload(
  steps: NormalizedFlavorPipelineStep[],
  referenceCatalog: FlavorValidationReferenceCatalog,
  compatibilityResult?: FlavorStepCompatibilityResult | null,
): ExternalPromptConfigStepPayload[] {
  const modelById = new Map(referenceCatalog.llmModels.map((model) => [model.id, model]));
  const outputById = new Map(referenceCatalog.llmOutputTypes.map((outputType) => [outputType.id, outputType]));
  const compatibilityByStepId = new Map(
    (compatibilityResult?.steps ?? []).map((snapshot) => [snapshot.stepId, snapshot]),
  );

  return steps
    .slice()
    .sort((a, b) => a.orderBy - b.orderBy)
    .map((step) => {
      const model = modelById.get(step.llmModelId);
      const outputType = outputById.get(step.llmOutputTypeId);
      const outputKind = toOutputSemanticKind(step.llmOutputTypeId, outputType?.slug ?? null);
      const compatibility = compatibilityByStepId.get(step.id);
      const isDowngradedJsonOutput =
        compatibility?.configuredOutputKind === "json" &&
        compatibility.downgradedFromJsonToText;
      const effectiveOutputKind = compatibility?.effectiveOutputKind ?? outputKind;
      const systemPrompt =
        effectiveOutputKind === "json" && compatibility?.jsonIsRequired !== false
          ? buildStrictJsonSystemPrompt(step.llmSystemPrompt)
          : step.llmSystemPrompt;
      const userPrompt =
        effectiveOutputKind === "json" && compatibility?.jsonIsRequired !== false
          ? buildStrictJsonUserPrompt(step.llmUserPrompt)
          : step.llmUserPrompt;

      return {
        order: step.orderBy,
        stepType: {
          id: step.humorFlavorStepTypeId,
        },
        inputType: {
          id: step.llmInputTypeId,
        },
        outputType: {
          id: isDowngradedJsonOutput ? STRING_OUTPUT_TYPE_ID : step.llmOutputTypeId,
          slug: isDowngradedJsonOutput ? "string" : outputType?.slug ?? null,
        },
        model: {
          id: step.llmModelId,
          provider: {
            id: model?.llmProviderId ?? 0,
          },
          providerModelId: model?.providerModelId?.trim() ?? "",
        },
        temperature: step.llmTemperature,
        systemPrompt,
        userPrompt,
        description: step.description,
      };
    });
}

export type FlavorPipelineDebugSnapshot = {
  flavorId: string;
  flavorName: string;
  stepCount: number;
  orderValues: number[];
  issues: FlavorPipelineIssue[];
  normalizedSteps: NormalizedFlavorPipelineStep[];
};

export function buildFlavorPipelineDebugSnapshot(
  flavor: Pick<HumorFlavor, "id" | "name" | "steps">,
): FlavorPipelineDebugSnapshot {
  const validation = validateAndNormalizeFlavorPipelineSteps(flavor.steps);

  return {
    flavorId: flavor.id,
    flavorName: flavor.name,
    stepCount: flavor.steps.length,
    orderValues: validation.orderValues,
    issues: validation.issues,
    normalizedSteps: validation.normalizedSteps,
  };
}

export function validateExternalPromptConfigPayload(config: unknown): string[] {
  const issues: string[] = [];

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return ["externalPromptConfig must be a JSON object."];
  }

  const record = config as Record<string, unknown>;
  const specificationVersion = record.specificationVersion;
  const steps = record.steps;

  if (typeof specificationVersion !== "string" || specificationVersion.trim().length === 0) {
    issues.push("externalPromptConfig.specificationVersion must be a non-empty string.");
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    issues.push("externalPromptConfig.steps must be a non-empty array.");
    return issues;
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const path = `externalPromptConfig.steps[${index}]`;
    if (typeof step !== "object" || step === null || Array.isArray(step)) {
      issues.push(`${path} must be an object.`);
      continue;
    }

    const row = step as Record<string, unknown>;
    const order = row.order;
    const stepType = row.stepType as Record<string, unknown> | undefined;
    const inputType = row.inputType as Record<string, unknown> | undefined;
    const outputType = row.outputType as Record<string, unknown> | undefined;
    const model = row.model as Record<string, unknown> | undefined;
    const modelProvider = model?.provider as Record<string, unknown> | undefined;

    if (!Number.isInteger(order) || Number(order) < 1) {
      issues.push(`${path}.order must be an integer >= 1.`);
    }
    if (!stepType || !Number.isInteger(stepType.id) || Number(stepType.id) < 1) {
      issues.push(`${path}.stepType.id must be an integer > 0.`);
    }
    if (!inputType || !Number.isInteger(inputType.id) || Number(inputType.id) < 1) {
      issues.push(`${path}.inputType.id must be an integer > 0.`);
    }
    if (!outputType || !Number.isInteger(outputType.id) || Number(outputType.id) < 1) {
      issues.push(`${path}.outputType.id must be an integer > 0.`);
    }
    if (!model || !Number.isInteger(model.id) || Number(model.id) < 1) {
      issues.push(`${path}.model.id must be an integer > 0.`);
    }
    if (!modelProvider || !Number.isInteger(modelProvider.id) || Number(modelProvider.id) < 1) {
      issues.push(`${path}.model.provider.id must be an integer > 0.`);
    }
    if (typeof model?.providerModelId !== "string" || model.providerModelId.trim().length === 0) {
      issues.push(`${path}.model.providerModelId must be a non-empty string.`);
    }
    if (typeof row.temperature !== "number" || !Number.isFinite(row.temperature)) {
      issues.push(`${path}.temperature must be a finite number.`);
    }
    if (typeof row.systemPrompt !== "string" || row.systemPrompt.trim().length === 0) {
      issues.push(`${path}.systemPrompt must be a non-empty string.`);
    }
    if (typeof row.userPrompt !== "string" || row.userPrompt.trim().length === 0) {
      issues.push(`${path}.userPrompt must be a non-empty string.`);
    }
  }

  return issues;
}
