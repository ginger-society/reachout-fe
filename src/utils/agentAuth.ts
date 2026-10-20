/**
 * Same source as the generated client's middleware: localStorage "access_token".
 * Read on every call, so a token refreshed elsewhere in the app is picked up on the next stream reconnect.
 *
 * Who the agent IS (id, name, email) is not decoded here any more: it comes from AuthContext
 * (the validate-token response), the same way the header gets it.
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
