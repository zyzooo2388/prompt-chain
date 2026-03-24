import {
  buildExternalApiUrl,
  GENERATE_CAPTIONS_PATH,
  GENERATE_PRESIGNED_URL_PATH,
  getExternalApiToken,
  UPLOAD_IMAGE_FROM_URL_PATH,
} from "@/lib/api/external-api-config";
import { extractCaptionsFromApiResponse } from "@/lib/api/extractCaptionsFromApiResponse";
import {
  type ExternalPromptConfigPayload,
  type ExternalPromptConfigStepPayload,
  type FlavorStepCompatibilityResult,
  type NormalizedFlavorPipelineStep,
  toExternalPromptConfigStepPayload,
  validateFlavorStepCompatibility,
  validateExternalPromptConfigPayload,
  validateAndNormalizeFlavorPipelineSteps,
} from "@/lib/flavor-pipeline";
import { parseStepTemplateKey, stripStepTemplateMarker } from "@/lib/flavor-step-templates";
import { type FlavorValidationReferenceCatalog, validateFlavor } from "@/lib/flavor-health";
import {
  type ResolvedStepModel,
  resolveStepModels,
  validateResolvedStepModels,
} from "@/lib/model-validation";
import { hasAdminAccess } from "@/lib/supabase/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type StageNumber = 1 | 2 | 3 | 4;

type StageDetails = {
  number: StageNumber;
  name: string;
};

type CaptionGenerationStage =
  | "validating_flavor"
  | "preparing_image"
  | "uploading_image"
  | "registering_image"
  | "generating_captions";

type CanonicalPayloadValidationIssue = {
  reason: string;
  invalidStepId: string | null;
  invalidFieldName: string | null;
  stepOrder: number | null;
};

type CanonicalPayloadValidationError = {
  reason: string;
  invalidStepId: string | null;
  invalidFieldName: string | null;
  flavorId: string;
  flavorName: string | null;
  issues: CanonicalPayloadValidationIssue[];
};

type UpstreamBodyDetails = {
  responseJson: unknown | null;
  responseText: string | null;
};

type StageFailureContext = {
  stage: StageDetails;
  phase?: CaptionGenerationStage;
  url: string;
  method: string;
  errorCode?: string;
  finalCaptionRequestBody?: unknown;
  canonicalPayloadValidation?: CanonicalPayloadValidationError | null;
  stepCompatibilityValidation?: FlavorStepCompatibilityResult | null;
  resolvedStepModels?: ResolvedStepModel[] | null;
  status?: number | null;
  responseJson?: unknown | null;
  responseText?: string | null;
  message: string;
};

type PresignedUrlResponse = {
  presignedUrl: string;
  cdnUrl: string;
};

type SelectedFlavorDebug = {
  id: string;
  name?: string;
  tone?: string;
};

type CaptionRouteDebugPayload = {
  phase: CaptionGenerationStage;
  selectedFlavor: SelectedFlavorDebug | null;
  normalizedHumorFlavorId: string | null;
  normalizedStepCount: number;
  finalCaptionRequestBody: unknown;
  canonicalPayloadValidation: CanonicalPayloadValidationError | null;
  stepCompatibilityValidation: FlavorStepCompatibilityResult | null;
  resolvedStepModels: ResolvedStepModel[] | null;
  externalPromptConfig: unknown;
  rawApiResponse: unknown | null;
};

const FINAL_STEP_LLM_OUTPUT_TYPE_ID = 2;
const DEFAULT_SPECIFICATION_VERSION = "v1";
const DEFAULT_UPSTREAM_TIMEOUT_MS = 30000;
const GENERATE_CAPTIONS_TIMEOUT_MS = 120000;
const FINAL_STEP_JSON_FORMAT_MARKER = "Test Panel JSON response requirements:";
const FINAL_STEP_JSON_FORMAT_GUIDANCE = [
  FINAL_STEP_JSON_FORMAT_MARKER,
  "Return ONLY valid JSON.",
  "Preserve the caption count and style requested by the flavor instructions above.",
  "If the instructions call for multiple captions, return a JSON array of strings.",
  "If the instructions call for one caption, return either a JSON string or a JSON array with one string.",
  "No prose.",
  "No markdown.",
  "No explanation.",
  "No object wrappers beyond the JSON string or JSON array response itself.",
  "No code fences.",
].join("\n");

type FinalStepRow = {
  id: number;
  order_by: number;
  humor_flavor_step_type_id: number | null;
  llm_output_type_id: number | null;
  llm_system_prompt: string | null;
  llm_user_prompt: string | null;
};

type FinalStepDebug = {
  id: number;
  orderBy: number;
  humorFlavorStepTypeId: number | null;
  llmOutputTypeId: number | null;
  llmSystemPrompt: string | null;
  llmUserPrompt: string | null;
};

type FlavorValidationStepRow = {
  id: number;
  humor_flavor_id: number;
  order_by: number;
  humor_flavor_step_type_id: number | null;
  llm_input_type_id: number | null;
  llm_output_type_id: number | null;
  llm_model_id: number | null;
  llm_temperature: number | null;
  description: string | null;
  llm_system_prompt: string | null;
  llm_user_prompt: string | null;
};

type FlavorValidationFlavorRow = {
  id: number | string;
  slug: string | null;
  description: string | null;
};

type IdRow = {
  id: number;
};

type LlmModelReferenceRow = {
  id: number;
  llm_provider_id: number | null;
  provider_model_id: string | null;
};

type LlmOutputTypeReferenceRow = {
  id: number;
  slug: string | null;
};

type FlavorPipelineStepDebug = {
  id: number;
  order_by: number;
  llm_output_type_id: number | null;
  llm_user_prompt: string | null;
};

type FlavorPipelineStepSummary = {
  id: number;
  orderBy: number;
  llmOutputTypeId: number | null;
  llmUserPrompt: string | null;
};

type FlavorFailureDiagnostics = {
  flavorSlug: string | null;
  stepIds: number[];
  orderByValues: number[];
  finalStepLlmOutputTypeId: number | null;
  finalStepPromptPreview: string | null;
};

type Stage4RequestBody = {
  imageId: string;
  humorFlavorId: string;
  specificationVersion: string;
  externalPromptConfig: ExternalPromptConfigPayload;
};

type Stage4BuildResult = {
  requestBody: Stage4RequestBody | null;
  issues: string[];
  normalizedStepPayload: ExternalPromptConfigStepPayload[];
  stepCompatibilityValidation: FlavorStepCompatibilityResult;
  resolvedStepModels: ResolvedStepModel[];
  canonicalPayloadValidation: CanonicalPayloadValidationError | null;
};

