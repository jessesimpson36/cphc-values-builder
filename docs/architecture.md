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
public/values.yaml            vendored copy of one published chart release
package.json  camundaChart    which release that is
       │
       ▼  npm run parse  (scripts/parseValues.js)
src/schema.json               flat [{ path, default, type, description }] x984
src/chartMeta.json            chart version, surfaced in the UI footer
       │
       ▼
src/displayConfig.js          which paths the user sees, and when
       │
       ▼
src/App.jsx                   renders the form; holds a flat `answers` object
       │                      ◄── src/importValues.js reverses this step
       ▼
src/transform.js              answers → nested Helm values object
src/sizing.js                 throughput target → cluster topology
       │
       ▼  yaml.dump
values.yaml
```

Nothing about the form is hardcoded in `App.jsx`. It walks
`displayConfig.sections`, filters by each section's `showIf(answers)`, and
renders a `Field` per entry. Adding a field means editing `displayConfig.js`
only.

## The four contracts

**1. Every `field.path` must exist in the chart.** A typo does not crash
anything — it writes a key the chart ignores, and the user's deployment quietly
behaves nothing like they configured it. `npm run validate` imports
`displayConfig.js` and `transform.js`, collects every path either can emit
(including paths built at runtime by the `secretFields` helper), and checks them
against `schema.json`. `path: null` marks a UI-only field.

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
| `npm run validate` | Every path the tool can emit exists in the chart |
| `npm test` | Output matches the reviewed golden files; sizing, import and round-trip behave |
| `npm run verify:helm` | The chart actually **accepts** the generated file |

`test/scenarios.js` is the single source of deployment shapes. Each scenario is
both unit-tested against `test/golden/<name>.yaml` and rendered through
`helm template` — so a scenario that is unit-tested is also proven to install.

Golden files are committed so a change to `transform.js` shows up as a
reviewable YAML diff in the pull request. Re-record with `npm test -- -u` and
**read the diff** before committing it.

`npm run verify:helm` needs `helm` on PATH and network access to
`https://helm.camunda.io`. It runs in its own CI job.

## Upgrading to a new chart version

1. `helm show values camunda/camunda-platform --version <new> > public/values.yaml`
2. Update `camundaChart.version` and `appVersion` in `package.json`
3. `npm run parse`
4. `npm run validate` — this flags paths the new chart renamed or removed
5. Reconcile `displayConfig.js` against anything it reports
6. `npm test -- -u` and review the golden diff
7. `npm run verify:helm` — catches new required values and new cross-component
   constraints
8. Commit `public/values.yaml`, `src/schema.json`, `src/chartMeta.json`,
   `package.json` and the golden files together

Renovate is configured to ignore `public/values.yaml`; bumping an image tag
inside it would desynchronise the vendored copy from the chart that
`schema.json` was generated from.

Steps 4 and 7 are not optional. The 14.8.5 upgrade removed
`webModeler.webapp.env` and revealed that `webModeler.restapi.mail.fromAddress`
is mandatory — neither would have been noticed without them.

## Cross-component constraints

`displayConfig.constraints` mirrors the rules in the chart's
`templates/common/constraints.tpl`, so the user sees them in the form instead of
in a failed `helm install`. Console and Web Modeler both require Management
Identity; multi-region requires an even broker count and one namespace per
region. Keep this list in sync when upgrading the chart.
