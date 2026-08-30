/**
 * transform.test.js — Output correctness tests
 *
 * Two layers:
 *
 *   1. Golden files  — every scenario in scenarios.js is rendered to YAML and
 *      compared against test/golden/<name>.yaml. Any change to transform.js or
 *      displayConfig.js that alters real output shows up as a reviewable YAML
 *      diff in the pull request. Re-record with `npm test -- -u`.
 *
 *   2. Targeted tests — the implicit Helm rules a reviewer cannot eyeball from
 *      a golden file, and the specific bugs that have bitten this tool before.
 */

import { describe, it, expect } from 'vitest'
import { dumpValues, loadValues } from '../src/yaml.js'
import { transformAnswers, setNestedValue, cleanObject } from '../src/transform.js'
import { displayConfig } from '../src/displayConfig.js'
import { scenarios } from './scenarios.js'

const toYaml = (answers) =>
  dumpValues(transformAnswers(answers))

// ─── 1. Golden files ──────────────────────────────────────────────────────────

describe('golden output', () => {
  for (const scenario of scenarios) {
    it(scenario.name, async () => {
      await expect(toYaml(scenario.answers))
        .toMatchFileSnapshot(`./golden/${scenario.name}.yaml`)
    })
  }
})

// ─── 2. Utilities ─────────────────────────────────────────────────────────────

describe('setNestedValue', () => {
  it('expands a dot path into nested objects', () => {
    expect(setNestedValue({}, 'a.b.c', 1)).toEqual({ a: { b: { c: 1 } } })
  })

  it('merges into an existing branch instead of replacing it', () => {
    const start = { a: { b: 1 } }
    expect(setNestedValue(start, 'a.c', 2)).toEqual({ a: { b: 1, c: 2 } })
  })

  it('does not mutate its input', () => {
    const start = { a: { b: 1 } }
    setNestedValue(start, 'a.c', 2)
    expect(start).toEqual({ a: { b: 1 } })
  })
})

describe('cleanObject', () => {
  it('drops empty strings, null and undefined', () => {
    expect(cleanObject({ a: '', b: null, c: undefined, d: 'keep' })).toEqual({ d: 'keep' })
  })

  it('keeps false and 0 — disabled flags must survive into the output', () => {
    expect(cleanObject({ enabled: false, replicas: 0 })).toEqual({ enabled: false, replicas: 0 })
  })

  it('removes branches that end up empty', () => {
    expect(cleanObject({ a: { b: '' }, c: { d: 1 } })).toEqual({ c: { d: 1 } })
  })
})

// ─── 3. Product enablement ────────────────────────────────────────────────────

describe('product flags', () => {
  it('sets an explicit enabled flag for every product, selected or not', () => {
    const out = transformAnswers({ products: ['orchestration'], databaseType: 'elasticsearch' })
    expect(out.orchestration.enabled).toBe(true)
    expect(out.optimize.enabled).toBe(false)
    expect(out.identity.enabled).toBe(false)
    expect(out.webModeler.enabled).toBe(false)
    expect(out.connectors.enabled).toBe(false)
    expect(out.console.enabled).toBe(false)
  })

  it('covers every product declared in displayConfig', () => {
    // Guards the hand-maintained coupling between displayConfig.products and
    // applyProductFlags: adding a product to the UI without a flag branch here
    // would silently omit its `enabled` key from the output.
    const out = transformAnswers({ products: [], databaseType: 'elasticsearch' })
    for (const product of displayConfig.products) {
      expect(out, `${product.id} has no enabled flag in transform.js`).toHaveProperty(product.id)
    }
  })
})

// ─── 4. Bundled databases are disabled when an external one is configured ─────

