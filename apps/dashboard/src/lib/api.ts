const BASE_URL = "/api";

// Credential and MFA calls answer 401 for a wrong password or code, which is not an expired session.
const AUTH_ENTRY_PATHS = /^\/auth\/(login|logout|mfa|reset-password|forgot-password)/;

export const SESSION_EXPIRED_EVENT = "oncoflow:session-expired";

// Sends a JSON request to the API with credentials and throws on a non-OK response.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (res.status === 401 && !AUTH_ENTRY_PATHS.test(path)) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  // 204 responses (acknowledge, cancel) have no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
