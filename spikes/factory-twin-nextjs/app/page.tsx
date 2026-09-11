import WebglPlaceholder from './webgl-placeholder';

/**
 * One route (this page), one client component (WebglPlaceholder), one
 * static asset (the <img> below, served from public/), one _next asset
 * (produced by the build itself -- Next.js's own JS/CSS chunks). Nothing
 * here is the real Factory Twin UI.
 *
 * Plain <img>, not next/image -- next/image's optimizer proxies through
 * its own /_next/image route, a separate proxy question this spike does
 * not test; called out as untested in the spike report rather than
 * silently assumed identical to a plain static file.
 */
export default function SpikePage() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Factory Twin Next.js Spike</h1>
      <p>
        Disposable Step 1.5 artifact. Answers: does this exact path shape
        (auth_request -&gt; proxy_pass -&gt; basePath) work end to end?
      </p>
      <img src="spike-badge.svg" alt="static asset check" width={120} height={40} />
      <WebglPlaceholder />
    </main>
  );
}
