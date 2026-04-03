import { createAppRouterServerSupabaseClient } from "@/lib/supabase/server";
import type { HumorFlavorStepRow } from "@/lib/supabase/types";
import type { DashboardFlavorData, HumorFlavor, HumorFlavorRecord } from "@/lib/flavor-types";
import type { FlavorValidationReferenceCatalog } from "@/lib/flavor-health";
import { parseStepTemplateKey, stripStepTemplateMarker } from "@/lib/flavor-step-templates";

type FlavorQueryRow = Record<string, unknown>;

type StepRow = Pick<
  HumorFlavorStepRow,
  | "id"
  | "humor_flavor_id"
  | "order_by"
  | "humor_flavor_step_type_id"
  | "llm_temperature"
  | "description"
  | "llm_system_prompt"
  | "llm_user_prompt"
  | "llm_input_type_id"
  | "llm_output_type_id"
  | "llm_model_id"
>;

type SupabaseQueryError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

type LlmModelReferenceRow = {
  id: number;
  name: string | null;
  llm_provider_id: number | null;
  provider_model_id: string | null;
};

type LlmInputTypeReferenceRow = {
  id: number;
  slug: string | null;
  description: string | null;
};

type LlmOutputTypeReferenceRow = {
  id: number;
  slug: string | null;
  description: string | null;
};

type HumorFlavorStepTypeReferenceRow = {
  id: number;
  slug: string | null;
  description: string | null;
};

type IdRow = {
  id: number;
};

function humanizeSlug(slug: string | null): string | null {
  if (!slug) {
    return null;
  }

  const normalized = slug
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function toFlavorSteps(stepRows: StepRow[]) {
  return stepRows
    .filter(
      (step) =>
        Number.isInteger(step.id) &&
        Number.isInteger(step.humor_flavor_id) &&
        Number.isInteger(step.order_by) &&
        step.order_by > 0,
    )
    .slice()
    .sort((a, b) => a.order_by - b.order_by)
    .map((step) => {
      const description = step.description?.trim() ?? null;
      const llmUserPrompt = step.llm_user_prompt?.trim() ?? null;
      const llmSystemPrompt = step.llm_system_prompt?.trim() ?? null;
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
        llmUserPrompt,
        llmSystemPrompt,
        stepTemplateKey: templateKey,
        title: cleanedDescription || `Step ${step.order_by}`,
        instruction: llmUserPrompt || llmSystemPrompt || "",
      };
    });
}

function buildFlavorDisplayName(flavor: HumorFlavorRecord) {
  const name = asString(flavor.name);
  const title = asString(flavor.title);
  const slugLabel = humanizeSlug(flavor.slug);
  const description = asString(flavor.description);

  return name ?? title ?? slugLabel ?? description ?? `Flavor ${flavor.id}`;
}

function buildFlavorTone(flavor: HumorFlavorRecord) {
  const tone = asString(flavor.tone);
  const title = asString(flavor.title);
  const slugLabel = humanizeSlug(flavor.slug);
  const description = asString(flavor.description);

  return tone ?? title ?? slugLabel ?? description ?? `Flavor ${flavor.id}`;
}

function toDashboardFlavors(flavorRows: HumorFlavorRecord[], stepRows: StepRow[]): HumorFlavor[] {
  const stepRowsByFlavorId = new Map<string, StepRow[]>();

  for (const step of stepRows) {
    const flavorId = String(step.humor_flavor_id);
    const nextRows = stepRowsByFlavorId.get(flavorId) ?? [];
    nextRows.push(step);
    stepRowsByFlavorId.set(flavorId, nextRows);
  }

  return flavorRows.map((flavor) => {
    const description = flavor.description?.trim() ?? "";
    const name = buildFlavorDisplayName(flavor);
    const tone = buildFlavorTone(flavor);
    const flavorId = String(flavor.id);
    const slugLabel = humanizeSlug(flavor.slug);
    const slugIdentifier = flavor.slug?.trim() || null;

    return {
      id: flavorId,
      rowId: flavor.id,
      sourceRow: flavor,
      name,
      slug: flavor.slug,
      tone,
      description,
      displayLabel: slugIdentifier || name || slugLabel || description || flavorId,
      steps: toFlavorSteps(stepRowsByFlavorId.get(flavorId) ?? []),
    };
  });
}

