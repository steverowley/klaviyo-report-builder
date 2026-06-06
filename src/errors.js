// Map a fetch/HTTP failure to plain-English guidance for non-technical staff,
// instead of surfacing raw status codes or model JSON. Shared by the generate,
// regenerate, and slides paths.
export function friendlyErrorMessage(status, fallback) {
  if (status === 429 || status === 529 || status === 503) {
    return "The AI service is busy right now — wait a few seconds and click Generate again.";
  }
  if (status === 401 || status === 403) {
    return "Your session has expired — please sign in again.";
  }
  if (typeof status === "number" && status >= 500) {
    return "Something went wrong on our side — please try again. If it keeps happening, contact Rowley.";
  }
  return fallback || "Something went wrong. Please try again.";
}

// Whether an HTTP status is worth automatically retrying (transient overload /
// upstream hiccup) versus a permanent client error.
export function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 529;
}
