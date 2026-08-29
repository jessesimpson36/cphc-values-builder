/**
 * validatePaths.js — Helm path validator
 *
 * Checks that every path this tool can emit actually exists in the chart.
 *
 * A wrong path does not crash anything — it silently writes a key the chart
 * ignores, and the user finds out when their deployment behaves nothing like
 * they configured it. This script turns that into a build failure.
 *
 * Two sources of paths are checked:
 *
 *   1. displayConfig.js — every field.path the UI can write.
 *   2. transform.js     — every leaf path actually produced by transforming the
 *                         scenarios in test/scenarios.js. This covers the flags
 *                         hardcoded in applyProductFlags (product enablement,
 *                         bundled database toggles, OpenShift security context),
 *                         which no amount of reading displayConfig would reveal.
 *
 * The module is imported and evaluated rather than pattern-matched, so paths
 * built at runtime (the secretFields helper) are covered too.
 *
 * Run with:  npm run validate
 *
 * Exit codes:
 *   0 — all paths valid
 *   1 — one or more invalid paths found
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { displayConfig } from '../src/displayConfig.js'
import { transformAnswers } from '../src/transform.js'
import { scenarios } from '../test/scenarios.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Load schema.json ─────────────────────────────────────────────────────────

const schemaPath = path.join(__dirname, '../src/schema.json')

if (!fs.existsSync(schemaPath)) {
  console.error('[validate] schema.json not found. Run npm run parse first.')
  process.exit(1)
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const validPaths = new Set(schema.map((field) => field.path))

process.stdout.write(`[validate] schema.json loaded — ${validPaths.size} valid paths\n`)

// ─── Source 1: paths declared in displayConfig.js ────────────────────────────
//
// path: null marks a UI-only field that maps to no Helm value — skipped.

const configPaths = new Map()

for (const section of displayConfig.sections) {
  for (const field of section.fields) {
    if (!field.path) continue
    configPaths.set(field.path, `displayConfig ${section.id} → ${field.id}`)
  }
}

process.stdout.write(`[validate] displayConfig.js evaluated — ${configPaths.size} paths declared\n`)

// ─── Source 2: paths actually emitted by transform.js ────────────────────────

function leafPaths(obj, parentPath = '') {
  const result = []
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...leafPaths(value, currentPath))
    } else {
      result.push(currentPath)
    }
  }
  return result
}

const emittedPaths = new Map()

for (const scenario of scenarios) {
  for (const emitted of leafPaths(transformAnswers(scenario.answers))) {
    if (!emittedPaths.has(emitted)) {
      emittedPaths.set(emitted, `transform output of scenario "${scenario.name}"`)
    }
  }
}

process.stdout.write(`[validate] ${scenarios.length} scenario(s) transformed — ${emittedPaths.size} distinct paths emitted\n`)

// ─── Validate ─────────────────────────────────────────────────────────────────

const allPaths = new Map([...configPaths, ...emittedPaths])
const invalid = [...allPaths].filter(([p]) => !validPaths.has(p))

if (invalid.length === 0) {
  process.stdout.write(`[validate] ✓ All ${allPaths.size} paths are valid\n`)
  process.exit(0)
}

process.stdout.write(`[validate] ✗ ${invalid.length} invalid path(s) found:\n`)
for (const [p, origin] of invalid) {
  process.stdout.write(`           - ${p}\n`)
  process.stdout.write(`             from ${origin}\n`)
}
process.stdout.write(`[validate] Compare against src/schema.json — the chart may have renamed or removed these.\n`)
process.exit(1)