function toFlavorRow(rawRow: FlavorQueryRow): HumorFlavorRecord | null {
  const idValue = rawRow.id;
  const numericId = typeof idValue === "number" ? idValue : Number(idValue);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  const slug = asString(rawRow.slug);
  const description = asString(rawRow.description) ?? "";
  const createdDatetimeUtc = asString(rawRow.created_datetime_utc) ?? "";

  return {
    id: numericId,
    created_datetime_utc: createdDatetimeUtc,
    description,
    slug,
    name: asString(rawRow.name),
    tone: asString(rawRow.tone),
    title: asString(rawRow.title),
    created_by_user_id: null,
    modified_by_user_id: null,
    modified_datetime_utc: null,
  };
}

function logSupabaseError(
  prefix: string,
  error: SupabaseQueryError | null | undefined,
  metadata?: Record<string, unknown>,
) {
  console.error(prefix, {
    ...metadata,
    code: error?.code ?? null,
    message: error?.message ?? "Supabase query failed without an error payload",
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  });
}

async function queryHumorFlavorSteps(
  supabase: Awaited<ReturnType<typeof createAppRouterServerSupabaseClient>>,
): Promise<{ stepRows: StepRow[]; selectUsed: string }> {
  const selectUsed =
    "id, humor_flavor_id, order_by, humor_flavor_step_type_id, llm_input_type_id, llm_output_type_id, llm_model_id, llm_temperature, description, llm_system_prompt, llm_user_prompt";

  const stepResult = await supabase
    .schema("public")
    .from("humor_flavor_steps")
    .select(selectUsed)
    .order("humor_flavor_id", { ascending: true })
    .order("order_by", { ascending: true });

  if (stepResult.error) {
    logSupabaseError("[dashboard-flavors] failed querying public.humor_flavor_steps", stepResult.error, {
      table: "public.humor_flavor_steps",
      selectedColumns: [
        "id",
        "humor_flavor_id",
        "order_by",
        "humor_flavor_step_type_id",
        "llm_input_type_id",
        "llm_output_type_id",
        "llm_model_id",
        "llm_temperature",
        "description",
        "llm_system_prompt",
        "llm_user_prompt",
      ],
      orderClause: "order_by asc",
    });

    return {
      stepRows: [],
      selectUsed,
    };
  }

  const stepRows = (stepResult.data ?? []) as StepRow[];

  console.info("[dashboard-flavors] queried public.humor_flavor_steps", {
    table: "public.humor_flavor_steps",
    selectedColumns: [
      "id",
      "humor_flavor_id",
      "order_by",
      "humor_flavor_step_type_id",
      "llm_input_type_id",
      "llm_output_type_id",
      "llm_model_id",
      "llm_temperature",
      "description",
      "llm_system_prompt",
      "llm_user_prompt",
    ],
    orderClause: "order_by asc",
    rowCount: stepRows.length,
  });

  return {
    stepRows,
    selectUsed,
  };
}

async function queryFlavorValidationReferenceCatalog(
  supabase: Awaited<ReturnType<typeof createAppRouterServerSupabaseClient>>,
): Promise<FlavorValidationReferenceCatalog> {
  const [llmModelsResult, llmInputTypesResult, llmOutputTypesResult, stepTypesResult, llmProvidersResult] =
    await Promise.all([
      supabase
        .schema("public")
        .from("llm_models")
        .select("id, name, llm_provider_id, provider_model_id"),
      supabase.schema("public").from("llm_input_types").select("id, slug, description"),
      supabase.schema("public").from("llm_output_types").select("id, slug, description"),
      supabase.schema("public").from("humor_flavor_step_types").select("id, slug, description"),
      supabase.schema("public").from("llm_providers").select("id"),
    ]);

  if (llmModelsResult.error) {
    logSupabaseError("[dashboard-flavors] failed querying public.llm_models", llmModelsResult.error, {
      table: "public.llm_models",
      selectedColumns: ["id", "name", "llm_provider_id", "provider_model_id"],
    });
  }
  if (llmInputTypesResult.error) {
    logSupabaseError("[dashboard-flavors] failed querying public.llm_input_types", llmInputTypesResult.error, {
      table: "public.llm_input_types",
      selectedColumns: ["id", "slug", "description"],
    });
  }
  if (llmOutputTypesResult.error) {
    logSupabaseError("[dashboard-flavors] failed querying public.llm_output_types", llmOutputTypesResult.error, {
      table: "public.llm_output_types",
      selectedColumns: ["id", "slug", "description"],
    });
  }
  if (stepTypesResult.error) {
    logSupabaseError(
      "[dashboard-flavors] failed querying public.humor_flavor_step_types",
      stepTypesResult.error,
      {
        table: "public.humor_flavor_step_types",
        selectedColumns: ["id", "slug", "description"],
      },
    );
  }
  if (llmProvidersResult.error) {
    logSupabaseError("[dashboard-flavors] failed querying public.llm_providers", llmProvidersResult.error, {
      table: "public.llm_providers",
      selectedColumns: ["id"],
    });
  }

  return {
    llmModels: ((llmModelsResult.data ?? []) as LlmModelReferenceRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      llmProviderId: row.llm_provider_id,
      providerModelId: row.provider_model_id,
    })),
    llmInputTypes: ((llmInputTypesResult.data ?? []) as LlmInputTypeReferenceRow[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      description: row.description,
    })),
    llmInputTypeIds: ((llmInputTypesResult.data ?? []) as IdRow[]).map((row) => row.id),
    llmOutputTypes: ((llmOutputTypesResult.data ?? []) as LlmOutputTypeReferenceRow[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      description: row.description,
    })),
    humorFlavorStepTypes: ((stepTypesResult.data ?? []) as HumorFlavorStepTypeReferenceRow[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      description: row.description,
    })),
    humorFlavorStepTypeIds: ((stepTypesResult.data ?? []) as IdRow[]).map((row) => row.id),
    llmProviderIds: ((llmProvidersResult.data ?? []) as IdRow[]).map((row) => row.id),
  };
}