class RequestTimeoutError extends Error {
  timeoutMs: number;
  url: string;
  method: string;

  constructor(message: string, timeoutMs: number, url: string, method: string) {
    super(message);
    this.name = "RequestTimeoutError";
    this.timeoutMs = timeoutMs;
    this.url = url;
    this.method = method;
  }
}

function mapValidationStepToFlavorStep(step: FlavorValidationStepRow) {
  const llmUserPrompt = step.llm_user_prompt?.trim() ?? null;
  const llmSystemPrompt = step.llm_system_prompt?.trim() ?? null;
  const description = step.description?.trim() ?? null;
  const templateKey = parseStepTemplateKey(description);
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
    llmSystemPrompt,
    llmUserPrompt,
    stepTemplateKey: templateKey,
    title: cleanedDescription || `Step ${step.order_by}`,
    instruction: llmUserPrompt || llmSystemPrompt || "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown error";
}

function getExternalApiBearerToken(supabaseJwt: string): string {
  return getExternalApiToken() ?? supabaseJwt;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const method = typeof init.method === "string" ? init.method.toUpperCase() : "GET";
  const timeoutMessage = `Upstream ${method} ${input} timed out after ${timeoutMs}ms.`;
  const timeout = setTimeout(() => controller.abort(timeoutMessage), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      const reason =
        typeof controller.signal.reason === "string" && controller.signal.reason.trim().length > 0
          ? controller.signal.reason
          : timeoutMessage;
      throw new RequestTimeoutError(reason, timeoutMs, input, method);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 0 ? `[REDACTED_STRING length=${value.length}]` : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("token") ||
      normalizedKey.includes("authorization") ||
      normalizedKey.includes("secret") ||
      normalizedKey.includes("password") ||
      normalizedKey.includes("prompt")
    ) {
      output[key] = typeof nestedValue === "string" ? `[REDACTED_STRING length=${nestedValue.length}]` : "[REDACTED]";
      continue;
    }

    output[key] = sanitizeForLog(nestedValue);
  }

  return output;
}

function buildStage4RequestBody(params: {
  imageId: string;
  humorFlavorId: string;
  flavorName: string | null;
  specificationVersion: string;
  normalizedSteps: NormalizedFlavorPipelineStep[];
  referenceCatalog: FlavorValidationReferenceCatalog;
}): Stage4BuildResult {
  const issues: CanonicalPayloadValidationIssue[] = [];
  const stepCompatibilityValidation = validateFlavorStepCompatibility(
    params.normalizedSteps,
    params.referenceCatalog,
  );
  const normalizedStepPayload = toExternalPromptConfigStepPayload(
    params.normalizedSteps,
    params.referenceCatalog,
    stepCompatibilityValidation,
  );
  const resolvedStepModels = resolveStepModels(params.normalizedSteps, params.referenceCatalog);
  const stepByOrder = new Map(params.normalizedSteps.map((step) => [step.orderBy, step]));

  function pushIssue(reason: string, fieldName?: string | null, order?: number | null) {
    const resolvedOrder = Number.isInteger(order) ? (order as number) : null;
    const step = resolvedOrder ? stepByOrder.get(resolvedOrder) ?? null : null;

    issues.push({
      reason,
      invalidStepId: step?.id ?? null,
      invalidFieldName: fieldName ?? null,
      stepOrder: resolvedOrder,
    });
  }

  if (normalizedStepPayload.length === 0) {
    pushIssue("No normalized humor flavor steps are available.", "steps");
  }
  if (!stepCompatibilityValidation.valid) {
    for (const compatibilityIssue of stepCompatibilityValidation.fatalIssues) {
      pushIssue(compatibilityIssue.message, compatibilityIssue.code, compatibilityIssue.orderBy);
    }
  }

  const modelIds = new Set(params.referenceCatalog.llmModels.map((model) => model.id));
  const outputTypeIds = new Set(params.referenceCatalog.llmOutputTypes.map((outputType) => outputType.id));
  const inputTypeIds = new Set(params.referenceCatalog.llmInputTypeIds);
  const stepTypeIds = new Set(params.referenceCatalog.humorFlavorStepTypeIds);
  const providerIds = new Set(params.referenceCatalog.llmProviderIds);

  for (const step of normalizedStepPayload) {
    if (!stepTypeIds.has(step.stepType.id)) {
      pushIssue(`Missing lookup row for stepType.id=${step.stepType.id}.`, "stepType.id", step.order);
    }
    if (!inputTypeIds.has(step.inputType.id)) {
      pushIssue(`Missing lookup row for inputType.id=${step.inputType.id}.`, "inputType.id", step.order);
    }
    if (!outputTypeIds.has(step.outputType.id)) {
      pushIssue(`Missing lookup row for outputType.id=${step.outputType.id}.`, "outputType.id", step.order);
    }
    if (!modelIds.has(step.model.id)) {
      pushIssue(`Missing lookup row for model.id=${step.model.id}.`, "model.id", step.order);
    }
    if (!providerIds.has(step.model.provider.id)) {
      pushIssue(
        `Missing lookup row for model.provider.id=${step.model.provider.id}.`,
        "model.provider.id",
        step.order,
      );
    }
    if (!step.model.providerModelId) {
      pushIssue(
        `Missing model.providerModelId for model.id=${step.model.id}.`,
        "model.providerModelId",
        step.order,
      );
    }
  }

  const stepModelIssues = validateResolvedStepModels(resolvedStepModels);
  for (const stepModelIssue of stepModelIssues.filter((issue) => issue.severity === "fatal")) {
    pushIssue(stepModelIssue.message, "model.providerModelId", stepModelIssue.order);
  }

  const issueStrings = issues.map((issue) => issue.reason);
  const externalPromptConfig: ExternalPromptConfigPayload = {
    specificationVersion: params.specificationVersion,
    steps: normalizedStepPayload,
  };
  const schemaIssues = validateExternalPromptConfigPayload(externalPromptConfig);
  for (const schemaIssue of schemaIssues) {
    const stepIssueMatch = schemaIssue.match(/^externalPromptConfig\.steps\[(\d+)\]\.([^ ]+)/);
    if (stepIssueMatch) {
      const stepIndex = Number(stepIssueMatch[1]);
      const fieldName = stepIssueMatch[2] ?? null;
      const step = normalizedStepPayload[stepIndex] ?? null;
      pushIssue(schemaIssue, fieldName, step?.order ?? null);
      continue;
    }
    if (schemaIssue.startsWith("externalPromptConfig.specificationVersion")) {
      pushIssue(schemaIssue, "specificationVersion");
      continue;
    }
    if (schemaIssue.startsWith("externalPromptConfig.steps")) {
      pushIssue(schemaIssue, "steps");
      continue;
    }
    pushIssue(schemaIssue, null);
  }

  if (!externalPromptConfig.specificationVersion || externalPromptConfig.steps.length === 0) {
    pushIssue("Missing required externalPromptConfig fields for Stage 4 request.", "specificationVersion/steps");
  }

  const uniqueIssues: CanonicalPayloadValidationIssue[] = [];
  const seenIssueKeys = new Set<string>();
  for (const issue of issues) {
    const key = `${issue.reason}|${issue.invalidStepId ?? ""}|${issue.invalidFieldName ?? ""}|${issue.stepOrder ?? ""}`;
    if (seenIssueKeys.has(key)) {
      continue;
    }
    seenIssueKeys.add(key);
    uniqueIssues.push(issue);
  }

  if (uniqueIssues.length > 0) {
    const firstIssue = uniqueIssues[0];
    return {
      requestBody: null,
      issues: Array.from(new Set([...issueStrings, ...schemaIssues])),
      normalizedStepPayload,
      stepCompatibilityValidation,
      resolvedStepModels,
      canonicalPayloadValidation: {
        reason: firstIssue?.reason ?? "Canonical payload validation failed.",
        invalidStepId: firstIssue?.invalidStepId ?? null,
        invalidFieldName: firstIssue?.invalidFieldName ?? null,
        flavorId: params.humorFlavorId,
        flavorName: params.flavorName,
        issues: uniqueIssues,
      },
    };
  }

  return {
    requestBody: {
      imageId: params.imageId,
      humorFlavorId: params.humorFlavorId,
      specificationVersion: params.specificationVersion,
      externalPromptConfig,
    },
    issues: [],
    normalizedStepPayload,
    stepCompatibilityValidation,
    resolvedStepModels,
    canonicalPayloadValidation: null,
  };
}

