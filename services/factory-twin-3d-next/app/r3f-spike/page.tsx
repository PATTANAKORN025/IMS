import TwinViewport from '@/components/factory-twin/twin-viewport/TwinViewport';

/**
 * Step 4 spike route -- /factory-twin-3d/r3f-spike, isolated from the real
 * /factory-twin-3d/ page (app/page.tsx, Step 3's shell, untouched by this
 * file). Server Component itself; TwinViewport is the client boundary
 * where R3F actually runs. See docs/evidence/FACTORY_TWIN_R3F_RUNTIME_SPIKE.md.
 */
export default function R3fSpikePage() {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-bg p-3">
      <h1 className="mb-2 shrink-0 text-sm font-semibold text-text-primary">
        R3F runtime spike (Step 4) — synthetic placeholder scene, not the real Factory Twin
      </h1>
      <TwinViewport />
    </main>
  );
}
