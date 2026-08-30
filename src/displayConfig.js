/**
 * displayConfig.js — UI Display Configuration
 *
 * The single file responsible for what the user sees in the form.
 * Defines which products are available, which sections appear, and
 * which fields are rendered — all driven by the user's current answers.
 *
 * This is the primary file for ongoing maintenance. Most day-to-day
 * changes — adding fields, reordering sections, adjusting conditions —
 * happen here only.
 *
 * Structure:
 *   products    — list of selectable Camunda products
 *   sections    — list of form sections, each with a showIf condition
 *     fields    — list of inputs, each mapping to a Helm values path.
 *                 A field may carry its own showIf for within-section branching
 *                 (used by the secret-mode toggles and the document store).
 *   constraints — cross-product rules the chart enforces at template time.
 *                 Checked before generating so the user sees the problem here
 *                 rather than in a failed `helm install`.
 *
 * To add a new field:
 *   1. Find the path in schema.json by searching for a keyword
 *   2. Add a field entry to the relevant section below
 *   3. Run `npm run validate` to confirm the path exists in the chart
 *   4. Save — the UI updates automatically
 *
 * Hidden fields (section showIf false, or field showIf false) are never read by
 * transform.js, so stale answers cannot leak into the generated file.
 */

import { resolveFieldPath } from './fieldPaths.js'

// Secret inputs offer two modes. Inline writes the value straight into the
// generated YAML, which is convenient for a trial cluster and wrong for a real
// one; existingSecret references a Kubernetes Secret the user creates outside
// this tool. The literals below are compared against in field showIf conditions.
const INLINE = 'Inline value'
const EXISTING = 'Existing secret'
const SECRET_MODES = [INLINE, EXISTING]

// Builds { path, paths } for one of the three secretFields sub-concepts
// (inline / existingSecret / existingSecretKey), applying a per-version
// override where one is given. A version absent from `overrides` falls
// through to the default, base-derived path.
function secretPath(leaf, defaultPath, overrides) {
  const paths = {}
  for (const [version, override] of Object.entries(overrides)) {
    if (Object.prototype.hasOwnProperty.call(override, leaf)) {
      paths[version] = override[leaf]
    }
  }
  return Object.keys(paths).length > 0 ? { path: defaultPath, paths } : { path: defaultPath }
}

// Builds the three fields that make up one credential input: the mode toggle,
// the inline value, and the existing-secret reference. `base` is the path of
// the secret object in the chart, e.g. 'global.elasticsearch.auth.secret'.
//
// `overrides` handles a release whose chart puts the same credential at a
// different path, or offers fewer of the three options at all — Camunda 8.7
// predates the `<base>.secret.{inlineSecret,existingSecret,existingSecretKey}`
// convention entirely. Each entry is keyed by release, e.g.:
//
//   { '8.7': { inline: 'global.elasticsearch.auth.password', existingSecret: null, existingSecretKey: null } }
//
// An explicit `null` means that release's chart has no such option at all —
// not a typo. When existingSecret is null for the selected release, the mode
// toggle and its two sub-fields disappear entirely and the inline field shows
// unconditionally, rather than letting a user pick "Existing secret" and
// silently write nothing.
function secretFields(idPrefix, base, label, { required = false, overrides = {} } = {}) {
  const modeId = `${idPrefix}_secret_mode`
  const mode = (answers) => answers[modeId] || INLINE

  const inlineField = {
    id: idPrefix,
    ...secretPath('inline', `${base}.inlineSecret`, overrides),
    label,
    type: 'password',
    required,
  }
  const existingSecretField = {
    id: `${idPrefix}_existing_secret`,
    ...secretPath('existingSecret', `${base}.existingSecret`, overrides),
    label: 'Existing secret name',
    type: 'text',
    required,
  }
  const existingSecretKeyField = {
    id: `${idPrefix}_existing_secret_key`,
    ...secretPath('existingSecretKey', `${base}.existingSecretKey`, overrides),
    label: 'Key within the secret',
    type: 'text',
    required,
  }

  // A field with a `paths` override resolving to null for the current release
  // has no chart equivalent there at all.
  const isAvailable = (field) => (answers) =>
    resolveFieldPath(field, answers.chartVersion) !== null

  const existingSecretOffered = isAvailable(existingSecretField)

  inlineField.showIf = (answers) =>
    isAvailable(inlineField)(answers) && (mode(answers) === INLINE || !existingSecretOffered(answers))
  existingSecretField.showIf = (answers) => existingSecretOffered(answers) && mode(answers) === EXISTING
  existingSecretKeyField.showIf = existingSecretField.showIf

  return [
    {
      id: modeId,
      path: null,
      label: `${label} source`,
      type: 'radio',
      options: SECRET_MODES,
      required: false,
      showIf: existingSecretOffered,
    },
    inlineField,
    existingSecretField,
    existingSecretKeyField,
  ]
}

