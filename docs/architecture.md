# Architecture and developer guide

## The problem this solves

The Camunda Platform 8 Helm chart exposes 984 configurable values. A working
production `values.yaml` needs perhaps forty of them, plus a set of flags that
are not obvious from the chart documentation — disabling the bundled
PostgreSQL when you point Identity at an external database, repeating
`adaptSecurityContext: force` on every sub-chart for OpenShift, or listing every
broker across both regions for a dual-region cluster.

This tool asks for the forty and derives the rest.

## Data flow

```
public/charts/<release>/values.yaml   vendored copy of one published chart
package.json  camundaCharts           which releases are supported
       │
       ▼  npm run parse  (scripts/parseValues.js)
src/schemas/<release>.json            full schema per release, ~1000 entries.
                                      Build-time only — npm run validate.
src/uiSchema.json                     compact: the ~100 paths the form writes,
                                      their descriptions, and which releases
                                      have each. The only one the browser loads.
       │
       ▼
src/displayConfig.js                  which paths the user sees, and when
src/chartVersions.js                  which release the output targets
       │
       ▼
src/App.jsx                           renders the form; holds a flat `answers`
       │                              ◄── src/importValues.js reverses this step
       ▼
src/transform.js                      answers → nested Helm values object
src/sizing.js                         throughput target → cluster topology
       │
       ▼  src/yaml.js
values.yaml
```

Nothing about the form is hardcoded in `App.jsx`. It walks
`displayConfig.sections`, filters by each section's `showIf(answers)`, and
renders a `Field` per entry. Adding a field means editing `displayConfig.js`
only.

### Why two generated schemas

A full chart schema is around 200KB. Importing one per supported release would
grow the bundle every time a Camunda version is added, for data the browser
barely uses — the UI only needs a description per *displayed* path, plus which
releases contain it. `uiSchema.json` is that, at roughly 25KB regardless of how
many releases are supported. The full schemas stay on disk for `npm run
validate`, which runs in Node.

`displayConfig.js` deliberately does **not** import `chartVersions.js`, so that
`scripts/parseValues.js` can import `displayConfig` to build `uiSchema.json`
without a circular dependency. The two concerns are combined by `fieldApplies()`
in `chartVersions.js`, which is what the UI, validation and `transform.js` all
call.

## The four contracts

**1. Every `field.path` must exist in the chart — in every release that shows
it.** A typo does not crash anything: it writes a key the chart ignores, and the
user's deployment quietly behaves nothing like they configured it.
`npm run validate` imports `displayConfig.js` and `transform.js`, collects every
path either can emit (including paths built at runtime by the `secretFields`
helper), and checks them against each release's schema. `path: null` marks a
UI-only field. A path present in only some releases is hidden in the others,
recorded automatically by `npm run parse`.

**2. `field.id` keys the flat `answers` object**, independently of `path`.
`showIf` predicates read `answers` by id. IDs are deliberately reused across
mutually exclusive sections — `es_username` appears in both the shared and
standalone Elasticsearch sections — so input survives when the visible section
swaps.

**3. Hidden means hidden.** A field is invisible if its section's `showIf` is
false *or* its own `showIf` is false. `transform.js`, the UI and the validator
all route through `isFieldVisible` in `displayConfig.js` so they cannot drift.
An invisible field is never required and never reaches the output — which is why
OpenSearch credentials left over from a switch to Elasticsearch do not leak.

**4. Types must match the chart's `values.schema.json`.** `clusterSize`,
`partitionCount` and `replicationFactor` are typed as **strings**; emitting them
as numbers makes `helm` reject the file outright. Ports must be numbers.
`npm run verify:helm` is what catches this.

## transform.js

Five ordered steps:

| Step | What it does |
|---|---|
| `applyProductFlags` | Per-product `enabled`, bundled database toggles, search database selection, OpenShift and EKS flags |
| `applyDerivedValues` | Sizing from a throughput target, document store selection |
| `mapFieldsToHelm` | Visible answers → their declared paths |
| `applyMultiregion` | Region count, region ID, generated initial contact points |
| `cleanObject` | Strips `""`, `null`, `undefined` and empty branches. `false` and `0` survive — which is why explicitly-disabled flags still appear |

