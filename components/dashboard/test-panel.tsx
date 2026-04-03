'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import {
  CaptionGenerationApiError,
  generateCaptions,
  type CaptionGenerationDebug,
} from "@/lib/api/generateCaptions";
import {
  buildFlavorPipelineDebugSnapshot,
  isFatalValidationSeverity,
  toExternalPromptConfigStepPayload,
  validateFlavorStepCompatibility,
  validateAndNormalizeFlavorPipelineSteps,
  type ValidationSeverity,
} from "@/lib/flavor-pipeline";
import { getFlavorAuditById } from "@/lib/flavor-audit";
import { resolveStepModels, validateResolvedStepModels } from "@/lib/model-validation";
import type { FlavorDataSource, FlavorValidationReferenceCatalog, HumorFlavor } from "@/lib/flavor-types";
import { supabase } from "@/lib/supabase/client";

type TestPanelProps = {
  flavors: HumorFlavor[];
  initialFlavorId: string | null;
  flavorSource: FlavorDataSource;
  referenceCatalog: FlavorValidationReferenceCatalog;
};

type ProgressPhase =
  | "idle"
  | "validating_flavor"
  | "preparing_image"
  | "uploading_image"
  | "registering_image"
  | "generating_captions";

const PHASE_LABEL: Record<ProgressPhase, string> = {
  idle: "",
  validating_flavor: "Validating flavor",
  preparing_image: "Preparing image",
  uploading_image: "Uploading image",
  registering_image: "Registering image",
  generating_captions: "Generating captions",
};

const PHASE_SEQUENCE: ProgressPhase[] = [
  "validating_flavor",
  "preparing_image",
  "uploading_image",
  "registering_image",
  "generating_captions",
];

type LocalDebugState = {
  flavorHealth: unknown;
  validationSummary: unknown;
  stepDetails: unknown;
  stepCompatibilityValidation: unknown;
  errorDiagnostics: unknown;
  timingMs: unknown;
  finalCanonicalRequestBody: unknown;
  canonicalPayloadValidation: unknown;
  resolvedStepModels: unknown;
  externalPromptConfig: unknown;
  rawApiResponse: unknown;
};

type ValidationDisplayIssue = {
  severity: ValidationSeverity;
  message: string;
  source: string;
  code?: string;
  stepId?: string;
  orderBy?: number;
  field?: string;
  generationAllowed: boolean;
};

type ValidationSummary = {
  overallSeverity: ValidationSeverity | "none";
  generationAllowed: boolean;
  fatalIssueCount: number;
  warningCount: number;
  infoCount: number;
  issues: ValidationDisplayIssue[];
};

function isMainPanelBlockingIssue(issue: ValidationDisplayIssue): boolean {
  if (issue.severity !== "fatal") {
    return false;
  }

  if (
    issue.source === "request" &&
    (issue.code === "missing_image" || issue.code === "missing_flavor" || issue.code === "unselectable_flavor")
  ) {
    return true;
  }

  if (
    issue.source === "pipeline" &&
    (issue.code === "missing_steps" ||
      issue.code === "duplicate_order" ||
      issue.code === "order_must_start_at_1" ||
      issue.code === "non_contiguous_order")
  ) {
    return true;
  }

  if (issue.source === "model") {
    return true;
  }

  if (
    issue.source === "pipeline" &&
    issue.code === "missing_required_field" &&
    (issue.field === "llmSystemPrompt/llmUserPrompt" || issue.field === "llmModelId" || issue.field === "orderBy")
  ) {
    return true;
  }

  if (issue.source === "health") {
    return true;
  }

  return false;
}

