#!/usr/bin/env node
/**
 * validate-morse: checks a Morse code table against the ITU-R M.1677-1 standard.
 *
 * Part of the `morse-validator` Kiro power. Zero dependencies (Node >= 18).
 *
 *   node validate-morse.mjs                      # checks src/utils/morseDictionary.ts
 *   node validate-morse.mjs --file <path>        # checks any file
 *   node validate-morse.mjs --strict             # a missing file is an error
 *   node validate-morse.mjs --json               # machine-readable report
 *
 * Understands the table shapes used in this repo:
 *   object entries   A: '.-',   '1': '.----'
 *   tuple entries    ['A', '.-']
 *   decoder entries  '.-': 'A'      (code -> character, as in src/utils/morseDictionary.ts)
 * Dits/dahs must be `.` and `-`. Typographic variants (· • and – — _) are
 * accepted but reported as warnings, so the reference card can be checked too.
 *
 * Exit codes: 0 = valid (or file not created yet), 1 = invalid, 2 = usage / parse error.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/* ITU-R M.1677-1 International Morse code: letters and figures */
const ITU = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
  J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....',
  7: '--...', 8: '---..', 9: '----.',
}
const REQUIRED = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']
const DEFAULT_FILE = 'src/utils/morseDictionary.ts'
// typographic dit / dah variants (non-global for .test(); global copies for replace)
const DIT_VARIANT = /[·•∙⋅]/
const DAH_VARIANT = /[–—−_]/
const DIT_VARIANTS = new RegExp(DIT_VARIANT.source, 'g')
const DAH_VARIANTS = new RegExp(DAH_VARIANT.source, 'g')

/* --- CLI ------------------------------------------------------------------ */
function parseArgs(argv) {
  const opts = { file: null, strict: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--strict') opts.strict = true
    else if (a === '--json') opts.json = true
    else if (a === '--file') opts.file = argv[++i]
    else if (a.startsWith('--file=')) opts.file = a.slice(7)
    else if (a === '--help' || a === '-h') opts.help = true
    else throw new UsageError(`unknown argument: ${a}`)
  }
  if (opts.file === undefined) throw new UsageError('--file needs a path')
  return opts
}

class UsageError extends Error {}

/** Nearest directory at or above `start` containing package.json (the project root) */
function projectRoot(start) {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const up = dirname(dir)
    if (up === dir) return resolve(start)
    dir = up
  }
}

