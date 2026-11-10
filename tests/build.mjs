// Transpile the pure (DOM-free) modules the tests exercise into tests/.out as
// plain ES modules: no bundler and no test framework, just TypeScript's own
// transpiler and node:assert. Run with `npm test`.
import { mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let ts
try {
  ts = require('typescript') // the project's devDependency
} catch {
  // no node_modules (a bare checkout): fall back to a global tsc
  ts = require(join(dirname(realpathSync(execSync('which tsc').toString().trim())), '../lib/typescript.js'))
}

const MODULES = ['constants.ts', 'utils/morseDictionary.ts', 'utils/stations.ts', 'utils/agentEngine.ts', 'utils/progress.ts']
for (const file of MODULES) {
  let js = ts.transpileModule(readFileSync(join(here, '../src', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  js = js.replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${p}.mjs'`).replace(/import\.meta\.env/g, '({})')
  const out = join(here, '.out', file.replace(/\.ts$/, '.mjs'))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, js)
}
console.log(`built ${MODULES.length} modules into tests/.out`)
