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
    this.debug = {
      phase: typeof payload?.phase === "string" ? payload.phase : null,
      stageName: typeof payload?.stageName === "string" ? payload.stageName : null,
      stageNumber: typeof payload?.stageNumber === "number" ? payload.stageNumber : null,
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

function buildErrorDetail(responseText: string, payload: Record<string, unknown> | null): string {
  let detail = responseText.trim();
  if (payload) {
    if (typeof payload.error === "string") {
      detail = payload.error;
    }
    if (typeof payload.message === "string") {
      detail = `${detail}: ${payload.message}`;
    }
    if (typeof payload.phase === "string") {
      detail = `${detail}: phase ${payload.phase}`;
    }
    if (typeof payload.stageName === "string") {
      detail = `${detail}: ${payload.stageName}`;
    }
    if (typeof payload.upstreamStatus === "number") {
      detail = `${detail}: upstream ${payload.upstreamStatus}`;
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
        detail = `${detail}: canonical payload validation (${canonicalParts.join(", ")})`;
      }
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

  let payload: Record<string, unknown> | null = payloadRecord;
  if (!payload && responseText.trim()) {
    try {
      payload = toRecord(JSON.parse(responseText));
    } catch {
      payload = null;
    }
  }

  const extracted = extractCaptionsFromApiResponse(payload);
  const captions = normalizeCaptions(extracted);

  const debugRecord = toRecord(payload?.debug);

  const debug: CaptionGenerationDebug = {
    phase: typeof debugRecord?.phase === "string" ? debugRecord.phase : null,
    stageName: typeof payload?.stageName === "string" ? (payload.stageName as string) : null,
    stageNumber: typeof payload?.stageNumber === "number" ? (payload.stageNumber as number) : null,
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