/* --- Parsing --------------------------------------------------------------- */
function stripComments(src) {
  // good enough for data tables: block comments, then line comments not inside
  // quotes. Comments are blanked, not deleted, so line numbers stay correct.
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`])(\/\/.*)$/gm, (_, pre, c) => pre + blank(c))
}

/** Returns [{ key, raw, line }] for every single-character alphanumeric entry */
export function extractEntries(src) {
  const text = stripComments(src)
  const lineOf = (index) => text.slice(0, index).split('\n').length
  const entries = []
  // object form:  A: '.-'   'A': ".-"   1: '.----'
  const objectRe = /(?<![\w$])(['"]?)([A-Za-z0-9])\1\s*:\s*(['"`])([^'"`\n]*)\3/g
  // tuple form:   ['A', '.-']
  const tupleRe = /\[\s*(['"`])([A-Za-z0-9])\1\s*,\s*(['"`])([^'"`\n]*)\3\s*\]/g
  for (const re of [objectRe, tupleRe]) {
    for (const m of text.matchAll(re)) entries.push({ key: m[2], raw: m[4], line: lineOf(m.index) })
  }
  // reverse (decoder) form:   '.-': 'A'   (code -> character)
  const reverseRe = /(['"`])([.\-·•∙⋅–—−_]*)\1\s*:\s*(['"`])([A-Za-z0-9])\3/g
  for (const m of text.matchAll(reverseRe)) entries.push({ key: m[4], raw: m[2], line: lineOf(m.index) })
  return entries.sort((a, b) => a.line - b.line)
}

/* --- Validation -------------------------------------------------------------- */
export function validate(entries) {
  const errors = []
  const warnings = []
  const typographic = [] // keys written with · / – instead of . / -
  const seen = new Map() // upper-cased key -> entry
  const byCode = new Map() // code -> key

  for (const e of entries) {
    const key = e.key.toUpperCase()
    if (seen.has(key)) {
      errors.push(`line ${e.line}: "${e.key}" is defined twice (first on line ${seen.get(key).line})`)
      continue
    }
    seen.set(key, e)

    let code = e.raw.trim()
    if (DIT_VARIANT.test(code) || DAH_VARIANT.test(code)) {
      typographic.push(key)
      code = code.replace(DIT_VARIANTS, '.').replace(DAH_VARIANTS, '-')
    }
    e.code = code

    if (code.length === 0) {
      errors.push(`line ${e.line}: "${key}" has an empty code`)
      continue
    }
    if (!/^[.-]+$/.test(code)) {
      errors.push(`line ${e.line}: "${key}" has invalid symbols in "${e.raw}" (only dit "." and dah "-" are allowed)`)
      continue
    }
    if (ITU[key] && code !== ITU[key]) {
      errors.push(`line ${e.line}: "${key}" is "${code}" but ITU Morse is "${ITU[key]}"`)
    }
    if (byCode.has(code)) {
      errors.push(`line ${e.line}: "${key}" and "${byCode.get(code)}" share the code "${code}" (ambiguous to decode)`)
    } else {
      byCode.set(code, key)
    }
  }

  // one summary line instead of one warning per character (hook output is fed to the agent)
  if (typographic.length) {
    warnings.push(`${typographic.length} entr${typographic.length === 1 ? 'y uses' : 'ies use'} typographic dits/dahs (· –) instead of "." "-": ${typographic.join(' ')}`)
  }

  const missing = REQUIRED.filter((c) => !seen.has(c))
  if (missing.length) errors.push(`missing ${missing.length} required character(s): ${missing.join(' ')}`)

  return { errors, warnings, checked: seen.size, missing }
}

/* --- Main -------------------------------------------------------------------- */
function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`validate-morse: ${err.message}`)
    return 2
  }
  if (opts.help) {
    console.log('usage: validate-morse [--file <path>] [--strict] [--json]')
    return 0
  }

  const root = projectRoot(process.cwd())
  const file = resolve(root, opts.file ?? DEFAULT_FILE)
  const shown = relative(root, file) || file
  const report = (r) => (opts.json ? console.log(JSON.stringify({ file: shown, ...r }, null, 2)) : null)

  if (!existsSync(file)) {
    const msg = `${shown} does not exist yet; nothing to validate.`
    if (opts.strict) {
      report({ ok: false, errors: [msg] })
      if (!opts.json) console.error(`✗ validate-morse: ${msg}`)
      return 1
    }
    report({ ok: true, skipped: true, errors: [], warnings: [] })
    if (!opts.json) console.log(`○ validate-morse: ${msg} (run with --strict to require it)`)
    return 0
  }

  const entries = extractEntries(readFileSync(file, 'utf8'))
  if (entries.length === 0) {
    const msg = `${shown}: no Morse entries found (expected  A: '.-'   ['A', '.-']   or  '.-': 'A')`
    report({ ok: false, errors: [msg] })
    if (!opts.json) console.error(`✗ validate-morse: ${msg}`)
    return 2
  }

  const result = validate(entries)
  const ok = result.errors.length === 0
  report({ ok, ...result })
  if (!opts.json) {
    const out = ok ? console.log : console.error
    out(`${ok ? '✓' : '✗'} validate-morse: ${shown}: ${result.checked} characters checked, ${result.errors.length} error(s), ${result.warnings.length} warning(s)`)
    for (const e of result.errors) out(`  error   ${e}`)
    for (const w of result.warnings) out(`  warning ${w}`)
  }
  return ok ? 0 : 1
}

process.exitCode = main()