export async function getDashboardFlavors(): Promise<DashboardFlavorData> {
  try {
    const supabase = await createAppRouterServerSupabaseClient();
    const flavorSelectUsed = "*";
    const flavorOrderClause = "created_datetime_utc asc";
    const flavorFiltersUsed = "in-memory blocked/test token filtering on slug and description";

    const flavorResult = await supabase
      .schema("public")
      .from("humor_flavors")
      .select(flavorSelectUsed)
      .order("created_datetime_utc", { ascending: true });

    if (flavorResult.error || !flavorResult.data) {
      logSupabaseError("[dashboard-flavors] failed querying public.humor_flavors", flavorResult.error, {
        table: "public.humor_flavors",
        selectedColumns: ["*"],
        orderClause: flavorOrderClause,
        filtersUsed: flavorFiltersUsed,
        queryShape: {
          select: flavorSelectUsed,
          order: [{ column: "created_datetime_utc", direction: "asc" }],
          filters: ["slug blocked/test token filter (in-memory)", "description blocked/test token filter (in-memory)"],
        },
      });
      return {
        flavors: [],
        source: "supabase_error",
        referenceCatalog: {
          llmModels: [],
          llmInputTypes: [],
          llmInputTypeIds: [],
          llmOutputTypes: [],
          humorFlavorStepTypes: [],
          humorFlavorStepTypeIds: [],
          llmProviderIds: [],
        },
      };
    }

    console.info("[dashboard-flavors] queried public.humor_flavors", {
      table: "public.humor_flavors",
      selectedColumns: ["*"],
      orderClause: flavorOrderClause,
      filtersUsed: flavorFiltersUsed,
      rowCount: flavorResult.data.length,
    });

    const [{ stepRows, selectUsed }, referenceCatalog] = await Promise.all([
      queryHumorFlavorSteps(supabase),
      queryFlavorValidationReferenceCatalog(supabase),
    ]);
    console.info("[dashboard-flavors] humor_flavor_steps query succeeded", {
      selectUsed,
      foreignKeyField: "humor_flavor_id",
    });

    const normalizedFlavorRows = (flavorResult.data as FlavorQueryRow[])
      .map(toFlavorRow)
      .filter((row): row is HumorFlavorRecord => Boolean(row));
    const flavors = toDashboardFlavors(normalizedFlavorRows, stepRows);
    console.info("[dashboard-flavors] loaded flavors", flavors.length);

    return {
      flavors,
      source: "supabase",
      referenceCatalog,
    };
  } catch (error) {
    console.error("[dashboard-flavors] unexpected failure while loading flavors", error);
    return {
      flavors: [],
      source: "supabase_error",
      referenceCatalog: {
        llmModels: [],
        llmInputTypes: [],
        llmInputTypeIds: [],
        llmOutputTypes: [],
        humorFlavorStepTypes: [],
        humorFlavorStepTypeIds: [],
        llmProviderIds: [],
      },
    };
  }
}
