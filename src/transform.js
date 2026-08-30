/**
 * transform.js — Answer to Helm Values Transformer
 *
 * Converts the flat answers object from the React form into a correctly
 * structured nested JavaScript object that mirrors the Helm values hierarchy.
 *
 * The output of this module is passed to yaml.dump() in App.jsx, which
 * serialises it to the final YAML string.
 *
 * Four steps in order:
 *   1. applyProductFlags  — set enabled/disabled and database flags automatically
 *   2. applyDerivedValues — sizing, multi-region topology, document store
 *   3. mapFieldsToHelm    — map user answers to their dot-notation Helm paths
 *   4. cleanObject        — remove empty, null, and undefined values
 */

import { displayConfig } from "./displayConfig.js"
import { fieldApplies, selectedVersion } from "./chartVersions.js"
import { resolveFieldPath } from "./fieldPaths.js"
import { calculateSizing } from "./sizing.js"

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

// Camunda 8.8 merged Zeebe, Zeebe Gateway, Operate and Tasklist into one
// "Orchestration Cluster" component. 8.7's chart predates that merge and still
// runs them as separately-enabled components sharing the same broker cluster.
// zeebeGateway has no enabled flag of its own in 8.7 - it is always deployed
// alongside zeebe - so it is not in this list.
const ORCHESTRATION_8_7_COMPONENTS = ["zeebe", "operate", "tasklist"]

function isPre88(answers) {
  return selectedVersion(answers) === "8.7"
}

// The concept "Orchestration Cluster's cluster settings" lives at
// orchestration.* from 8.8 onward and zeebe.* on 8.7 — used by sizing and
// multi-region below, which write these paths directly rather than through a
// displayConfig field.
function orchestrationBase(answers) {
  return isPre88(answers) ? "zeebe" : "orchestration"
}

// Same idea for the gRPC ingress, which the 8.7 chart exposes on the gateway
// component specifically rather than on the merged orchestration component.
function grpcIngressBase(answers) {
  return isPre88(answers) ? "zeebeGateway.ingress.grpc" : "orchestration.ingress.grpc"
}

// Web Modeler's bundled database is its own "webModelerPostgresql" sub-chart
// from 8.8 onward. 8.7 predates that split and shares one top-level
// "postgresql" sub-chart for it instead.
function webModelerDbBase(answers) {
  return isPre88(answers) ? "postgresql" : "webModelerPostgresql"
}

