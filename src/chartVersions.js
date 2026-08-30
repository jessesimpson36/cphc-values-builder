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
import { resolveFieldPath } from './fieldPaths.js'

export { resolveFieldPath }

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
 * A field is out if its section is hidden, its own showIf is false, the
 * selected release's path for it (see fieldPaths.js) does not exist in that
 * chart's schema, or the field explicitly has no path at all on this release.
 */
export function fieldApplies(field, answers) {
  if (!isFieldVisible(field, answers)) return false

  const version = selectedVersion(answers)
  const path = resolveFieldPath(field, version)

  if (path === null) {
    // A field with no path at all (UI-only, e.g. a mode-toggle radio) always
    // applies once visible. A field whose `paths` override is explicitly null
    // for THIS version means the release has no equivalent at all.
    const hasVersionOverride = field.paths && Object.prototype.hasOwnProperty.call(field.paths, version)
    return !hasVersionOverride
  }

  return isPathAvailable(path, version)
}

/** A section with every field hidden on the current release renders nothing but a title. */
export function sectionHasVisibleFields(section, answers) {
  return section.fields.some((field) => fieldApplies(field, answers))
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
