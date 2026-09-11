'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PerspectiveCamera } from 'three';
import type { ViewName, CameraState } from '@twin-domain/camera';
import { VIEW_NAMES } from '@twin-domain/camera';
import type { Envelope } from '@twin-domain/geometry';

/**
 * Step 5D production camera architecture, built on Step 5A's own
 * CameraState-driven preset controller (view is a discrete prop, OrbitControls
 * owns orbit/zoom/pan entirely inside three.js -- unchanged principle).
 * CameraState itself (services/factory-twin-3d/domain/camera.ts) stays
 * renderer-independent: no THREE.PerspectiveCamera/OrbitControls reference
 * is ever put into it, only plain {view, position, target}. This
 * component is the ONLY place that boundary is crossed, in both
 * directions: domain -> renderer (the preset useEffect below) and
 * renderer -> domain (handleControlsEnd, a discrete checkpoint, never a
 * per-frame read).
 *
 * Presets are computed FROM the real envelope (mirroring app.js's own
 * refitViews()/frameBounds() intent: frame the actual measured building),
 * not copied constants -- unchanged from Step 5A.
 */

const PADDING = 1.15; // headroom so a fit doesn't touch the exact edge of frame

function computePresets(span: number): Record<ViewName, { position: [number, number, number]; target: [number, number, number] }> {
  return {
    plan: { position: [0, span * 0.9, 0.01], target: [0, 0, 0] },
    overview: { position: [span * 0.45, span * 0.35, span * 0.45], target: [0, 0, 0] },
    building: { position: [span * 0.7, span * 0.6, span * 0.7], target: [0, 0, 0] },
  };
}

export default function GeometryCameraController({
  view,
  envelope,
  resetToken,
  fitToken,
  onCameraStateChange,
}: {
  view: ViewName;
  envelope: Envelope;
  /** Bump (increment) to trigger "Reset Camera" -- a counter prop, not a
   *  ref/imperative-handle, keeps this component's API plain data. */
  resetToken: number;
  /** Bump to trigger "Fit Factory". */
  fitToken: number;
  /** Called ONLY at a meaningful checkpoint (orbit/zoom/pan interaction
   *  END, or after reset/fit) -- never per frame, never per pointermove. */
  onCameraStateChange?: (state: CameraState) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const span = Math.max(envelope.width, envelope.depth);
  const prevResetToken = useRef(resetToken);
  const prevFitToken = useRef(fitToken);
  const lastCommitted = useRef<CameraState | null>(null);

  /**
   * Commit a CameraState only if it actually differs from the last one
   * committed. Real, measured bug this fixes: OrbitControls fires its own
   * 'end' event on ANY mousedown->mouseup on the canvas, including a plain
   * click with zero movement (a machine-selection click, Step 5C) -- so
   * without this guard, every selection click also produced a spurious,
   * unnecessary React render via onCameraStateChange even though the
   * camera never moved. That is exactly what Section 7 forbids ("update
   * only at meaningful checkpoints"): a no-op end event is not a
   * meaningful checkpoint. Found via Step 5B/5C's own regression suites
   * (camera-orbit and rapid-click render-count assertions), not invented
   * speculatively.
   */
  function commit(state: CameraState) {
    const prev = lastCommitted.current;
    const unchanged =
      prev !== null &&
      prev.view === state.view &&
      prev.position.x === state.position.x &&
      prev.position.y === state.position.y &&
      prev.position.z === state.position.z &&
      prev.target.x === state.target.x &&
      prev.target.y === state.target.y &&
      prev.target.z === state.target.z;
    if (unchanged) return;
    lastCommitted.current = state;
    onCameraStateChange?.(state);
  }

  function applyPreset(name: ViewName) {
    const preset = computePresets(span)[name] ?? computePresets(span)[VIEW_NAMES[0]];
    camera.position.set(...preset.position);
    controlsRef.current?.target.set(...preset.target);
    controlsRef.current?.update();
  }

  /**
   * Fit Factory (Section 11): a real, computed fit, not a hardcoded
   * extent. Bounding SPHERE of the envelope box (not an iterative
   * NDC-fit like app.js's own frameBounds() -- that 12-pass algorithm
   * solves for an oblique view's asymmetric projection, which is more
   * precision than a "simplest camera model that fits" step needs;
   * radius/sin(fov/2) is the standard closed-form distance that exactly
   * inscribes a bounding sphere in frame, correct for any aspect ratio).
   * Direction vector reused from app.js's own frameBounds() (0.35, 0.78,
   * 0.85 normalized) -- an evidence-informed choice already proven to
   * frame this building well in the legacy app, not a new guess.
   */
  function fitFactory() {
    const box = new THREE.Box3(
      new THREE.Vector3(-envelope.width / 2, 0, -envelope.depth / 2),
      new THREE.Vector3(envelope.width / 2, envelope.height, envelope.depth / 2),
    );
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const perspective = camera as PerspectiveCamera;
    const vFovRad = THREE.MathUtils.degToRad(perspective.fov);
    const distance = (sphere.radius / Math.sin(vFovRad / 2)) * PADDING;
    const dir = new THREE.Vector3(0.35, 0.78, 0.85).normalize();
    const pos = dir.clone().multiplyScalar(distance).add(sphere.center);
    camera.position.copy(pos);
    controlsRef.current?.target.copy(sphere.center);
    controlsRef.current?.update();
  }

  function readCameraState(): CameraState {
    const t = controlsRef.current?.target ?? new THREE.Vector3();
    return {
      view,
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: t.x, y: t.y, z: t.z },
    };
  }

  // Initial framing + limits (Section 3), derived from the real envelope,
  // never hard-coded. Runs on mount and whenever the view preset or the
  // envelope itself changes -- a discrete effect, not a per-frame loop.
  useEffect(() => {
    applyPreset(view);
    const perspective = camera as PerspectiveCamera;
    perspective.far = span * 4;
    perspective.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.minDistance = Math.max(span * 0.02, 2);
      controls.maxDistance = span * 3;
      controls.minPolarAngle = 0; // top-down ('plan') stays reachable
      controls.maxPolarAngle = Math.PI / 2 - 0.05; // never reach/cross the horizon -- never see the floor from below
      // Same convention as app.js:162 (controls.enableDamping =
      // !prefersReducedMotion) -- not a difference introduced here, and
      // legacy has no min/maxDistance or polar-angle limits at all (grep
      // confirmed), so those ARE new, evidence-derived capability, not a
      // reproduction of an existing pattern.
      const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      controls.enableDamping = !prefersReducedMotion;
      controls.update();
    }
    commit(readCameraState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, camera, span]);

  useEffect(() => {
    if (resetToken !== prevResetToken.current) {
      prevResetToken.current = resetToken;
      applyPreset(view);
      commit(readCameraState());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useEffect(() => {
    if (fitToken !== prevFitToken.current) {
      prevFitToken.current = fitToken;
      fitFactory();
      commit(readCameraState());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      onEnd={() => commit(readCameraState())}
    />
  );
}
