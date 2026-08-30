/**
 * scenarios.js — Shared test scenarios
 *
 * One `answers` object per realistic deployment shape. Used by two consumers:
 *
 *   test/transform.test.js    — asserts the generated YAML matches test/golden/
 *   scripts/renderFixtures.js — writes the same YAML out for `helm template`
 *
 * Keeping a single list means a scenario that is unit-tested is also proven to
 * render against the real chart. Add new scenarios here, then run
 * `npm test -- -u` to record the golden output and review the diff.
 *
 * Passwords are obviously fake — these values are committed.
 */

const es = {
  es_username: 'camunda',
  es_password: 'es-secret',
  es_protocol: 'https',
  es_host: 'elasticsearch.example.internal',
  es_port: '9200',
  es_tls: true,
}

const os = {
  os_username: 'camunda',
  os_password: 'os-secret',
  os_protocol: 'https',
  os_host: 'opensearch.example.internal',
  os_port: '9200',
  os_tls: true,
}

const identityDb = {
  identity_db_host: 'identity-db.example.internal',
  identity_db_port: '5432',
  identity_db_username: 'identity',
  identity_db_password: 'identity-secret',
  identity_db_name: 'identity',
}

const webModelerMail = {
  wm_mail_from_address: 'camunda@example.com',
  wm_mail_from_name: 'Camunda 8',
  wm_smtp_host: 'smtp.example.internal',
  wm_smtp_port: '587',
  wm_smtp_user: 'camunda',
  wm_smtp_tls: true,
  wm_smtp_password: 'smtp-secret',
}

const webModelerDb = {
  wm_db_host: 'modeler-db.example.internal',
  wm_db_port: '5432',
  wm_db_user: 'modeler',
  wm_db_password: 'modeler-secret',
  wm_db_name: 'modeler',
}

