/**
 * transform.js — Answer to Helm Values Transformer
 *
 * Converts the flat answers object from the React form into a correctly
 * structured nested JavaScript object that mirrors the Helm values hierarchy.
 *
 * The output of this module is passed to yaml.dump() in App.jsx, which
 * serialises it to the final YAML string.
 *
 * Three steps in order:
 *   1. applyProductFlags  — set enabled/disabled and database flags automatically
 *   2. mapFieldsToHelm    — map user answers to their dot-notation Helm paths
 *   3. cleanObject        — remove empty, null, and undefined values
 */

import { displayConfig } from "./displayConfig"

// ─── Utility: set a value in a nested object using a dot-notation path ────────
export function setNestedValue(obj, path, value) {
  const keys = path.split(".")
  const result = { ...obj }
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = { ...(current[keys[i]] || {}) }
    current = current[keys[i]]
  }
  current[keys[keys.length - 1]] = value
  return result
}

// ─── Utility: remove empty/null/undefined values from object recursively ──────
export function cleanObject(obj) {
  if (typeof obj !== "object" || obj === null) return obj
  const cleaned = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === "" || value === null || value === undefined) continue
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = cleanObject(value)
      if (Object.keys(nested).length > 0) cleaned[key] = nested
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

// ─── Utility: convert port string to number ────────────────────────────────────
function toNumber(value) {
  const n = Number(value)
  return isNaN(n) ? value : n
}

// ─── Product-specific automatic flags ─────────────────────────────────────────
function applyProductFlags(helmValues, answers) {
  const selected = answers.products

  // ── Orchestration Cluster ──────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "orchestration.enabled", selected.includes("orchestration"))

  // ── Optimize ──────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "optimize.enabled", selected.includes("optimize"))

  // ── Identity ───────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "identity.enabled", selected.includes("identity"))
  if (selected.includes("identity")) {
    // use external database, disable bundled keycloak postgresql
    helmValues = setNestedValue(helmValues, "identity.externalDatabase.enabled", true)
    helmValues = setNestedValue(helmValues, "identityPostgresql.enabled", false)
  } else {
    helmValues = setNestedValue(helmValues, "identityPostgresql.enabled", false)
  }

  // ── Web Modeler ────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "webModeler.enabled", selected.includes("webModeler"))
  if (selected.includes("webModeler")) {
    // use external database, disable bundled postgresql
    helmValues = setNestedValue(helmValues, "webModelerPostgresql.enabled", false)
  } else {
    helmValues = setNestedValue(helmValues, "webModelerPostgresql.enabled", false)
  }

  // ── Connectors ────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "connectors.enabled", selected.includes("connectors"))

  // ── Console ───────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "console.enabled", selected.includes("console"))

  // ── Cluster type flags ─────────────────────────────────────────────────────
  if (answers.clusterType === 'AWS EKS' && answers.databaseType === 'opensearch') {
    // Enable AWS IRSA (IAM Roles for Service Accounts) for OpenSearch.
    // Only set when OpenSearch is selected — irrelevant for Elasticsearch.
    helmValues = setNestedValue(helmValues, 'global.opensearch.aws.enabled', true)
  }
  if (answers.clusterType === 'OpenShift') {
    // Force security context adaptation for OpenShift restricted-v2 SCC.
    // Must be set on the top-level chart AND each sub-chart that has its own
    // compatibility block — otherwise sub-charts like PostgreSQL and Elasticsearch
    // will still run with the wrong security context and fail on OpenShift.
    helmValues = setNestedValue(helmValues, 'global.compatibility.openshift.adaptSecurityContext', 'force')
    helmValues = setNestedValue(helmValues, 'identityPostgresql.global.compatibility.openshift.adaptSecurityContext', 'force')
    helmValues = setNestedValue(helmValues, 'identityKeycloak.global.compatibility.openshift.adaptSecurityContext', 'force')
    helmValues = setNestedValue(helmValues, 'webModelerPostgresql.global.compatibility.openshift.adaptSecurityContext', 'force')
    helmValues = setNestedValue(helmValues, 'elasticsearch.global.compatibility.openshift.adaptSecurityContext', 'force')
  }

  // ── Database type flags ────────────────────────────────────────────────────
  // Only relevant if orchestration or optimize is selected
  const needsSearchDB = selected.includes("orchestration") || selected.includes("optimize")

  if (needsSearchDB) {
    if (answers.databaseType === "elasticsearch") {
      helmValues = setNestedValue(helmValues, "global.elasticsearch.enabled", true)
      helmValues = setNestedValue(helmValues, "global.elasticsearch.external", true)
      helmValues = setNestedValue(helmValues, "global.opensearch.enabled", false)
      // disable bundled elasticsearch since we use external
      helmValues = setNestedValue(helmValues, "elasticsearch.enabled", false)
    }
    if (answers.databaseType === "opensearch") {
      helmValues = setNestedValue(helmValues, "global.opensearch.enabled", true)
      helmValues = setNestedValue(helmValues, "global.elasticsearch.enabled", false)
      helmValues = setNestedValue(helmValues, "elasticsearch.enabled", false)
    }
  } else {
    // no search DB needed
    helmValues = setNestedValue(helmValues, "global.elasticsearch.enabled", false)
    helmValues = setNestedValue(helmValues, "global.opensearch.enabled", false)
    helmValues = setNestedValue(helmValues, "elasticsearch.enabled", false)
  }

  // ── Ingress flags ──────────────────────────────────────────────────────────
  // Explicitly set ingress to disabled if the user did not enable it.
  // This makes the intent unambiguous rather than relying on Helm defaults.
  if (!answers.ingress_enabled) {
    helmValues = setNestedValue(helmValues, "global.ingress.enabled", false)
  }
  if (selected.includes("orchestration") && !answers.grpc_enabled) {
    helmValues = setNestedValue(helmValues, "orchestration.ingress.grpc.enabled", false)
  }

  return helmValues
}

// ─── Map user answers to helm values paths ────────────────────────────────────
function mapFieldsToHelm(helmValues, answers) {
  const visibleSections = displayConfig.sections.filter((s) => s.showIf(answers))

  for (const section of visibleSections) {
    for (const field of section.fields) {
      if (!field.path) continue

      // env_vars type — convert to YAML array of { name, value } objects
      if (field.type === "env_vars") {
        const rows = answers[field.id] || []
        const envArray = rows
          .filter((row) => row.name && row.value)
          .map((row) => ({ name: row.name, value: row.value }))
        if (envArray.length > 0) {
          helmValues = setNestedValue(helmValues, field.path, envArray)
        }
        continue
      }

      let value = answers[field.id]
      if (value === undefined || value === "" || value === null) continue

      // Convert port fields to numbers
      if (field.id.includes("port")) {
        value = toNumber(value)
      }

      helmValues = setNestedValue(helmValues, field.path, value)
    }
  }

  return helmValues
}

// ─── Main transform function ───────────────────────────────────────────────────
export function transformAnswers(answers) {
  let helmValues = {}

  // Step 1: apply automatic product flags (enabled/disabled for all products)
  helmValues = applyProductFlags(helmValues, answers)

  // Step 2: map user filled fields to their yaml paths
  helmValues = mapFieldsToHelm(helmValues, answers)

  // Step 3: remove any empty values
  return cleanObject(helmValues)
}