const DEFAULT_API_BASE_URL = "https://api.almostcrackd.ai";
const EXTERNAL_API_BASE_URL_ENV = "ASSIGNMENT5_API_BASE_URL";
const EXTERNAL_API_TOKEN_ENV = "ASSIGNMENT5_API_TOKEN";

export function getExternalApiBaseUrl(): string {
  const configured = process.env[EXTERNAL_API_BASE_URL_ENV]?.trim();
  if (!configured) {
    return DEFAULT_API_BASE_URL;
  }

  try {
    return new URL(configured).toString();
  } catch {
    throw new Error(`Invalid ${EXTERNAL_API_BASE_URL_ENV} value: ${configured}`);
  }
}

export function getExternalApiToken(): string | null {
  const configured = process.env[EXTERNAL_API_TOKEN_ENV]?.trim();
  return configured && configured.length > 0 ? configured : null;
}

export const GENERATE_PRESIGNED_URL_PATH = "/pipeline/generate-presigned-url";
export const UPLOAD_IMAGE_FROM_URL_PATH = "/pipeline/upload-image-from-url";
export const GENERATE_CAPTIONS_PATH = "/pipeline/generate-captions";

export function buildExternalApiUrl(path = ""): string {
  return new URL(path, `${getExternalApiBaseUrl()}/`).toString().replace(/\/$/, "");
}
