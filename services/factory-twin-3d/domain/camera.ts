/**
 * app.js's three fixed view presets (VIEWS()/applyView(), app.js:765-781).
 * CameraState describes INTENT -- which preset, where it points -- never a
 * per-frame Three.js Camera/Controls instance. Those stay exactly where
 * they are today: renderer-local module state in app.js, read every frame
 * inside animate() but never written to by anything resembling a UI
 * framework's state (see FACTORY_TWIN_ARCHITECTURE_GAP_AUDIT.md's "State
 * management" row). This type exists so that discipline stays checkable
 * once a UI framework is introduced -- it is not itself rendering code.
 */

import type { Point3 } from './spatial';

export type ViewName = 'plan' | 'overview' | 'building';

export const VIEW_NAMES: readonly ViewName[] = ['plan', 'overview', 'building'];

/** app.js's own default (`let activeView = 'plan'`, app.js:603). */
export const DEFAULT_VIEW: ViewName = 'plan';

export interface CameraState {
  readonly view: ViewName;
  readonly position: Point3;
  readonly target: Point3;
}