describe('bundled database handling', () => {
  it('disables bundled Postgres and enables external DB for Identity', () => {
    const out = transformAnswers({ products: ['identity'] })
    expect(out.identity.externalDatabase.enabled).toBe(true)
    expect(out.identityPostgresql.enabled).toBe(false)
  })

  it('disables bundled Postgres for Web Modeler', () => {
    const out = transformAnswers({ products: ['webModeler'] })
    expect(out.webModelerPostgresql.enabled).toBe(false)
  })

  it('marks Elasticsearch external and disables the bundled sub-chart', () => {
    const out = transformAnswers({ products: ['orchestration'], databaseType: 'elasticsearch' })
    expect(out.global.elasticsearch.enabled).toBe(true)
    expect(out.global.elasticsearch.external).toBe(true)
    expect(out.elasticsearch.enabled).toBe(false)
    expect(out.global.opensearch.enabled).toBe(false)
  })

  it('selects OpenSearch exclusively', () => {
    const out = transformAnswers({ products: ['orchestration'], databaseType: 'opensearch' })
    expect(out.global.opensearch.enabled).toBe(true)
    expect(out.global.elasticsearch.enabled).toBe(false)
    expect(out.elasticsearch.enabled).toBe(false)
  })

  it('disables every search database when nothing consumes one', () => {
    const out = transformAnswers({ products: ['connectors', 'console'] })
    expect(out.global.elasticsearch.enabled).toBe(false)
    expect(out.global.opensearch.enabled).toBe(false)
    expect(out.elasticsearch.enabled).toBe(false)
  })
})

// ─── 5. Cluster-specific flags ────────────────────────────────────────────────
//
// Regression tests. These branches previously read `answers.clusterType`, which
// no field ever set, so ticking either checkbox produced no output at all.

describe('cluster flags', () => {
  it('forces adaptSecurityContext on the chart and every sub-chart for OpenShift', () => {
    const out = transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      isOpenShift: true,
    })
    const force = (o) => o.global.compatibility.openshift.adaptSecurityContext
    expect(force(out)).toBe('force')
    for (const sub of ['identityPostgresql', 'identityKeycloak', 'webModelerPostgresql', 'elasticsearch']) {
      expect(force(out[sub]), `${sub} missing OpenShift security context`).toBe('force')
    }
  })

  it('omits OpenShift settings when the box is unticked', () => {
    const out = transformAnswers({ products: ['orchestration'], databaseType: 'elasticsearch' })
    expect(out.global.compatibility).toBeUndefined()
  })

  it('enables OpenSearch IRSA on EKS', () => {
    const out = transformAnswers({
      products: ['orchestration'],
      databaseType: 'opensearch',
      isAwsEks: true,
    })
    expect(out.global.opensearch.aws.enabled).toBe(true)
  })

  it('does not enable IRSA on EKS when the database is Elasticsearch', () => {
    const out = transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      isAwsEks: true,
    })
    expect(out.global.opensearch.aws).toBeUndefined()
  })
})

// ─── 6. Multi-region topology ─────────────────────────────────────────────────

