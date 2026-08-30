/**
 * validatePaths.js — Helm path validator
 *
 * Checks that every path this tool can emit exists in the chart — for each
 * supported Camunda release, not just the newest.
 *
 * A wrong path does not crash anything. It writes a key the chart ignores, and
 * the user finds out when their deployment behaves nothing like they
 * configured it. This turns that into a build failure.
 *
 * Two sources of paths are checked, per version:
 *
 *   1. displayConfig.js — every field.path the UI can write, minus the ones
 *      uiSchema.json records as absent from that release (those are hidden in
 *      the form, so writing them is impossible by construction).
 *   2. transform.js     — every leaf path actually produced by transforming the
 *                         scenarios in test/scenarios.js against that release.
 *                         This covers the flags hardcoded in applyProductFlags,
 *                         which reading displayConfig would never reveal.
 *
 * Modules are imported and evaluated rather than pattern-matched, so paths
 * built at runtime (the secretFields helper) are covered too.
 *
 * Run with:  npm run validate
 *
 * Exit codes:
 *   0 — all paths valid in every supported release
 *   1 — one or more invalid paths found
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { displayConfig } from '../src/displayConfig.js'
import { transformAnswers } from '../src/transform.js'
import { SUPPORTED_VERSIONS, isPathAvailable } from '../src/chartVersions.js'
import { resolveFieldPath } from '../src/fieldPaths.js'
import { flattenLeafPaths } from '../src/objectPaths.js'
import { scenarios } from '../test/scenarios.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let failed = 0

for (const chart of SUPPORTED_VERSIONS) {
  const schemaPath = path.join(__dirname, `../src/schemas/${chart.key}.json`)

  if (!fs.existsSync(schemaPath)) {
    console.error(`[validate] src/schemas/${chart.key}.json not found. Run npm run parse first.`)
    process.exit(1)
  }

  const validPaths = new Set(JSON.parse(fs.readFileSync(schemaPath, 'utf8')).map((f) => f.path))
  const checked = new Map()

  // Source 1: declared fields, resolved to whatever path each one writes on
  // THIS release — not the field's default path. A field with a per-version
  // override (src/fieldPaths.js) writes somewhere else entirely on some
  // releases; checking its default path there would validate the wrong string
  // and silently skip the one that actually matters.
  //
  // isPathAvailable additionally excludes a field whose resolved path is a
  // real string but simply does not exist on this release AT ALL — e.g. a
  // field with no override whose single default path happens to be
  // orchestration-cluster-only and this release still calls that "zeebe".
  // Such a field is invisible on this release by construction (fieldApplies
  // hides it the same way), so it would never actually be written here.
  for (const section of displayConfig.sections) {
    for (const field of section.fields) {
      const resolvedPath = resolveFieldPath(field, chart.key)
      if (!resolvedPath) continue
      if (!isPathAvailable(resolvedPath, chart.key)) continue
      checked.set(resolvedPath, `displayConfig ${section.id} → ${field.id}`)
    }
  }

  // Source 2: what transform.js actually emits when targeting this release.
  for (const scenario of scenarios) {
    const answers = { ...scenario.answers, chartVersion: chart.key }
    for (const emitted of flattenLeafPaths(transformAnswers(answers))) {
      if (!checked.has(emitted)) {
        checked.set(emitted, `transform output of scenario "${scenario.name}"`)
      }
    }
  }

  const invalid = [...checked].filter(([p]) => !validPaths.has(p))

  if (invalid.length === 0) {
    process.stdout.write(
      `[validate] ✓ ${chart.key} (chart ${chart.version}) — ${checked.size} paths valid ` +
      `of ${validPaths.size} in the chart\n`,
    )
    continue
  }

  failed += invalid.length
  process.stdout.write(`[validate] ✗ ${chart.key} (chart ${chart.version}) — ${invalid.length} invalid path(s):\n`)
  for (const [p, origin] of invalid) {
    process.stdout.write(`           - ${p}\n             from ${origin}\n`)
  }
}

if (failed > 0) {
  process.stdout.write(
    `[validate] Compare against src/schemas/ — the chart may have renamed or removed these.\n` +
    `[validate] A path that exists in only some releases belongs in uiSchema via npm run parse.\n`,
  )
  process.exit(1)
}

process.stdout.write(`[validate] ✓ All paths valid across ${SUPPORTED_VERSIONS.length} supported release(s)\n`)