export const scenarios = [
  {
    name: 'orchestration-elasticsearch',
    description: 'Smallest useful deployment: orchestration cluster on external Elasticsearch.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
    },
  },
  {
    name: 'orchestration-opensearch-eks',
    description: 'OpenSearch on AWS EKS — exercises the IRSA flag.',
    answers: {
      products: ['orchestration'],
      databaseType: 'opensearch',
      isAwsEks: true,
      ...os,
    },
  },
  {
    name: 'optimize-only-opensearch',
    description: 'Optimize without orchestration — the standalone (non-shared) database section.',
    answers: {
      products: ['optimize'],
      databaseType: 'opensearch',
      ...os,
    },
  },
  {
    name: 'orchestration-optimize-shared-elasticsearch',
    description: 'Both search consumers selected — the shared database section applies.',
    answers: {
      products: ['orchestration', 'optimize'],
      databaseType: 'elasticsearch',
      ...es,
    },
  },
  {
    name: 'identity-only',
    description: 'Management Identity against an external Postgres, bundled Postgres disabled.',
    answers: {
      products: ['identity'],
      ...identityDb,
    },
  },
  {
    name: 'webmodeler-with-identity',
    description: 'Web Modeler needs Identity and an SMTP from-address, or the chart refuses to render.',
    answers: {
      products: ['webModeler', 'identity'],
      ...identityDb,
      ...webModelerDb,
      ...webModelerMail,
      webModeler_restapi_env: [{ name: 'LOGGING_LEVEL_IO_CAMUNDA', value: 'DEBUG' }],
      webModeler_websockets_env: [{ name: 'LOG_LEVEL', value: 'debug' }],
    },
  },
  {
    name: 'connectors-console-no-search-db',
    description: 'Neither orchestration nor optimize — every search database must be disabled. Console requires Identity.',
    answers: {
      products: ['connectors', 'console', 'identity'],
      ...identityDb,
      connectors_env: [{ name: 'CAMUNDA_CONNECTOR_POLLING_ENABLED', value: 'true' }],
    },
  },
  {
    name: 'ingress-with-tls',
    description: 'Global ingress plus the separate gRPC ingress, both with TLS.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
      ingress_enabled: true,
      ingress_class: 'nginx',
      ingress_host: 'camunda.example.com',
      ingress_tls_enabled: true,
      ingress_tls_secret: 'camunda-tls',
      grpc_enabled: true,
      grpc_class: 'nginx',
      grpc_host: 'zeebe.example.com',
      grpc_tls_enabled: true,
      grpc_tls_secret: 'zeebe-tls',
    },
  },
  {
    name: 'openshift-full-stack',
    description: 'Every product on OpenShift — adaptSecurityContext must reach each sub-chart.',
    answers: {
      products: ['orchestration', 'optimize', 'identity', 'webModeler', 'connectors', 'console'],
      databaseType: 'elasticsearch',
      isOpenShift: true,
      ...es,
      ...identityDb,
      ...webModelerDb,
      ...webModelerMail,
      orchestration_env: [{ name: 'ZEEBE_BROKER_CLUSTER_PARTITIONSCOUNT', value: '3' }],
      optimize_env: [{ name: 'CAMUNDA_OPTIMIZE_ENTERPRISE', value: 'false' }],
      identity_env: [{ name: 'IDENTITY_LOG_LEVEL', value: 'DEBUG' }],
      console_env: [{ name: 'CONSOLE_LOG_LEVEL', value: 'debug' }],
      connectors_env: [{ name: 'CAMUNDA_CONNECTOR_POLLING_ENABLED', value: 'true' }],
    },
  },
  // ── Sizing ─────────────────────────────────────────────────────────────────
  {
    name: 'throughput-1000-pi-per-second',
    description: 'Sized from a throughput target of 1000 process instances per second.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
      sizing_mode: 'Throughput target',
      target_pi_per_second: '1000',
      tasks_per_instance: '10',
      storage_class: 'premium-rwo',
    },
  },
  {
    name: 'manual-sizing',
    description: 'Operator overrides every sizing value by hand.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
      sizing_mode: 'Manual',
      cluster_size: '8',
      partition_count: '24',
      replication_factor: '4',
      pvc_size: '128Gi',
      storage_class: 'premium-rwo',
      cpu_request: '4000m',
      cpu_limit: '6000m',
      memory_request: '8Gi',
      memory_limit: '12Gi',
    },
  },

  // ── Multi-region ───────────────────────────────────────────────────────────
  // The same deployment generates one file per region, differing only in
  // regionId. Both are kept as fixtures so the pair stays consistent.
  {
    name: 'dual-region-0',
    description: 'Dual-region stretch cluster, values file for region 0.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
      sizing_mode: 'Throughput target',
      target_pi_per_second: '480',
      multiregion_enabled: true,
      multiregion_region_id: '0',
      multiregion_namespaces: ['camunda-region-0', 'camunda-region-1'],
      multiregion_release_name: 'camunda',
      multiregion_cluster_domain: 'cluster.local',
    },
  },
  {
    name: 'dual-region-1',
    description: 'The same cluster, values file for region 1.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
      sizing_mode: 'Throughput target',
      target_pi_per_second: '480',
      multiregion_enabled: true,
      multiregion_region_id: '1',
      multiregion_namespaces: ['camunda-region-0', 'camunda-region-1'],
      multiregion_release_name: 'camunda',
      multiregion_cluster_domain: 'cluster.local',
    },
  },

  // ── Security ───────────────────────────────────────────────────────────────
  {
    name: 'oidc-authentication',
    description: 'External OIDC provider instead of the default basic auth.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
      auth_method: 'oidc',
      oidc_type: 'KEYCLOAK',
      oidc_issuer: 'https://keycloak.example.com/realms/camunda',
      oidc_client_id: 'orchestration',
      oidc_client_secret: 'oidc-secret',
      oidc_audience: 'orchestration-api',
      oidc_redirect_url: 'https://camunda.example.com',
      oidc_username_claim: 'preferred_username',
      oidc_groups_claim: 'groups',
    },
  },
  {
    name: 'existing-secrets',
    description: 'Every credential referenced from a pre-created Kubernetes Secret — no plaintext in the file.',
    answers: {
      products: ['orchestration', 'identity'],
      databaseType: 'elasticsearch',
      es_username: 'camunda',
      es_protocol: 'https',
      es_host: 'elasticsearch.example.internal',
      es_port: '9200',
      es_tls: true,
      es_password_secret_mode: 'Existing secret',
      es_password_existing_secret: 'camunda-elasticsearch',
      es_password_existing_secret_key: 'password',
      identity_db_host: 'identity-db.example.internal',
      identity_db_port: '5432',
      identity_db_username: 'identity',
      identity_db_name: 'identity',
      identity_db_password_secret_mode: 'Existing secret',
      identity_db_password_existing_secret: 'camunda-identity-db',
      identity_db_password_existing_secret_key: 'password',
      license_secret_mode: 'Existing secret',
      license_existing_secret: 'camunda-license',
      license_existing_secret_key: 'license-key',
    },
  },

  // ── Document store ─────────────────────────────────────────────────────────
  {
    name: 'document-store-s3',
    description: 'Documents in S3 with IRSA, so no AWS keys land in the file.',
    answers: {
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      ...es,
      document_store_type: 'AWS S3',
      doc_aws_bucket: 'camunda-documents',
      doc_aws_region: 'eu-central-1',
      doc_aws_path: 'production/',
      doc_aws_irsa: true,
    },
  },

  // ── Everything ─────────────────────────────────────────────────────────────
  {
    name: 'production-full-stack',
    description: 'All products, OIDC, S3 documents, existing secrets, ingress and a throughput target.',
    answers: {
      products: ['orchestration', 'optimize', 'identity', 'webModeler', 'connectors', 'console'],
      databaseType: 'elasticsearch',
      ...es,
      ...identityDb,
      ...webModelerDb,
      ...webModelerMail,
      sizing_mode: 'Throughput target',
      target_pi_per_second: '480',
      tasks_per_instance: '10',
      storage_class: 'premium-rwo',
      auth_method: 'oidc',
      oidc_type: 'KEYCLOAK',
      oidc_issuer: 'https://keycloak.example.com/realms/camunda',
      oidc_client_id: 'orchestration',
      oidc_client_secret: 'oidc-secret',
      document_store_type: 'AWS S3',
      doc_aws_bucket: 'camunda-documents',
      doc_aws_region: 'eu-central-1',
      doc_aws_irsa: true,
      license_secret_mode: 'Existing secret',
      license_existing_secret: 'camunda-license',
      license_existing_secret_key: 'license-key',
      ingress_enabled: true,
      ingress_class: 'nginx',
      ingress_host: 'camunda.example.com',
      ingress_tls_enabled: true,
      ingress_tls_secret: 'camunda-tls',
      grpc_enabled: true,
      grpc_class: 'nginx',
      grpc_host: 'zeebe.example.com',
      grpc_tls_enabled: true,
      grpc_tls_secret: 'zeebe-tls',
      orchestration_env: [{ name: 'CAMUNDA_LOG_LEVEL', value: 'INFO' }],
    },
  },
]
