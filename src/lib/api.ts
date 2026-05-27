type ApiErrorPayload = {
  error?: string;
};

function isApiErrorPayload(payload: unknown): payload is ApiErrorPayload {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const payload: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = isApiErrorPayload(payload) && typeof payload.error === "string"
      ? payload.error
      : `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return payload as T;
}