describe('multi-region', () => {
  const dualRegion = (overrides = {}) => transformAnswers({
    products: ['orchestration'],
    databaseType: 'elasticsearch',
    multiregion_enabled: true,
    multiregion_region_id: '0',
    multiregion_namespaces: ['region-a', 'region-b'],
    multiregion_release_name: 'camunda',
    ...overrides,
  })

  it('never leaves an odd broker count across two regions', () => {
    // The chart divides clusterSize by regions with integer division, so the
    // default of 3 would run one broker per region while each believes it is in
    // a cluster of three — the cluster would never reach a quorum.
    const out = dualRegion()
    expect(Number(out.orchestration.clusterSize) % 2).toBe(0)
  })

  it('writes the broker count explicitly rather than relying on the chart default', () => {
    expect(dualRegion().orchestration.clusterSize).toBe('4')
  })

  it('emits one contact point per broker across every region', () => {
    const points = dualRegion().orchestration.env[0].value.split(',')
    expect(points).toHaveLength(4)
    expect(points.filter((p) => p.includes('region-a'))).toHaveLength(2)
    expect(points.filter((p) => p.includes('region-b'))).toHaveLength(2)
  })

  it('addresses brokers by their fully-qualified cross-cluster DNS name', () => {
    const [first] = dualRegion().orchestration.env[0].value.split(',')
    expect(first).toBe('camunda-zeebe-0.camunda-zeebe.region-a.svc.cluster.local:26502')
  })

  it('keeps the user\'s own env vars alongside the generated contact points', () => {
    const out = dualRegion({
      orchestration_env: [{ name: 'CAMUNDA_LOG_LEVEL', value: 'DEBUG' }],
    })
    expect(out.orchestration.env.map((e) => e.name)).toEqual([
      'CAMUNDA_CLUSTER_INITIALCONTACTPOINTS',
      'CAMUNDA_LOG_LEVEL',
    ])
  })

  it('uses replication factor 4 so a quorum survives losing a region', () => {
    expect(dualRegion().orchestration.replicationFactor).toBe('4')
  })

  it('writes nothing multi-region when only one namespace is given', () => {
    const out = dualRegion({ multiregion_namespaces: ['region-a'] })
    expect(out.global.multiregion).toBeUndefined()
    expect(out.orchestration.env).toBeUndefined()
  })

  it('differs between the two regions only by region ID', () => {
    const a = dualRegion({ multiregion_region_id: '0' })
    const b = dualRegion({ multiregion_region_id: '1' })

    expect(a.global.multiregion.regionId).toBe(0)
    expect(b.global.multiregion.regionId).toBe(1)

    delete a.global.multiregion.regionId
    delete b.global.multiregion.regionId
    expect(a).toEqual(b)
  })
})

// ─── 7. Field mapping ─────────────────────────────────────────────────────────

describe('field mapping', () => {
  it('emits ports as numbers, not quoted strings', () => {
    const out = transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      es_host: 'es.example.com',
      es_port: '9200',
    })
    expect(out.global.elasticsearch.url.port).toBe(9200)
    expect(typeof out.global.elasticsearch.url.port).toBe('number')
  })

  it('ignores answers belonging to sections the user cannot currently see', () => {
    // OpenSearch credentials linger in state after switching to Elasticsearch;
    // they must not leak into the generated file.
    const out = transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      es_host: 'es.example.com',
      os_host: 'leftover.example.com',
      os_username: 'leftover',
    })
    expect(out.global.opensearch.url).toBeUndefined()
    expect(out.global.opensearch.auth).toBeUndefined()
  })

  it('renders env vars as a list of name/value pairs', () => {
    const out = transformAnswers({
      products: ['connectors'],
      connectors_env: [
        { name: 'A', value: '1' },
        { name: 'B', value: '2' },
      ],
    })
    expect(out.connectors.env).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ])
  })

  it('drops incomplete env var rows rather than emitting a half-empty entry', () => {
    const out = transformAnswers({
      products: ['connectors'],
      connectors_env: [
        { name: 'A', value: '1' },
        { name: '', value: 'orphan' },
        { name: 'C', value: '' },
      ],
    })
    expect(out.connectors.env).toEqual([{ name: 'A', value: '1' }])
  })
})

// ─── 8. Camunda 8.7 — pre-merge Orchestration Cluster ─────────────────────────
//
// 8.8 merged Zeebe, Zeebe Gateway, Operate and Tasklist into one Orchestration
// Cluster component. 8.7's chart predates that merge, and several of its
// defaults differ from 8.8+ in ways that are easy to get backwards — each
// assertion below is a fact verified against the real vendored 8.7 chart via
// `npm run verify:helm`, not an assumption.

