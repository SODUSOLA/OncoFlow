const BASE_URL = "/api";

// Adds an escape hatch for structured error data, such as the unpaid invoice returned with a 402.
export class ApiError extends Error {
  constructor(message: string, public readonly body: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

// Credential, MFA and password-reset calls answer 401 for a wrong password or code, which is not an expired session.
const AUTH_ENTRY_PATHS = /^\/auth\/(login|logout|mfa|register|reset-password|forgot-password|verify-email)/;

// Sends a JSON request to the API and throws an ApiError on failure.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (res.status === 401 && typeof window !== "undefined" && !AUTH_ENTRY_PATHS.test(path) && window.location.pathname !== "/login") {
    window.location.assign("/login?expired=1");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? `Request failed: ${res.status}`, body);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
};
