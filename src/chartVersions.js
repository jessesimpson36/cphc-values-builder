/**
 * chartVersions.js — Which Camunda release the output targets
 *
 * Camunda supports several minor versions at once, and their Helm charts differ:
 * keys get renamed, removed, or newly required between releases. A generated
 * file is only meaningful for one of them, so the version is part of the form
 * rather than a property of the build.
 *
 * Everything here reads src/uiSchema.json, which `npm run parse` generates from
 * the vendored charts in public/charts/. It deliberately carries only the paths
 * the form can write — a full chart schema is ~200KB, and the browser would
 * otherwise download one per supported release.
 *
 * displayConfig.js does NOT import this module, so that scripts/parseValues.js
 * can import displayConfig to build uiSchema.json without a circular dependency.
 * The two concerns are combined by fieldApplies() below.
 */

import uiSchema from './uiSchema.json' with { type: 'json' }
import { isFieldVisible } from './displayConfig.js'

export const SUPPORTED_VERSIONS = uiSchema.versions
export const DEFAULT_VERSION = uiSchema.defaultVersion

export function getChart(versionKey) {
  return SUPPORTED_VERSIONS.find((chart) => chart.key === versionKey)
    || SUPPORTED_VERSIONS.find((chart) => chart.key === DEFAULT_VERSION)
}

/**
 * The version a set of answers targets. Answers created before a version was
 * ever chosen — an imported file, or a fresh form — fall back to the default.
 */
export function selectedVersion(answers) {
  const chosen = answers?.chartVersion
  return SUPPORTED_VERSIONS.some((chart) => chart.key === chosen) ? chosen : DEFAULT_VERSION
}

/**
 * Whether a chart path exists in a given release. An unknown path (one no
 * displayed field declares) is treated as available: transform.js writes plenty
 * of paths that uiSchema does not track, and those are covered by
 * `npm run validate` against the full schemas instead.
 */
export function isPathAvailable(fieldPath, versionKey) {
  const field = uiSchema.fields[fieldPath]
  if (!field) return true
  return field.versions.includes(versionKey)
}

/**
 * The single question the UI, validation and transform all need to ask:
 * should this field be rendered, required, and written?
 *
 * A field is out if its section is hidden, its own showIf is false, or the
 * selected chart release does not have its path.
 */
export function fieldApplies(field, answers) {
  if (!isFieldVisible(field, answers)) return false
  if (!field.path) return true
  return isPathAvailable(field.path, selectedVersion(answers))
}

/** Description for a path, used by the field tooltips. */
export function describePath(fieldPath) {
  return uiSchema.fields[fieldPath]?.description || ''
}

/** Paths a field declares that the selected release does not have. */
export function unsupportedFields(answers) {
  const version = selectedVersion(answers)
  return Object.entries(uiSchema.fields)
    .filter(([, field]) => !field.versions.includes(version))
    .map(([fieldPath]) => fieldPath)
}