async function getAuthorizedProfileFromJwt(supabaseJwt: string) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(supabaseJwt);

  if (userError || !user) {
    return {
      user: null,
      profile: null,
      isAllowed: false,
    };
  }

  const scopedClient = createServerSupabaseClient(supabaseJwt);
  const { data: profile, error: profileError } = await scopedClient
    .schema("public")
    .from("profiles")
    .select("id, is_superadmin, is_matrix_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("[generate-captions] failed to load caller profile", {
      userId: user.id,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      code: profileError.code,
    });
  }

  return {
    user,
    profile: profile ?? null,
    isAllowed: hasAdminAccess(profile),
  };
}

async function readUpstreamBodySafely(response: Response): Promise<UpstreamBodyDetails> {
  try {
    const responseText = await response.text();
    const trimmed = responseText.trim();

    if (trimmed.length === 0) {
      return { responseJson: null, responseText: null };
    }

    try {
      return {
        responseJson: JSON.parse(trimmed) as unknown,
        responseText: trimmed,
      };
    } catch {
      return {
        responseJson: null,
        responseText: trimmed,
      };
    }
  } catch {
    return {
      responseJson: null,
      responseText: null,
    };
  }
}

function createStageError(context: StageFailureContext): Response {
  const {
    stage,
    phase,
    url,
    method,
    message,
    errorCode,
    finalCaptionRequestBody = null,
    canonicalPayloadValidation = null,
    stepCompatibilityValidation = null,
    resolvedStepModels = null,
    status = null,
    responseJson = null,
    responseText = null,
  } = context;

  const detail = [message, status ? `status ${status}` : null, responseText].filter(Boolean).join(": ");

  return Response.json(
    {
      error: `Stage ${stage.number} failed: ${stage.name}`,
      message: detail || `Upstream request failed during ${stage.name}.`,
      errorCode: errorCode ?? null,
      phase: phase ?? null,
      stageNumber: stage.number,
      stageName: stage.name,
      url,
      method,
      status,
      upstreamStatus: status,
      finalCaptionRequestBody,
      canonicalPayloadValidation,
      stepCompatibilityValidation,
      resolvedStepModels,
      responseJson,
      responseText,
    },
    { status: status && status >= 400 ? status : 500 },
  );
}

function getSupabaseJwt(request: Request, formData: FormData): string | null {
  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  const tokenFromBody = formData.get("supabaseAccessToken");
  if (typeof tokenFromBody === "string" && tokenFromBody.trim().length > 0) {
    return tokenFromBody.trim();
  }

  return null;
}

function normalizeCaptions(captions: string[]): string[] {
  return captions
    .filter((caption) => typeof caption === "string")
    .map((caption) => caption.trim())
    .filter((caption) => caption.length > 0);
}

function addJsonFormatGuidance(prompt: string | null): string {
  const normalizedPrompt = prompt?.trim() ?? "";
  if (normalizedPrompt.includes(FINAL_STEP_JSON_FORMAT_MARKER)) {
    return normalizedPrompt;
  }

  return [normalizedPrompt, FINAL_STEP_JSON_FORMAT_GUIDANCE]
    .filter((value) => value.length > 0)
    .join("\n\n");
}

function isSchemaMismatchFailure(responseJson: unknown, responseText: string | null): boolean {
  const jsonText =
    typeof responseJson === "string" ? responseJson : responseJson ? JSON.stringify(responseJson) : "";
  const combined = `${jsonText}\n${responseText ?? ""}`.toLowerCase();

  return (
    combined.includes("response did not match schema") ||
    combined.includes("no object generated")
  );
}

function responseContainsMissingStep2Output(responseJson: unknown, responseText: string | null): boolean {
  const jsonText =
    typeof responseJson === "string" ? responseJson : responseJson ? JSON.stringify(responseJson) : "";
  const combined = `${jsonText}\n${responseText ?? ""}`.toLowerCase();

  return combined.includes("no output found for step2output");
}

function responseContainsSpecificationVersionFailure(responseJson: unknown, responseText: string | null): boolean {
  const jsonText =
    typeof responseJson === "string" ? responseJson : responseJson ? JSON.stringify(responseJson) : "";
  const combined = `${jsonText}\n${responseText ?? ""}`.toLowerCase();

  return combined.includes("specificationversion");
}