// ─── Product-specific automatic flags ─────────────────────────────────────────
function applyProductFlags(helmValues, answers) {
  const selected = answers.products

  // ── Orchestration Cluster ──────────────────────────────────────────────────
  if (isPre88(answers)) {
    for (const component of ORCHESTRATION_8_7_COMPONENTS) {
      helmValues = setNestedValue(helmValues, `${component}.enabled`, selected.includes("orchestration"))
    }
  } else {
    helmValues = setNestedValue(helmValues, "orchestration.enabled", selected.includes("orchestration"))
  }

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
  // 8.7's chart defaults BOTH identityKeycloak.enabled and
  // global.identity.auth.enabled to true (8.8+ defaults both to false). Left
  // alone with Identity unselected, the chart still tries to resolve an OIDC
  // issuer URL from a Keycloak that was never deployed and every non-Identity
  // deployment fails at template time with an unrelated-looking error deep in
  // a naming helper. Both must be forced off explicitly.
  if (isPre88(answers) && !selected.includes("identity")) {
    helmValues = setNestedValue(helmValues, "identityKeycloak.enabled", false)
    helmValues = setNestedValue(helmValues, "global.identity.auth.enabled", false)
  }

  // ── Web Modeler ────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "webModeler.enabled", selected.includes("webModeler"))
  // Bundled database always disabled, selected or not - the form only ever
  // wires up an external one.
  helmValues = setNestedValue(helmValues, `${webModelerDbBase(answers)}.enabled`, false)

  // ── Connectors ────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "connectors.enabled", selected.includes("connectors"))

  // ── Console ───────────────────────────────────────────────────────────────
  helmValues = setNestedValue(helmValues, "console.enabled", selected.includes("console"))

  // ── Cluster type flags ─────────────────────────────────────────────────────
  if (answers.isAwsEks && answers.databaseType === 'opensearch') {
    // Enable AWS IRSA (IAM Roles for Service Accounts) for OpenSearch.
    // Only set when OpenSearch is selected — irrelevant for Elasticsearch.
    helmValues = setNestedValue(helmValues, 'global.opensearch.aws.enabled', true)
  }
  if (answers.isOpenShift) {
    // Force security context adaptation for OpenShift restricted-v2 SCC.
    // Must be set on the top-level chart AND each sub-chart that has its own
    // compatibility block — otherwise sub-charts like PostgreSQL and Elasticsearch
    // will still run with the wrong security context and fail on OpenShift.
    helmValues = setNestedValue(helmValues, 'global.compatibility.openshift.adaptSecurityContext', 'force')
    helmValues = setNestedValue(helmValues, 'identityPostgresql.global.compatibility.openshift.adaptSecurityContext', 'force')
    helmValues = setNestedValue(helmValues, 'identityKeycloak.global.compatibility.openshift.adaptSecurityContext', 'force')
    helmValues = setNestedValue(helmValues, `${webModelerDbBase(answers)}.global.compatibility.openshift.adaptSecurityContext`, 'force')
    helmValues = setNestedValue(helmValues, 'elasticsearch.global.compatibility.openshift.adaptSecurityContext', 'force')
  }

  // ── Database type flags ────────────────────────────────────────────────────
  // Only relevant if orchestration or optimize is selected
  const needsSearchDB = selected.includes("orchestration") || selected.includes("optimize")

  // RDBMS replaces Elasticsearch/OpenSearch for Orchestration Cluster's own
  // secondary storage only - Optimize has no RDBMS option and always needs a
  // document store (the constraint rdbmsIncompatibleWithOptimize keeps the two
  // from being selected together in the UI). orchestration.data.secondaryStorage
  // does not exist before 8.9 at all (the constraint rdbmsRequires89 keeps the
  // UI from generating this combination) - guarded again here so a caller that
  // bypasses the UI, like the cross-version path validator, cannot produce a
  // file that writes a path the target chart doesn't have.
  if (needsSearchDB && answers.databaseType === "rdbms" && selectedVersion(answers) === "8.9") {
    helmValues = setNestedValue(helmValues, "orchestration.data.secondaryStorage.type", "rdbms")
    helmValues = setNestedValue(helmValues, "global.elasticsearch.enabled", false)
    helmValues = setNestedValue(helmValues, "global.opensearch.enabled", false)
    helmValues = setNestedValue(helmValues, "elasticsearch.enabled", false)
  } else if (needsSearchDB) {
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
    helmValues = setNestedValue(helmValues, `${grpcIngressBase(answers)}.enabled`, false)
  }

  return helmValues
}

// ─── Cluster sizing ───────────────────────────────────────────────────────────
//
// clusterSize, partitionCount and replicationFactor are typed as STRINGS in the
// chart's values.schema.json. Emitting them as numbers makes helm reject the
// file outright, so every value here is stringified on the way out.

export function resolveSizing(answers) {
  const regions = multiregionRegions(answers)

  if (answers.sizing_mode === "Throughput target") {
    return calculateSizing({
      processInstancesPerSecond: answers.target_pi_per_second,
      tasksPerInstance: answers.tasks_per_instance || undefined,
      calibration: answers.sizing_calibration || undefined,
      vcpuPerBroker: Number(answers.vcpu_per_broker) || undefined,
      regions,
    })
  }

  if (answers.sizing_mode === "Manual") {
    const size = Number(answers.cluster_size)
    if (!Number.isFinite(size) || size <= 0) return null
    return {
      clusterSize: size,
      partitionCount: Number(answers.partition_count) || size,
      replicationFactor: Number(answers.replication_factor) || Math.min(3, size),
    }
  }

  return null
}

function applySizing(helmValues, answers) {
  const sizing = resolveSizing(answers)
  if (!sizing) return helmValues

  // Manual mode already writes these through displayConfig paths; only the
  // computed modes need to set them here.
  if (answers.sizing_mode !== "Throughput target") return helmValues

  const base = orchestrationBase(answers)
  helmValues = setNestedValue(helmValues, `${base}.clusterSize`, String(sizing.clusterSize))
  helmValues = setNestedValue(helmValues, `${base}.partitionCount`, String(sizing.partitionCount))
  helmValues = setNestedValue(helmValues, `${base}.replicationFactor`, String(sizing.replicationFactor))
  helmValues = setNestedValue(helmValues, `${base}.pvcSize`, sizing.pvcSize)
  helmValues = setNestedValue(helmValues, `${base}.resources.requests.cpu`, sizing.resources.requests.cpu)
  helmValues = setNestedValue(helmValues, `${base}.resources.requests.memory`, sizing.resources.requests.memory)
  helmValues = setNestedValue(helmValues, `${base}.resources.limits.cpu`, sizing.resources.limits.cpu)
  helmValues = setNestedValue(helmValues, `${base}.resources.limits.memory`, sizing.resources.limits.memory)

  return helmValues
}

