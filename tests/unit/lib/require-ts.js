'use strict';

/**
 * Loads a single .ts file at test time by transpiling it in memory with the
 * TypeScript compiler API (already present in node_modules -- see root
 * package.json's typescript devDependency) and running the result through
 * Node's own CommonJS module loader. No dist folder, no ts-node, no build
 * step for the running application: this exists only so this repo's plain
 * `node some.test.js` test convention (see tests/unit/factory-twin-wire.test.js)
 * can exercise TypeScript domain modules without adopting a bundler.
 *
 * Per-file only (ts.transpileModule does no cross-file type checking or
 * module resolution) -- correctness of types across files is checked
 * separately by `npm run factory-twin:typecheck` (tsc --noEmit). Domain
 * files are written so every cross-file reference is `import type`, which
 * transpileModule erases entirely, so no runtime require() of a sibling
 * .ts file is ever emitted and none needs to be resolved here.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function requireTs(tsPath) {
  const absPath = path.resolve(tsPath);
  const source = fs.readFileSync(absPath, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true,
    },
    fileName: absPath,
    reportDiagnostics: true,
  });
  if (diagnostics && diagnostics.length > 0) {
    const msg = diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n');
    throw new Error(`requireTs(${absPath}) transpile diagnostics:\n${msg}`);
  }
  const mod = new Module(absPath, module);
  mod.filename = absPath;
  mod.paths = Module._nodeModulePaths(path.dirname(absPath));
  mod._compile(outputText, absPath);
  return mod.exports;
}

module.exports = { requireTs };
