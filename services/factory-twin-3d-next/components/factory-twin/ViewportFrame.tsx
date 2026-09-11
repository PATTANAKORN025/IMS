/**
 * THE RENDERER BOUNDARY. Everything above this component is real UI shell
 * (Step 3). Everything this component's children WOULD be is the future
 * R3F/Three.js runtime (a later, separate migration spike) -- deliberately
 * not present here.
 *
 *   React UI (this app)
 *        |
 *        v
 *   TwinViewport boundary  <-- this component
 *        |
 *        v
 *   Future R3F / Three.js runtime  <-- NOT built yet
 *
 * A plain, static, server-rendered box -- no canvas, no WebGL, no client
 * JS at all. The main viewport must stay the visually dominant element
 * even as an empty placeholder (industrial-SCADA rule: the viewport is
 * the product, not the chrome around it).
 */
export default function ViewportFrame() {
  return (
    <div
      role="img"
      aria-label="3D viewport placeholder -- renderer not migrated in this step"
      className="flex flex-1 items-center justify-center border border-border bg-bg bg-[repeating-linear-gradient(45deg,var(--border)_0,var(--border)_1px,transparent_0,transparent_12px)]"
    >
      <p className="rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-text-secondary">
        TwinViewport boundary — renderer not migrated yet
      </p>
    </div>
  );
}