function getOverallSeverity(issues: ValidationDisplayIssue[]): ValidationSummary["overallSeverity"] {
  if (issues.some((issue) => issue.severity === "fatal")) {
    return "fatal";
  }
  if (issues.some((issue) => issue.severity === "warning")) {
    return "warning";
  }
  if (issues.some((issue) => issue.severity === "info")) {
    return "info";
  }
  return "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chooseDefaultAvailableFlavorId(
  flavors: HumorFlavor[],
  isFlavorAvailable: (flavorId: string) => boolean,
  initialFlavorId: string | null,
): string {
  const normalizedInitialFlavorId = initialFlavorId?.trim() ?? "";
  if (normalizedInitialFlavorId && isFlavorAvailable(normalizedInitialFlavorId)) {
    return normalizedInitialFlavorId;
  }

  return flavors.find((flavor) => isFlavorAvailable(flavor.id))?.id ?? "";
}

function toUserGenerationErrorMessage(
  rawMessage: string,
  debug?: CaptionGenerationDebug,
  flavorLabel?: string | null,
): string {
  const errorPayload = isRecord(debug?.errorPayload) ? debug.errorPayload : null;
  const errorDiagnostics = isRecord(debug?.errorDiagnostics) ? debug.errorDiagnostics : null;
  const canonicalValidation =
    debug && typeof debug.canonicalPayloadValidation === "object" && debug.canonicalPayloadValidation !== null
      ? (debug.canonicalPayloadValidation as Record<string, unknown>)
      : null;
  const modelValidationIssues = Array.isArray(errorPayload?.modelValidationIssues)
    ? (errorPayload.modelValidationIssues as Array<Record<string, unknown>>)
    : [];
  const errorCode = typeof errorPayload?.errorCode === "string" ? errorPayload.errorCode : null;
  const upstreamStatus =
    typeof debug?.upstreamStatus === "number"
      ? debug.upstreamStatus
      : typeof errorPayload?.upstreamStatus === "number"
        ? (errorPayload.upstreamStatus as number)
        : typeof errorPayload?.status === "number"
          ? (errorPayload.status as number)
          : null;
  const upstreamBodyKind =
    typeof debug?.upstreamBodyKind === "string"
      ? debug.upstreamBodyKind
      : typeof errorPayload?.upstreamBodyKind === "string"
        ? (errorPayload.upstreamBodyKind as string)
        : null;
  const flavorNameFromDebug =
    isRecord(debug?.selectedFlavor) && typeof debug.selectedFlavor.name === "string"
      ? (debug.selectedFlavor.name as string)
      : errorDiagnostics && isRecord(errorDiagnostics.selectedFlavor) && typeof errorDiagnostics.selectedFlavor.name === "string"
        ? (errorDiagnostics.selectedFlavor.name as string)
        : null;
  const resolvedFlavorLabel = flavorLabel ?? flavorNameFromDebug ?? "this flavor";
  const firstModelIssue = modelValidationIssues[0] ?? null;
  const firstModelIssueMessage =
    firstModelIssue && typeof firstModelIssue.message === "string" ? firstModelIssue.message : null;
  const canonicalReason =
    canonicalValidation && typeof canonicalValidation.reason === "string"
      ? canonicalValidation.reason
      : null;
  const canonicalStepId =
    canonicalValidation && typeof canonicalValidation.invalidStepId === "string"
      ? canonicalValidation.invalidStepId
      : null;
  const canonicalField =
    canonicalValidation && typeof canonicalValidation.invalidFieldName === "string"
      ? canonicalValidation.invalidFieldName
      : null;
  const canonicalFlavor =
    canonicalValidation && typeof canonicalValidation.flavorName === "string"
      ? canonicalValidation.flavorName
      : canonicalValidation && typeof canonicalValidation.flavorId === "string"
        ? canonicalValidation.flavorId
        : null;

  if (canonicalReason) {
    const parts = [
      `Canonical payload validation failed: ${canonicalReason}`,
      canonicalStepId ? `step ${canonicalStepId}` : null,
      canonicalField ? `field ${canonicalField}` : null,
      canonicalFlavor ? `flavor ${canonicalFlavor}` : null,
    ].filter(Boolean);
    return parts.join(" | ");
  }

  if (firstModelIssueMessage) {
    return `Model validation failed: ${firstModelIssueMessage}`;
  }
  if (errorCode === "upstream_timeout" || upstreamStatus === 504) {
    return `The caption API timed out while generating captions for ${resolvedFlavorLabel}. This flavor may be too slow or the upstream service is temporarily unavailable.`;
  }
  if (upstreamBodyKind === "html") {
    return `The caption API returned an upstream error page while generating captions for ${resolvedFlavorLabel}. Raw HTML was omitted from the UI.`;
  }

  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes("model_not_found") ||
    normalized.includes("does not exist or you do not have access")
  ) {
    return "Selected flavor step uses an invalid or unauthorized upstream model. Choose a supported model in flavor steps.";
  }
  if (normalized.includes("missing flavor before calling")) {
    return "Choose a flavor before generating captions.";
  }
  if (normalized.includes("specificationversion")) {
    return "Missing external prompt config (specificationVersion) for this flavor pipeline.";
  }
  if (normalized.includes("incompatible step contracts")) {
    return "The selected flavor has a fatal step contract issue. Fix the highlighted step configuration and retry.";
  }
  if (normalized.includes("json")) {
    const stepCompatibility =
      debug && typeof debug.stepCompatibilityValidation === "object" && debug.stepCompatibilityValidation !== null
        ? (debug.stepCompatibilityValidation as Record<string, unknown>)
        : null;
    const firstIssue = Array.isArray(stepCompatibility?.issues)
      ? (stepCompatibility?.issues[0] as Record<string, unknown> | undefined)
      : null;
    if (firstIssue && typeof firstIssue.message === "string") {
      return firstIssue.message;
    }
  }
  if (normalized.includes("response did not match schema") || normalized.includes("no object generated")) {
    return "The upstream API returned output that does not match the expected caption JSON schema.";
  }
  if (normalized.includes("forbidden")) {
    return "You do not have admin access to run caption generation.";
  }
  if (normalized.includes("timed out after")) {
    return `The caption API timed out while generating captions for ${resolvedFlavorLabel}. This flavor may be too slow or the upstream service is temporarily unavailable.`;
  }
  return rawMessage;
}