describe('8.7 orchestration components', () => {
  const base = (overrides = {}) => ({
    products: ['orchestration'],
    databaseType: 'elasticsearch',
    chartVersion: '8.7',
    es_username: 'camunda',
    es_password: 'secret',
    es_protocol: 'https',
    es_host: 'es.example.com',
    es_port: '9200',
    ...overrides,
  })

  it('fans "Orchestration Cluster" out to zeebe, operate and tasklist — not zeebeGateway', () => {
    // zeebeGateway has no enabled flag of its own in 8.7's chart; it is
    // always deployed alongside zeebe. (zeebeGateway.ingress.grpc.enabled does
    // still appear — that is the separate default-disabled-ingress write.)
    const out = transformAnswers(base())
    expect(out.zeebe.enabled).toBe(true)
    expect(out.operate.enabled).toBe(true)
    expect(out.tasklist.enabled).toBe(true)
    expect(out.zeebeGateway.enabled).toBeUndefined()
  })

  it('maps cluster sizing to zeebe.*, not orchestration.*', () => {
    const out = transformAnswers(base({
      sizing_mode: 'Manual',
      cluster_size: '6',
      partition_count: '6',
      replication_factor: '3',
    }))
    expect(out.zeebe.clusterSize).toBe('6')
    expect(out.zeebe.partitionCount).toBe('6')
    expect(out.orchestration).toBeUndefined()
  })

  it('maps gRPC ingress to zeebeGateway.ingress.grpc, not orchestration.ingress.grpc', () => {
    const out = transformAnswers(base({ grpc_enabled: true, grpc_host: 'zeebe.example.com' }))
    expect(out.zeebeGateway.ingress.grpc.enabled).toBe(true)
    expect(out.zeebeGateway.ingress.grpc.host).toBe('zeebe.example.com')
  })

  it('splits environment variables into zeebe.env, operate.env and tasklist.env', () => {
    const out = transformAnswers(base({
      zeebe_env: [{ name: 'A', value: '1' }],
      operate_env: [{ name: 'B', value: '2' }],
      tasklist_env: [{ name: 'C', value: '3' }],
    }))
    expect(out.zeebe.env).toEqual([{ name: 'A', value: '1' }])
    expect(out.operate.env).toEqual([{ name: 'B', value: '2' }])
    expect(out.tasklist.env).toEqual([{ name: 'C', value: '3' }])
  })

  it('injects multi-region contact points into zeebe.env specifically', () => {
    const out = transformAnswers(base({
      sizing_mode: 'Manual',
      cluster_size: '4',
      partition_count: '4',
      replication_factor: '4',
      multiregion_enabled: true,
      multiregion_region_id: '0',
      multiregion_namespaces: ['region-a', 'region-b'],
    }))
    const points = out.zeebe.env.find((e) => e.name === 'CAMUNDA_CLUSTER_INITIALCONTACTPOINTS')
    expect(points).toBeDefined()
    expect(points.value).toContain('region-a')
  })

  it('writes Web Modeler\'s bundled database to postgresql.enabled, not webModelerPostgresql', () => {
    const out = transformAnswers({ ...base(), products: ['orchestration', 'webModeler'] })
    expect(out.postgresql.enabled).toBe(false)
    expect(out.webModelerPostgresql).toBeUndefined()
  })
})

describe('8.7 auth defaults', () => {
  // 8.7's chart defaults identityKeycloak.enabled AND global.identity.auth.enabled
  // to true (8.8+ defaults both to false). Left alone, every non-Identity
  // deployment fails at template time trying to resolve an OIDC issuer from a
  // Keycloak that was never deployed - confirmed by rendering it.
  it('forces Keycloak and identity auth off when Identity is not selected', () => {
    const out = transformAnswers({
      products: ['orchestration'], databaseType: 'elasticsearch', chartVersion: '8.7',
    })
    expect(out.identityKeycloak.enabled).toBe(false)
    expect(out.global.identity.auth.enabled).toBe(false)
  })

  it('leaves them at chart defaults when Identity is selected', () => {
    const out = transformAnswers({
      products: ['orchestration', 'identity'], databaseType: 'elasticsearch', chartVersion: '8.7',
      identity_db_host: 'db.example.com', identity_db_port: '5432',
      identity_db_username: 'identity', identity_db_password: 'secret', identity_db_name: 'identity',
    })
    expect(out.identityKeycloak).toBeUndefined()
    expect(out.global.identity).toBeUndefined()
  })

  it('does not force these off on 8.8/8.9, which already default both to false', () => {
    const out = transformAnswers({ products: ['orchestration'], databaseType: 'elasticsearch' })
    expect(out.identityKeycloak).toBeUndefined()
    expect(out.global.identity).toBeUndefined()
  })
})

