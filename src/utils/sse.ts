import { fetchEventSource } from "@microsoft/fetch-event-source";

export interface SseOptions {
  url: string;
  /** called before EVERY (re)connection, so the token is always current */
  headers: () => Promise<Record<string, string>> | Record<string, string>;
  onEvent: (name: string, data: string) => void;
  /** every time a connection is (re)established; the server sends a fresh snapshot first */
  onOpen?: () => void;
  /** an established connection dropped (a retry is already scheduled) */
  onDisconnect?: () => void;
  /** non-retryable status (401/403/404/410): the stream stops for good */
  onFatal?: (status: number) => void;
}

export interface SseHandle {
  close(): void;
}

const STALL_MS = 45_000; // server heartbeat is every 15 s
const FATAL = [401, 403, 404, 410];

class FatalError extends Error {
  constructor(public status: number) {
    super(`sse ${status}`);
  }
}
class RetriableError extends Error { }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Authenticated SSE on top of @microsoft/fetch-event-source (EventSource can't send headers).
 *  - the library retries on errors and on a server-side close (we throw from onclose to make it retry)
 *  - a watchdog aborts connections that go silent (it also sees heartbeat comments, which the library hides)
 *  - the browser coming back online restarts the connection immediately
 */
export function connectSse(o: SseOptions): SseHandle {
  let closed = false;
  let conn: AbortController | null = null;
  let retry = 0;

  const onOnline = () => conn?.abort(); // the loop below reconnects at once
  window.addEventListener("online", onOnline);

  const run = async () => {
    while (!closed) {
      const ctl = new AbortController();
      conn = ctl;
      let stall: ReturnType<typeof setTimeout> | undefined;
      let open = false;
      const arm = () => {
        if (stall) clearTimeout(stall);
        stall = setTimeout(() => ctl.abort(), STALL_MS);
      };

      try {
        await fetchEventSource(o.url, {
          signal: ctl.signal,
          openWhenHidden: true, // agents want live updates from a background tab too
          headers: { Accept: "text/event-stream" },

          // runs for every (re)connection: fresh token each time, and chunk-level activity tracking
          fetch: async (input, init) => {
            arm();
            const extra = await o.headers();
            const res = await window.fetch(input, {
              ...init,
              headers: { ...(init?.headers as Record<string, string>), ...extra },
              credentials: "omit",
              cache: "no-store",
            });
            if (!res.body) return res;
            const body = res.body.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                  arm(); // any bytes, including ": heartbeat" comments
                  controller.enqueue(chunk);
                },
              }),
            );
            return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
          },

          async onopen(res) {
            if (res.ok && res.headers.get("content-type")?.startsWith("text/event-stream")) {
              retry = 0;
              open = true;
              o.onOpen?.();
              return;
            }
            if (FATAL.includes(res.status)) throw new FatalError(res.status);
            throw new Error(`sse ${res.status}`); // retried
          },

          onmessage(ev) {
            if (!ev.data) return;
            try {
              o.onEvent(ev.event || "message", ev.data);
            } catch {
              /* a bad handler must not kill the stream */
            }
          },

          // the library only retries after an error, so a clean server close has to be turned into one
          onclose() {
            throw new RetriableError();
          },

          onerror(err) {
            if (err instanceof FatalError) throw err; // stops the stream
            if (open) {
              open = false;
              o.onDisconnect?.();
            }
            return Math.min(1000 * 2 ** retry++, 15_000); // backoff before the library retries
          },
        });
      } catch (err) {
        if (err instanceof FatalError) {
          closed = true;
          o.onFatal?.(err.status);
          return;
        }
      } finally {
        if (stall) clearTimeout(stall);
      }

      if (closed) return;
      // fetchEventSource resolves without an error only when we aborted it (stall or "online")
      if (open) {
        open = false;
        o.onDisconnect?.();
      }
      await sleep(250);
    }
  };
  void run();

  return {
    close() {
      closed = true;
      conn?.abort();
      window.removeEventListener("online", onOnline);
    },
  };
}