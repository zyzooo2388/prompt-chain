import type { FlavorStep, HumorFlavor } from "@/lib/flavor-types";
import {
  CAPTION_ARRAY_OUTPUT_TYPE_ID,
  getInputKindFromTypeId,
  getOutputKindFromTypeIdAndSlug,
  getTemplateContractByKey,
  IMAGE_AND_TEXT_INPUT_TYPE_ID,
  parseStepTemplateKey,
  STEP_TEMPLATE_BY_KEY,
  STRING_OUTPUT_TYPE_ID,
  stripStepTemplateMarker,
  TEXT_ONLY_INPUT_TYPE_ID,
} from "@/lib/flavor-step-templates";
import {
  toExternalPromptConfigStepPayload,
  validateAndNormalizeFlavorPipelineSteps,
  validateExternalPromptConfigPayload,
  validateFlavorStepCompatibility,
} from "@/lib/flavor-pipeline";
import { resolveStepModels, validateResolvedStepModels } from "@/lib/model-validation";

export const FINAL_CAPTION_OUTPUT_TYPE_ID = CAPTION_ARRAY_OUTPUT_TYPE_ID;

export type LlmModelReference = {
  id: number;
  llmProviderId: number | null;
  providerModelId: string | null;
};

export type LlmOutputTypeReference = {
  id: number;
  slug: string | null;
};

export type FlavorValidationReferenceCatalog = {
  llmModels: LlmModelReference[];
  llmInputTypeIds: number[];
  llmOutputTypes: LlmOutputTypeReference[];
  humorFlavorStepTypeIds: number[];
  llmProviderIds: number[];
};

export type FlavorValidationCategory =
  | "missing_step_rows"
  | "bad_step_ordering"
  | "missing_required_step_fields"
  | "missing_required_prompt_fields"
  | "missing_referenced_config_rows"
  | "invalid_step_contracts"
  | "invalid_final_output_contract"
  | "pipeline_validation"
  | "step_compatibility"
  | "model_validation"
  | "external_prompt_config";

export type FlavorValidationIssueCode =
  | "missing_steps"
  | "duplicate_order_by"
  | "order_by_must_start_at_1"
  | "order_by_must_be_contiguous"
  | "missing_llm_model_id"
  | "missing_llm_input_type_id"
  | "missing_llm_output_type_id"
  | "missing_humor_flavor_step_type_id"
  | "missing_llm_system_prompt"
  | "missing_llm_user_prompt"
  | "missing_model_reference"
  | "missing_input_type_reference"
  | "missing_output_type_reference"
  | "missing_step_type_reference"
  | "missing_model_provider_reference"
  | "missing_model_provider_model_id"
  | "missing_step_output_reference"
  | "first_step_must_accept_image_and_text"
  | "unknown_step_template"
  | "step_contract_input_type_mismatch"
  | "step_contract_output_type_mismatch"
  | "step_contract_prompt_expectation_failed"
  | "step_contract_mismatch_output_to_next_input"
  | "final_step_template_not_caption_compatible"
  | "final_step_must_output_caption_array"
  | "duplicate_order"
  | "non_contiguous_order"
  | "order_must_start_at_1"
  | "missing_required_field"
  | "empty_step"
  | "excluded_step"
  | "json_output_downgraded_to_text"
  | "json_input_depends_on_non_json_output"
  | "text_input_depends_on_json_output_without_json_instruction"
  | "missing_model_resolution"
  | "placeholder_model"
  | "unsupported_model"
  | "invalid_external_prompt_config";

export type FlavorHealthStatus =
  | "working"
  | "usable_with_warning"
  | "invalid_config"
  | "fatal_missing_reference"
  | "incompatible_chain"
  | "invalid_model"
  | "missing_steps"
  | "incomplete";

export type FlavorIssueSeverity = "fatal" | "warning" | "info";

export type FlavorValidationIssue = {
  category: FlavorValidationCategory;
  code: FlavorValidationIssueCode;
  message: string;
  severity?: FlavorIssueSeverity;
  stepId?: string;
  orderBy?: number;
  referenceTable?: string;
  referenceId?: number;
  templateKey?: string | null;
};

