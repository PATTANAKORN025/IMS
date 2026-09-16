/**
 * Phase 12D: the smallest possible consistent application logging boundary
 * this service didn't have at all before (the audit's own finding --
 * zero console/structured-logger calls anywhere in this codebase). One
 * function, one line of JSON per call, no framework -- this service is a
 * migration candidate, not a place to introduce a new dependency for
 * something this small.
 *
 * NEVER pass as `detail`: passwords, cookies, Authorization headers,
 * secrets, or a full request/response payload. `detail` exists for a
 * short, already-safe string only (an error kind, a status code, a record
 * count) -- the same discipline services/alarm-api/server.js's own
 * console.error calls already follow (log err.message, never the full
 * err object with request/response context attached).
 */

export type LogFailureCategory =
  | 'timeout'
  | 'network'
  | 'http_error'
  | 'malformed_response'
  | 'validation_error'
  | 'unknown_error';

export interface LogFields {
  readonly route: string;
  readonly operation: string;
  /** Omit entirely for a successful operation -- presence of this field
   *  is itself what marks a log line as a failure (see below). */
  readonly failureCategory?: LogFailureCategory;
  readonly durationMs?: number;
  /** Short, already-safe classification text only -- see the file header. */
  readonly detail?: string;
}

const SERVICE = 'factory-twin-3d-next';

export function log(fields: LogFields): void {
  const line = {
    ts: new Date().toISOString(),
    service: SERVICE,
    ...fields,
  };
  // Server-side console output only -- this module is imported from a
  // Server Component (page.tsx) and, for the boundary's own log call, a
  // Client Component (error.tsx); neither ever runs anywhere but this
  // process or the viewer's own browser console, never a shared sink.
  if (fields.failureCategory) {
    console.error(JSON.stringify(line));
  } else {
    console.log(JSON.stringify(line));
  }
}
