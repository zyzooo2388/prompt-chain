import { extractCaptionsFromApiResponse } from "@/lib/api/extractCaptionsFromApiResponse";

export type GenerateCaptionsApiInput = {
  image: File;
  humorFlavorId: string;
  supabaseAccessToken: string;
  selectedFlavor: {
    id: string;
    name: string;
    tone: string;
  };
  specificationVersion?: string;
};

export type CaptionGenerationDebug = {
  phase?: string | null;
  stageName?: string | null;
  stageNumber?: number | null;
  upstreamStatus?: number | null;
  upstreamContentType?: string | null;
  upstreamBodyKind?: string | null;
  selectedFlavor?: unknown;
  errorDiagnostics?: unknown;
  timingMs?: unknown;
  payloadSizeBytes?: number | null;
  flavorComplexity?: unknown;
  finalCaptionRequestBody?: unknown;
  canonicalPayloadValidation?: unknown;
  stepCompatibilityValidation?: unknown;
  resolvedStepModels?: unknown;
  externalPromptConfig?: unknown;
  rawApiResponse?: unknown;
  errorPayload?: unknown;
};

export type GenerateCaptionsResult = {
  captions: string[];
  debug: CaptionGenerationDebug;
};

export class CaptionGenerationApiError extends Error {
  status: number;
  payload: Record<string, unknown> | null;
  debug: CaptionGenerationDebug;

  constructor(message: string, status: number, payload: Record<string, unknown> | null) {
    super(message);
    this.name = "CaptionGenerationApiError";
    this.status = status;
    this.payload = payload;
    const nestedMetrics = getNestedMetricsFromPayload(payload);
    this.debug = {
      phase: typeof payload?.phase === "string" ? payload.phase : null,
      stageName: typeof payload?.stageName === "string" ? payload.stageName : null,
      stageNumber: typeof payload?.stageNumber === "number" ? payload.stageNumber : null,
      upstreamStatus:
        typeof payload?.upstreamStatus === "number"
          ? payload.upstreamStatus
          : typeof payload?.status === "number"
            ? payload.status
            : null,
      upstreamContentType: typeof payload?.upstreamContentType === "string" ? payload.upstreamContentType : null,
      upstreamBodyKind: typeof payload?.upstreamBodyKind === "string" ? payload.upstreamBodyKind : null,
      selectedFlavor: payload?.selectedFlavor ?? null,
      errorDiagnostics: payload?.errorDiagnostics ?? null,
      timingMs: nestedMetrics.timingMs,
      payloadSizeBytes: nestedMetrics.payloadSizeBytes,
      flavorComplexity: nestedMetrics.flavorComplexity,
      finalCaptionRequestBody: payload?.finalCaptionRequestBody ?? null,
      canonicalPayloadValidation: payload?.canonicalPayloadValidation ?? null,
      stepCompatibilityValidation: payload?.stepCompatibilityValidation ?? null,
      resolvedStepModels: payload?.resolvedStepModels ?? null,
      externalPromptConfig: payload?.externalPromptConfig ?? null,
      rawApiResponse: payload?.rawApiResponse ?? payload?.responseJson ?? null,
      errorPayload: payload,
    };
  }
}

function normalizeCaptions(captions: string[]): string[] {
  return captions
    .filter((caption) => typeof caption === "string")
    .map((caption) => caption.trim())
    .filter((caption) => caption.length > 0);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getNestedMetricsFromPayload(payload: Record<string, unknown> | null) {
  const nested = toRecord(payload?.responseJson);
  return {
    timingMs: payload?.timingMs ?? nested?.timingMs ?? null,
    payloadSizeBytes:
      typeof payload?.payloadSizeBytes === "number"
        ? payload.payloadSizeBytes
        : typeof nested?.payloadSizeBytes === "number"
          ? nested.payloadSizeBytes
          : null,
    flavorComplexity: payload?.flavorComplexity ?? nested?.flavorComplexity ?? null,
  };
}

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim();
  return /<!doctype html|<html[\s>]|<body[\s>]|<head[\s>]/i.test(trimmed);
}

function appendErrorDetail(detail: string, next: string | null): string {
  if (!next) {
    return detail;
  }
  if (!detail) {
    return next;
  }
  return detail.includes(next) ? detail : `${detail}: ${next}`;
}