`applyProductFlags` holds the implicit chart knowledge. **Adding a product to
`displayConfig.products` also requires adding its `enabled` branch there** — the
two lists are coupled by hand, and a test guards the coupling.

## Supporting several Camunda releases

Camunda supports several minor versions at once, and their charts differ — keys
get renamed, removed, or newly required between releases. A generated file is
only meaningful for one of them, so the target release is part of the form
rather than a property of the build.

Choosing a release changes what is rendered, what is required, and what is
written. `fieldApplies(field, answers)` is the single question all three ask,
and it is false when the section is hidden, the field's own `showIf` is false,
**or** the selected release does not have the path.

Adding a release is data, not code: vendor its `values.yaml`, add an entry to
`camundaCharts`, and run `npm run parse`. Availability per release is derived,
not hand-maintained.

8.8 shares every path the form writes with 8.9, so it cost almost nothing to
add. **8.7 does not** — it predates the 8.8 merge of Zeebe, Zeebe Gateway,
Operate and Tasklist into one "Orchestration Cluster" component, and predates
the `<base>.secret.{inlineSecret,existingSecret,existingSecretKey}` convention
credentials use from 8.8 onward. Supporting it needed a second mechanism
alongside `fieldApplies()`: `src/fieldPaths.js`.

### field.paths — a field whose chart path differs by release

`field.paths` overrides `field.path` for exactly the release keys it lists;
every other release falls through to the default. `resolveFieldPath(field,
version)` is the single place that resolves this, used by the UI, by
`transform.js` when it writes a value, and by `scripts/parseValues.js` and
`scripts/validatePaths.js` when they discover and check paths per release.
It is pure and has no dependency on the generated schemas, so both the browser
and the build-time parser can share it without a circular import.

```js
{ id: 'cluster_size', path: 'orchestration.clusterSize', paths: { '8.7': 'zeebe.clusterSize' }, ... }
```

An explicit `null` in `paths` means the release has no equivalent at all — not
a typo. `secretFields()` uses this for ES/OS authentication: 8.7's chart has no
`existingSecret`/`existingSecretKey` option for it whatsoever, only a
plaintext `auth.password`. When `paths` resolves `existingSecret` to null for
the selected release, the mode toggle and both existing-secret sub-fields
disappear and the inline field renders unconditionally — a user is never
offered a choice that would silently write nothing.

Three concept families needed this, each verified against the real 8.7 chart
rather than assumed:

| Concept | 8.8/8.9 | 8.7 |
|---|---|---|
| Cluster sizing, resources, PVC | `orchestration.*` | `zeebe.*` |
| gRPC ingress | `orchestration.ingress.grpc.*` | `zeebeGateway.ingress.grpc.*` |
| Web Modeler's bundled database | `webModelerPostgresql.*` | `postgresql.*` |
| ES/OS auth secret | `<base>.secret.{inlineSecret,existingSecret,existingSecretKey}` | `<base>.password` only — no existing-secret option |
| Identity DB / license / Web Modeler DB & mail secrets | same as above | flat, and Identity's key is `existingSecretPasswordKey`, not `existingSecretKey` |

**Not remapped, only hidden**, because the shapes do not correspond 1:1:

- **OIDC per-component authentication** — no equivalent exists in 8.7's chart at all.
- **`global.tls.caBundle`** — does not exist in 8.7.
- **AWS S3 document-store credentials** — 8.7 uses one shared secret plus two
  key-name fields (`existingSecret` + `accessKeyIdKey`/`secretAccessKeyKey`);
  8.8+ uses two fully independent secret objects. IRSA still works on 8.7
  since it needs no credentials at all.
- **Web Modeler DB/mail existing-secret mode** — 8.7's chart documents
  `existingSecret` there as accepting a string *or* an object with different
  meaning (a bare string is "treated as a literal password", not a secret
  reference). Writing the wrong shape would silently misconfigure the
  deployment, so only the inline password is offered on 8.7 for these two.

