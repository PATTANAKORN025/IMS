'use client';

/**
 * Phase 12D: route-segment error boundary for /geometry-candidate
 * (Next.js App Router convention -- catches any error thrown by this
 * segment's Server Component, including every BackendFetchError kind:
 * timeout, network failure, non-2xx, malformed JSON, or this route's own
 * semantic validation failures).
 *
 * Deliberately never reads `error.message` or `error.stack`. Two reasons,
 * not one:
 *   1. Next.js itself already strips a Server Component error's message
 *      down to a generic string in production builds, keeping only
 *      `digest` (an opaque id for correlating with server logs) -- so
 *      relying on `error.message` for anything meaningful would silently
 *      stop working outside development mode anyway.
 *   2. Defense in depth: even though page.tsx's own catch (Phase 12D)
 *      already re-throws a short, scrubbed message before this boundary
 *      ever sees it, this component does not depend on that scrubbing
 *      staying correct forever -- it never touches error.message at all,
 *      so a future regression in the page's own catch cannot leak a
 *      backend URL or stack trace through this boundary.
 *
 * The real classification (timeout vs network vs malformed, the backend
 * URL, the full message) is server-side only -- see the `log()` call in
 * page.tsx's catch block and lib/log.ts. An operator correlates a
 * specific failure using `error.digest` against that server log, not
 * anything rendered here.
 *
 * Step 11 production spike fix: uses `retry`, not `reset`. This app's own
 * bundled Next 16.3.4 docs (node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/error.md) state `retry` became
 * stable in v16.3.0 and is the function that "will try to re-fetch and
 * re-render the error boundary's children" -- `reset` (this file's
 * original Phase 12D implementation, predating that stabilization) only
 * "clear[s] the error state and re-render[s] ... WITHOUT re-fetching the
 * contents." Reproduced live: with `reset`, clicking Retry after the
 * backend genuinely recovered produced ZERO new network requests and
 * re-displayed the identical stale error -- a real user had no way to
 * recover from this boundary short of a full manual page reload, despite
 * the button being labeled "Retry."
 */
export default function GeometryCandidateError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
      <h1 className="text-sm font-semibold text-text-primary">Factory Twin data unavailable</h1>
      <p className="max-w-md text-xs text-text-secondary">
        The factory floor geometry could not be retrieved. This candidate route is an
        in-progress migration target -- the production Factory Twin at /factory-twin-3d/ is
        unaffected.
      </p>
      {error.digest && (
        <p className="text-xs text-text-muted">Reference: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-sm border border-border px-3 py-1 text-xs text-text-secondary hover:text-text-primary"
      >
        Retry
      </button>
    </main>
  );
}
