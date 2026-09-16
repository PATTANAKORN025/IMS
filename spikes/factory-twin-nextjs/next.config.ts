import type { NextConfig } from 'next';

// Mirrors the constraint the real /factory-twin-3d/ deployment has today
// (proxy/nginx.conf's `location /factory-twin-3d/`): the app is served
// under a fixed, non-root path, self-hosted (no Vercel), behind a reverse
// proxy that also gates the route with auth_request. basePath is the
// only supported way to do the first part; `output: 'standalone'` is
// evaluated here because every other service in this repo self-hosts via
// a plain `node server.js`-shaped container, which standalone output is
// built for.
const nextConfig: NextConfig = {
  basePath: '/factory-twin-3d',
  output: 'standalone',
};

export default nextConfig;