// ─── Multi-region ─────────────────────────────────────────────────────────────
//
// A dual-region cluster is a single Zeebe cluster stretched across two
// Kubernetes clusters. The chart runs clusterSize / regions brokers per region
// and derives each broker's node ID as (podIndex * regions + regionId), so the
// brokers interleave across regions rather than sitting in contiguous blocks.
//
// In this mode the chart cannot generate the initial contact point list itself
// — it has no way to know the other region's namespace — and says so in
// templates/orchestration/files/_application.yaml. We build the full list of
// fully-qualified broker addresses across every region and pass it through the
// documented environment variable.

const INTERNAL_API_PORT = 26502
const DEFAULT_CLUSTER_DOMAIN = "cluster.local"
const CONTACT_POINTS_ENV = "CAMUNDA_CLUSTER_INITIALCONTACTPOINTS"

// The chart names the orchestration StatefulSet and its headless service
// "<release>-zeebe" — the component is still called zeebe internally for
// backward compatibility between 8.7 and 8.8.
const brokerServiceName = (releaseName) => `${releaseName}-zeebe`

export function multiregionNamespaces(answers) {
  if (answers.multiregion_enabled !== true) return []
  return (answers.multiregion_namespaces || []).map((n) => (n || "").trim()).filter(Boolean)
}

export function multiregionRegions(answers) {
  const namespaces = multiregionNamespaces(answers)
  return namespaces.length > 1 ? namespaces.length : 1
}

/**
 * Every broker address in the stretched cluster, in region-major order.
 * Exported so the UI can show the user exactly what will be generated.
 */
export function buildInitialContactPoints(answers, clusterSize) {
  const namespaces = multiregionNamespaces(answers)
  if (namespaces.length < 2) return []

  const releaseName = (answers.multiregion_release_name || "camunda").trim()
  const domain = (answers.multiregion_cluster_domain || DEFAULT_CLUSTER_DOMAIN).trim()
  const service = brokerServiceName(releaseName)
  const perRegion = Math.max(1, Math.floor(clusterSize / namespaces.length))

  const points = []
  for (const namespace of namespaces) {
    for (let podIndex = 0; podIndex < perRegion; podIndex++) {
      points.push(`${service}-${podIndex}.${service}.${namespace}.svc.${domain}:${INTERNAL_API_PORT}`)
    }
  }

  return points
}

// The chart's default clusterSize is 3, and it computes per-region replicas with
// integer division: 3 / 2 regions runs ONE broker per region while the brokers
// still believe they are in a cluster of three. The cluster never forms a
// quorum. So in multi-region the broker count is always written explicitly,
// rounded up to a multiple of the region count.
const CHART_DEFAULT_CLUSTER_SIZE = 3

export function effectiveClusterSize(answers) {
  const sizing = resolveSizing(answers)
  const requested = sizing ? Number(sizing.clusterSize) : CHART_DEFAULT_CLUSTER_SIZE
  const regions = multiregionRegions(answers)

  if (regions < 2) return requested
  return requested % regions === 0
    ? requested
    : requested + (regions - (requested % regions))
}

function applyMultiregion(helmValues, answers) {
  const namespaces = multiregionNamespaces(answers)
  if (namespaces.length < 2) return helmValues

  const regions = namespaces.length
  const regionId = Number(answers.multiregion_region_id) || 0

  helmValues = setNestedValue(helmValues, "global.multiregion.regions", regions)
  helmValues = setNestedValue(helmValues, "global.multiregion.regionId", regionId)

  const clusterSize = effectiveClusterSize(answers)
  const base = orchestrationBase(answers)

  // Written unconditionally: leaving it to the chart default would produce the
  // broken topology described above, and the contact point list below must
  // describe exactly the brokers that will exist.
  helmValues = setNestedValue(helmValues, `${base}.clusterSize`, String(clusterSize))

  // Replication factor 4 is Camunda's requirement for dual-region so a quorum
  // survives losing a region — but never more than the number of brokers.
  if (!helmValues[base]?.replicationFactor) {
    helmValues = setNestedValue(
      helmValues,
      `${base}.replicationFactor`,
      String(Math.min(4, clusterSize)),
    )
  }

  const contactPoints = buildInitialContactPoints(answers, clusterSize)
  if (contactPoints.length === 0) return helmValues

  // Prepend rather than replace: the user may have added their own env vars.
  // On 8.7, `base` is "zeebe" specifically — the broker component that needs
  // the topology, not Operate or Tasklist's separate env arrays.
  const existing = helmValues[base]?.env || []
  helmValues = setNestedValue(helmValues, `${base}.env`, [
    { name: CONTACT_POINTS_ENV, value: contactPoints.join(",") },
    ...existing.filter((entry) => entry.name !== CONTACT_POINTS_ENV),
  ])

  return helmValues
}

