export const STEP_TEMPLATE_MARKER_PATTERN = /^\s*\[\[template:([a-z0-9-]+)\]\]\s*/i;

export const IMAGE_AND_TEXT_INPUT_TYPE_ID = 1;
export const TEXT_ONLY_INPUT_TYPE_ID = 2;

export const STRING_OUTPUT_TYPE_ID = 1;
export const CAPTION_ARRAY_OUTPUT_TYPE_ID = 2;

export type StepInputKind = "image_and_text" | "text";
export type StepOutputKind = "string" | "caption_json";

export type StepContract = {
  inputKind: StepInputKind;
  outputKind: StepOutputKind;
  requiredOutputJsonSchema: string | null;
  promptMustContainAny: string[];
  captionCompatibleFinal: boolean;
};

export type StepTemplateDefinition = {
  key: string;
  label: string;
  description: string;
  defaults: {
    humorFlavorStepTypeId: string;
    llmInputTypeId: string;
    llmOutputTypeId: string;
    llmTemperature: string;
    description: string;
    llmSystemPrompt: string;
    llmUserPrompt: string;
  };
  contract: StepContract;
};

export const CAPTION_JSON_SCHEMA_DESCRIPTION =
  "JSON array of caption strings. Example: [\"caption one\", \"caption two\"].";

export const STEP_TEMPLATE_LIBRARY: StepTemplateDefinition[] = [
  {
    key: "image-recognition",
    label: "Image Recognition",
    description: "Extract concrete visual facts and scene context from the image.",
    defaults: {
      humorFlavorStepTypeId: "",
      llmInputTypeId: String(IMAGE_AND_TEXT_INPUT_TYPE_ID),
      llmOutputTypeId: String(STRING_OUTPUT_TYPE_ID),
      llmTemperature: "0.2",
      description: "Image recognition and visual fact extraction",
      llmSystemPrompt:
        "You are a vision analyst. Identify concrete objects, actions, relationships, and scene context from the image.",
      llmUserPrompt:
        "Analyze the uploaded image and return concise factual notes only. Include subjects, actions, setting, and notable details.",
    },
    contract: {
      inputKind: "image_and_text",
      outputKind: "string",
      requiredOutputJsonSchema: null,
      promptMustContainAny: ["image", "objects", "scene", "visual"],
      captionCompatibleFinal: false,
    },
  },
  {
    key: "literal-image-description",
    label: "Literal Image Description",
    description: "Create a plain-language literal description before any humor transformations.",
    defaults: {
      humorFlavorStepTypeId: "",
      llmInputTypeId: String(IMAGE_AND_TEXT_INPUT_TYPE_ID),
      llmOutputTypeId: String(STRING_OUTPUT_TYPE_ID),
      llmTemperature: "0.3",
      description: "Literal description of visible content",
      llmSystemPrompt:
        "You write literal image descriptions with no jokes, no opinion, and no metaphors.",
      llmUserPrompt:
        "Describe exactly what is visible in the image in clear sentences that can be reused by later caption steps.",
    },
    contract: {
      inputKind: "image_and_text",
      outputKind: "string",
      requiredOutputJsonSchema: null,
      promptMustContainAny: ["describe", "literal", "image", "visible"],
      captionCompatibleFinal: false,
    },
  },
  {
    key: "tone-rewrite",
    label: "Tone Rewrite",
    description: "Rewrite upstream text into a specific humor tone while preserving facts.",
    defaults: {
      humorFlavorStepTypeId: "",
      llmInputTypeId: String(TEXT_ONLY_INPUT_TYPE_ID),
      llmOutputTypeId: String(STRING_OUTPUT_TYPE_ID),
      llmTemperature: "0.7",
      description: "Rewrite previous output in flavor tone",
      llmSystemPrompt:
        "You are a comedic style transformer. Preserve facts from the input and rewrite in the requested tone.",
      llmUserPrompt:
        "Rewrite the prior step output in the target humor tone while keeping key facts intact. Output plain text only.",
    },
    contract: {
      inputKind: "text",
      outputKind: "string",
      requiredOutputJsonSchema: null,
      promptMustContainAny: ["rewrite", "tone", "style", "input"],
      captionCompatibleFinal: false,
    },
  },
  {
    key: "caption-generator",
    label: "Caption Generator",
    description: "Generate final caption options directly as JSON.",
    defaults: {
      humorFlavorStepTypeId: "",
      llmInputTypeId: String(TEXT_ONLY_INPUT_TYPE_ID),
      llmOutputTypeId: String(CAPTION_ARRAY_OUTPUT_TYPE_ID),
      llmTemperature: "0.9",
      description: "Generate final caption options",
      llmSystemPrompt:
        "You generate social-media captions from the provided context. Output only valid JSON.",
      llmUserPrompt:
        "Using the prior step output, return a JSON array of caption strings. Keep each caption concise and distinct.",
    },
    contract: {
      inputKind: "text",
      outputKind: "caption_json",
      requiredOutputJsonSchema: CAPTION_JSON_SCHEMA_DESCRIPTION,
      promptMustContainAny: ["caption", "json", "array"],
      captionCompatibleFinal: true,
    },
  },
  {
    key: "output-normalizer",
    label: "Output Normalizer",
    description: "Normalize upstream text into strict caption JSON schema.",
    defaults: {
      humorFlavorStepTypeId: "",
      llmInputTypeId: String(TEXT_ONLY_INPUT_TYPE_ID),
      llmOutputTypeId: String(CAPTION_ARRAY_OUTPUT_TYPE_ID),
      llmTemperature: "0.2",
      description: "Normalize output to caption JSON schema",
      llmSystemPrompt:
        "You are a strict formatter. Convert input to exact schema-compliant caption JSON output with no extra text.",
      llmUserPrompt:
        "Convert the previous output into a JSON array of caption strings. Return only JSON. No markdown, no explanation.",
    },
    contract: {
      inputKind: "text",
      outputKind: "caption_json",
      requiredOutputJsonSchema: CAPTION_JSON_SCHEMA_DESCRIPTION,
      promptMustContainAny: ["json", "array", "caption", "return only"],
      captionCompatibleFinal: true,
    },
  },
  {
    key: "caption-ranker",
    label: "Caption Ranker",
    description: "Rank/select best caption candidates and output final JSON.",
    defaults: {
      humorFlavorStepTypeId: "",
      llmInputTypeId: String(TEXT_ONLY_INPUT_TYPE_ID),
      llmOutputTypeId: String(CAPTION_ARRAY_OUTPUT_TYPE_ID),
      llmTemperature: "0.2",
      description: "Rank and select strongest caption candidates",
      llmSystemPrompt:
        "You are a caption editor. Rank candidate captions by clarity, humor, and readability.",
      llmUserPrompt:
        "From the provided candidate captions, return the best captions as a JSON array of strings only.",
    },
    contract: {
      inputKind: "text",
      outputKind: "caption_json",
      requiredOutputJsonSchema: CAPTION_JSON_SCHEMA_DESCRIPTION,
      promptMustContainAny: ["rank", "best", "caption", "json"],
      captionCompatibleFinal: true,
    },
  },
];

