const CAPTION_TEXT_KEYS = ["content", "caption", "text", "output_text", "candidate"] as const;
const CONTAINER_KEYS = ["captions", "data", "results", "output", "outputs", "items", "candidates"] as const;
const OUTPUT_STRING_KEYS = ["output", "result", "response", "completion", "message"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addCaption(candidate: unknown, sink: string[], seen: Set<string>) {
  if (typeof candidate !== "string") {
    return;
  }

  const normalized = candidate.trim();
  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  sink.push(normalized);
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json|javascript|js|txt)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractCaptionsFromListText(value: string): string[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const listItems = lines
    .map((line) => line.replace(/^([-*]\s+|\d+[.)]\s+)/, "").trim())
    .filter((line) => line.length > 0);

  if (listItems.length < 2) {
    return [];
  }

  return listItems;
}

function tryParseCaptionJsonString(value: string): string[] {
  const normalized = stripCodeFences(value);
  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed)) {
      return extractFromArray(parsed);
    }
    if (typeof parsed === "string") {
      return parsed.trim().length > 0 ? [parsed.trim()] : [];
    }
    if (isRecord(parsed)) {
      for (const key of [...CONTAINER_KEYS, ...OUTPUT_STRING_KEYS] as const) {
        const candidate = parsed[key];
        if (Array.isArray(candidate)) {
          const extracted = extractFromArray(candidate);
          if (extracted.length > 0) {
            return extracted;
          }
        }
        if (typeof candidate === "string") {
          const nested = tryParseCaptionJsonString(candidate);
          if (nested.length > 0) {
            return nested;
          }
        }
      }
    }
  } catch {
    return extractCaptionsFromListText(normalized);
  }

  return [];
}

export function extractCaptionsFromApiResponse(responseJson: unknown): string[] {
  // Prioritize direct array payloads returned by the Stage 4 endpoint.
  if (Array.isArray(responseJson)) {
    const fromArray = extractFromArray(responseJson);
    if (fromArray.length > 0) {
      return fromArray;
    }
  }

  if (isRecord(responseJson)) {
    for (const key of ["captions", "data"] as const) {
      if (Array.isArray(responseJson[key])) {
        const fromContainerArray = extractFromArray(responseJson[key]);
        if (fromContainerArray.length > 0) {
          return fromContainerArray;
        }
      }
    }

    for (const key of OUTPUT_STRING_KEYS) {
      if (typeof responseJson[key] === "string") {
        const parsed = tryParseCaptionJsonString(responseJson[key]);
        if (parsed.length > 0) {
          return parsed;
        }
      }
    }
  }

  if (typeof responseJson === "string") {
    const parsed = tryParseCaptionJsonString(responseJson);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  const captions: string[] = [];
  const seen = new Set<string>();
  const visited = new WeakSet<object>();

  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || value == null) {
      return;
    }

    addCaption(value, captions, seen);
    if (typeof value === "string") {
      for (const parsedCaption of tryParseCaptionJsonString(value)) {
        addCaption(parsedCaption, captions, seen);
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, depth + 1);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    if (visited.has(value)) {
      return;
    }
    visited.add(value);

    for (const key of CAPTION_TEXT_KEYS) {
      if (key in value) {
        walk(value[key], depth + 1);
      }
    }

    for (const key of CONTAINER_KEYS) {
      if (key in value) {
        walk(value[key], depth + 1);
      }
    }
  };

  walk(responseJson, 0);

  return captions;
}

function extractFromArray(value: unknown[]): string[] {
  const captions: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item === "string") {
      addCaption(item, captions, seen);
      continue;
    }

    if (!isRecord(item)) {
      continue;
    }

    for (const key of CAPTION_TEXT_KEYS) {
      if (key in item) {
        addCaption(item[key], captions, seen);
      }
    }
  }

  return captions;
}