describe('8.7 credential shapes', () => {
  it('writes ES/OS passwords flat, with no existing-secret option offered', () => {
    // 8.7's chart has no auth.secret.* structure for Elasticsearch/OpenSearch
    // at all - only a plaintext auth.password.
    const out = transformAnswers({
      products: ['orchestration'], databaseType: 'elasticsearch', chartVersion: '8.7',
      es_host: 'es.example.com', es_password: 'secret',
      es_password_secret_mode: 'Existing secret', // ignored - not offered on 8.7
      es_password_existing_secret: 'should-not-be-used',
    })
    expect(out.global.elasticsearch.auth.password).toBe('secret')
    expect(out.global.elasticsearch.auth.secret).toBeUndefined()
    expect(out.global.elasticsearch.auth.existingSecret).toBeUndefined()
  })

  it('uses existingSecretPasswordKey for Identity\'s external database, not existingSecretKey', () => {
    const out = transformAnswers({
      products: ['identity'], chartVersion: '8.7',
      identity_db_host: 'db.example.com', identity_db_port: '5432', identity_db_username: 'identity',
      identity_db_name: 'identity',
      identity_db_password_secret_mode: 'Existing secret',
      identity_db_password_existing_secret: 'db-creds',
      identity_db_password_existing_secret_key: 'password',
    })
    expect(out.identity.externalDatabase.existingSecret).toBe('db-creds')
    expect(out.identity.externalDatabase.existingSecretPasswordKey).toBe('password')
    expect(out.identity.externalDatabase.existingSecretKey).toBeUndefined()
  })

  it('excludes AWS S3 document-store credential fields entirely — the 8.7 shape does not correspond', () => {
    const out = transformAnswers({
      products: ['orchestration'], databaseType: 'elasticsearch', chartVersion: '8.7',
      es_host: 'es.example.com', es_password: 'secret',
      document_store_type: 'AWS S3', doc_aws_bucket: 'bucket', doc_aws_region: 'eu-central-1',
      doc_aws_access_key: 'AKIA...', doc_aws_secret_key: 'shh',
    })
    expect(out.global.documentStore.type.aws.bucket).toBe('bucket')
    expect(out.global.documentStore.type.aws.accessKeyId).toBeUndefined()
    expect(out.global.documentStore.type.aws.secretAccessKey).toBeUndefined()
  })

  it('hides the OIDC section entirely — 8.7 has no per-component auth method concept', () => {
    const out = transformAnswers({
      products: ['orchestration'], databaseType: 'elasticsearch', chartVersion: '8.7',
      es_host: 'es.example.com', es_password: 'secret',
      auth_method: 'oidc', oidc_type: 'KEYCLOAK', oidc_issuer: 'https://example.com',
    })
    expect(out.global.security).toBeUndefined()
    expect(out.orchestration).toBeUndefined()
  })

  it('hides the TLS CA bundle section — global.tls.caBundle does not exist on 8.7', () => {
    const out = transformAnswers({
      products: ['orchestration'], databaseType: 'elasticsearch', chartVersion: '8.7',
      es_host: 'es.example.com', es_password: 'secret', es_tls: true,
      ca_bundle_secret: 'my-bundle',
    })
    expect(out.global.tls).toBeUndefined()
  })
})

