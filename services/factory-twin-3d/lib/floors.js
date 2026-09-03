'use strict';

/**
 * THE FLOOR REGISTRY.
 *
 * Floor 1 is the first validated dataset, not the only shape this service is
 * allowed to have. Everything below exists so that Floor 2 is a file drop
 * rather than a rewrite: the loaders, the routes and the renderer address a
 * floor by id, and the id space is fixed here.
 *
 * WHY A REGISTRY AND NOT A PATH PARAMETER. A floor id arrives from the query
 * string, which means it is attacker-controlled, and it is used to build a
 * filesystem path. Two independent guards apply, in this order:
 *
 *   1. It must match FLOOR_ID exactly. The pattern admits nothing that could
 *      traverse -- no dot, no slash, no separator of any kind.
 *   2. It must already appear in the discovered catalogue. A floor the server
 *      did not find on disk cannot be addressed at all, so even a well-formed
 *      id for a floor that does not exist never reaches fs.
 *
 * The second guard is what makes this allowlist-by-construction rather than
 * pattern-matching: paths are built only from ids the server itself produced
 * by reading its own directory, never from the string the client sent.
 *
 * WHAT IS DELIBERATELY NOT HERE. No floor label, ordering or description is
 * read from a private document. A floor's label is computed from its ordinal
 * ("Floor 2"), because a name read from a confidential drawing is exactly the
 * kind of value that must not reach the wire, and a floor selector does not
 * need one to work.
 */

const fs = require('fs');
const path = require('path');

/**
 * The complete id space. Five floors is the building; the pattern is closed
 * rather than open-ended so that an id can never name something else on disk.
 */
const FLOOR_ID = /^floor[1-5]$/;

/**
 * The document kinds a floor can have, and the filename suffix of each.
 * A caller names a kind; it never names a file. Anything not in this map
 * cannot be addressed, which is what stops a new private document from
 * becoming reachable merely by existing in the directory.
 */
const DOCUMENTS = Object.freeze({
  geometry: '-geometry.json',
  zones: '-zones.json',
  mapping: '-asset-mapping.json',
  schematic: '-schematic.json',
});

/** True only for a string that is exactly a floor id. */
function isFloorId(value) {
  return typeof value === 'string' && FLOOR_ID.test(value);
}

/** The ordinal in "floorN". Returns null for anything that is not an id. */
function ordinalOf(id) {
  return isFloorId(id) ? Number(id.slice(5)) : null;
}

/**
 * Reads the private directory and reports which floors are actually deployed.
 *
 * A floor counts as deployed when its geometry document exists -- zones and a
 * mapping are optional layers on top of it, and a floor with zones but no
 * geometry has nothing to place them on. Absence is reported, never inferred:
 * an undeployed floor is simply not in the catalogue, and no caller is invited
 * to guess what would have been there.
 */
function discover(privateDir) {
  const out = [];
  for (let n = 1; n <= 5; n++) {
    const id = `floor${n}`;
    const geometry = path.join(privateDir, `${id}${DOCUMENTS.geometry}`);
    if (!fs.existsSync(geometry)) continue;
    out.push({
      id,
      ordinal: n,
      label: `Floor ${n}`,
      has_zones: fs.existsSync(path.join(privateDir, `${id}${DOCUMENTS.zones}`)),
      has_mapping: fs.existsSync(path.join(privateDir, `${id}${DOCUMENTS.mapping}`)),
    });
  }
  return out;
}

/**
 * Resolves a requested floor id against a catalogue.
 *
 * Returns the catalogue's own id string, never the caller's -- so a path is
 * built from a value the server produced. An unrecognised or malformed request
 * resolves to null rather than to the default: silently serving Floor 1 when
 * Floor 3 was asked for would make a floor selector lie about what it shows.
 * A request with no floor at all is a different case, and its answer is
 * defaultFloor() below.
 */
function resolve(catalogue, requested) {
  if (!Array.isArray(catalogue) || catalogue.length === 0) return null;
  if (!isFloorId(requested)) return null;
  const hit = catalogue.find((f) => f.id === requested);
  return hit ? hit.id : null;
}

/** The lowest deployed floor, or null when nothing is deployed. */
function defaultFloor(catalogue) {
  if (!Array.isArray(catalogue) || catalogue.length === 0) return null;
  return catalogue.reduce((a, b) => (a.ordinal <= b.ordinal ? a : b)).id;
}

/**
 * The path of one document of one floor.
 *
 * Both arguments are checked against closed sets before any string is joined,
 * so this cannot be made to name a file outside the private directory even if
 * both arguments come straight from a request.
 */
function documentPath(privateDir, id, kind) {
  if (!isFloorId(id)) return null;
  if (!Object.prototype.hasOwnProperty.call(DOCUMENTS, kind)) return null;
  return path.join(privateDir, `${id}${DOCUMENTS[kind]}`);
}

module.exports = {
  FLOOR_ID,
  DOCUMENTS,
  isFloorId,
  ordinalOf,
  discover,
  resolve,
  defaultFloor,
  documentPath,
};
