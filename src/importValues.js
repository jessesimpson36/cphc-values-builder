/**
 * importValues.js — Read an existing values.yaml back into the form
 *
 * The inverse of transform.js. Lets someone load the file they deployed last
 * quarter, change one thing, and regenerate — rather than starting from a blank
 * form and hoping they remember every field they set.
 *
 * The mapping is deliberately lossy in one direction only: anything the form
 * does not model is reported as an unmapped key rather than silently dropped,
 * so the user knows what they will lose by regenerating. transform.js emits a
 * minimal override file, so a file this tool produced round-trips exactly.
 */

import { displayConfig } from './displayConfig.js'

// ─── Read a dot-notation path out of a nested object ─────────────────────────

export function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined
    return current[key]
  }, obj)
}

function flattenLeafPaths(obj, parentPath = '') {
  const result = []
  for (const [key, value] of Object.entries(obj || {})) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenLeafPaths(value, currentPath))
    } else {
      result.push(currentPath)
    }
  }
  return result
}

// ─── Product detection ───────────────────────────────────────────────────────

function detectProducts(values) {
  return displayConfig.products
    .filter((product) => getNestedValue(values, `${product.id}.enabled`) === true)
    .map((product) => product.id)
}

function detectDatabaseType(values) {
  if (getNestedValue(values, 'global.elasticsearch.enabled') === true) return 'elasticsearch'
  if (getNestedValue(values, 'global.opensearch.enabled') === true) return 'opensearch'
  return undefined
}

function detectDocumentStore(values) {
  if (getNestedValue(values, 'global.documentStore.type.aws.enabled') === true) return 'AWS S3'
  if (getNestedValue(values, 'global.documentStore.type.gcp.enabled') === true) return 'GCP Cloud Storage'
  if (getNestedValue(values, 'global.documentStore.type.inmemory.enabled') === true) return 'In-memory'
  return undefined
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * @param {object} values  a parsed values.yaml
 * @returns {{answers: object, unmapped: string[], warnings: string[]}}
 */
export function importValues(values) {
  if (!values || typeof values !== 'object') {
    return { answers: { products: [] }, unmapped: [], warnings: ['The file did not contain a YAML object.'] }
  }

  const warnings = []
  const answers = { products: detectProducts(values) }

  const databaseType = detectDatabaseType(values)
  if (databaseType) answers.databaseType = databaseType

  // Cluster-level toggles, which transform.js writes but no single field owns.
  if (getNestedValue(values, 'global.compatibility.openshift.adaptSecurityContext') === 'force') {
    answers.isOpenShift = true
  }
  if (getNestedValue(values, 'global.opensearch.aws.enabled') === true) {
    answers.isAwsEks = true
  }

  const documentStore = detectDocumentStore(values)
  if (documentStore) answers.document_store_type = documentStore

  // Multi-region. Namespaces are not recoverable from the chart's own keys —
  // they only exist inside the generated contact point list — so parse them
  // back out of it.
  const regions = getNestedValue(values, 'global.multiregion.regions')
  if (typeof regions === 'number' && regions > 1) {
    answers.multiregion_enabled = true
    answers.multiregion_region_id = String(getNestedValue(values, 'global.multiregion.regionId') ?? 0)

    const contactPoints = (getNestedValue(values, 'orchestration.env') || [])
      .find((entry) => entry?.name === 'CAMUNDA_CLUSTER_INITIALCONTACTPOINTS')

    if (contactPoints?.value) {
      const parsed = parseContactPoints(contactPoints.value)
      if (parsed) {
        answers.multiregion_namespaces = parsed.namespaces
        answers.multiregion_release_name = parsed.releaseName
        answers.multiregion_cluster_domain = parsed.clusterDomain
      } else {
        warnings.push('Multi-region contact points could not be parsed; re-enter the namespaces.')
      }
    } else {
      warnings.push('Multi-region is enabled but no contact point list was found.')
    }
  }

  // Sizing: a file with an explicit cluster size was sized by hand or by an
  // earlier throughput calculation. Either way the numbers are what matter, so
  // load them into manual mode where they are visible and editable.
  if (getNestedValue(values, 'orchestration.clusterSize') !== undefined) {
    answers.sizing_mode = 'Manual'
  }

  if (getNestedValue(values, 'global.security.authentication.method') === 'oidc') {
    answers.auth_method = 'oidc'
  }

  // Every declared field, by its path.
  const mappedPaths = new Set()

  for (const section of displayConfig.sections) {
    for (const field of section.fields) {
      if (!field.path) continue
      mappedPaths.add(field.path)

      const value = getNestedValue(values, field.path)
      if (value === undefined || value === null || value === '') continue

      if (field.type === 'env_vars') {
        if (Array.isArray(value)) {
          answers[field.id] = value
            .filter((entry) => entry && entry.name !== undefined)
            .map((entry) => ({ name: String(entry.name), value: String(entry.value ?? '') }))
        }
        continue
      }

      if (field.type === 'string_list') {
        if (Array.isArray(value)) answers[field.id] = value.map(String)
        continue
      }

      if (field.type === 'checkbox') {
        answers[field.id] = value === true
        continue
      }

      answers[field.id] = typeof value === 'boolean' ? value : String(value)

      // A credential given as an existing secret must switch its group's mode,
      // or the form would show the reference while writing an inline value.
      if (field.id.endsWith('_existing_secret')) {
        answers[`${field.id.replace(/_existing_secret$/, '')}_secret_mode`] = 'Existing secret'
      }
    }
  }

  // Anything present in the file that the form cannot represent.
  const unmapped = flattenLeafPaths(values).filter((path) => {
    if (mappedPaths.has(path)) return false
    // Flags transform.js sets on its own are represented, just not by a field.
    return !isDerivedPath(path)
  })

  return { answers, unmapped, warnings }
}

// Paths written by applyProductFlags / applyDerivedValues rather than by a field.
const DERIVED_PATH_PATTERNS = [
  /^[a-zA-Z]+\.enabled$/,
  /^global\.(elasticsearch|opensearch)\.(enabled|external)$/,
  /^global\.opensearch\.aws\.enabled$/,
  /^identity\.externalDatabase\.enabled$/,
  /^global\.multiregion\./,
  /^global\.documentStore\.(activeStoreId|type\.[a-z]+\.enabled)$/,
  /compatibility\.openshift\.adaptSecurityContext$/,
  /^orchestration\.env$/,
]

function isDerivedPath(path) {
  return DERIVED_PATH_PATTERNS.some((pattern) => pattern.test(path))
}

/**
 * Recover the namespaces, release name and cluster domain from a generated
 * contact point list. Entries look like:
 *   camunda-zeebe-0.camunda-zeebe.camunda-region-0.svc.cluster.local:26502
 */
export function parseContactPoints(value) {
  const namespaces = []
  let releaseName
  let clusterDomain

  for (const entry of String(value).split(',')) {
    const match = entry.trim().match(/^(.+)-\d+\.\1\.([^.]+)\.svc\.(.+):\d+$/)
    if (!match) return null

    const [, service, namespace, domain] = match
    releaseName = service.replace(/-zeebe$/, '')
    clusterDomain = domain
    if (!namespaces.includes(namespace)) namespaces.push(namespace)
  }

  if (namespaces.length === 0) return null
  return { namespaces, releaseName, clusterDomain }
}