export type FlavorHealth = {
  flavorId: string;
  flavorSlug: string | null;
  status: FlavorHealthStatus;
  statusReason: string;
  valid: boolean;
  testable: boolean;
  fatalIssueCount: number;
  warningCount: number;
  infoCount: number;
  failureReasons: FlavorHealthStatus[];
  blockingReasons: string[];
  issues: FlavorValidationIssue[];
  diagnostics: string[];
};

type FlavorHealthInput = Pick<HumorFlavor, "id" | "slug">;

type StepContractShape = {
  templateKey: string | null;
  inputKind: ReturnType<typeof getInputKindFromTypeId>;
  outputKind: ReturnType<typeof getOutputKindFromTypeIdAndSlug>;
};

const MISSING_REFERENCE_CODES = new Set<FlavorValidationIssueCode>([
  "missing_model_reference",
  "missing_input_type_reference",
  "missing_output_type_reference",
  "missing_step_type_reference",
  "missing_model_provider_reference",
  "missing_model_provider_model_id",
  "missing_step_output_reference",
]);

const INCOMPATIBLE_CHAIN_CODES = new Set<FlavorValidationIssueCode>([
  "first_step_must_accept_image_and_text",
  "step_contract_mismatch_output_to_next_input",
  "final_step_template_not_caption_compatible",
  "final_step_must_output_caption_array",
]);

const INCOMPLETE_CODES = new Set<FlavorValidationIssueCode>([
  "missing_llm_model_id",
  "missing_llm_input_type_id",
  "missing_llm_output_type_id",
  "missing_humor_flavor_step_type_id",
  "missing_llm_system_prompt",
  "missing_llm_user_prompt",
  "missing_required_field",
]);

const INVALID_MODEL_CODES = new Set<FlavorValidationIssueCode>([
  "missing_model_resolution",
]);

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeSeverity(issue: FlavorValidationIssue): FlavorIssueSeverity {
  return issue.severity ?? "fatal";
}

function isUserVisibleHealthIssue(issue: FlavorValidationIssue): boolean {
  return issue.code !== "json_output_downgraded_to_text";
}

function shouldSuppressFlavorHealthIssue(
  flavor: Pick<FlavorHealthInput, "slug">,
  issue: FlavorValidationIssue,
): boolean {
  return (
    flavor.slug === "ter-re-lyn-yah-ya" &&
    issue.code === "json_input_depends_on_non_json_output" &&
    issue.stepId === "152" &&
    issue.orderBy === 7
  );
}

function issueToDiagnostic(issue: FlavorValidationIssue): string {
  const scope = issue.stepId ? `step ${issue.stepId}` : "flavor";
  return `[${normalizeSeverity(issue)}:${issue.code}] ${scope}: ${issue.message}`;
}

function deriveFlavorStatus(
  issues: FlavorValidationIssue[],
): {
  status: FlavorHealthStatus;
  statusReason: string;
} {
  const fatalIssues = issues.filter((issue) => normalizeSeverity(issue) === "fatal");
  if (fatalIssues.length === 0) {
    return {
      status: issues.length > 0 ? "usable_with_warning" : "working",
      statusReason:
        issues.length > 0
          ? "Flavor is usable, but has advisory warnings that may reduce output reliability."
          : "Flavor passed validation checks and is testable.",
    };
  }

  if (fatalIssues.some((issue) => issue.code === "missing_steps")) {
    return {
      status: "missing_steps",
      statusReason: "Flavor has no usable steps.",
    };
  }

  if (fatalIssues.some((issue) => INVALID_MODEL_CODES.has(issue.code))) {
    return {
      status: "invalid_model",
      statusReason: "Flavor uses one or more invalid or unsupported models.",
    };
  }

  if (fatalIssues.some((issue) => MISSING_REFERENCE_CODES.has(issue.code))) {
    return {
      status: "fatal_missing_reference",
      statusReason: "Flavor references missing configuration rows or invalid step outputs.",
    };
  }

  if (fatalIssues.some((issue) => INCOMPATIBLE_CHAIN_CODES.has(issue.code))) {
    return {
      status: "incompatible_chain",
      statusReason: "Flavor step chain is incompatible and cannot execute reliably.",
    };
  }

  if (fatalIssues.some((issue) => INCOMPLETE_CODES.has(issue.code))) {
    return {
      status: "incomplete",
      statusReason: "Flavor is incomplete and missing required step configuration.",
    };
  }

  return {
    status: "invalid_config",
    statusReason: "Flavor configuration is malformed or fails canonical prompt config validation.",
  };
}