**Two chart-default differences, not path differences**, that would otherwise
break every non-Identity deployment on 8.7: `identityKeycloak.enabled` and
`global.identity.auth.enabled` both default to `true` on 8.7 (both default to
`false` from 8.8 onward). `transform.js` forces both off explicitly whenever
Identity is not selected — found by `helm template` failing deep inside a
Keycloak-URL-resolution helper with an error that named `.Release.Name` as the
culprit, nothing about Keycloak at all.

A section whose only fields are all unavailable on the selected release (the
merged Orchestration Cluster Environment Variables section, on 8.7) is hidden
by `sectionHasVisibleFields()` in `chartVersions.js` rather than rendering as
an empty card with just a title.

## Comparing a values.yaml across releases

`src/compareVersions.js` answers one question, mechanically: for every leaf path
set in an uploaded values.yaml, does a target chart still have that path at all.
It is driven by `src/pathIndex.json` — every path in every supported chart, no
descriptions or defaults, generated alongside the other schemas by
`npm run parse`. A full schema is ~200KB; the path-only index for two versions
gzips to ~10KB, which is why it is a separate artifact from `uiSchema.json`
rather than shipping the full schemas to the browser.

This is deliberately narrower than "will my upgrade work." A path surviving a
chart bump can still change meaning — optional becoming mandatory is enforced by
a `required "..."` call inside the chart's Go templates, not declared in
`values.yaml` or its JSON Schema, and checking it would mean vendoring and
parsing the chart's templates rather than just its values file. Rather than fake
that coverage, the UI links Camunda's own upgrade guide
(`https://docs.camunda.io/docs/self-managed/deployment/helm/upgrade/` — taken
verbatim from the 8.9 chart's own `constraints.tpl`, not invented) for anything
beyond path existence.

A removed path the tool's own form manages (tracked via `uiSchema.fields`) is
flagged distinctly from one the user set by hand — the fix for the former is
"reconfigure that section after switching release," not "consult the chart
docs."

## RDBMS secondary storage (8.9 only)

Camunda 8.9 added relational databases (PostgreSQL, MySQL, Oracle, SQL Server,
Aurora) as a first-class alternative to Elasticsearch/OpenSearch for the
Orchestration Cluster's own secondary storage. It does not exist on 8.7 or 8.8
at all — `orchestration.data.secondaryStorage` is absent from both schemas.

**It is Orchestration Cluster-specific, not a whole-deployment database
choice**: Optimize has no RDBMS option and always needs Elasticsearch or
OpenSearch for its own analytics store, confirmed against Camunda's own
architecture docs and by reading `optimize.database`'s schema (elasticsearch
and opensearch only). Choosing RDBMS for Orchestration while Optimize is also
selected is rejected by the `rdbmsIncompatibleWithOptimize` constraint rather
than silently doing something wrong with Optimize's database — the two are
not options on the same axis.

`databaseType`'s options always include `rdbms`, on every release — a radio
button cannot conditionally hide one of its own options. The `rdbmsRequires89`
constraint rejects it instead when the selected release isn't 8.9. `transform.js`
guards the same rule again before writing anything (`selectedVersion(answers)
=== "8.9"`), so a caller that bypasses the UI — the cross-version path
validator among them — cannot produce a file referencing a path the target
chart doesn't have. That guard is what caught the gap.

## Multi-region

A dual-region cluster is one logical Zeebe cluster stretched across two
Kubernetes clusters. The chart runs `clusterSize / regions` brokers per region
and computes each broker's node ID as `podIndex * regions + regionId`, so
brokers interleave across regions rather than sitting in contiguous blocks.

In this mode the chart **cannot** generate the initial contact point list — it
has no way to know the other region's namespace, and says so in
`templates/orchestration/files/_application.yaml`. `transform.js` builds the
full list of fully-qualified broker addresses and passes it through
`CAMUNDA_CLUSTER_INITIALCONTACTPOINTS`:

