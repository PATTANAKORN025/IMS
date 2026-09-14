/**
 * Phase 12D: one reusable timeout mechanism for every outbound
 * factory-twin-3d backend call this service makes, replacing three
 * separate untimed `fetch()` calls in geometry-adapter.ts,
 * machine-adapter.ts and reference-adapter.ts (the audit's own finding --
 * a hung backend blocked the whole server-rendered page indefinitely,
 * with no AbortController/timeout of any kind).
 *
 * Timeout grounded in a real measurement of THIS SAME endpoint, not a
 * guess: docs/ux/INTERACTIVE_READY_ROOT_CAUSE.md's own recorded figure for
 * `/api/floor-geometry` (433 real equipment records) is 86-284ms.
 * BACKEND_FETCH_TIMEOUT_MS is roughly 28x that observed worst case --
 * generous headroom for a cold or loaded backend, small enough to fail a
 * request fast rather than hang a server-rendered page indefinitely. Never
 * "arbitrary huge" (not 30s/60s) and never so tight it would false-positive
 * against the real measured range.
 */

export const BACKEND_FETCH_TIMEOUT_MS = 8_000;

export type BackendFetchErrorKind = 'TIMEOUT' | 'NETWORK' | 'HTTP_ERROR' | 'MALFORMED_RESPONSE';

/**
 * Typed classification for every way an outbound backend call can fail --
 * never a fabricated fallback value, always a thrown, classified error for
 * the caller (page.tsx's own try/catch, Phase 12D) to log server-side and
 * for the route's error.tsx boundary to render honestly.
 */
export class BackendFetchError extends Error {
  readonly kind: BackendFetchErrorKind;
  readonly url: string;
  readonly status?: number;

  constructor(kind: BackendFetchErrorKind, url: string, message: string, status?: number) {
    super(message);
    this.name = 'BackendFetchError';
    this.kind = kind;
    this.url = url;
    this.status = status;
  }
}

/**
 * Fetches `url` bounded by BACKEND_FETCH_TIMEOUT_MS and returns the parsed
 * JSON body. `cache: 'no-store'` preserved from the three original call
 * sites -- this is live operational/CAD data, never cached across
 * requests. Every failure path throws a typed BackendFetchError; this
 * function itself never returns fabricated fallback data.
 */
export async function fetchBackendJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new BackendFetchError('TIMEOUT', url, `backend request timed out after ${BACKEND_FETCH_TIMEOUT_MS}ms: ${url}`);
    }
    throw new BackendFetchError('NETWORK', url, `backend request failed: ${url} -- ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new BackendFetchError('HTTP_ERROR', url, `backend returned ${res.status} ${res.statusText}: ${url}`, res.status);
  }

  try {
    return await res.json();
  } catch {
    throw new BackendFetchError('MALFORMED_RESPONSE', url, `backend response was not valid JSON: ${url}`);
  }
}