// ─── Document store ───────────────────────────────────────────────────────────
//
// Exactly one store is active. activeStoreId must match the storeId of the
// enabled type, and the types the user did not pick must be switched off — the
// in-memory store is enabled by default in the chart and would otherwise stay on.

const DOCUMENT_STORES = {
  "In-memory": { key: "inmemory", storeId: "INMEMORY" },
  "AWS S3": { key: "aws", storeId: "AWS" },
  "GCP Cloud Storage": { key: "gcp", storeId: "GCP" },
}

function applyDocumentStore(helmValues, answers) {
  const selected = DOCUMENT_STORES[answers.document_store_type]
  if (!selected) return helmValues

  for (const { key } of Object.values(DOCUMENT_STORES)) {
    helmValues = setNestedValue(helmValues, `global.documentStore.type.${key}.enabled`, key === selected.key)
  }
  helmValues = setNestedValue(helmValues, "global.documentStore.activeStoreId", selected.storeId)

  return helmValues
}

// ─── Derived values ───────────────────────────────────────────────────────────

function applyDerivedValues(helmValues, answers) {
  if (answers.products.includes("orchestration")) {
    helmValues = applySizing(helmValues, answers)
    helmValues = applyDocumentStore(helmValues, answers)
  }
  return helmValues
}

// ─── Map user answers to helm values paths ────────────────────────────────────
function mapFieldsToHelm(helmValues, answers) {
  const visibleSections = displayConfig.sections.filter((s) => s.showIf(answers))

  for (const section of visibleSections) {
    for (const field of section.fields) {
      // A field hidden inside a visible section is just as hidden as one in a
      // collapsed section — its answer must not reach the output. This also
      // covers a field whose `paths` override is null for the selected
      // release (no chart equivalent there) or whose default path simply does
      // not exist on that release.
      if (!fieldApplies(field, answers)) continue

      // The path a field writes to can differ by release (src/fieldPaths.js)
      // — resolved once here, used for every write below.
      const path = resolveFieldPath(field, selectedVersion(answers))
      if (!path) continue

      // env_vars type — convert to YAML array of { name, value } objects
      if (field.type === "env_vars") {
        const rows = answers[field.id] || []
        const envArray = rows
          .filter((row) => row.name && row.value)
          .map((row) => ({ name: row.name, value: row.value }))
        if (envArray.length > 0) {
          helmValues = setNestedValue(helmValues, path, envArray)
        }
        continue
      }

      // string_list — drop blank rows, omit the key entirely if none remain
      if (field.type === "string_list") {
        const items = (answers[field.id] || []).map((item) => (item || "").trim()).filter(Boolean)
        if (items.length > 0) {
          helmValues = setNestedValue(helmValues, path, items)
        }
        continue
      }

      let value = answers[field.id]
      if (value === undefined || value === "" || value === null) continue

      // Convert port fields to numbers
      if (field.id.includes("port")) {
        value = toNumber(value)
      }

      helmValues = setNestedValue(helmValues, path, value)
    }
  }

  return helmValues
}

// ─── Main transform function ───────────────────────────────────────────────────
export function transformAnswers(answers) {
  let helmValues = {}

  // Step 1: apply automatic product flags (enabled/disabled for all products)
  helmValues = applyProductFlags(helmValues, answers)

  // Step 2: values derived from a target rather than typed in directly
  helmValues = applyDerivedValues(helmValues, answers)

  // Step 3: map user filled fields to their yaml paths
  helmValues = mapFieldsToHelm(helmValues, answers)

  // Step 4: multi-region runs after field mapping so the generated contact
  // points sit alongside any environment variables the user added by hand
  if (answers.products.includes("orchestration")) {
    helmValues = applyMultiregion(helmValues, answers)
  }

  // Step 5: remove any empty values
  return cleanObject(helmValues)
}