export const displayConfig = {

  // ─── Products ───────────────────────────────────────────────────────────────
  products: [
    { id: 'orchestration', label: 'Orchestration Cluster' },
    { id: 'optimize',      label: 'Optimize' },
    { id: 'identity',      label: 'Management Identity' },
    { id: 'webModeler',    label: 'Web Modeler' },
    { id: 'connectors',    label: 'Connectors' },
    { id: 'console',       label: 'Console' },
  ],

  // ─── Sections ───────────────────────────────────────────────────────────────
  // Each section has:
  //   id        — unique identifier
  //   title     — displayed in the UI
  //   showIf    — function that takes answers and returns true/false
  //   fields    — list of fields to render in this section
  //
  // Each field has:
  //   id        — unique identifier, used to store the answer
  //   path      — dot-notation path in the Helm values YAML (null for UI-only fields)
  //   label     — displayed in the UI
  //   type      — text | password | radio | checkbox | env_vars
  //   options   — (radio only) list of options
  //   required  — whether the field must be filled before generating
  //   showIf    — optional; hides the field within an otherwise visible section

  sections: [

    // ── OpenShift ──────────────────────────────────────────────────────────────
    // Shown when any product is selected.
    // OpenShift enforces stricter security contexts — selecting this sets
    // adaptSecurityContext: force on all components and sub-charts automatically.
    {
      id: 'openshiftCluster',
      title: 'OpenShift',
      showIf: (answers) => answers.products.length > 0,
      fields: [
        {
          id: 'isOpenShift',
          path: null,
          label: 'Deploying on OpenShift',
          type: 'checkbox',
          required: false,
        }
      ]
    },

    // ── AWS EKS ────────────────────────────────────────────────────────────────
    // Only shown when OpenSearch is selected as the database type.
    // AWS EKS supports IRSA (IAM Roles for Service Accounts) for OpenSearch
    // authentication — this sets global.opensearch.aws.enabled automatically.
    {
      id: 'awsEksCluster',
      title: 'AWS EKS',
      showIf: (answers) =>
        (answers.products.includes('orchestration') || answers.products.includes('optimize')) &&
        answers.databaseType === 'opensearch',
      fields: [
        {
          id: 'isAwsEks',
          path: null,
          label: 'Deploying on AWS EKS',
          type: 'checkbox',
          required: false,
        }
      ]
    },

    // ── Database Type ──────────────────────────────────────────────────────────
    // Only shown if orchestration or optimize is selected
    {
      id: 'databaseType',
      title: 'Database Type',
      showIf: (answers) =>
        answers.products.includes('orchestration') ||
        answers.products.includes('optimize'),
      fields: [
        {
          // 'rdbms' is Orchestration Cluster's secondary storage only — Optimize
          // always needs Elasticsearch or OpenSearch regardless (the chart has
          // no RDBMS option for Optimize's own analytics store at all), and
          // rdbms requires Camunda 8.9+. Both are chart rules, not something a
          // showIf can express cleanly, so they are checked as constraints
          // instead of removing the option outright.
          id: 'databaseType',
          path: null,
          label: 'Select Database Type',
          type: 'radio',
          options: ['elasticsearch', 'opensearch', 'rdbms'],
          required: true,
        }
      ]
    },

    // ── RDBMS (Orchestration Cluster secondary storage) ─────────────────────────
    // A relational database instead of Elasticsearch/OpenSearch for the
    // Orchestration Cluster's own history/search storage. Introduced in
    // Camunda 8.9 - see docs.camunda.io/docs/self-managed/concepts/databases/relational-db/.
    // Optimize is never wired to this section; it has no RDBMS option.
    {
      id: 'rdbmsDatabase',
      title: 'RDBMS Configuration',
      showIf: (answers) =>
        answers.products.includes('orchestration') && answers.databaseType === 'rdbms',
      fields: [
        { id: 'rdbms_url',      path: 'orchestration.data.secondaryStorage.rdbms.url',      label: 'JDBC URL',  type: 'text', required: true,
          placeholder: 'jdbc:postgresql://host:5432/camunda' },
        { id: 'rdbms_username', path: 'orchestration.data.secondaryStorage.rdbms.username', label: 'Username',  type: 'text', required: true },
        { id: 'rdbms_aws_irsa', path: 'orchestration.data.secondaryStorage.rdbms.aws.enabled', label: 'Authenticate with AWS IAM (Aurora IRSA) instead of a password', type: 'checkbox', required: false },
        ...secretFields('rdbms_password', 'orchestration.data.secondaryStorage.rdbms.secret', 'Password', { required: true })
          .map((f) => ({ ...f, showIf: (a) => !a.rdbms_aws_irsa && (f.showIf ? f.showIf(a) : true) })),
      ]
    },

    // ── Shared Elasticsearch ───────────────────────────────────────────────────
    // Shown when BOTH orchestration AND optimize are selected with elasticsearch
    {
      id: 'sharedElasticsearch',
      title: 'Shared Elasticsearch Configuration',
      showIf: (answers) =>
        answers.products.includes('orchestration') &&
        answers.products.includes('optimize') &&
        answers.databaseType === 'elasticsearch',
      fields: [
        { id: 'es_username', path: 'global.elasticsearch.auth.username',            label: 'Username',   type: 'text',     required: true  },
        ...secretFields('es_password', 'global.elasticsearch.auth.secret', 'Password', {
          required: true,
          overrides: { '8.7': { inline: 'global.elasticsearch.auth.password', existingSecret: null, existingSecretKey: null } },
        }),
        { id: 'es_protocol', path: 'global.elasticsearch.url.protocol',             label: 'Protocol',   type: 'radio',    required: true, options: ['http', 'https'] },
        { id: 'es_host',     path: 'global.elasticsearch.url.host',                 label: 'Host',       type: 'text',     required: true  },
        { id: 'es_port',     path: 'global.elasticsearch.url.port',                 label: 'Port',       type: 'text',     required: true  },
        { id: 'es_tls',      path: 'global.elasticsearch.tls.enabled',              label: 'Enable TLS', type: 'checkbox', required: false },
      ]
    },

    // ── Shared OpenSearch ──────────────────────────────────────────────────────
    // Shown when BOTH orchestration AND optimize are selected with opensearch
    {
      id: 'sharedOpensearch',
      title: 'Shared OpenSearch Configuration',
      showIf: (answers) =>
        answers.products.includes('orchestration') &&
        answers.products.includes('optimize') &&
        answers.databaseType === 'opensearch',
      fields: [
        { id: 'os_username', path: 'global.opensearch.auth.username',            label: 'Username',   type: 'text',     required: true  },
        ...secretFields('os_password', 'global.opensearch.auth.secret', 'Password', {
          required: true,
          overrides: { '8.7': { inline: 'global.opensearch.auth.password', existingSecret: null, existingSecretKey: null } },
        }),
        { id: 'os_protocol', path: 'global.opensearch.url.protocol',             label: 'Protocol',   type: 'radio',    required: true, options: ['http', 'https'] },
        { id: 'os_host',     path: 'global.opensearch.url.host',                 label: 'Host',       type: 'text',     required: true  },
        { id: 'os_port',     path: 'global.opensearch.url.port',                 label: 'Port',       type: 'text',     required: true  },
        { id: 'os_tls',      path: 'global.opensearch.tls.enabled',              label: 'Enable TLS', type: 'checkbox', required: false },
      ]
    },

    // ── Standalone Elasticsearch ───────────────────────────────────────────────
    // Shown when ONLY orchestration OR ONLY optimize is selected with elasticsearch
    {
      id: 'standaloneElasticsearch',
      title: 'Elasticsearch Configuration',
      // !== acts as XOR — true only when exactly one of orchestration/optimize is selected
      // (not both, not neither). When both are selected the shared section is shown instead.
      showIf: (answers) =>
        (answers.products.includes('orchestration') !== answers.products.includes('optimize')) &&
        answers.databaseType === 'elasticsearch',
      fields: [
        { id: 'es_username', path: 'global.elasticsearch.auth.username',            label: 'Username',   type: 'text',     required: true  },
        ...secretFields('es_password', 'global.elasticsearch.auth.secret', 'Password', {
          required: true,
          overrides: { '8.7': { inline: 'global.elasticsearch.auth.password', existingSecret: null, existingSecretKey: null } },
        }),
        { id: 'es_protocol', path: 'global.elasticsearch.url.protocol',             label: 'Protocol',   type: 'radio',    required: true, options: ['http', 'https'] },
        { id: 'es_host',     path: 'global.elasticsearch.url.host',                 label: 'Host',       type: 'text',     required: true  },
        { id: 'es_port',     path: 'global.elasticsearch.url.port',                 label: 'Port',       type: 'text',     required: true  },
        { id: 'es_tls',      path: 'global.elasticsearch.tls.enabled',              label: 'Enable TLS', type: 'checkbox', required: false },
      ]
    },

    // ── Standalone OpenSearch ──────────────────────────────────────────────────
    // Shown when ONLY orchestration OR ONLY optimize is selected with opensearch
    {
      id: 'standaloneOpensearch',
      title: 'OpenSearch Configuration',
      // !== acts as XOR — true only when exactly one of orchestration/optimize is selected
      // (not both, not neither). When both are selected the shared section is shown instead.
      showIf: (answers) =>
        (answers.products.includes('orchestration') !== answers.products.includes('optimize')) &&
        answers.databaseType === 'opensearch',
      fields: [
        { id: 'os_username', path: 'global.opensearch.auth.username',            label: 'Username',   type: 'text',     required: true  },
        ...secretFields('os_password', 'global.opensearch.auth.secret', 'Password', {
          required: true,
          overrides: { '8.7': { inline: 'global.opensearch.auth.password', existingSecret: null, existingSecretKey: null } },
        }),
        { id: 'os_protocol', path: 'global.opensearch.url.protocol',             label: 'Protocol',   type: 'radio',    required: true, options: ['http', 'https'] },
        { id: 'os_host',     path: 'global.opensearch.url.host',                 label: 'Host',       type: 'text',     required: true  },
        { id: 'os_port',     path: 'global.opensearch.url.port',                 label: 'Port',       type: 'text',     required: true  },
        { id: 'os_tls',      path: 'global.opensearch.tls.enabled',              label: 'Enable TLS', type: 'checkbox', required: false },
      ]
    },

    // ── TLS trust ──────────────────────────────────────────────────────────────
    //
    // An external Elasticsearch or OpenSearch fronted by a private or corporate
    // CA is not trusted by the pods' default trust store, and the connection
    // fails at runtime with a certificate error that says nothing about the
    // cause. The chart mounts this PEM bundle and converts it to a PKCS12
    // truststore at pod start.
    //
    // This replaces the per-component JKS truststore options, which the chart
    // now emits a deprecation warning for.
    {
      id: 'tlsTrust',
      title: 'TLS Trust (private CA)',
      showIf: (answers) => answers.es_tls === true || answers.os_tls === true,
      fields: [
        {
          id: 'ca_bundle_secret',
          path: 'global.tls.caBundle.secret.existingSecret',
          label: 'Secret holding the CA certificate bundle',
          type: 'text',
          required: false,
          placeholder: 'camunda-ca-bundle',
        },
        {
          id: 'ca_bundle_secret_key',
          path: 'global.tls.caBundle.secret.existingSecretKey',
          label: 'Key within the secret',
          type: 'text',
          required: false,
          placeholder: 'ca.crt',
        },
      ]
    },

    // ── Management Identity Database ───────────────────────────────────────────
    {
      id: 'identityDatabase',
      title: 'Management Identity Database',
      showIf: (answers) => answers.products.includes('identity'),
      fields: [
        { id: 'identity_db_host',     path: 'identity.externalDatabase.host',                label: 'Host',          type: 'text',     required: true  },
        { id: 'identity_db_port',     path: 'identity.externalDatabase.port',                label: 'Port',          type: 'text',     required: true  },
        { id: 'identity_db_username', path: 'identity.externalDatabase.username',            label: 'Username',      type: 'text',     required: true  },
        ...secretFields('identity_db_password', 'identity.externalDatabase.secret', 'Password', {
          required: true,
          overrides: {
            '8.7': {
              inline: 'identity.externalDatabase.password',
              existingSecret: 'identity.externalDatabase.existingSecret',
              existingSecretKey: 'identity.externalDatabase.existingSecretPasswordKey',
            },
          },
        }),
        { id: 'identity_db_name',     path: 'identity.externalDatabase.database',            label: 'Database Name', type: 'text',     required: true  },
      ]
    },

    // ── Web Modeler Database ───────────────────────────────────────────────────
    {
      id: 'webModelerDatabase',
      title: 'Web Modeler Database',
      showIf: (answers) => answers.products.includes('webModeler'),
      fields: [
        { id: 'wm_db_host',     path: 'webModeler.restapi.externalDatabase.host',                  label: 'Host',          type: 'text',     required: true  },
        { id: 'wm_db_port',     path: 'webModeler.restapi.externalDatabase.port',                  label: 'Port',          type: 'text',     required: true  },
        { id: 'wm_db_user',     path: 'webModeler.restapi.externalDatabase.user',                  label: 'Username',      type: 'text',     required: true  },
        ...secretFields('wm_db_password', 'webModeler.restapi.externalDatabase.secret', 'Password', {
          required: true,
          overrides: {
            '8.7': { inline: 'webModeler.restapi.externalDatabase.password', existingSecret: null, existingSecretKey: null },
          },
        }),
        { id: 'wm_db_name',     path: 'webModeler.restapi.externalDatabase.database',              label: 'Database Name', type: 'text',     required: true  },
      ]
    },

    // ── Enterprise License ─────────────────────────────────────────────────────
    // Self-managed installations run in trial mode without a license key.
    {
      id: 'license',
      title: 'Enterprise License',
      showIf: (answers) => answers.products.length > 0,
      fields: secretFields('license', 'global.license.secret', 'License key', {
        overrides: {
          '8.7': {
            inline: 'global.license.key',
            existingSecret: 'global.license.existingSecret',
            existingSecretKey: 'global.license.existingSecretKey',
          },
        },
      }),
    },

    // ── Web Modeler SMTP ───────────────────────────────────────────────────────
    // fromAddress is mandatory: the chart calls `required` on it and refuses to
    // render the Web Modeler configmap without it. Omitting this section is why
    // a generated file with Web Modeler selected used to fail `helm install`.
    {
      id: 'webModelerMail',
      title: 'Web Modeler Email (SMTP)',
      showIf: (answers) => answers.products.includes('webModeler'),
      fields: [
        { id: 'wm_mail_from_address', path: 'webModeler.restapi.mail.fromAddress',    label: 'From address',      type: 'text',     required: true  },
        { id: 'wm_mail_from_name',    path: 'webModeler.restapi.mail.fromName',       label: 'From name',         type: 'text',     required: false },
        { id: 'wm_smtp_host',         path: 'webModeler.restapi.mail.smtpHost',       label: 'SMTP host',         type: 'text',     required: false },
        { id: 'wm_smtp_port',         path: 'webModeler.restapi.mail.smtpPort',       label: 'SMTP port',         type: 'text',     required: false },
        { id: 'wm_smtp_user',         path: 'webModeler.restapi.mail.smtpUser',       label: 'SMTP username',     type: 'text',     required: false },
        { id: 'wm_smtp_tls',          path: 'webModeler.restapi.mail.smtpTlsEnabled', label: 'Enforce STARTTLS',  type: 'checkbox', required: false },
        ...secretFields('wm_smtp_password', 'webModeler.restapi.mail.secret', 'SMTP password', {
          overrides: {
            '8.7': { inline: 'webModeler.restapi.mail.smtpPassword', existingSecret: null, existingSecretKey: null },
          },
        }),
      ]
    },

    // ── Authentication ─────────────────────────────────────────────────────────
    // The chart ships with basic auth. Anything beyond a trial cluster uses an
    // external OIDC provider instead.
    {
      id: 'authentication',
      title: 'Authentication',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        {
          id: 'auth_method',
          path: 'global.security.authentication.method',
          label: 'Authentication method',
          type: 'radio',
          options: ['basic', 'oidc'],
          required: false,
        },
      ]
    },

    // ── OIDC ───────────────────────────────────────────────────────────────────
    {
      id: 'oidc',
      title: 'OIDC Provider',
      showIf: (answers) =>
        answers.products.includes('orchestration') && answers.auth_method === 'oidc',
      fields: [
        { id: 'oidc_type',           path: 'orchestration.security.authentication.oidc.type',          label: 'Provider type',   type: 'radio', options: ['KEYCLOAK', 'ENTRA', 'GENERIC'], required: true },
        { id: 'oidc_issuer',         path: 'orchestration.security.authentication.oidc.issuer',        label: 'Issuer URL',      type: 'text', required: true  },
        { id: 'oidc_client_id',      path: 'orchestration.security.authentication.oidc.clientId',      label: 'Client ID',       type: 'text', required: true  },
        { id: 'oidc_audience',       path: 'orchestration.security.authentication.oidc.audience',      label: 'Audience',        type: 'text', required: false },
        { id: 'oidc_redirect_url',   path: 'orchestration.security.authentication.oidc.redirectUrl',   label: 'Redirect URL',    type: 'text', required: false },
        { id: 'oidc_username_claim', path: 'orchestration.security.authentication.oidc.usernameClaim', label: 'Username claim',  type: 'text', required: false },
        { id: 'oidc_groups_claim',   path: 'orchestration.security.authentication.oidc.groupsClaim',   label: 'Groups claim',    type: 'text', required: false },
        ...secretFields('oidc_client_secret', 'orchestration.security.authentication.oidc.secret', 'Client secret', { required: true }),
      ]
    },

    // ── Cluster Sizing ─────────────────────────────────────────────────────────
    // Chart defaults are 3 brokers / 3 partitions, which the published Camunda
    // benchmark saturates at roughly 240 process instances per second. Sizing
    // beyond that means changing partition count, which cannot be done by
    // editing values.yaml after go-live without a cluster scaling procedure —
    // so it is worth getting right at install time. See src/sizing.js.
    {
      id: 'sizing',
      title: 'Cluster Sizing',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        {
          id: 'sizing_mode',
          path: null,
          label: 'How should the cluster be sized?',
          type: 'radio',
          options: ['Chart defaults', 'Throughput target', 'Manual'],
          required: false,
        },
        {
          id: 'target_pi_per_second',
          path: null,
          label: 'Target process instances per second',
          type: 'text',
          required: true,
          showIf: (answers) => answers.sizing_mode === 'Throughput target',
        },
        {
          id: 'tasks_per_instance',
          path: null,
          label: 'Tasks per process instance (Camunda suggests 10 if unknown)',
          type: 'text',
          required: false,
          showIf: (answers) => answers.sizing_mode === 'Throughput target',
        },
        {
          id: 'sizing_calibration',
          path: null,
          label: 'Calibration',
          type: 'radio',
          options: ['conservative', 'balanced', 'optimistic'],
          required: false,
          showIf: (answers) => answers.sizing_mode === 'Throughput target',
        },
        {
          id: 'vcpu_per_broker',
          path: null,
          label: 'vCPU per broker',
          type: 'text',
          required: false,
          placeholder: '8',
          showIf: (answers) => answers.sizing_mode === 'Throughput target',
        },
        // Manual mode writes these paths directly. Throughput mode computes them
        // in transform.js and ignores whatever is typed here.
        // Camunda 8.8 merged Zeebe into "Orchestration Cluster"; 8.7's chart still
        // calls the broker component "zeebe" and these settings live there.
        { id: 'cluster_size',       path: 'orchestration.clusterSize',       paths: { '8.7': 'zeebe.clusterSize' },       label: 'Broker count (clusterSize)', type: 'text', required: true, showIf: (answers) => answers.sizing_mode === 'Manual' },
        { id: 'partition_count',    path: 'orchestration.partitionCount',    paths: { '8.7': 'zeebe.partitionCount' },    label: 'Partition count',            type: 'text', required: true, showIf: (answers) => answers.sizing_mode === 'Manual' },
        { id: 'replication_factor', path: 'orchestration.replicationFactor', paths: { '8.7': 'zeebe.replicationFactor' }, label: 'Replication factor',         type: 'text', required: true, showIf: (answers) => answers.sizing_mode === 'Manual' },
        { id: 'pvc_size',           path: 'orchestration.pvcSize',           paths: { '8.7': 'zeebe.pvcSize' },           label: 'Disk per broker',            type: 'text', required: false, showIf: (answers) => answers.sizing_mode === 'Manual' },
        { id: 'storage_class',      path: 'orchestration.pvcStorageClassName', paths: { '8.7': 'zeebe.pvcStorageClassName' }, label: 'Storage class',            type: 'text', required: false, showIf: (answers) => answers.sizing_mode !== 'Chart defaults' },
        { id: 'cpu_request',        path: 'orchestration.resources.requests.cpu',    paths: { '8.7': 'zeebe.resources.requests.cpu' },    label: 'CPU request',    type: 'text', required: false, showIf: (answers) => answers.sizing_mode === 'Manual' },
        { id: 'cpu_limit',          path: 'orchestration.resources.limits.cpu',      paths: { '8.7': 'zeebe.resources.limits.cpu' },      label: 'CPU limit',      type: 'text', required: false, showIf: (answers) => answers.sizing_mode === 'Manual' },
        { id: 'memory_request',     path: 'orchestration.resources.requests.memory', paths: { '8.7': 'zeebe.resources.requests.memory' }, label: 'Memory request', type: 'text', required: false, showIf: (answers) => answers.sizing_mode === 'Manual' },
        { id: 'memory_limit',       path: 'orchestration.resources.limits.memory',   paths: { '8.7': 'zeebe.resources.limits.memory' },   label: 'Memory limit',   type: 'text', required: false, showIf: (answers) => answers.sizing_mode === 'Manual' },
      ]
    },

    // ── Multi-region ───────────────────────────────────────────────────────────
    // A dual-region cluster is one logical Zeebe cluster stretched across two
    // Kubernetes clusters. Each region is installed from its own values.yaml
    // that differs only in regionId, so generate this file once per region.
    //
    // The chart cannot compute initial contact points itself in this mode (it
    // says so in orchestration/files/_application.yaml) because it has no way to
    // know the other region's namespace. transform.js builds the full broker
    // list from the namespaces given below.
    {
      id: 'multiRegion',
      title: 'Multi-region',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        {
          id: 'multiregion_enabled',
          path: null,
          label: 'Stretch this cluster across multiple regions',
          type: 'checkbox',
          required: false,
        },
      ]
    },

    {
      id: 'multiRegionConfig',
      title: 'Multi-region Configuration',
      showIf: (answers) =>
        answers.products.includes('orchestration') && answers.multiregion_enabled === true,
      fields: [
        {
          id: 'multiregion_region_id',
          // Written by transform.js, not mapped directly: the chart's JSON
          // schema types regionId as a number and radio answers are strings.
          path: null,
          label: 'Region ID of THIS installation (0-based)',
          type: 'radio',
          options: ['0', '1'],
          required: true,
        },
        {
          id: 'multiregion_namespaces',
          path: null,
          label: 'Namespace per region, in region order',
          type: 'string_list',
          required: true,
          placeholder: 'camunda-region-0',
        },
        {
          id: 'multiregion_release_name',
          path: null,
          label: 'Helm release name (used to build broker DNS names)',
          type: 'text',
          required: true,
          placeholder: 'camunda',
        },
        {
          id: 'multiregion_cluster_domain',
          path: null,
          label: 'Kubernetes cluster domain',
          type: 'text',
          required: false,
          placeholder: 'cluster.local',
        },
      ]
    },

    // ── Document Store ─────────────────────────────────────────────────────────
    // Documents uploaded through forms need somewhere to live. The default is
    // in-memory, which loses every document on pod restart — fine for a trial,
    // never for production.
    {
      id: 'documentStore',
      title: 'Document Store',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        {
          id: 'document_store_type',
          path: null,
          label: 'Where should uploaded documents be stored?',
          type: 'radio',
          options: ['In-memory', 'AWS S3', 'GCP Cloud Storage'],
          required: false,
        },
        { id: 'doc_aws_bucket',     path: 'global.documentStore.type.aws.bucket',      label: 'S3 bucket',       type: 'text',     required: true,  showIf: (a) => a.document_store_type === 'AWS S3' },
        { id: 'doc_aws_region',     path: 'global.documentStore.type.aws.region',      label: 'AWS region',      type: 'text',     required: true,  showIf: (a) => a.document_store_type === 'AWS S3' },
        { id: 'doc_aws_path',       path: 'global.documentStore.type.aws.bucketPath',  label: 'Path prefix',     type: 'text',     required: false, showIf: (a) => a.document_store_type === 'AWS S3' },
        { id: 'doc_aws_irsa',       path: 'global.documentStore.type.aws.irsa.enabled', label: 'Authenticate with IRSA instead of keys', type: 'checkbox', required: false, showIf: (a) => a.document_store_type === 'AWS S3' },
        ...secretFields('doc_aws_access_key', 'global.documentStore.type.aws.accessKeyId.secret', 'AWS access key ID', {
          overrides: { '8.7': { inline: null, existingSecret: null, existingSecretKey: null } },
        }).map((f) => ({ ...f, showIf: (a) => a.document_store_type === 'AWS S3' && !a.doc_aws_irsa && (f.showIf ? f.showIf(a) : true) })),
        ...secretFields('doc_aws_secret_key', 'global.documentStore.type.aws.secretAccessKey.secret', 'AWS secret access key', {
          overrides: { '8.7': { inline: null, existingSecret: null, existingSecretKey: null } },
        }).map((f) => ({ ...f, showIf: (a) => a.document_store_type === 'AWS S3' && !a.doc_aws_irsa && (f.showIf ? f.showIf(a) : true) })),
        { id: 'doc_gcp_bucket',        path: 'global.documentStore.type.gcp.bucket',                label: 'GCS bucket',                type: 'text', required: true,  showIf: (a) => a.document_store_type === 'GCP Cloud Storage' },
        {
          id: 'doc_gcp_secret', path: 'global.documentStore.type.gcp.secret.existingSecret',
          paths: { '8.7': 'global.documentStore.type.gcp.existingSecret' },
          label: 'Service account secret name', type: 'text', required: true,
          showIf: (a) => a.document_store_type === 'GCP Cloud Storage',
        },
        {
          id: 'doc_gcp_secret_key', path: 'global.documentStore.type.gcp.secret.existingSecretKey',
          paths: { '8.7': 'global.documentStore.type.gcp.credentialsKey' },
          label: 'Key within the secret', type: 'text', required: false,
          showIf: (a) => a.document_store_type === 'GCP Cloud Storage',
        },
      ]
    },

    // ── Global Ingress ─────────────────────────────────────────────────────────
    // Toggle shown when any product is selected.
    // global.ingress covers all web UI components automatically.
    {
      id: 'globalIngress',
      title: 'Ingress',
      showIf: (answers) => answers.products.length > 0,
      fields: [
        { id: 'ingress_enabled', path: 'global.ingress.enabled', label: 'Enable Ingress', type: 'checkbox', required: false },
      ]
    },

    // ── Global Ingress Configuration ───────────────────────────────────────────
    // Only shown when ingress is enabled
    {
      id: 'globalIngressConfig',
      title: 'Ingress Configuration',
      showIf: (answers) => answers.products.length > 0 && answers.ingress_enabled === true,
      fields: [
        { id: 'ingress_class',       path: 'global.ingress.className',   label: 'Ingress Class', type: 'text',     required: false },
        { id: 'ingress_host',        path: 'global.ingress.host',        label: 'Host',          type: 'text',     required: false },
        { id: 'ingress_tls_enabled', path: 'global.ingress.tls.enabled', label: 'Enable TLS',    type: 'checkbox', required: false },
      ]
    },

    // ── Global Ingress TLS Configuration ──────────────────────────────────────
    // Only shown when ingress TLS is enabled
    {
      id: 'globalIngressTls',
      title: 'Ingress TLS Configuration',
      showIf: (answers) => answers.ingress_enabled === true && answers.ingress_tls_enabled === true,
      fields: [
        { id: 'ingress_tls_secret', path: 'global.ingress.tls.secretName', label: 'TLS Secret Name', type: 'text', required: false },
      ]
    },

    // ── Orchestration gRPC Ingress ─────────────────────────────────────────────
    // Toggle shown when orchestration is selected.
    // gRPC ingress is separate from global ingress because it requires different
    // nginx annotations (backend-protocol: GRPC) for Zeebe client connections.
    {
      id: 'grpcIngress',
      title: 'Orchestration gRPC Ingress',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        { id: 'grpc_enabled', path: 'orchestration.ingress.grpc.enabled', paths: { '8.7': 'zeebeGateway.ingress.grpc.enabled' }, label: 'Enable gRPC Ingress', type: 'checkbox', required: false },
      ]
    },

    // ── Orchestration gRPC Ingress Configuration ───────────────────────────────
    // Only shown when gRPC ingress is enabled
    {
      id: 'grpcIngressConfig',
      title: 'Orchestration gRPC Ingress Configuration',
      showIf: (answers) => answers.products.includes('orchestration') && answers.grpc_enabled === true,
      fields: [
        { id: 'grpc_class',       path: 'orchestration.ingress.grpc.className',   paths: { '8.7': 'zeebeGateway.ingress.grpc.className' },   label: 'Ingress Class', type: 'text',     required: false },
        { id: 'grpc_host',        path: 'orchestration.ingress.grpc.host',         paths: { '8.7': 'zeebeGateway.ingress.grpc.host' },         label: 'Host',          type: 'text',     required: false },
        { id: 'grpc_tls_enabled', path: 'orchestration.ingress.grpc.tls.enabled',  paths: { '8.7': 'zeebeGateway.ingress.grpc.tls.enabled' },  label: 'Enable TLS',    type: 'checkbox', required: false },
      ]
    },

    // ── Orchestration gRPC Ingress TLS Configuration ───────────────────────────
    // Only shown when gRPC ingress TLS is enabled
    {
      id: 'grpcIngressTls',
      title: 'Orchestration gRPC Ingress TLS Configuration',
      showIf: (answers) => answers.products.includes('orchestration') && answers.grpc_enabled === true && answers.grpc_tls_enabled === true,
      fields: [
        { id: 'grpc_tls_secret', path: 'orchestration.ingress.grpc.tls.secretName', paths: { '8.7': 'zeebeGateway.ingress.grpc.tls.secretName' }, label: 'TLS Secret Name', type: 'text', required: false },
      ]
    },

    // ── Orchestration Environment Variables ────────────────────────────────────
    {
      id: 'orchestrationEnv',
      title: 'Orchestration Cluster Environment Variables',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        // 'orchestration.env' does not exist on 8.7 (see the three sections
        // below), so this field is hidden there automatically — no version
        // check needed here.
        { id: 'orchestration_env', path: 'orchestration.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    // ── Zeebe / Operate / Tasklist Environment Variables (8.7 only) ─────────────
    // Camunda 8.8 merged these into one Orchestration Cluster with one shared
    // env array. 8.7's chart still runs them as three separate components,
    // each with its own env vars — writing one input to all three would put a
    // Zeebe-specific variable in front of Operate and Tasklist too, which is
    // wrong, not just imprecise. Each field's single-version path means the
    // section above and these three are mutually exclusive automatically.
    {
      id: 'zeebeEnv',
      title: 'Zeebe Environment Variables',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        { id: 'zeebe_env', path: 'zeebe.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },
    {
      id: 'operateEnv',
      title: 'Operate Environment Variables',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        { id: 'operate_env', path: 'operate.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },
    {
      id: 'tasklistEnv',
      title: 'Tasklist Environment Variables',
      showIf: (answers) => answers.products.includes('orchestration'),
      fields: [
        { id: 'tasklist_env', path: 'tasklist.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    // ── Optimize Environment Variables ─────────────────────────────────────────
    {
      id: 'optimizeEnv',
      title: 'Optimize Environment Variables',
      showIf: (answers) => answers.products.includes('optimize'),
      fields: [
        { id: 'optimize_env', path: 'optimize.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    // ── Identity Environment Variables ─────────────────────────────────────────
    {
      id: 'identityEnv',
      title: 'Management Identity Environment Variables',
      showIf: (answers) => answers.products.includes('identity'),
      fields: [
        { id: 'identity_env', path: 'identity.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    // ── Web Modeler Environment Variables ──────────────────────────────────────
    // webModeler exposes env vars on two sub-components: restapi is the backend,
    // websockets handles live updates. The separate `webapp` sub-chart was folded
    // into restapi upstream, so webModeler.webapp.env no longer exists.
    {
      id: 'webModelerRestapiEnv',
      title: 'Web Modeler REST API Environment Variables',
      showIf: (answers) => answers.products.includes('webModeler'),
      fields: [
        { id: 'webModeler_restapi_env', path: 'webModeler.restapi.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    {
      id: 'webModelerWebsocketsEnv',
      title: 'Web Modeler WebSockets Environment Variables',
      showIf: (answers) => answers.products.includes('webModeler'),
      fields: [
        { id: 'webModeler_websockets_env', path: 'webModeler.websockets.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    // ── Connectors Environment Variables ───────────────────────────────────────
    {
      id: 'connectorsEnv',
      title: 'Connectors Environment Variables',
      showIf: (answers) => answers.products.includes('connectors'),
      fields: [
        { id: 'connectors_env', path: 'connectors.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    // ── Console Environment Variables ──────────────────────────────────────────
    {
      id: 'consoleEnv',
      title: 'Console Environment Variables',
      showIf: (answers) => answers.products.includes('console'),
      fields: [
        { id: 'console_env', path: 'console.env', label: 'Environment Variables', type: 'env_vars', required: false }
      ]
    },

    ],

  // ─── Constraints ────────────────────────────────────────────────────────────
  //
  // Rules the chart enforces at template time, checked here so the user sees
  // the problem in the form rather than in a failed `helm install`. Each entry
  // returns true when the configuration is INVALID.
  //
  // Keep these in sync with templates/common/constraints.tpl in the chart.

  constraints: [
    {
      id: 'rdbmsRequires89',
      message: 'RDBMS secondary storage requires Camunda 8.9 or newer. Select 8.9 in the header, or choose Elasticsearch/OpenSearch instead.',
      violated: (answers) =>
        answers.databaseType === 'rdbms' && !!answers.chartVersion && answers.chartVersion !== '8.9',
    },
    {
      id: 'rdbmsIncompatibleWithOptimize',
      message: 'Optimize has no RDBMS option — it always needs Elasticsearch or OpenSearch. Deselect Optimize, or choose Elasticsearch/OpenSearch as the database type.',
      violated: (answers) =>
        answers.databaseType === 'rdbms' && answers.products.includes('optimize'),
    },
    {
      id: 'consoleNeedsIdentity',
      message: 'Console requires Management Identity. Select Identity as well, or point Console at an external Identity instance.',
      violated: (answers) =>
        answers.products.includes('console') && !answers.products.includes('identity'),
    },
    {
      id: 'webModelerNeedsIdentity',
      message: 'Web Modeler requires Management Identity. Select Identity as well, or point Web Modeler at an external Identity instance.',
      violated: (answers) =>
        answers.products.includes('webModeler') && !answers.products.includes('identity'),
    },
    {
      id: 'multiregionNamespaceCount',
      message: 'Give one namespace per region — a dual-region cluster needs exactly two.',
      violated: (answers) =>
        answers.multiregion_enabled === true &&
        (answers.multiregion_namespaces || []).filter(Boolean).length < 2,
    },
    {
      id: 'multiregionRegionIdInRange',
      message: 'Region ID must identify one of the namespaces listed above.',
      violated: (answers) => {
        if (answers.multiregion_enabled !== true) return false
        const namespaces = (answers.multiregion_namespaces || []).filter(Boolean)
        if (namespaces.length === 0) return false
        return Number(answers.multiregion_region_id) >= namespaces.length
      },
    },
    {
      // Only reachable in manual mode: every other path rounds the broker count
      // up to a multiple of the region count automatically. Left in place so a
      // hand-entered odd number is rejected rather than silently corrected.
      id: 'multiregionEvenClusterSize',
      message: 'Broker count must divide evenly across the regions — the chart runs clusterSize / regions brokers in each.',
      violated: (answers) => {
        if (answers.multiregion_enabled !== true) return false
        if (answers.sizing_mode !== 'Manual') return false
        const regions = (answers.multiregion_namespaces || []).filter(Boolean).length
        const size = Number(answers.cluster_size)
        if (!regions || !Number.isFinite(size) || size === 0) return false
        return size % regions !== 0
      },
    },
    {
      id: 'multiregionNeedsElasticsearch',
      message: 'A multi-region cluster needs an external Elasticsearch or OpenSearch reachable from both regions.',
      violated: (answers) =>
        answers.multiregion_enabled === true && !answers.databaseType,
    },
  ],
}

// ─── Visibility helpers ──────────────────────────────────────────────────────
//
// The UI, the validator and transform.js must agree exactly on what is visible:
// a field the user cannot see must not be required, and must not be written to
// the output. Sharing these two functions is what keeps them in step.

export function visibleSections(answers) {
  return displayConfig.sections.filter((section) => section.showIf(answers))
}

export function isFieldVisible(field, answers) {
  return !field.showIf || field.showIf(answers)
}

export function visibleFields(answers) {
  return visibleSections(answers).flatMap((section) =>
    section.fields
      .filter((field) => isFieldVisible(field, answers))
      .map((field) => ({ section, field })),
  )
}

export function violatedConstraints(answers) {
  return displayConfig.constraints.filter((constraint) => constraint.violated(answers))
}