function toPromptPreview(prompt: string | null, maxLength = 160): string | null {
  const normalized = prompt?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

async function loadFlavorPipelineSteps(
  humorFlavorId: string,
  supabaseJwt: string,
): Promise<FlavorPipelineStepSummary[] | null> {
  const numericFlavorId = Number(humorFlavorId.trim());
  if (!Number.isFinite(numericFlavorId)) {
    return null;
  }

  const supabase = createServerSupabaseClient(supabaseJwt);
  const { data, error } = await supabase
    .schema("public")
    .from("humor_flavor_steps")
    .select("id, order_by, llm_output_type_id, llm_user_prompt")
    .eq("humor_flavor_id", numericFlavorId)
    .order("order_by", { ascending: true });

  if (error) {
    console.warn("[generate-captions] failed to load flavor pipeline steps", {
      humorFlavorId: numericFlavorId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return null;
  }

  return ((data ?? []) as FlavorPipelineStepDebug[]).map((step) => ({
    id: step.id,
    orderBy: step.order_by,
    llmOutputTypeId: step.llm_output_type_id,
    llmUserPrompt: step.llm_user_prompt,
  }));
}

async function logMissingStep2OutputFailure(humorFlavorId: string, supabaseJwt: string): Promise<void> {
  const steps = await loadFlavorPipelineSteps(humorFlavorId, supabaseJwt);
  if (!steps || steps.length === 0) {
    return;
  }

  const step2 = steps.find((step) => step.orderBy === 2) ?? null;

  console.warn("[generate-captions][pipeline] missing step2Output", {
    humorFlavorId,
    stepIds: steps.map((step) => step.id),
    orderBy: steps.map((step) => step.orderBy),
    step2LlmOutputTypeId: step2?.llmOutputTypeId ?? null,
    step2PromptPreview: toPromptPreview(step2?.llmUserPrompt ?? null),
  });
}

async function loadFlavorFailureDiagnostics(
  humorFlavorId: string,
  supabaseJwt: string,
  finalStep: FinalStepDebug | null,
): Promise<FlavorFailureDiagnostics | null> {
  const numericFlavorId = Number(humorFlavorId.trim());
  if (!Number.isFinite(numericFlavorId)) {
    return null;
  }

  const supabase = createServerSupabaseClient(supabaseJwt);
  const [steps, flavorResult] = await Promise.all([
    loadFlavorPipelineSteps(humorFlavorId, supabaseJwt),
    supabase
      .schema("public")
      .from("humor_flavors")
      .select("slug")
      .eq("id", numericFlavorId)
      .limit(1),
  ]);

  if (!steps || steps.length === 0) {
    return null;
  }

  if (flavorResult.error) {
    console.warn("[generate-captions] failed to load flavor slug for diagnostics", {
      humorFlavorId: numericFlavorId,
      message: flavorResult.error.message,
      details: flavorResult.error.details,
      hint: flavorResult.error.hint,
      code: flavorResult.error.code,
    });
  }

  const flavorSlug = (flavorResult.data?.[0]?.slug ?? null) as string | null;
  const finalStepFromPipeline = steps[steps.length - 1] ?? null;

  return {
    flavorSlug,
    stepIds: steps.map((step) => step.id),
    orderByValues: steps.map((step) => step.orderBy),
    finalStepLlmOutputTypeId: finalStep?.llmOutputTypeId ?? finalStepFromPipeline?.llmOutputTypeId ?? null,
    finalStepPromptPreview: toPromptPreview(finalStep?.llmUserPrompt ?? finalStepFromPipeline?.llmUserPrompt ?? null),
  };
}

async function logFlavorFailureDiagnostics(
  humorFlavorId: string,
  supabaseJwt: string,
  finalStep: FinalStepDebug | null,
): Promise<void> {
  const diagnostics = await loadFlavorFailureDiagnostics(humorFlavorId, supabaseJwt, finalStep);
  if (!diagnostics) {
    return;
  }

  console.warn("[generate-captions][pipeline] flavor failure diagnostics", {
    humorFlavorId,
    flavorSlug: diagnostics.flavorSlug,
    stepIds: diagnostics.stepIds,
    orderBy: diagnostics.orderByValues,
    finalStepLlmOutputTypeId: diagnostics.finalStepLlmOutputTypeId,
    finalStepPromptPreview: diagnostics.finalStepPromptPreview,
  });
}

async function ensureFinalStepPrompt(
  humorFlavorId: string,
  supabaseJwt: string,
): Promise<FinalStepDebug | null> {
  const numericFlavorId = Number(humorFlavorId.trim());
  if (!Number.isFinite(numericFlavorId)) {
    return null;
  }

  const supabase = createServerSupabaseClient(supabaseJwt);
  const { data, error: selectError } = await supabase
    .schema("public")
    .from("humor_flavor_steps")
    .select(
      "id, order_by, humor_flavor_step_type_id, llm_output_type_id, llm_system_prompt, llm_user_prompt",
    )
    .eq("humor_flavor_id", numericFlavorId)
    .order("order_by", { ascending: false })
    .limit(1);

  if (selectError) {
    console.warn("[generate-captions] failed to load final step", {
      humorFlavorId: numericFlavorId,
      message: selectError.message,
      details: selectError.details,
      hint: selectError.hint,
      code: selectError.code,
    });
    return null;
  }

  const finalStep = ((data ?? [])[0] ?? null) as FinalStepRow | null;
  if (!finalStep) {
    console.warn("[generate-captions] no final step found", {
      humorFlavorId: numericFlavorId,
    });
    return null;
  }

  const expectedSystemPrompt = addJsonFormatGuidance(finalStep.llm_system_prompt);
  const expectedUserPrompt = addJsonFormatGuidance(finalStep.llm_user_prompt);
  const hasExpectedFinalStepShape =
    finalStep.llm_output_type_id === FINAL_STEP_LLM_OUTPUT_TYPE_ID &&
    finalStep.llm_system_prompt === expectedSystemPrompt &&
    finalStep.llm_user_prompt === expectedUserPrompt;
  if (!hasExpectedFinalStepShape) {
    console.warn("[generate-captions] final step does not match expected caption contract", {
      humorFlavorId: numericFlavorId,
      finalStepId: finalStep.id,
      orderBy: finalStep.order_by,
      llmOutputTypeId: finalStep.llm_output_type_id,
      hasJsonGuidanceInSystemPrompt: (finalStep.llm_system_prompt ?? "").includes(FINAL_STEP_JSON_FORMAT_MARKER),
      hasJsonGuidanceInUserPrompt: (finalStep.llm_user_prompt ?? "").includes(FINAL_STEP_JSON_FORMAT_MARKER),
    });
  }

  return {
    id: finalStep.id,
    orderBy: finalStep.order_by,
    humorFlavorStepTypeId: finalStep.humor_flavor_step_type_id,
    llmOutputTypeId: finalStep.llm_output_type_id,
    llmSystemPrompt: finalStep.llm_system_prompt,
    llmUserPrompt: finalStep.llm_user_prompt,
  };
}

async function loadFlavorValidationData(humorFlavorId: string, supabaseJwt: string) {
  const numericFlavorId = Number(humorFlavorId.trim());
  if (!Number.isFinite(numericFlavorId)) {
    return null;
  }

  const supabase = createServerSupabaseClient(supabaseJwt);
  const [flavorResult, stepsResult, llmModelsResult, llmInputTypesResult, llmOutputTypesResult, stepTypesResult, llmProvidersResult] =
    await Promise.all([
      supabase
        .schema("public")
        .from("humor_flavors")
        .select("id, slug, description")
        .eq("id", numericFlavorId)
        .limit(1),
      supabase
        .schema("public")
        .from("humor_flavor_steps")
        .select(
          "id, humor_flavor_id, order_by, humor_flavor_step_type_id, llm_input_type_id, llm_output_type_id, llm_model_id, llm_temperature, description, llm_system_prompt, llm_user_prompt",
        )
        .eq("humor_flavor_id", numericFlavorId)
        .order("order_by", { ascending: true }),
      supabase.schema("public").from("llm_models").select("id, llm_provider_id, provider_model_id"),
      supabase.schema("public").from("llm_input_types").select("id"),
      supabase.schema("public").from("llm_output_types").select("id, slug"),
      supabase.schema("public").from("humor_flavor_step_types").select("id"),
      supabase.schema("public").from("llm_providers").select("id"),
    ]);

  if (flavorResult.error) {
    console.warn("[generate-captions] failed to load flavor for validation", {
      humorFlavorId: numericFlavorId,
      message: flavorResult.error.message,
      details: flavorResult.error.details,
      hint: flavorResult.error.hint,
      code: flavorResult.error.code,
    });
    return null;
  }

  if (stepsResult.error) {
    console.warn("[generate-captions] failed to load flavor steps for validation", {
      humorFlavorId: numericFlavorId,
      message: stepsResult.error.message,
      details: stepsResult.error.details,
      hint: stepsResult.error.hint,
      code: stepsResult.error.code,
    });
    return null;
  }

  if (llmModelsResult.error || llmInputTypesResult.error || llmOutputTypesResult.error || stepTypesResult.error || llmProvidersResult.error) {
    console.warn("[generate-captions] failed to load reference tables for validation", {
      humorFlavorId: numericFlavorId,
      llmModelsError: llmModelsResult.error?.message ?? null,
      llmInputTypesError: llmInputTypesResult.error?.message ?? null,
      llmOutputTypesError: llmOutputTypesResult.error?.message ?? null,
      stepTypesError: stepTypesResult.error?.message ?? null,
      llmProvidersError: llmProvidersResult.error?.message ?? null,
    });
    return null;
  }

  const referenceCatalog: FlavorValidationReferenceCatalog = {
    llmModels: ((llmModelsResult.data ?? []) as LlmModelReferenceRow[]).map((row) => ({
      id: row.id,
      llmProviderId: row.llm_provider_id,
      providerModelId: row.provider_model_id,
    })),
    llmInputTypeIds: ((llmInputTypesResult.data ?? []) as IdRow[]).map((row) => row.id),
    llmOutputTypes: ((llmOutputTypesResult.data ?? []) as LlmOutputTypeReferenceRow[]).map((row) => ({
      id: row.id,
      slug: row.slug,
    })),
    humorFlavorStepTypeIds: ((stepTypesResult.data ?? []) as IdRow[]).map((row) => row.id),
    llmProviderIds: ((llmProvidersResult.data ?? []) as IdRow[]).map((row) => row.id),
  };

  const flavor = ((flavorResult.data ?? [])[0] ?? null) as FlavorValidationFlavorRow | null;
  const steps = ((stepsResult.data ?? []) as FlavorValidationStepRow[]).map(mapValidationStepToFlavorStep);

  if (!flavor) {
    return null;
  }

  return {
    flavor,
    steps,
    referenceCatalog,
  };
}

async function generatePresignedUrl(contentType: string, externalApiBearerToken: string): Promise<PresignedUrlResponse> {
  const stage: StageDetails = { number: 1, name: "generate presigned URL" };
  const url = buildExternalApiUrl(GENERATE_PRESIGNED_URL_PATH);
  const method = "POST";

  try {
    const response = await fetchWithTimeout(url, {
      method,
      headers: {
        Authorization: `Bearer ${externalApiBearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contentType,
      }),
      cache: "no-store",
    });

    const { responseJson, responseText } = await readUpstreamBodySafely(response);

    if (!response.ok) {
      throw {
        stage,
        url,
        method,
        status: response.status,
        phase: "preparing_image",
        responseJson,
        responseText,
        message: "Could not generate presigned URL",
      } satisfies StageFailureContext;
    }

    if (!isRecord(responseJson)) {
      throw {
        stage,
        url,
        method,
        status: response.status,
        phase: "preparing_image",
        responseJson,
        responseText,
        message: "Presigned URL response was not a JSON object",
      } satisfies StageFailureContext;
    }

    const presignedUrl =
      typeof responseJson.presignedUrl === "string" ? responseJson.presignedUrl.trim() : "";
    const cdnUrl = typeof responseJson.cdnUrl === "string" ? responseJson.cdnUrl.trim() : "";

    if (!presignedUrl || !cdnUrl) {
      throw {
        stage,
        url,
        method,
        status: response.status,
        phase: "preparing_image",
        responseJson,
        responseText,
        message: "Presigned URL response did not include both presignedUrl and cdnUrl",
      } satisfies StageFailureContext;
    }

    return { presignedUrl, cdnUrl };
  } catch (error) {
    if (isRecord(error) && "stage" in error) {
      throw error;
    }

    throw {
      stage,
      phase: "preparing_image",
      url,
      method,
      message: getErrorMessage(error),
    } satisfies StageFailureContext;
  }
}

async function uploadToPresignedUrl(presignedUrl: string, image: File): Promise<void> {
  const stage: StageDetails = { number: 2, name: "upload image bytes" };
  const method = "PUT";

  try {
    const response = await fetchWithTimeout(presignedUrl, {
      method,
      headers: {
        "Content-Type": image.type || "application/octet-stream",
      },
      body: image,
      cache: "no-store",
    });

    const { responseJson, responseText } = await readUpstreamBodySafely(response);

    if (!response.ok) {
      throw {
        stage,
        url: presignedUrl,
        method,
        status: response.status,
        phase: "uploading_image",
        responseJson,
        responseText,
        message: "Could not upload image bytes to presigned URL",
      } satisfies StageFailureContext;
    }
  } catch (error) {
    if (isRecord(error) && "stage" in error) {
      throw error;
    }

    throw {
      stage,
      phase: "uploading_image",
      url: presignedUrl,
      method,
      message: getErrorMessage(error),
    } satisfies StageFailureContext;
  }
}

async function registerImageFromUrl(cdnUrl: string, externalApiBearerToken: string): Promise<string> {
  const stage: StageDetails = { number: 3, name: "register uploaded image URL" };
  const url = buildExternalApiUrl(UPLOAD_IMAGE_FROM_URL_PATH);
  const method = "POST";

  try {
    const response = await fetchWithTimeout(url, {
      method,
      headers: {
        Authorization: `Bearer ${externalApiBearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageUrl: cdnUrl,
        isCommonUse: false,
      }),
      cache: "no-store",
    });

    const { responseJson, responseText } = await readUpstreamBodySafely(response);

    if (!response.ok) {
      throw {
        stage,
        url,
        method,
        status: response.status,
        phase: "registering_image",
        responseJson,
        responseText,
        message: "Could not register uploaded image URL",
      } satisfies StageFailureContext;
    }

    if (!isRecord(responseJson)) {
      throw {
        stage,
        url,
        method,
        status: response.status,
        phase: "registering_image",
        responseJson,
        responseText,
        message: "Image registration response was not a JSON object",
      } satisfies StageFailureContext;
    }

    const imageId = typeof responseJson.imageId === "string" ? responseJson.imageId.trim() : "";

    if (!imageId) {
      throw {
        stage,
        url,
        method,
        status: response.status,
        phase: "registering_image",
        responseJson,
        responseText,
        message: "Image registration response did not include imageId",
      } satisfies StageFailureContext;
    }

    return imageId;
  } catch (error) {
    if (isRecord(error) && "stage" in error) {
      throw error;
    }

    throw {
      stage,
      phase: "registering_image",
      url,
      method,
      message: getErrorMessage(error),
    } satisfies StageFailureContext;
  }
}

async function generateCaptionsForFlavor(
  imageId: string,
  humorFlavorId: string,
  externalApiBearerToken: string,
  supabaseJwt: string,
  selectedFlavor: SelectedFlavorDebug | null,
  finalStep: FinalStepDebug | null,
  normalizedSteps: NormalizedFlavorPipelineStep[],
  referenceCatalog: FlavorValidationReferenceCatalog,
  specificationVersion?: string,
) {
  const stage: StageDetails = { number: 4, name: "generate captions for selected flavor" };
  const url = buildExternalApiUrl(GENERATE_CAPTIONS_PATH);
  const method = "POST";
  let requestBody: unknown = null;
  let resolvedStepModels: ResolvedStepModel[] | null = null;
  let stepCompatibilityValidation: FlavorStepCompatibilityResult | null = null;
  const normalizedImageId = imageId.trim();
  const normalizedHumorFlavorId = humorFlavorId.trim();
  const normalizedSpecificationVersion =
    specificationVersion?.trim() && specificationVersion.trim().length > 0
      ? specificationVersion.trim()
      : DEFAULT_SPECIFICATION_VERSION;

  try {
    if (!normalizedImageId) {
      throw {
        stage,
        phase: "generating_captions",
        url,
        method,
        message: "Missing imageId before Stage 4 caption request",
      } satisfies StageFailureContext;
    }

    if (!normalizedHumorFlavorId) {
      throw {
        stage,
        phase: "generating_captions",
        url,
        method,
        message: "Missing humorFlavorId before Stage 4 caption request",
      } satisfies StageFailureContext;
    }

    if (normalizedHumorFlavorId === "undefined" || normalizedHumorFlavorId === "null") {
      throw {
        stage,
        phase: "generating_captions",
        url,
        method,
        message: `Invalid humorFlavorId before Stage 4 caption request: ${normalizedHumorFlavorId}`,
      } satisfies StageFailureContext;
    }

    const payloadBuild = buildStage4RequestBody({
      imageId: normalizedImageId,
      humorFlavorId: normalizedHumorFlavorId,
      flavorName: selectedFlavor?.name ?? null,
      specificationVersion: normalizedSpecificationVersion,
      normalizedSteps,
      referenceCatalog,
    });
    const normalizedStepPayload = payloadBuild.normalizedStepPayload;
    stepCompatibilityValidation = payloadBuild.stepCompatibilityValidation;
    resolvedStepModels = payloadBuild.resolvedStepModels;

    if (!payloadBuild.requestBody) {
      throw {
        stage,
        phase: "generating_captions",
        url,
        method,
        errorCode: "canonical_payload_validation_failed",
        status: 422,
        canonicalPayloadValidation: payloadBuild.canonicalPayloadValidation,
        stepCompatibilityValidation: payloadBuild.stepCompatibilityValidation,
        resolvedStepModels: payloadBuild.resolvedStepModels,
        message:
          payloadBuild.canonicalPayloadValidation?.reason ??
          `Payload construction failed for Stage 4: ${payloadBuild.issues.join(" | ")}`,
        responseJson: {
          payloadBuildIssues: payloadBuild.issues,
          normalizedStepCount: normalizedStepPayload.length,
          normalizedStepPreview: normalizedStepPayload,
          stepCompatibilityValidation: payloadBuild.stepCompatibilityValidation,
          resolvedStepModels: payloadBuild.resolvedStepModels,
          canonicalPayloadValidation: payloadBuild.canonicalPayloadValidation,
        },
        finalCaptionRequestBody: null,
      } satisfies StageFailureContext;
    }

    const richRequestBody = payloadBuild.requestBody;

    console.info("[generate-captions][stage4] request body", {
      requestBody: sanitizeForLog(richRequestBody),
      selectedFlavor,
    });

    requestBody = richRequestBody;
    const response = await fetchWithTimeout(url, {
      method,
      headers: {
        Authorization: `Bearer ${externalApiBearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    }, GENERATE_CAPTIONS_TIMEOUT_MS);

    const { responseJson, responseText } = await readUpstreamBodySafely(response);

    console.info("[generate-captions][stage4] raw response json", {
      ok: response.ok,
      status: response.status,
      responseJson,
    });

    if (!response.ok) {
      await logFlavorFailureDiagnostics(normalizedHumorFlavorId, supabaseJwt, finalStep);

      if (responseContainsMissingStep2Output(responseJson, responseText)) {
        await logMissingStep2OutputFailure(normalizedHumorFlavorId, supabaseJwt);
      }

      if (responseContainsSpecificationVersionFailure(responseJson, responseText)) {
        console.warn("[generate-captions][stage4] specificationVersion failure", {
          selectedFlavorId: normalizedHumorFlavorId,
          finalStepRowId: finalStep?.id ?? null,
          finalStepLlmOutputTypeId: finalStep?.llmOutputTypeId ?? null,
        });
      }

      if (isSchemaMismatchFailure(responseJson, responseText) && finalStep) {
        console.warn("[generate-captions][stage4] schema mismatch", {
          selectedFlavorId: normalizedHumorFlavorId,
          finalStepRowId: finalStep.id,
          finalStepLlmUserPrompt: finalStep.llmUserPrompt,
          finalStepLlmOutputTypeId: finalStep.llmOutputTypeId,
        });
      }

      throw {
        stage,
        phase: "generating_captions",
        url,
        method,
        finalCaptionRequestBody: requestBody,
        stepCompatibilityValidation,
        resolvedStepModels,
        status: response.status,
        responseJson,
        responseText,
        message: "Could not generate captions",
      } satisfies StageFailureContext;
    }

    if (responseJson === null) {
      throw {
        stage,
        phase: "generating_captions",
        url,
        method,
        finalCaptionRequestBody: requestBody,
        stepCompatibilityValidation,
        resolvedStepModels,
        status: response.status,
        responseJson,
        responseText,
        message: "Caption generation response was empty",
      } satisfies StageFailureContext;
    }

    const extracted = extractCaptionsFromApiResponse(responseJson);
    if (extracted.length === 0) {
      console.warn("[generate-captions][stage4] no displayable captions extracted", {
        rawResponseJson: responseJson,
        parsedResult: extracted,
      });
    }

    const parsedCaptions = normalizeCaptions(extracted);

    console.info("[generate-captions][stage4] parsed captions", {
      count: parsedCaptions.length,
      parsedResult: parsedCaptions,
    });

    return {
      captions: parsedCaptions,
      debug: {
        phase: "generating_captions",
        selectedFlavor,
        normalizedHumorFlavorId,
        normalizedStepCount: normalizedStepPayload.length,
        finalCaptionRequestBody: requestBody,
        canonicalPayloadValidation: null,
        stepCompatibilityValidation,
        resolvedStepModels,
        externalPromptConfig: isRecord(requestBody) ? requestBody.externalPromptConfig ?? null : null,
        rawApiResponse: {
          status: response.status,
          responseJson,
          responseText,
        },
      } satisfies CaptionRouteDebugPayload,
    };
  } catch (error) {
    if (isRecord(error) && "stage" in error) {
      throw error;
    }

    throw {
      stage,
      phase: "generating_captions",
      url,
      method,
      finalCaptionRequestBody: requestBody,
      stepCompatibilityValidation,
      resolvedStepModels,
      message: getErrorMessage(error),
    } satisfies StageFailureContext;
  }
}

function parseSelectedFlavorDebug(value: FormDataEntryValue | null): SelectedFlavorDebug | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    if (!id) {
      return null;
    }

    const name = typeof parsed.name === "string" ? parsed.name.trim() : undefined;
    const tone = typeof parsed.tone === "string" ? parsed.tone.trim() : undefined;

    return {
      id,
      name: name && name.length > 0 ? name : undefined,
      tone: tone && tone.length > 0 ? tone : undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");
    const humorFlavorId = formData.get("humorFlavorId");
    const selectedFlavor = parseSelectedFlavorDebug(formData.get("selectedFlavor"));
    const specificationVersionFromFormData = formData.get("specificationVersion");
    const specificationVersion =
      typeof specificationVersionFromFormData === "string" &&
      specificationVersionFromFormData.trim().length > 0
        ? specificationVersionFromFormData.trim()
        : DEFAULT_SPECIFICATION_VERSION;

    if (!(image instanceof File)) {
      return Response.json(
        { error: "Missing required image file in form data." },
        { status: 400 },
      );
    }

    if (typeof humorFlavorId !== "string" || humorFlavorId.trim().length === 0) {
      return Response.json(
        {
          error: "Missing required humorFlavorId in form data.",
          message: "Include a non-empty humorFlavorId string from the selected flavor row id.",
        },
        { status: 400 },
      );
    }

    const normalizedHumorFlavorId = humorFlavorId.trim();
    if (normalizedHumorFlavorId === "undefined" || normalizedHumorFlavorId === "null") {
      return Response.json(
        {
          error: "Invalid humorFlavorId in form data.",
          message: `Received humorFlavorId=${normalizedHumorFlavorId}. Pass the selected flavor's real id.`,
        },
        { status: 400 },
      );
    }

    const supabaseJwt = getSupabaseJwt(request, formData);
    if (!supabaseJwt) {
      return Response.json(
        {
          error: "Missing Supabase JWT access token.",
          message: "Provide the logged-in user's token as Bearer auth header or supabaseAccessToken form field.",
        },
        { status: 401 },
      );
    }

    const access = await getAuthorizedProfileFromJwt(supabaseJwt);
    if (!access.user) {
      return Response.json(
        {
          error: "Authentication failed.",
          message: "Could not resolve current user from Supabase JWT.",
        },
        { status: 401 },
      );
    }

    if (!access.isAllowed) {
      return Response.json(
        {
          error: "Forbidden.",
          message: "Only superadmins or matrix admins can generate captions.",
        },
        { status: 403 },
      );
    }

    const flavorValidationData = await loadFlavorValidationData(normalizedHumorFlavorId, supabaseJwt);
    if (!flavorValidationData) {
      return Response.json(
        {
          error: "Failed to validate selected flavor.",
          message: "Could not load the selected flavor and steps for preflight validation.",
        },
        { status: 422 },
      );
    }

    const normalizedPipelineValidation = validateAndNormalizeFlavorPipelineSteps(flavorValidationData.steps);
    const stepCompatibilityValidation = validateFlavorStepCompatibility(
      normalizedPipelineValidation.normalizedSteps,
      flavorValidationData.referenceCatalog,
    );
    const normalizedStepPayload = toExternalPromptConfigStepPayload(
      normalizedPipelineValidation.normalizedSteps,
      flavorValidationData.referenceCatalog,
      stepCompatibilityValidation,
    );
    if (!normalizedPipelineValidation.valid) {
      const blockingIssues = normalizedPipelineValidation.issues.filter((issue) => issue.severity === "fatal");
      return Response.json(
        {
          error: "Selected humor flavor has fatal step validation issues.",
          message: "Fix required step fields/order before generating captions.",
          phase: "validating_flavor",
          validationIssues: normalizedPipelineValidation.issues,
          blockingIssues,
          normalizedStepPreview: normalizedStepPayload,
          stepCompatibilityValidation,
        },
        { status: 422 },
      );
    }
    const flavorHealth = validateFlavor(
      {
        id: String(flavorValidationData.flavor.id),
        slug: flavorValidationData.flavor.slug,
      },
      flavorValidationData.steps,
      flavorValidationData.referenceCatalog,
    );

    if (!flavorHealth.valid) {
      console.warn("[generate-captions] selected flavor has blocking health validation issues", {
        flavorId: flavorHealth.flavorId,
        flavorSlug: flavorHealth.flavorSlug,
        status: flavorHealth.status,
        statusReason: flavorHealth.statusReason,
        failureReasons: flavorHealth.failureReasons,
        diagnostics: flavorHealth.diagnostics,
        issues: flavorHealth.issues,
      });

      return Response.json(
        {
          error: "Selected humor flavor failed health validation.",
          message:
            flavorHealth.diagnostics[0] ??
            flavorHealth.statusReason ??
            "Fix the flavor configuration before generating captions.",
          phase: "validating_flavor",
          flavorHealth,
        },
        { status: 422 },
      );
    }

    const resolvedStepModels = resolveStepModels(
      normalizedPipelineValidation.normalizedSteps,
      flavorValidationData.referenceCatalog,
    );
    const stepModelIssues = validateResolvedStepModels(resolvedStepModels);
    const fatalStepModelIssues = stepModelIssues.filter((issue) => issue.severity === "fatal");
    if (fatalStepModelIssues.length > 0) {
      return Response.json(
        {
          error: "Selected humor flavor includes invalid model configuration.",
          message: "Fix model mapping for one or more flavor steps before generating captions.",
          phase: "validating_flavor",
          modelValidationIssues: fatalStepModelIssues,
          resolvedStepModels,
        },
        { status: 422 },
      );
    }

    const contentType = image.type || "application/octet-stream";
    const externalApiBearerToken = getExternalApiBearerToken(supabaseJwt);
    const { presignedUrl, cdnUrl } = await generatePresignedUrl(contentType, externalApiBearerToken);
    await uploadToPresignedUrl(presignedUrl, image);
    const imageId = await registerImageFromUrl(cdnUrl, externalApiBearerToken);

    console.info("[generate-captions] selected flavor", selectedFlavor);
    console.info("[generate-captions] selected flavor id", normalizedHumorFlavorId);

    const finalStep = await ensureFinalStepPrompt(normalizedHumorFlavorId, supabaseJwt);

    const captionsPayload = await generateCaptionsForFlavor(
      imageId,
      normalizedHumorFlavorId,
      externalApiBearerToken,
      supabaseJwt,
      selectedFlavor,
      finalStep,
      normalizedPipelineValidation.normalizedSteps,
      flavorValidationData.referenceCatalog,
      specificationVersion,
    );

    return Response.json({
      ...captionsPayload,
      debug: {
        ...(isRecord(captionsPayload.debug) ? captionsPayload.debug : {}),
        validationPhase: "validating_flavor",
        selectedFlavor: selectedFlavor ?? {
          id: normalizedHumorFlavorId,
          name: flavorValidationData.flavor.description ?? undefined,
        },
        normalizedHumorFlavorId,
        normalizedStepCount: normalizedStepPayload.length,
        finalCaptionRequestBody: isRecord(captionsPayload.debug) ? captionsPayload.debug.finalCaptionRequestBody : null,
        canonicalPayloadValidation:
          isRecord(captionsPayload.debug) ? captionsPayload.debug.canonicalPayloadValidation ?? null : null,
        stepCompatibilityValidation:
          isRecord(captionsPayload.debug)
            ? (captionsPayload.debug.stepCompatibilityValidation as FlavorStepCompatibilityResult | null) ??
              stepCompatibilityValidation
            : stepCompatibilityValidation,
        resolvedStepModels:
          isRecord(captionsPayload.debug) && Array.isArray(captionsPayload.debug.resolvedStepModels)
            ? (captionsPayload.debug.resolvedStepModels as ResolvedStepModel[])
            : resolvedStepModels,
        externalPromptConfig: isRecord(captionsPayload.debug) ? captionsPayload.debug.externalPromptConfig : null,
        rawApiResponse: isRecord(captionsPayload.debug) ? captionsPayload.debug.rawApiResponse : null,
        validationIssues: normalizedPipelineValidation.issues,
      },
    });
  } catch (error) {
    if (isRecord(error) && isRecord(error.stage) && typeof error.url === "string" && typeof error.method === "string") {
      const stageRecord = error.stage;
      const stageNumber = stageRecord.number;
      const stageName = stageRecord.name;

      if (
        (stageNumber === 1 || stageNumber === 2 || stageNumber === 3 || stageNumber === 4) &&
        typeof stageName === "string"
      ) {
        return createStageError({
          stage: { number: stageNumber, name: stageName },
          phase: typeof error.phase === "string" ? (error.phase as CaptionGenerationStage) : undefined,
          url: error.url,
          method: error.method,
          errorCode: typeof error.errorCode === "string" ? error.errorCode : undefined,
          status: typeof error.status === "number" ? error.status : null,
          finalCaptionRequestBody: "finalCaptionRequestBody" in error ? error.finalCaptionRequestBody : null,
          canonicalPayloadValidation:
            "canonicalPayloadValidation" in error ? (error.canonicalPayloadValidation as CanonicalPayloadValidationError | null) : null,
          stepCompatibilityValidation:
            "stepCompatibilityValidation" in error
              ? (error.stepCompatibilityValidation as FlavorStepCompatibilityResult | null)
              : null,
          resolvedStepModels: "resolvedStepModels" in error ? (error.resolvedStepModels as ResolvedStepModel[] | null) : null,
          responseJson: "responseJson" in error ? error.responseJson : null,
          responseText: typeof error.responseText === "string" ? error.responseText : null,
          message: typeof error.message === "string" ? error.message : "Unknown stage error",
        });
      }
    }

    const message = getErrorMessage(error);
    return Response.json(
      {
        error: "Caption generation request failed.",
        message,
      },
      { status: 500 },
    );
  }
}