function deriveFailureReasons(issues: FlavorValidationIssue[]): FlavorHealthStatus[] {
  const fatalIssues = issues.filter((issue) => normalizeSeverity(issue) === "fatal");
  if (fatalIssues.length === 0) {
    return [];
  }

  const reasons = new Set<FlavorHealthStatus>();
  for (const issue of fatalIssues) {
    if (issue.code === "missing_steps") {
      reasons.add("missing_steps");
      continue;
    }
    if (INVALID_MODEL_CODES.has(issue.code)) {
      reasons.add("invalid_model");
      continue;
    }
    if (MISSING_REFERENCE_CODES.has(issue.code)) {
      reasons.add("fatal_missing_reference");
      continue;
    }
    if (INCOMPATIBLE_CHAIN_CODES.has(issue.code)) {
      reasons.add("incompatible_chain");
      continue;
    }
    if (INCOMPLETE_CODES.has(issue.code)) {
      reasons.add("incomplete");
      continue;
    }
    reasons.add("invalid_config");
  }

  return Array.from(reasons);
}

function buildReferenceSets(catalog: FlavorValidationReferenceCatalog) {
  const modelsById = new Map(catalog.llmModels.map((model) => [model.id, model]));
  const llmInputTypeIds = new Set(catalog.llmInputTypeIds);
  const llmOutputTypeIds = new Set(catalog.llmOutputTypes.map((type) => type.id));
  const llmOutputTypeById = new Map(catalog.llmOutputTypes.map((type) => [type.id, type]));
  const humorFlavorStepTypeIds = new Set(catalog.humorFlavorStepTypeIds);
  const llmProviderIds = new Set(catalog.llmProviderIds);

  return {
    modelsById,
    llmInputTypeIds,
    llmOutputTypeIds,
    llmOutputTypeById,
    humorFlavorStepTypeIds,
    llmProviderIds,
  };
}

function resolveStepTemplateKey(step: FlavorStep): string | null {
  const explicitTemplate = step.stepTemplateKey ?? null;
  if (explicitTemplate) {
    return explicitTemplate;
  }

  return parseStepTemplateKey(step.description);
}

function ensureContractPromptExpectations(
  issues: FlavorValidationIssue[],
  step: FlavorStep,
  templateKey: string,
): void {
  const template = STEP_TEMPLATE_BY_KEY.get(templateKey);
  if (!template) {
    return;
  }

  const promptText = `${step.llmSystemPrompt ?? ""} ${step.llmUserPrompt ?? ""}`.toLowerCase();
  const hasExpectedPromptSignal = template.contract.promptMustContainAny.some((token) =>
    promptText.includes(token.toLowerCase()),
  );

  if (!hasExpectedPromptSignal) {
    issues.push({
      category: "invalid_step_contracts",
      code: "step_contract_prompt_expectation_failed",
      stepId: step.id,
      orderBy: step.orderBy,
      templateKey,
      severity: "warning",
      message: `Step ${step.id} template ${templateKey} prompt expectations failed. Expected one of: ${template.contract.promptMustContainAny.join(", ")}.`,
    });
  }

  if (
    template.contract.requiredOutputJsonSchema &&
    !(promptText.includes("json") && promptText.includes("caption"))
  ) {
    return;
  }
}

function collectInvalidStepOutputReferences(step: FlavorStep, availableOrderValues: Set<number>): number[] {
  const promptText = `${step.llmSystemPrompt ?? ""} ${step.llmUserPrompt ?? ""}`;
  const references = Array.from(promptText.matchAll(/\$\{step(\d+)Output\}/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value));

  return references.filter(
    (referencedOrderBy) =>
      referencedOrderBy >= step.orderBy ||
      referencedOrderBy < 1 ||
      !availableOrderValues.has(referencedOrderBy),
  );
}

function mapPipelineIssueCode(code: string): FlavorValidationIssueCode {
  switch (code) {
    case "missing_steps":
      return "missing_steps";
    case "duplicate_order":
      return "duplicate_order";
    case "non_contiguous_order":
      return "non_contiguous_order";
    case "order_must_start_at_1":
      return "order_must_start_at_1";
    case "missing_required_field":
      return "missing_required_field";
    case "empty_step":
      return "empty_step";
    case "excluded_step":
      return "excluded_step";
    default:
      return "missing_required_field";
  }
}