export const STEP_TEMPLATE_BY_KEY = new Map(STEP_TEMPLATE_LIBRARY.map((template) => [template.key, template]));

export type StepTemplateKey = (typeof STEP_TEMPLATE_LIBRARY)[number]["key"];

export function parseStepTemplateKey(description: string | null | undefined): string | null {
  if (!description) {
    return null;
  }

  const match = description.match(STEP_TEMPLATE_MARKER_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
}

export function stripStepTemplateMarker(description: string | null | undefined): string {
  const raw = description ?? "";
  return raw.replace(STEP_TEMPLATE_MARKER_PATTERN, "").trim();
}

export function withStepTemplateMarker(description: string, templateKey: string | null): string {
  const stripped = stripStepTemplateMarker(description);
  if (!templateKey) {
    return stripped;
  }

  return `[[template:${templateKey}]] ${stripped}`.trim();
}

export function getTemplateContractByKey(templateKey: string | null | undefined): StepContract | null {
  if (!templateKey) {
    return null;
  }

  return STEP_TEMPLATE_BY_KEY.get(templateKey)?.contract ?? null;
}

export function getInputKindFromTypeId(llmInputTypeId: number | null | undefined): StepInputKind | null {
  if (llmInputTypeId === IMAGE_AND_TEXT_INPUT_TYPE_ID) {
    return "image_and_text";
  }

  if (llmInputTypeId === TEXT_ONLY_INPUT_TYPE_ID) {
    return "text";
  }

  return null;
}

export function getOutputKindFromTypeIdAndSlug(
  llmOutputTypeId: number | null | undefined,
  outputSlug: string | null | undefined,
): StepOutputKind | null {
  if (llmOutputTypeId === CAPTION_ARRAY_OUTPUT_TYPE_ID) {
    return "caption_json";
  }

  if (llmOutputTypeId === STRING_OUTPUT_TYPE_ID) {
    return "string";
  }

  const normalizedSlug = outputSlug?.trim().toLowerCase() ?? "";
  if (normalizedSlug === "array") {
    return "caption_json";
  }

  if (normalizedSlug === "string") {
    return "string";
  }

  return null;
}