export function TestPanel({ flavors, initialFlavorId, referenceCatalog }: TestPanelProps) {
  const flavorAuditById = useMemo(() => getFlavorAuditById(flavors, referenceCatalog), [flavors, referenceCatalog]);
  const flavorAvailabilityById = useMemo(
    () =>
      new Map(
        flavors.map((flavor) => {
          const audit = flavorAuditById.get(flavor.id);
          return [
            flavor.id,
            {
              selectable: Boolean(audit?.usable),
              reason: audit?.reason ?? audit?.selectability.reason ?? null,
            },
          ];
        }),
      ),
    [flavorAuditById, flavors],
  );
  const [selectedFlavorId, setSelectedFlavorId] = useState(
    chooseDefaultAvailableFlavorId(
      flavors,
      (flavorId) => Boolean(flavorAvailabilityById.get(flavorId)?.selectable),
      initialFlavorId,
    ),
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [captions, setCaptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progressPhase, setProgressPhase] = useState<ProgressPhase>("idle");
  const [debugState, setDebugState] = useState<LocalDebugState | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const selectedFlavor = useMemo(
    () => flavors.find((flavor) => flavor.id === selectedFlavorId) ?? null,
    [flavors, selectedFlavorId],
  );
  const selectedFlavorPipeline = useMemo(
    () => validateAndNormalizeFlavorPipelineSteps(selectedFlavor?.steps ?? []),
    [selectedFlavor],
  );
  const selectedFlavorComplexity = useMemo(() => {
    let totalPromptChars = 0;
    let maxStepPromptChars = 0;
    let maxPromptStepOrder: number | null = null;

    for (const step of selectedFlavorPipeline.normalizedSteps) {
      const promptChars = step.llmSystemPrompt.length + step.llmUserPrompt.length;
      totalPromptChars += promptChars;
      if (promptChars > maxStepPromptChars) {
        maxStepPromptChars = promptChars;
        maxPromptStepOrder = step.orderBy;
      }
    }

    return {
      stepCount: selectedFlavorPipeline.normalizedSteps.length,
      totalPromptChars,
      maxStepPromptChars,
      maxPromptStepOrder,
    };
  }, [selectedFlavorPipeline.normalizedSteps]);
  const heavyFlavorWarning = useMemo(() => {
    if (
      selectedFlavorComplexity.stepCount < 4 &&
      selectedFlavorComplexity.totalPromptChars < 30000 &&
      selectedFlavorComplexity.maxStepPromptChars < 12000
    ) {
      return null;
    }

    const largestStepLabel =
      selectedFlavorComplexity.maxPromptStepOrder !== null
        ? `largest prompt is step ${selectedFlavorComplexity.maxPromptStepOrder} at ${selectedFlavorComplexity.maxStepPromptChars.toLocaleString()} chars`
        : `largest prompt is ${selectedFlavorComplexity.maxStepPromptChars.toLocaleString()} chars`;

    return `Heavy chain warning: ${selectedFlavorComplexity.stepCount} steps, ${selectedFlavorComplexity.totalPromptChars.toLocaleString()} prompt chars total, ${largestStepLabel}. Upstream timeouts are more likely for this flavor.`;
  }, [selectedFlavorComplexity]);
  const selectedStepCompatibilityValidation = useMemo(
    () => validateFlavorStepCompatibility(selectedFlavorPipeline.normalizedSteps, referenceCatalog),
    [referenceCatalog, selectedFlavorPipeline.normalizedSteps],
  );
  const selectedResolvedStepModels = useMemo(
    () => resolveStepModels(selectedFlavorPipeline.normalizedSteps, referenceCatalog),
    [referenceCatalog, selectedFlavorPipeline.normalizedSteps],
  );
  const selectedStepModelIssues = useMemo(
    () => validateResolvedStepModels(selectedResolvedStepModels),
    [selectedResolvedStepModels],
  );
  const selectedExternalPromptConfigPreview = useMemo(
    () => ({
      specificationVersion: "v1",
      steps: toExternalPromptConfigStepPayload(
        selectedFlavorPipeline.normalizedSteps,
        referenceCatalog,
        selectedStepCompatibilityValidation,
      ),
    }),
    [referenceCatalog, selectedFlavorPipeline.normalizedSteps, selectedStepCompatibilityValidation],
  );
  const selectedFlavorAudit = selectedFlavor ? flavorAuditById.get(selectedFlavor.id) ?? null : null;
  const selectedFlavorAvailability = selectedFlavor
    ? flavorAvailabilityById.get(selectedFlavor.id) ?? null
    : null;
  const validationSummary = useMemo<ValidationSummary>(() => {
    const issues: ValidationDisplayIssue[] = [];
    const blockedFlavorMessage =
      "This flavor cannot be tested because it is intentionally disabled or has fatal configuration issues.";

    const pushIssue = (issue: ValidationDisplayIssue) => {
      issues.push(issue);
    };

    if (!imageFile) {
      pushIssue({
        severity: "fatal",
        message: "Choose an image before generating captions.",
        source: "request",
        code: "missing_image",
        generationAllowed: false,
      });
    }

    if (!selectedFlavorId || !selectedFlavor) {
      pushIssue({
        severity: "fatal",
        message: "Choose a flavor before generating captions.",
        source: "request",
        code: "missing_flavor",
        generationAllowed: false,
      });
    } else if (!selectedFlavorAvailability?.selectable) {
      pushIssue({
        severity: "fatal",
        message: blockedFlavorMessage,
        source: "request",
        code: "unselectable_flavor",
        generationAllowed: false,
      });
    }

    for (const issue of selectedFlavorPipeline.issues) {
      pushIssue({
        severity: issue.severity,
        message: issue.message,
        source: "pipeline",
        code: issue.code,
        stepId: issue.stepId,
        orderBy: issue.orderBy,
        field: issue.field,
        generationAllowed: !isFatalValidationSeverity(issue.severity),
      });
    }

    for (const issue of selectedStepCompatibilityValidation.issues) {
      pushIssue({
        severity: issue.severity,
        message: issue.message,
        source: "compatibility",
        code: issue.code,
        stepId: issue.stepId,
        orderBy: issue.orderBy,
        generationAllowed: !isFatalValidationSeverity(issue.severity),
      });
    }

    for (const issue of selectedStepModelIssues) {
      pushIssue({
        severity: issue.severity,
        message: issue.message,
        source: "model",
        code: issue.code,
        stepId: issue.stepId,
        orderBy: issue.order,
        generationAllowed: issue.severity !== "fatal",
      });
    }

    if (selectedFlavorAudit?.health && !selectedFlavorAudit.health.testable) {
      const blockingReasons =
        selectedFlavorAudit.health.blockingReasons.length > 0
          ? selectedFlavorAudit.health.blockingReasons
          : [selectedFlavorAudit.reason ?? selectedFlavorAudit.health.statusReason];
      for (const reason of blockingReasons) {
        pushIssue({
          severity: "fatal",
          message: reason,
          source: "health",
          code: selectedFlavorAudit.health.status,
          generationAllowed: false,
        });
      }
    }

    return {
      overallSeverity: getOverallSeverity(issues),
      generationAllowed: !issues.some((issue) => issue.severity === "fatal"),
      fatalIssueCount: issues.filter((issue) => issue.severity === "fatal").length,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
      infoCount: issues.filter((issue) => issue.severity === "info").length,
      issues,
    };
  }, [
    imageFile,
    selectedFlavor,
    selectedFlavorAudit,
    selectedFlavorAvailability,
    selectedFlavorId,
    selectedFlavorPipeline.issues,
    selectedStepCompatibilityValidation.issues,
    selectedStepModelIssues,
  ]);
  const fatalValidationMessage = useMemo(
    () => validationSummary.issues.find((issue) => isMainPanelBlockingIssue(issue))?.message ?? null,
    [validationSummary],
  );

  useEffect(() => {
    setSelectedFlavorId((current) => {
      if (current && flavorAvailabilityById.get(current)?.selectable) {
        return current;
      }
      return chooseDefaultAvailableFlavorId(
        flavors,
        (flavorId) => Boolean(flavorAvailabilityById.get(flavorId)?.selectable),
        initialFlavorId,
      );
    });
  }, [flavorAvailabilityById, flavors, initialFlavorId]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    let index = 0;
    const timer = setInterval(() => {
      index = (index + 1) % PHASE_SEQUENCE.length;
      setProgressPhase(PHASE_SEQUENCE[index]);
    }, 1200);

    return () => clearInterval(timer);
  }, [isLoading]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setCaptions([]);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitStartedAt = Date.now();

    if (!selectedFlavor || validationSummary.issues.some((issue) => isMainPanelBlockingIssue(issue))) {
      setError(fatalValidationMessage ?? "Caption generation is blocked by a fatal validation issue.");
      setCaptions([]);
      setDebugState({
        flavorHealth: selectedFlavorAudit?.health ?? null,
        validationSummary,
        stepDetails: selectedStepCompatibilityValidation.steps,
        stepCompatibilityValidation: selectedStepCompatibilityValidation,
        errorDiagnostics: null,
        finalCanonicalRequestBody: null,
        timingMs: null,
        canonicalPayloadValidation: null,
        resolvedStepModels: selectedResolvedStepModels,
        externalPromptConfig: selectedExternalPromptConfigPreview,
        rawApiResponse: null,
      });
      return;
    }

    const normalizedHumorFlavorId = selectedFlavor.id.trim();
    if (!normalizedHumorFlavorId || normalizedHumorFlavorId === "undefined" || normalizedHumorFlavorId === "null") {
      setError("Selected flavor is missing a valid database id.");
      setCaptions([]);
      return;
    }
    if (!imageFile) {
      setError("Choose an image before generating captions.");
      setCaptions([]);
      return;
    }

    setIsLoading(true);
    setProgressPhase("validating_flavor");
    setError(null);
    setCaptions([]);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(`Could not read Supabase session: ${sessionError.message}`);
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("You must be logged in to generate captions.");
      }

      const result = await generateCaptions({
        image: imageFile,
        humorFlavorId: normalizedHumorFlavorId,
        supabaseAccessToken: accessToken,
        selectedFlavor: {
          id: normalizedHumorFlavorId,
          name: selectedFlavor.slug?.trim() || selectedFlavor.name,
          tone: selectedFlavor.tone,
        },
        specificationVersion: "v1",
      });

      setProgressPhase("generating_captions");
      const displayStartedAt = Date.now();
      setCaptions(result.captions);
      const displayDurationMs = Date.now() - displayStartedAt;
      console.info("[test-panel][timing] caption generation completed", {
        flavorId: normalizedHumorFlavorId,
        flavorName: selectedFlavor.name,
        captionCount: result.captions.length,
        totalSubmitMs: Date.now() - submitStartedAt,
        displayDurationMs,
        apiTimingMs:
          result.debug && typeof result.debug.timingMs === "object" && result.debug.timingMs !== null
            ? result.debug.timingMs
            : null,
        payloadSizeBytes:
          typeof result.debug.payloadSizeBytes === "number" ? result.debug.payloadSizeBytes : null,
        flavorComplexity:
          result.debug && typeof result.debug.flavorComplexity === "object" ? result.debug.flavorComplexity : null,
      });

      const localSnapshot = buildFlavorPipelineDebugSnapshot(selectedFlavor);
      const localCompatibilityValidation = validateFlavorStepCompatibility(
        localSnapshot.normalizedSteps,
        referenceCatalog,
      );
      setDebugState({
        flavorHealth: selectedFlavorAudit?.health ?? null,
        validationSummary,
        stepDetails:
          result.debug.stepCompatibilityValidation && isRecord(result.debug.stepCompatibilityValidation)
            ? (result.debug.stepCompatibilityValidation as { steps?: unknown }).steps ?? localCompatibilityValidation.steps
            : localCompatibilityValidation.steps,
        stepCompatibilityValidation:
          result.debug.stepCompatibilityValidation ?? localCompatibilityValidation,
        errorDiagnostics: null,
        finalCanonicalRequestBody: result.debug.finalCaptionRequestBody ?? null,
        timingMs: result.debug.timingMs ?? null,
        canonicalPayloadValidation: result.debug.canonicalPayloadValidation ?? null,
        resolvedStepModels:
          result.debug.resolvedStepModels ??
          resolveStepModels(localSnapshot.normalizedSteps, referenceCatalog),
        externalPromptConfig:
          result.debug.externalPromptConfig ??
          selectedExternalPromptConfigPreview,
        rawApiResponse: result.debug.rawApiResponse ?? null,
      });
    } catch (caughtError) {
      const errorMessage =
        caughtError instanceof Error ? caughtError.message : "Caption generation failed.";
      const errorDebug =
        caughtError instanceof CaptionGenerationApiError
          ? caughtError.debug
          : ({ errorPayload: errorMessage } satisfies CaptionGenerationDebug);
      const userMessage = toUserGenerationErrorMessage(
        errorMessage,
        errorDebug,
        selectedFlavor?.displayLabel ?? null,
      );
      setError(userMessage);
      setCaptions([]);
      console.warn("[test-panel][timing] caption generation failed", {
        flavorId: selectedFlavor?.id ?? null,
        flavorName: selectedFlavor?.name ?? null,
        totalSubmitMs: Date.now() - submitStartedAt,
        phase: errorDebug.phase ?? null,
        stageName: errorDebug.stageName ?? null,
        upstreamStatus: errorDebug.upstreamStatus ?? null,
        upstreamBodyKind: errorDebug.upstreamBodyKind ?? null,
        timingMs: errorDebug.timingMs ?? null,
        payloadSizeBytes:
          typeof errorDebug.payloadSizeBytes === "number" ? errorDebug.payloadSizeBytes : null,
        flavorComplexity:
          errorDebug && typeof errorDebug.flavorComplexity === "object"
            ? errorDebug.flavorComplexity
            : null,
      });
      const localSnapshot = selectedFlavor ? buildFlavorPipelineDebugSnapshot(selectedFlavor) : null;
      const localResolvedStepModels = localSnapshot
        ? resolveStepModels(localSnapshot.normalizedSteps, referenceCatalog)
        : null;
      const localCompatibilityValidation = localSnapshot
        ? validateFlavorStepCompatibility(localSnapshot.normalizedSteps, referenceCatalog)
        : null;

      setDebugState({
        flavorHealth: selectedFlavorAudit?.health ?? null,
        validationSummary,
        stepDetails:
          errorDebug.stepCompatibilityValidation && isRecord(errorDebug.stepCompatibilityValidation)
            ? (errorDebug.stepCompatibilityValidation as { steps?: unknown }).steps ?? localCompatibilityValidation?.steps ?? null
            : localCompatibilityValidation?.steps ?? null,
        stepCompatibilityValidation:
          errorDebug.stepCompatibilityValidation ?? localCompatibilityValidation ?? null,
        errorDiagnostics: errorDebug.errorDiagnostics ?? null,
        finalCanonicalRequestBody: errorDebug.finalCaptionRequestBody ?? null,
        timingMs: errorDebug.timingMs ?? null,
        canonicalPayloadValidation: errorDebug.canonicalPayloadValidation ?? null,
        resolvedStepModels: errorDebug.resolvedStepModels ?? localResolvedStepModels,
        externalPromptConfig:
          errorDebug.externalPromptConfig ??
          (localSnapshot ? selectedExternalPromptConfigPreview : null),
        rawApiResponse: errorDebug.rawApiResponse ?? null,
      });

      if (caughtError instanceof CaptionGenerationApiError && typeof caughtError.debug.phase === "string") {
        const nextPhase = caughtError.debug.phase as ProgressPhase;
        if (PHASE_LABEL[nextPhase]) {
          setProgressPhase(nextPhase);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  const canGenerate = !isLoading && !validationSummary.issues.some((issue) => isMainPanelBlockingIssue(issue));
  const errorDiagnostics = isRecord(debugState?.errorDiagnostics) ? debugState.errorDiagnostics : null;

  return (
    <div className="space-y-4">
      <form
        className="space-y-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950"
        onSubmit={handleSubmit}
      >
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Image Upload</span>
          <input
            required
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:font-medium file:text-zinc-50 hover:file:bg-zinc-700 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-300"
          />
          {!imageFile ? (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">An image is required.</p>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Flavor</span>
          <select
            value={selectedFlavorId}
            onChange={(event) => {
              setSelectedFlavorId(event.target.value);
              setCaptions([]);
              setError(null);
            }}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {flavors.map((flavor) => {
              const availability = flavorAvailabilityById.get(flavor.id);
              const audit = flavorAuditById.get(flavor.id);
              const status = audit?.status ?? audit?.health?.status ?? null;
              const selectorLabel = flavor.slug?.trim() || flavor.displayLabel;
              const unavailableLabel = status
                ? `${selectorLabel} (${status})`
                : `${selectorLabel} (Unavailable)`;
              return (
                <option key={flavor.id} value={flavor.id} disabled={!availability?.selectable}>
                  {availability?.selectable ? selectorLabel : unavailableLabel}
                </option>
              );
            })}
          </select>
          {fatalValidationMessage ? (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">{fatalValidationMessage}</p>
          ) : null}
          {heavyFlavorWarning ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{heavyFlavorWarning}</p>
          ) : null}
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canGenerate}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isLoading ? `Generating ${selectedFlavor?.displayLabel ?? "Captions"}...` : "Generate Captions"}
          </button>
          {!isLoading && error ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCaptions([]);
              }}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Retry
            </button>
          ) : null}
        </div>

      </form>

      {isLoading ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {PHASE_LABEL[progressPhase] || "Generating captions"} for{" "}
          <span className="font-medium">{selectedFlavor?.displayLabel ?? "selected flavor"}</span> on{" "}
          {imageFile?.name ?? "your image"}...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
          <p>{error}</p>
          {errorDiagnostics ? (
            <details className="mt-3 text-xs text-red-800 dark:text-red-200">
              <summary className="cursor-pointer font-medium">Debug details</summary>
              <div className="mt-2 space-y-1 rounded border border-red-200/70 bg-red-100/70 p-3 dark:border-red-900 dark:bg-red-950/40">
                <p>
                  Status:{" "}
                  {typeof errorDiagnostics.upstreamStatus === "number"
                    ? errorDiagnostics.upstreamStatus
                    : "unknown"}
                </p>
                <p>
                  Phase:{" "}
                  {typeof errorDiagnostics.phase === "string"
                    ? errorDiagnostics.phase
                    : "unknown"}
                </p>
                <p>
                  Response format:{" "}
                  {typeof errorDiagnostics.upstreamBodyKind === "string"
                    ? errorDiagnostics.upstreamBodyKind
                    : "unknown"}
                </p>
                <p>
                  Duration:{" "}
                  {typeof errorDiagnostics.totalDurationMs === "number"
                    ? `${errorDiagnostics.totalDurationMs}ms`
                    : "unknown"}
                </p>
                <p>
                  Ordered steps:{" "}
                  {Array.isArray(errorDiagnostics.orderedStepIds) &&
                  errorDiagnostics.orderedStepIds.length > 0
                    ? errorDiagnostics.orderedStepIds.join(", ")
                    : "unavailable"}
                </p>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {captions.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Captions</h3>
          <ol className="space-y-3">
            {captions.map((caption, index) => (
              <li
                key={`${index}-${caption}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  OPTION {index + 1}
                </p>
                <p className="mt-2">{caption}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <details
        className="rounded-lg border border-zinc-200 bg-white p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        open={showDebug}
        onToggle={(event) => setShowDebug((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-medium">Debug Panel</summary>
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1 font-medium">Flavor Health</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.flavorHealth ?? selectedFlavorAudit?.health ?? null, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Overall Validation Summary</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.validationSummary ?? validationSummary, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Per-Step Diagnostics</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.stepDetails ?? selectedStepCompatibilityValidation.steps, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Step Compatibility Validation</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.stepCompatibilityValidation ?? selectedStepCompatibilityValidation, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Error Diagnostics</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.errorDiagnostics ?? null, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Timing (ms)</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.timingMs ?? null, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Final Canonical Request Body</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.finalCanonicalRequestBody ?? null, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Canonical Payload Validation</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.canonicalPayloadValidation ?? null, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Resolved Step Models</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.resolvedStepModels ?? selectedResolvedStepModels, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">externalPromptConfig</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.externalPromptConfig ?? selectedExternalPromptConfigPreview, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-medium">Upstream Response</p>
            <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
              {JSON.stringify(debugState?.rawApiResponse ?? null, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}