// ─── 9. RDBMS secondary storage (8.9 only) ────────────────────────────────────
//
// orchestration.data.secondaryStorage.rdbms.* is new in Camunda 8.9 - it does
// not exist on 8.7 or 8.8 at all (verified against both vendored schemas).

describe('RDBMS secondary storage', () => {
  it('configures RDBMS and deploys no document store at all', () => {
    const out = transformAnswers({
      products: ['orchestration'], chartVersion: '8.9', databaseType: 'rdbms',
      rdbms_url: 'jdbc:postgresql://db:5432/camunda', rdbms_username: 'camunda', rdbms_password: 'secret',
    })
    expect(out.orchestration.data.secondaryStorage.type).toBe('rdbms')
    expect(out.orchestration.data.secondaryStorage.rdbms.url).toBe('jdbc:postgresql://db:5432/camunda')
    expect(out.global.elasticsearch.enabled).toBe(false)
    expect(out.global.opensearch.enabled).toBe(false)
    expect(out.elasticsearch.enabled).toBe(false)
  })

  it('does not require a password when authenticating via Aurora IRSA', () => {
    const out = transformAnswers({
      products: ['orchestration'], chartVersion: '8.9', databaseType: 'rdbms',
      rdbms_url: 'jdbc:postgresql://aurora:5432/camunda', rdbms_username: 'camunda', rdbms_aws_irsa: true,
    })
    expect(out.orchestration.data.secondaryStorage.rdbms.aws.enabled).toBe(true)
    expect(out.orchestration.data.secondaryStorage.rdbms.secret).toBeUndefined()
  })

  it('never writes secondaryStorage on 8.7 or 8.8, where the path does not exist', () => {
    // Reachable only by bypassing the UI's rdbmsRequires89 constraint - guarded
    // again here so a direct transformAnswers call can't produce a file that
    // references a path the target chart doesn't have.
    for (const version of ['8.7', '8.8']) {
      const out = transformAnswers({
        products: ['orchestration'], chartVersion: version, databaseType: 'rdbms',
        rdbms_url: 'jdbc:postgresql://db:5432/camunda', rdbms_username: 'camunda', rdbms_password: 'secret',
      })
      expect(out.orchestration?.data, version).toBeUndefined()
    }
  })
})

describe('RDBMS constraints', () => {
  it('rejects RDBMS combined with Optimize — Optimize has no RDBMS option', () => {
    const violated = displayConfig.constraints.find((c) => c.id === 'rdbmsIncompatibleWithOptimize')
    expect(violated.violated({ products: ['orchestration', 'optimize'], databaseType: 'rdbms' })).toBe(true)
    expect(violated.violated({ products: ['orchestration'], databaseType: 'rdbms' })).toBe(false)
  })

  it('rejects RDBMS on any release other than 8.9', () => {
    const constraint = displayConfig.constraints.find((c) => c.id === 'rdbmsRequires89')
    expect(constraint.violated({ products: ['orchestration'], databaseType: 'rdbms', chartVersion: '8.7' })).toBe(true)
    expect(constraint.violated({ products: ['orchestration'], databaseType: 'rdbms', chartVersion: '8.9' })).toBe(false)
    // Unset chartVersion defaults to 8.9 elsewhere in the app - must not false-flag here.
    expect(constraint.violated({ products: ['orchestration'], databaseType: 'rdbms' })).toBe(false)
  })
})

// ─── 10. Output is always valid YAML ──────────────────────────────────────────

describe('serialisation', () => {
  it('round-trips every scenario through js-yaml', () => {
    for (const scenario of scenarios) {
      const text = toYaml(scenario.answers)
      expect(() => loadValues(text), scenario.name).not.toThrow()
      expect(loadValues(text)).toEqual(transformAnswers(scenario.answers))
    }
  })
})