function buildErrorDetail(responseText: string, payload: Record<string, unknown> | null): string {
  let detail = looksLikeHtml(responseText) ? "" : responseText.trim();
  if (payload) {
    const payloadMessage =
      typeof payload.message === "string" && !looksLikeHtml(payload.message) ? payload.message : null;
    detail = appendErrorDetail(detail, payloadMessage);

    if (typeof payload.error === "string") {
      detail = appendErrorDetail(detail, payload.error);
    }
    if (typeof payload.phase === "string") {
      detail = appendErrorDetail(detail, `phase ${payload.phase}`);
    }
    if (typeof payload.stageName === "string") {
      detail = appendErrorDetail(detail, payload.stageName);
    }
    if (typeof payload.upstreamStatus === "number") {
      detail = appendErrorDetail(detail, `upstream ${payload.upstreamStatus}`);
    }

    const canonicalPayloadValidation = toRecord(payload.canonicalPayloadValidation);
    if (canonicalPayloadValidation) {
      const reason =
        typeof canonicalPayloadValidation.reason === "string" ? canonicalPayloadValidation.reason : null;
      const invalidStepId =
        typeof canonicalPayloadValidation.invalidStepId === "string"
          ? canonicalPayloadValidation.invalidStepId
          : null;
      const invalidFieldName =
        typeof canonicalPayloadValidation.invalidFieldName === "string"
          ? canonicalPayloadValidation.invalidFieldName
          : null;
      const flavorName =
        typeof canonicalPayloadValidation.flavorName === "string" ? canonicalPayloadValidation.flavorName : null;
      const flavorId =
        typeof canonicalPayloadValidation.flavorId === "string" ? canonicalPayloadValidation.flavorId : null;

      const canonicalParts = [
        reason ? `reason ${reason}` : null,
        invalidStepId ? `step ${invalidStepId}` : null,
        invalidFieldName ? `field ${invalidFieldName}` : null,
        flavorName || flavorId ? `flavor ${flavorName ?? flavorId}` : null,
      ].filter(Boolean);

      if (canonicalParts.length > 0) {
        detail = appendErrorDetail(detail, `canonical payload validation (${canonicalParts.join(", ")})`);
      }
    }

    if (!detail && payload.upstreamBodyKind === "html") {
      detail = "Upstream HTML error page omitted from UI";
    }
  }

  return detail;
}

export async function generateCaptions({
  image,
  humorFlavorId,
  supabaseAccessToken,
  selectedFlavor,
  specificationVersion,
}: GenerateCaptionsApiInput): Promise<GenerateCaptionsResult> {
  const normalizedHumorFlavorId = humorFlavorId.trim();
  if (
    !normalizedHumorFlavorId ||
    normalizedHumorFlavorId === "undefined" ||
    normalizedHumorFlavorId === "null"
  ) {
    throw new Error("Missing humorFlavorId before calling /api/generate-captions.");
  }

  const normalizedSelectedFlavorId = selectedFlavor.id.trim();
  if (
    !normalizedSelectedFlavorId ||
    normalizedSelectedFlavorId === "undefined" ||
    normalizedSelectedFlavorId === "null"
  ) {
    throw new Error("Missing flavor before calling /api/generate-captions.");
  }

  const normalizedSpecificationVersion =
    specificationVersion?.trim() && specificationVersion.trim().length > 0
      ? specificationVersion.trim()
      : "v1";

  const formData = new FormData();
  formData.append("image", image);
  formData.append("humorFlavorId", normalizedHumorFlavorId);
  formData.append("supabaseAccessToken", supabaseAccessToken);
  formData.append("selectedFlavor", JSON.stringify(selectedFlavor));
  formData.append("specificationVersion", normalizedSpecificationVersion);

  const response = await fetch("/api/generate-captions", {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`,
    },
  });

  const responseText = await response.text();
  let payloadRecord: Record<string, unknown> | null = null;
  if (responseText.trim()) {
    try {
      payloadRecord = toRecord(JSON.parse(responseText));
    } catch {
      payloadRecord = null;
    }
  }

  if (!response.ok) {
    const detail = buildErrorDetail(responseText, payloadRecord);
    throw new CaptionGenerationApiError(
      detail
        ? `Caption generation request failed (${response.status}): ${detail}`
        : `Caption generation request failed (${response.status}).`,
      response.status,
      payloadRecord,
    );
  }

  const payload: Record<string, unknown> | null = payloadRecord;

  const extracted = extractCaptionsFromApiResponse(payload);
  const captions = normalizeCaptions(extracted);

  const debugRecord = toRecord(payload?.debug);
  const nestedMetrics = getNestedMetricsFromPayload(payloadRecord);

  const debug: CaptionGenerationDebug = {
    phase: typeof debugRecord?.phase === "string" ? debugRecord.phase : null,
    stageName: typeof payload?.stageName === "string" ? (payload.stageName as string) : null,
    stageNumber: typeof payload?.stageNumber === "number" ? (payload.stageNumber as number) : null,
    upstreamStatus:
      typeof payload?.upstreamStatus === "number"
        ? (payload.upstreamStatus as number)
        : typeof payload?.status === "number"
          ? (payload.status as number)
          : null,
    upstreamContentType: typeof payload?.upstreamContentType === "string" ? (payload.upstreamContentType as string) : null,
    upstreamBodyKind: typeof payload?.upstreamBodyKind === "string" ? (payload.upstreamBodyKind as string) : null,
    selectedFlavor: payload?.selectedFlavor ?? null,
    errorDiagnostics: payload?.errorDiagnostics ?? null,
    timingMs: debugRecord?.timingMs ?? nestedMetrics.timingMs,
    payloadSizeBytes:
      typeof debugRecord?.payloadSizeBytes === "number"
        ? (debugRecord.payloadSizeBytes as number)
        : nestedMetrics.payloadSizeBytes,
    flavorComplexity: debugRecord?.flavorComplexity ?? nestedMetrics.flavorComplexity,
    finalCaptionRequestBody: debugRecord?.finalCaptionRequestBody ?? null,
    canonicalPayloadValidation: debugRecord?.canonicalPayloadValidation ?? null,
    stepCompatibilityValidation: debugRecord?.stepCompatibilityValidation ?? null,
    resolvedStepModels: debugRecord?.resolvedStepModels ?? null,
    externalPromptConfig: debugRecord?.externalPromptConfig ?? null,
    rawApiResponse: debugRecord?.rawApiResponse ?? null,
    errorPayload: null,
  };

  return { captions, debug };
}
