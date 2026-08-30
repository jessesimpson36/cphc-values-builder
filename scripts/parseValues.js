/**
 * parseValues.js - YAML Schema Extractor
 *
 * Reads every Camunda Helm chart release this tool supports, extracts each
 * configurable field and its ## @param description, and writes the two things
 * the rest of the project consumes.
 *
 * Run with:  npm run parse
 *
 * Input:   public/charts/<key>/values.yaml, package.json (camundaCharts)
 *
 * Output:  src/schemas/<key>.json   full schema per chart, ~1000 entries.
 *                                   Build-time only - used by npm run validate.
 *
 *          src/uiSchema.json        compact, and the only one the browser loads
 *                                   for rendering the form. Holds the supported
 *                                   versions plus, for each path the form can
 *                                   write, its description and which versions
 *                                   have it.
 *
 *          src/pathIndex.json       compact, loaded by the browser only when
 *                                   comparing an uploaded values.yaml across
 *                                   releases (src/compareVersions.js). Every
 *                                   path in every chart, with no descriptions,
 *                                   defaults or types - just enough to answer
 *                                   "does this release have this path".
 *                                   A full schema is ~200KB; this is ~20KB
 *                                   because the strings alone compress well.
 *
 * The split matters: a full schema is ~200KB, so importing one per version
 * would grow the bundle every time a Camunda release is added. The UI only
 * needs descriptions for the ~100 paths it displays, which stays flat.
 *
 * Data flow:
 *
 *   values.yaml (raw text + YAML structure)
 *        |
 *        ├── js-yaml parses structure
 *        └── comment parser
 *             |
 *             └── combined + typed
 *                  |
 *                  ├── schemas/<key>.json  ← npm run validate
 *                  ├── uiSchema.json       ← the React UI (form + tooltips)
 *                  └── pathIndex.json      ← the React UI (upgrade compare)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadValues } from '../src/yaml.js'
import { displayConfig } from '../src/displayConfig.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const charts = pkg.camundaCharts

if (!Array.isArray(charts) || charts.length === 0) {
  console.error('[parse] package.json is missing "camundaCharts" - cannot record chart provenance.')
  process.exit(1)
}

// ─── Object Flattening ────────────────────────────────────────────────────────
//
// The parsed YAML is a deeply nested object. We flatten it into a list of
// dot-notation paths so every field can be referenced by a single string
// e.g. { global: { elasticsearch: { auth: { username: "" } } } }
// becomes  "global.elasticsearch.auth.username"

function flattenObject(obj, parentPath = '') {
  const result = []

  for (const key of Object.keys(obj)) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key
    const value = obj[key]

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenObject(value, currentPath))
    } else {
      result.push({ path: currentPath, default: value })
    }
  }

  return result
}

// ─── Comment Parser ───────────────────────────────────────────────────────────
//
// values.yaml documents each field with a structured comment above it,
// following the Bitnami convention:
//
//   ## @param global.elasticsearch.auth.username the username for external elasticsearch
//
// These are parsed from the raw text, since YAML parsing discards comments.

function parseComments(rawText) {
  const result = {}

  for (const line of rawText.split('\n')) {
    if (!line.includes('## @param')) continue

    const content = line.replace(/.*##\s*@param\s+/, '').trim()
    const spaceIndex = content.indexOf(' ')
    if (spaceIndex === -1) continue

    result[content.substring(0, spaceIndex)] = content.substring(spaceIndex + 1).trim()
  }

  return result
}

// ─── Build one schema per chart ───────────────────────────────────────────────

const schemasDir = path.join(__dirname, '../src/schemas')
fs.mkdirSync(schemasDir, { recursive: true })

const schemasByKey = {}

for (const chart of charts) {
  const valuesPath = path.join(__dirname, `../public/charts/${chart.key}/values.yaml`)

  if (!fs.existsSync(valuesPath)) {
    console.error(`[parse] missing ${path.relative(process.cwd(), valuesPath)} for chart ${chart.key}.`)
    process.exit(1)
  }

  const rawYaml = fs.readFileSync(valuesPath, 'utf8')
  const comments = parseComments(rawYaml)

  const schema = flattenObject(loadValues(rawYaml)).map((field) => ({
    path: field.path,
    default: field.default,
    type: Array.isArray(field.default) ? 'array' : typeof field.default,
    description: comments[field.path] || '',
  }))

  schemasByKey[chart.key] = schema

  const outputPath = path.join(schemasDir, `${chart.key}.json`)
  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2) + '\n')

  process.stdout.write(
    `[parse] ${chart.key}: chart ${chart.version} (Camunda ${chart.appVersion}) - ` +
    `${schema.length} fields, ${Object.keys(comments).length} descriptions\n`,
  )
}

// ─── Build the path index ─────────────────────────────────────────────────────
//
// Every path in every supported chart, so the browser can answer "does release
// X have this path" for a values.yaml the user uploads - which may set fields
// this tool's own form never touches. uiSchema only tracks the ~100 paths the
// form displays, which is not enough for that question.

const pathIndex = Object.fromEntries(
  charts.map((chart) => [chart.key, schemasByKey[chart.key].map((f) => f.path).sort()]),
)

const pathIndexPath = path.join(__dirname, '../src/pathIndex.json')
fs.writeFileSync(pathIndexPath, JSON.stringify(pathIndex, null, 2) + '\n')

process.stdout.write(
  `[parse] pathIndex.json - ${Object.values(pathIndex).reduce((n, p) => n + p.length, 0)} ` +
  `path entries across ${charts.length} version(s) (${fs.statSync(pathIndexPath).size.toLocaleString()} bytes)\n`,
)

// ─── Build the compact UI schema ──────────────────────────────────────────────
//
// Only the paths displayConfig can write. For each, the description (taken from
// the newest chart that documents it) and the versions that contain it, so the
// UI can hide a field that does not apply to the selected version.

const displayedPaths = [
  ...new Set(
    displayConfig.sections.flatMap((section) =>
      section.fields.filter((field) => field.path).map((field) => field.path),
    ),
  ),
].sort()

const fields = {}

for (const fieldPath of displayedPaths) {
  const versions = []
  let description = ''

  for (const chart of charts) {
    const entry = schemasByKey[chart.key].find((f) => f.path === fieldPath)
    if (!entry) continue
    versions.push(chart.key)
    if (!description && entry.description) description = entry.description
  }

  fields[fieldPath] = { description, versions }
}

const uiSchema = {
  defaultVersion: charts[0].key,
  versions: charts,
  fields,
}

const uiSchemaPath = path.join(__dirname, '../src/uiSchema.json')
fs.writeFileSync(uiSchemaPath, JSON.stringify(uiSchema, null, 2) + '\n')

const notEverywhere = displayedPaths.filter((p) => fields[p].versions.length !== charts.length)

process.stdout.write(
  `[parse] uiSchema.json - ${displayedPaths.length} displayed paths across ` +
  `${charts.length} versions (${fs.statSync(uiSchemaPath).size.toLocaleString()} bytes)\n`,
)

if (notEverywhere.length > 0) {
  // Not necessarily a problem: a field with a per-version path override is
  // expected to show up here on every release except the one it defaults to.
  // Worth skimming after touching fieldPaths overrides or adding a release.
  process.stdout.write(`[parse] ${notEverywhere.length} path(s) are release-scoped (expected for per-version overrides):\n`)
  for (const p of notEverywhere) {
    process.stdout.write(`           ${p} -> only ${fields[p].versions.join(', ')}\n`)
  }
}
