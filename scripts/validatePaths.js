/**
 * validatePaths.js — displayConfig Path Validator
 *
 * Checks that every field path defined in displayConfig.js exists in
 * schema.json. Catches typos and stale paths before they reach users.
 *
 * A typo in a path won't crash the tool — it will silently write the
 * wrong key in the YAML output, causing a confusing helm install failure.
 * This script catches that at development time instead.
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Load schema.json ─────────────────────────────────────────────────────────

const schemaPath = path.join(__dirname, '../src/schema.json')

if (!fs.existsSync(schemaPath)) {
  console.error('[validate] schema.json not found. Run npm run parse first.')
  process.exit(1)
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const validPaths = new Set(schema.map(field => field.path))

process.stdout.write(`[validate] schema.json loaded — ${validPaths.size} valid paths\n`)

// ─── Load displayConfig.js ────────────────────────────────────────────────────

const configPath = path.join(__dirname, '../src/displayConfig.js')

if (!fs.existsSync(configPath)) {
  console.error('[validate] displayConfig.js not found.')
  process.exit(1)
}

const configText = fs.readFileSync(configPath, 'utf8')

// ─── Extract paths from displayConfig.js ─────────────────────────────────────
//
// displayConfig.js is a JS file not JSON so we can't parse it directly.
// Instead we use a regex to extract all path: '...' and path: "..." values.
// path: null entries are intentionally skipped — those are UI-only fields
// that don't map to any Helm value.

const pathRegex = /path:\s*['"]([^'"]+)['"]/g
const foundPaths = []
let match

while ((match = pathRegex.exec(configText)) !== null) {
  foundPaths.push(match[1])
}

process.stdout.write(`[validate] displayConfig.js scanned — ${foundPaths.length} paths found\n`)

// ─── Validate ─────────────────────────────────────────────────────────────────

const invalidPaths = foundPaths.filter(p => !validPaths.has(p))

if (invalidPaths.length === 0) {
  process.stdout.write(`[validate] ✓ All paths are valid\n`)
  process.exit(0)
} else {
  process.stdout.write(`[validate] ✗ ${invalidPaths.length} invalid path(s) found:\n`)
  invalidPaths.forEach(p => {
    process.stdout.write(`           - ${p}\n`)
  })
  process.stdout.write(`[validate] Check displayConfig.js and compare against schema.json\n`)
  process.exit(1)
}