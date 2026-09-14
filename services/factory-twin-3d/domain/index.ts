/**
 * Type-only barrel. Every export in this domain layer is a type, an
 * interface, or a small pure function operating on plain data (no
 * classes, no side effects, no DOM/WebGL/network access) -- see
 * docs/evidence/FACTORY_TWIN_DOMAIN_MODEL.md for the boundary diagram.
 */

export * from './spatial';
export * from './machine-state';
export * from './data-quality';
export * from './geometry';
export * from './zone';
export * from './asset';
export * from './selection';
export * from './camera';
