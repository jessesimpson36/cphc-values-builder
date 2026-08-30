/**
 * compareVersions.js — What breaks moving a values.yaml to another release
 *
 * Camunda charts differ between minor versions: keys get renamed, merged, or
 * removed. A values.yaml written for one release can install cleanly, then go
 * silent on a key the new chart no longer reads — the user finds out when the
 * deployment doesn't do what the file says it should.
 *
 * This checks one thing, mechanically: for every leaf path set in an uploaded
 * file, does the target chart still have that path at all. That is derived
 * from src/pathIndex.json (every path in every supported chart - see
 * scripts/parseValues.js), not guessed.
 *
 * ─── What this deliberately does NOT check ───────────────────────────────────
 *
 * A path can survive a chart upgrade and still change meaning - a field that
 * was optional becomes mandatory, for instance. That is enforced inside the
 * chart's Go templates (a `required "..."` call), not declared in values.yaml
 * or its JSON Schema, so it cannot be checked without vendoring and parsing the
 * chart's templates - which this tool deliberately does not do, to keep the
 * vendored footprint to values.yaml. Point users needing that at Camunda's own
 * upgrade guide instead of pretending to cover it.
 */

import pathIndex from './pathIndex.json' with { type: 'json' }
import uiSchema from './uiSchema.json' with { type: 'json' }
import { flattenLeafPaths } from './objectPaths.js'
import { getChart } from './chartVersions.js'

export const UPGRADE_GUIDE_URL = 'https://docs.camunda.io/docs/self-managed/deployment/helm/upgrade/'

/**
 * @param {object} values        a parsed values.yaml
 * @param {string} targetVersion key into chartVersions.SUPPORTED_VERSIONS
 * @returns {{
 *   targetVersion: string,
 *   checkedCount: number,
 *   removedPaths: Array<{ path: string, managedByForm: boolean }>,
 * }}
 */
export function compareVersions(values, targetVersion) {
  const targetPaths = new Set(pathIndex[targetVersion] || [])
  const leafPaths = flattenLeafPaths(values)

  const removedPaths = leafPaths
    .filter((p) => !targetPaths.has(p))
    .sort()
    .map((p) => ({
      path: p,
      // A path this tool's own form manages, on at least one release, has a
      // concrete fix: reconfigure that section after switching the release
      // selector. A path the form never touched is the user's own — the fix
      // is the chart's upgrade guide, not this tool.
      managedByForm: Boolean(uiSchema.fields[p]),
    }))

  return {
    targetVersion,
    checkedCount: leafPaths.length,
    removedPaths,
  }
}

/** True when a target release exists and differs from what a file would need checked against. */
export function canCompare(targetVersion) {
  return Boolean(pathIndex[targetVersion])
}

export function targetChartLabel(targetVersion) {
  const chart = getChart(targetVersion)
  return `Camunda ${chart.appVersion} (chart ${chart.version})`
}