```
camunda-zeebe-0.camunda-zeebe.camunda-region-0.svc.cluster.local:26502,
camunda-zeebe-1.camunda-zeebe.camunda-region-0.svc.cluster.local:26502,
...
camunda-zeebe-0.camunda-zeebe.camunda-region-1.svc.cluster.local:26502,
```

The StatefulSet and its headless service are both named `<release>-zeebe` — the
component is still called `zeebe` internally for backward compatibility between
8.7 and 8.8.

Generate one file per region, changing only the region ID. Every other value
must be identical across the two.

## Sizing

`src/sizing.js` converts a throughput target into a cluster topology. It is
calibrated against Camunda's internal benchmark result set, restricted to runs
on engine 8.7+ with replication factor ≥ 3 (26 of ~330 runs). Their observed
per-unit throughput:

| Metric | p25 | median | p75 | max |
|---|---|---|---|---|
| tasks/s per partition | 156 | 288 | 446 | 688 |
| tasks/s per vCPU | 63 | 108 | 167 | 258 |
| partitions per broker | 9 | 12 | 12 | 12.5 |

Sizing is done in **tasks** per second, not process instances — tasks are the
resource driver, so a 50-task process costs roughly five times a 10-task one at
equal instance throughput. Camunda's documented rule of thumb is 10 tasks per
instance when the process model is unknown.

Two limits apply and the tighter wins: partition throughput sets a floor on
partition count, per-vCPU throughput sets a floor on total CPU. The three
calibration profiles map to the p25 / median / p75 columns.

The result is a starting point, not a guarantee — the spread between p25 and p75
is a factor of three. The UI says so.

## Testing

| Command | What it proves |
|---|---|
| `npm run validate` | Every path the tool can emit exists in every supported release |
| `npm test` | Output matches the reviewed golden files; sizing, import and round-trip behave |
| `npm run verify:helm` | Every chart actually **accepts** the generated file |

`test/scenarios.js` is the single source of deployment shapes. Each scenario is
unit-tested against `test/golden/<name>.yaml` and rendered through
`helm template` against **every** supported release — so a scenario that is
unit-tested is also proven to install, on each release the tool offers.

Golden files are recorded for the default release only. Cross-release behaviour
is covered by `test/chartVersions.test.js` and by the helm matrix, which would
otherwise multiply the golden files by the number of releases for very little
extra signal.

Golden files are committed so a change to `transform.js` shows up as a
reviewable YAML diff in the pull request. Re-record with `npm test -- -u` and
**read the diff** before committing it.

`npm run verify:helm` needs `helm` on PATH and network access to
`https://helm.camunda.io`. It runs in its own CI job.

## Supporting a new chart version

1. `mkdir -p public/charts/<release>`
2. `helm show values camunda/camunda-platform --version <new> > public/charts/<release>/values.yaml`
3. Add an entry to `camundaCharts` in `package.json`. **The first entry is the
   UI default**, so put a new stable release at the top.
4. `npm run parse` — writes the new schema and reports any displayed path the
   release does not have
5. `npm run validate` — checks every release
6. `npm test -- -u` and review the golden diff
7. `npm run verify:helm` — renders every scenario against every chart, catching
   newly required values and new cross-component constraints
8. Commit `public/charts/`, `src/schemas/`, `src/uiSchema.json`, `package.json`
   and the golden files together

To drop a release, remove its entry and its directory, then re-run `npm run
parse`.

Renovate is configured to ignore `public/charts/`; bumping an image tag inside a
vendored values file would desynchronise it from the chart that its schema was
generated from.

Steps 5 and 7 are not optional. The 14.8.5 upgrade removed
`webModeler.webapp.env` and revealed that `webModeler.restapi.mail.fromAddress`
is mandatory — neither would have been noticed without them.

## Cross-component constraints

`displayConfig.constraints` mirrors the rules in the chart's
`templates/common/constraints.tpl`, so the user sees them in the form instead of
in a failed `helm install`. Console and Web Modeler both require Management
Identity; multi-region requires an even broker count and one namespace per
region. Keep this list in sync when upgrading the chart.
