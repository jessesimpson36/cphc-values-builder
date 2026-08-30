/**
 * fieldPaths.js — Resolve which chart path a field writes to on a given release
 *
 * Most fields have exactly one Helm path across every supported release. A few
 * concepts exist on every release but moved chart: Camunda 8.8 merged Zeebe,
 * Zeebe Gateway, Operate and Tasklist into one "Orchestration Cluster"
 * component, so cluster sizing that reads `orchestration.clusterSize` on 8.8+
 * reads `zeebe.clusterSize` on 8.7.
 *
 * `field.paths` overrides `field.path` for exactly the release keys it lists;
 * every other release falls through to `field.path`. An explicit `null` in
 * `paths` means the concept has no equivalent at all on that release — not a
 * typo. ES/OS authentication has no "reference an existing secret" option on
 * 8.7's chart at all, for instance, only a plaintext `auth.password`.
 *
 * Pure and dependency-free on purpose, so both the browser (chartVersions.js)
 * and the build-time parser (scripts/parseValues.js) can resolve paths the
 * same way without a circular import through the generated schemas.
 */

export function resolveFieldPath(field, versionKey) {
  if (field.paths && Object.prototype.hasOwnProperty.call(field.paths, versionKey)) {
    return field.paths[versionKey]
  }
  return field.path ?? null
}