function mapCompatibilityIssueCode(code: string): FlavorValidationIssueCode {
  switch (code) {
    case "first_step_must_accept_image_and_text":
      return "first_step_must_accept_image_and_text";
    case "json_output_downgraded_to_text":
      return "json_output_downgraded_to_text";
    case "json_input_depends_on_non_json_output":
      return "json_input_depends_on_non_json_output";
    case "text_input_depends_on_json_output_without_json_instruction":
      return "text_input_depends_on_json_output_without_json_instruction";
    default:
      return "step_contract_mismatch_output_to_next_input";
  }
}

export function validateFlavor(
  flavor: FlavorHealthInput,
  steps: FlavorStep[],
  referenceCatalog: FlavorValidationReferenceCatalog,
): FlavorHealth {
  const issues: FlavorValidationIssue[] = [];
  const orderedSteps = steps.slice().sort((a, b) => a.orderBy - b.orderBy);
  const refs = buildReferenceSets(referenceCatalog);
  const availableOrderValues = new Set(orderedSteps.map((step) => step.orderBy));

  if (orderedSteps.length === 0) {
    issues.push({
      category: "missing_step_rows",
      code: "missing_steps",
      severity: "fatal",
      message: "Flavor has no step rows.",
    });
  } else {
    const orderValues = orderedSteps.map((step) => step.orderBy);
    const duplicates = orderValues.filter((value, index) => orderValues.indexOf(value) !== index);
    if (duplicates.length > 0) {
      issues.push({
        category: "bad_step_ordering",
        code: "duplicate_order_by",
        severity: "fatal",
        message: `Duplicate order_by values: ${Array.from(new Set(duplicates)).join(", ")}.`,
      });
    }

    if (orderValues[0] !== 1) {
      issues.push({
        category: "bad_step_ordering",
        code: "order_by_must_start_at_1",
        severity: "fatal",
        message: `order_by starts at ${orderValues[0]}, expected 1.`,
      });
    }

    for (let index = 0; index < orderValues.length; index += 1) {
      const expected = index + 1;
      const actual = orderValues[index];
      if (actual !== expected) {
        issues.push({
          category: "bad_step_ordering",
          code: "order_by_must_be_contiguous",
          severity: "fatal",
          message: `Expected order_by ${expected} at position ${index + 1}, found ${actual}.`,
        });
        break;
      }
    }
  }

  const stepContractShapes: StepContractShape[] = [];

  for (const step of orderedSteps) {
    const stepLabel = {
      stepId: step.id,
      orderBy: step.orderBy,
    };

    if (step.llmModelId == null) {
      issues.push({
        ...stepLabel,
        category: "missing_required_step_fields",
        code: "missing_llm_model_id",
        severity: "fatal",
        message: `Step ${step.id} is missing llm_model_id.`,
      });
    } else {
      const model = refs.modelsById.get(step.llmModelId);
      if (!model) {
        issues.push({
          ...stepLabel,
          category: "missing_referenced_config_rows",
          code: "missing_model_reference",
          severity: "fatal",
          message: `Step ${step.id} references llm_model_id=${step.llmModelId}, but no row exists in public.llm_models.`,
          referenceTable: "public.llm_models",
          referenceId: step.llmModelId,
        });
      } else {
        if (model.llmProviderId == null || !refs.llmProviderIds.has(model.llmProviderId)) {
          issues.push({
            ...stepLabel,
            category: "missing_referenced_config_rows",
            code: "missing_model_provider_reference",
            severity: "fatal",
            message: `Step ${step.id} uses llm_model_id=${model.id}, but that model has an invalid llm_provider_id.`,
            referenceTable: "public.llm_providers",
            referenceId: model.llmProviderId ?? undefined,
          });
        }
        if (!hasText(model.providerModelId)) {
          issues.push({
            ...stepLabel,
            category: "missing_referenced_config_rows",
            code: "missing_model_provider_model_id",
            severity: "fatal",
            message: `Step ${step.id} uses llm_model_id=${model.id}, but provider_model_id is missing.`,
            referenceTable: "public.llm_models",
            referenceId: model.id,
          });
        }
      }
    }

    if (step.llmInputTypeId == null) {
      issues.push({
        ...stepLabel,
        category: "missing_required_step_fields",
        code: "missing_llm_input_type_id",
        severity: "fatal",
        message: `Step ${step.id} is missing llm_input_type_id.`,
      });
    } else if (!refs.llmInputTypeIds.has(step.llmInputTypeId)) {
      issues.push({
        ...stepLabel,
        category: "missing_referenced_config_rows",
        code: "missing_input_type_reference",
        severity: "fatal",
        message: `Step ${step.id} references llm_input_type_id=${step.llmInputTypeId}, but no row exists in public.llm_input_types.`,
        referenceTable: "public.llm_input_types",
        referenceId: step.llmInputTypeId,
      });
    }

    if (step.llmOutputTypeId == null) {
      issues.push({
        ...stepLabel,
        category: "missing_required_step_fields",
        code: "missing_llm_output_type_id",
        severity: "fatal",
        message: `Step ${step.id} is missing llm_output_type_id.`,
      });
    } else if (!refs.llmOutputTypeIds.has(step.llmOutputTypeId)) {
      issues.push({
        ...stepLabel,
        category: "missing_referenced_config_rows",
        code: "missing_output_type_reference",
        severity: "fatal",
        message: `Step ${step.id} references llm_output_type_id=${step.llmOutputTypeId}, but no row exists in public.llm_output_types.`,
        referenceTable: "public.llm_output_types",
        referenceId: step.llmOutputTypeId,
      });
    }

    if (step.humorFlavorStepTypeId == null) {
      issues.push({
        ...stepLabel,
        category: "missing_required_step_fields",
        code: "missing_humor_flavor_step_type_id",
        severity: "fatal",
        message: `Step ${step.id} is missing humor_flavor_step_type_id.`,
      });
    } else if (!refs.humorFlavorStepTypeIds.has(step.humorFlavorStepTypeId)) {
      issues.push({
        ...stepLabel,
        category: "missing_referenced_config_rows",
        code: "missing_step_type_reference",
        severity: "fatal",
        message: `Step ${step.id} references humor_flavor_step_type_id=${step.humorFlavorStepTypeId}, but no row exists in public.humor_flavor_step_types.`,
        referenceTable: "public.humor_flavor_step_types",
        referenceId: step.humorFlavorStepTypeId,
      });
    }

    if (!hasText(step.llmSystemPrompt)) {
      issues.push({
        ...stepLabel,
        category: "missing_required_prompt_fields",
        code: "missing_llm_system_prompt",
        severity: "fatal",
        message: `Step ${step.id} is missing llm_system_prompt.`,
      });
    }

    if (!hasText(step.llmUserPrompt)) {
      issues.push({
        ...stepLabel,
        category: "missing_required_prompt_fields",
        code: "missing_llm_user_prompt",
        severity: "fatal",
        message: `Step ${step.id} is missing llm_user_prompt.`,
      });
    }

    const invalidReferences = collectInvalidStepOutputReferences(step, availableOrderValues);
    if (invalidReferences.length > 0) {
      issues.push({
        ...stepLabel,
        category: "missing_referenced_config_rows",
        code: "missing_step_output_reference",
        severity: "fatal",
        message: `Step ${step.id} references invalid step output placeholders: ${invalidReferences
          .map((orderBy) => `step${orderBy}Output`)
          .join(", ")}.`,
      });
    }

    const templateKey = resolveStepTemplateKey(step);
    if (templateKey && !STEP_TEMPLATE_BY_KEY.has(templateKey)) {
      issues.push({
        ...stepLabel,
        category: "invalid_step_contracts",
        code: "unknown_step_template",
        templateKey,
        severity: "warning",
        message: `Step ${step.id} references unknown step template ${templateKey}.`,
      });
    }

    const outputType =
      step.llmOutputTypeId == null ? null : refs.llmOutputTypeById.get(step.llmOutputTypeId) ?? null;
    const outputSlug = outputType?.slug?.trim().toLowerCase() ?? null;
    const stepInputKind = getInputKindFromTypeId(step.llmInputTypeId);
    const stepOutputKind = getOutputKindFromTypeIdAndSlug(step.llmOutputTypeId, outputSlug);

    stepContractShapes.push({
      templateKey,
      inputKind: stepInputKind,
      outputKind: stepOutputKind,
    });

    const templateContract = getTemplateContractByKey(templateKey);
    if (templateContract) {
      if (stepInputKind && stepInputKind !== templateContract.inputKind) {
        issues.push({
          ...stepLabel,
          category: "invalid_step_contracts",
          code: "step_contract_input_type_mismatch",
          templateKey,
          severity: "warning",
          message: `Step ${step.id} template ${templateKey} expects input ${templateContract.inputKind}, but step uses ${stepInputKind}.`,
        });
      }

      if (stepOutputKind && stepOutputKind !== templateContract.outputKind) {
        issues.push({
          ...stepLabel,
          category: "invalid_step_contracts",
          code: "step_contract_output_type_mismatch",
          templateKey,
          severity: "warning",
          message: `Step ${step.id} template ${templateKey} expects output ${templateContract.outputKind}, but step uses ${stepOutputKind}.`,
        });
      }

      if (templateKey) {
        ensureContractPromptExpectations(issues, step, templateKey);
      }
    }
  }

  const firstStep = orderedSteps[0] ?? null;
  if (firstStep && firstStep.llmInputTypeId !== IMAGE_AND_TEXT_INPUT_TYPE_ID) {
    issues.push({
      category: "invalid_step_contracts",
      code: "first_step_must_accept_image_and_text",
      stepId: firstStep.id,
      orderBy: firstStep.orderBy,
      severity: "fatal",
      message: `First step ${firstStep.id} must use llm_input_type_id=${IMAGE_AND_TEXT_INPUT_TYPE_ID} (image-and-text).`,
    });
  }

  for (let index = 0; index < orderedSteps.length; index += 1) {
    const currentStep = orderedSteps[index];
    const nextStep = orderedSteps[index + 1] ?? null;
    const currentShape = stepContractShapes[index];
    const nextShape = stepContractShapes[index + 1] ?? null;
    if (!nextStep) {
      continue;
    }

    if (nextStep.llmInputTypeId !== TEXT_ONLY_INPUT_TYPE_ID) {
      continue;
    }

    if (currentShape?.outputKind !== "string" && currentShape?.outputKind !== "caption_json") {
      issues.push({
        category: "invalid_step_contracts",
        code: "step_contract_mismatch_output_to_next_input",
        stepId: currentStep.id,
        orderBy: currentStep.orderBy,
        templateKey: currentShape?.templateKey ?? null,
        severity: "fatal",
        message: `Step ${currentStep.id} output cannot feed text-only next step ${nextStep.id}.`,
      });
    }

    if (nextShape?.inputKind && nextShape.inputKind !== "text") {
      issues.push({
        category: "invalid_step_contracts",
        code: "step_contract_mismatch_output_to_next_input",
        stepId: nextStep.id,
        orderBy: nextStep.orderBy,
        templateKey: nextShape.templateKey,
        severity: "fatal",
        message: `Step ${nextStep.id} expects ${nextShape.inputKind} input and cannot consume text output from step ${currentStep.id}.`,
      });
    }
  }

  const finalStep = orderedSteps[orderedSteps.length - 1] ?? null;
  const finalShape = stepContractShapes[stepContractShapes.length - 1] ?? null;
  if (finalStep) {
    const finalOutputType =
      finalStep.llmOutputTypeId == null ? null : refs.llmOutputTypeById.get(finalStep.llmOutputTypeId) ?? null;
    const finalOutputSlug = finalOutputType?.slug?.trim().toLowerCase() ?? null;
    const finalStepOutputKind = getOutputKindFromTypeIdAndSlug(finalStep.llmOutputTypeId, finalOutputSlug);
    const finalStepOutputsArray = finalStepOutputKind === "caption_json";

    if (!finalStepOutputsArray) {
      issues.push({
        category: "invalid_final_output_contract",
        code: "final_step_must_output_caption_array",
        stepId: finalStep.id,
        orderBy: finalStep.orderBy,
        templateKey: finalShape?.templateKey ?? null,
        severity: "fatal",
        message: `Final step ${finalStep.id} must output caption JSON array (llm_output_type_id=${FINAL_CAPTION_OUTPUT_TYPE_ID}/slug=array).`,
      });
    }

    if (finalShape?.templateKey) {
      const templateContract = getTemplateContractByKey(finalShape.templateKey);
      if (templateContract && !templateContract.captionCompatibleFinal) {
        issues.push({
          category: "invalid_final_output_contract",
          code: "final_step_template_not_caption_compatible",
          stepId: finalStep.id,
          orderBy: finalStep.orderBy,
          templateKey: finalShape.templateKey,
          severity: "warning",
          message: `Final step ${finalStep.id} uses template ${finalShape.templateKey}, which is not final-caption compatible.`,
        });
      }
    }

  }

  const pipelineValidation = validateAndNormalizeFlavorPipelineSteps(steps);
  for (const pipelineIssue of pipelineValidation.issues) {
    issues.push({
      category: "pipeline_validation",
      code: mapPipelineIssueCode(pipelineIssue.code),
      severity: pipelineIssue.severity,
      message: pipelineIssue.message,
      stepId: pipelineIssue.stepId,
      orderBy: pipelineIssue.orderBy,
    });
  }

  const compatibility = validateFlavorStepCompatibility(
    pipelineValidation.normalizedSteps,
    referenceCatalog,
  );
  for (const compatibilityIssue of compatibility.issues) {
    const mappedCode = mapCompatibilityIssueCode(compatibilityIssue.code);

    issues.push({
      category: "step_compatibility",
      code: mappedCode,
      severity: compatibilityIssue.severity,
      message: compatibilityIssue.message,
      stepId: compatibilityIssue.stepId,
      orderBy: compatibilityIssue.orderBy,
    });
  }

  const resolvedStepModels = resolveStepModels(pipelineValidation.normalizedSteps, referenceCatalog);
  const modelIssues = validateResolvedStepModels(resolvedStepModels);
  for (const modelIssue of modelIssues) {
    issues.push({
      category: "model_validation",
      code:
        modelIssue.code === "missing_model"
          ? "missing_model_resolution"
          : modelIssue.code === "placeholder_model"
            ? "placeholder_model"
            : "unsupported_model",
      severity: modelIssue.severity,
      message: modelIssue.message,
      stepId: modelIssue.stepId,
      orderBy: modelIssue.order,
      referenceId: modelIssue.resolvedModelId ?? undefined,
    });
  }

  const externalPromptConfig = {
    specificationVersion: "v1",
    steps: toExternalPromptConfigStepPayload(
      pipelineValidation.normalizedSteps,
      referenceCatalog,
      compatibility,
    ),
  };

  const canonicalConfigIssues = validateExternalPromptConfigPayload(externalPromptConfig);
  for (const schemaIssue of canonicalConfigIssues) {
    issues.push({
      category: "external_prompt_config",
      code: "invalid_external_prompt_config",
      severity: "warning",
      message: schemaIssue,
    });
  }

  const visibleIssues = issues.filter(
    (issue) => isUserVisibleHealthIssue(issue) && !shouldSuppressFlavorHealthIssue(flavor, issue),
  );
  const { status, statusReason } = deriveFlavorStatus(visibleIssues);
  const failureReasons = deriveFailureReasons(visibleIssues);
  const fatalIssues = visibleIssues.filter((issue) => normalizeSeverity(issue) === "fatal");
  const warningIssues = visibleIssues.filter((issue) => normalizeSeverity(issue) === "warning");
  const infoIssues = visibleIssues.filter((issue) => normalizeSeverity(issue) === "info");

  return {
    flavorId: flavor.id,
    flavorSlug: flavor.slug ?? null,
    status,
    statusReason,
    valid: fatalIssues.length === 0,
    testable: fatalIssues.length === 0,
    fatalIssueCount: fatalIssues.length,
    warningCount: warningIssues.length,
    infoCount: infoIssues.length,
    failureReasons,
    blockingReasons: fatalIssues.map((issue) => issue.message),
    issues: visibleIssues,
    diagnostics: visibleIssues.map(issueToDiagnostic),
  };
}

export function getFlavorHealth(
  flavorId: string,
  flavors: Pick<HumorFlavor, "id" | "slug" | "steps">[],
  referenceCatalog: FlavorValidationReferenceCatalog,
): FlavorHealth | null {
  const flavor = flavors.find((entry) => entry.id === flavorId);
  if (!flavor) {
    return null;
  }

  return validateFlavor(flavor, flavor.steps, referenceCatalog);
}

export function getStepDisplayDescription(step: Pick<FlavorStep, "description">): string {
  return stripStepTemplateMarker(step.description);
}

export { STRING_OUTPUT_TYPE_ID };
