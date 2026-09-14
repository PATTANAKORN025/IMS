/**
 * Step 8: standalone service health endpoint. Served at
 * `/factory-twin-3d/health` (this app's `basePath` in `next.config.ts` is
 * `/factory-twin-3d`, matching legacy's own served path -- App Router
 * route handlers are prefixed by `basePath` automatically, no separate
 * `/factory-twin-3d-next` prefix exists anywhere in this app).
 *
 * Returns application name, version, a build identifier, and environment
 * only -- no secrets, no env var dump, no request headers echoed back.
 */

import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import packageJson from '../../package.json';

export const dynamic = 'force-dynamic';

/** `.next/BUILD_ID` is written by `next build` next to the compiled
 *  output and present in both the dev tree and the `output: standalone`
 *  runtime image -- absent only if this route is hit before any build
 *  has ever run, handled as `null`, never a guessed value. */
function readBuildId(): string | null {
  try {
    return readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      application: packageJson.name,
      version: packageJson.version,
      buildId: readBuildId(),
      environment: process.env.NODE_ENV ?? 'unknown',
    },
    { status: 200 },
  );
}
