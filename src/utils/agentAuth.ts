/**
 * Same source as the generated client's middleware: localStorage "access_token".
 * Read on every call, so a token refreshed elsewhere in the app is picked up on the next stream reconnect.
 */
const rawToken = (): string | null => {
  try {
    return localStorage.getItem("access_token");
  } catch {
    return null;
  }
};

/** "Bearer <token>" for the SSE calls (the backend accepts the token with or without the prefix). */
export function getAuthHeader(): string | null {
  const token = rawToken()?.trim();
  if (!token) return null;
  return /^bearer\s/i.test(token) ? token : `Bearer ${token}`;
}

export interface AgentIdentity {
  /** the numeric agent PK the backend uses (token claim `user_id`) */
  agentId: number;
  name: string;
  email: string;
}

/** Reads the agent's own claims from the token (no verification: the server does that). */
export async function loadIdentity(): Promise<AgentIdentity | null> {
  const header = getAuthHeader();
  if (!header) return null;
  const part = header.replace(/^bearer\s+/i, "").split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const agentId = Number(claims.user_id);
    if (!Number.isSafeInteger(agentId)) return null;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const name = [str(claims.first_name), str(claims.last_name)].filter(Boolean).join(" ") || str(claims.sub) || "Agent";
    return { agentId, name, email: str(claims.sub) };
  } catch {
    return null;
  }
}