import type { NextConfig } from 'next';

// Same basePath/output shape proven working end-to-end in the Step 2 spike
// (spikes/factory-twin-nextjs/, see docs/evidence/FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md).
// This app is NOT wired into proxy/nginx.conf or docker-compose.yaml -- it
// only builds/runs standalone on its own dev port for this step.
const nextConfig: NextConfig = {
  basePath: '/factory-twin-3d',
  output: 'standalone',
  // turbopack.root deliberately left at Turbopack's own inferred default
  // (this repo's root, where package-lock.json lives) rather than scoped
  // to __dirname: this app imports Step 1's domain layer from a sibling
  // service directory (../factory-twin-3d/domain via the @twin-domain
  // path alias), and Turbopack refuses to resolve imports outside a
  // narrower configured root -- confirmed by a real build failure when
  // this was tried. The workspace-root inference warning is accepted as
  // harmless rather than "fixed" in a way that breaks the domain import.
};

export default nextConfig;
