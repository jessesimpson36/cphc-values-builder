# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-only React + Vite app that generates a minimal Camunda Platform 8 Helm
`values.yaml` from a form. No backend; everything runs client-side.
Deployed at https://cphc-values-wizard.vercel.app/

`docs/architecture.md` is the full developer guide — read it before non-trivial work.

## Commands

```bash
npm run dev          # Vite dev server on :5173
npm run build        # production build
npm run lint         # eslint
npm test             # vitest (golden files + unit tests); `npm test -- -u` re-records
npm run validate     # every emittable Helm path exists in the chart
npm run verify:helm  # renders every scenario against every supported chart (needs helm)
npm run parse        # regenerate src/schemas/ + src/uiSchema.json
npm run fixtures     # write a values.yaml per scenario per release to tmp/fixtures/
```

Run a single test file with `npx vitest run test/sizing.test.js`, or one case with
`npx vitest run -t "sizes 1000 PI/s"`.

CI runs lint, a schema-staleness check, validate, test and build in one job, and
`verify:helm` in a second job.

## Architecture

One pipeline:

```
public/charts/<release>/values.yaml  →  parseValues.js  →  schemas/<release>.json  (node only)
                                                        →  uiSchema.json           (the browser)
                                              ↓
                        displayConfig.js + chartVersions.js   (what the user sees)
                                              ↓
                                          App.jsx             (flat `answers` object)
                                              ↓                ↑ importValues.js reverses this
                              transform.js + sizing.js
                                              ↓
                                         values.yaml
```

Several Camunda releases are supported at once. `fieldApplies()` in
`chartVersions.js` is the single question the UI, validation and transform all ask:
it is false when the section is hidden, the field's own `showIf` is false, or the
selected release lacks the path. `displayConfig.js` must NOT import
`chartVersions.js` — `parseValues.js` imports displayConfig to build uiSchema, and
that would be circular.

`App.jsx` hardcodes no fields — it walks `displayConfig.sections`. Adding a field
means editing `displayConfig.js` only.

### Contracts that are easy to break

1. **`field.path` must exist in the chart, in every release that shows it.** A typo
   writes a key the chart ignores and fails silently at deploy time.
   `npm run validate` is the only guard — it evaluates `displayConfig.js` and
   `transform.js` output rather than pattern-matching, so runtime-built paths (the
   `secretFields` helper) are covered, and it runs per release.
2. **`field.id` keys `answers`, not `path`.** IDs are deliberately reused across
   mutually exclusive sections so input survives a section swap.
3. **Hidden means hidden.** Section `showIf` *or* field `showIf`. UI, validation and
   `transform.js` all go through `isFieldVisible` so they cannot drift. Hidden fields
   are never required and never emitted.
4. **`clusterSize`, `partitionCount`, `replicationFactor` must be strings.** The
   chart's `values.schema.json` rejects numbers. Ports must be numbers. Only
   `npm run verify:helm` catches this class of bug.

### transform.js

`applyProductFlags` → `applyDerivedValues` → `mapFieldsToHelm` → `applyMultiregion`
→ `cleanObject`.

`applyProductFlags` holds the implicit chart knowledge (product `enabled` flags,
disabling bundled databases, OpenShift `adaptSecurityContext` on every sub-chart).
**Adding a product to `displayConfig.products` also needs an `enabled` branch there** —
a test guards this coupling.

`cleanObject` strips `""`/`null`/`undefined`; `false` and `0` survive, which is why
explicitly-disabled flags still appear in the output.

### Sizing

`src/sizing.js` is calibrated against Camunda's internal benchmark data (engine 8.7+,
replication factor ≥ 3). The constants and their percentile sources are documented in
the file header and in `docs/architecture.md`. If you change them, update
`test/sizing.test.js` deliberately — it is the record of what the tool recommends.

Never present sizing output as a guarantee; the p25–p75 spread is a factor of three.

### Multi-region

The chart cannot compute initial contact points in multi-region mode (it has no way to
know the other region's namespace). `transform.js` generates the full broker list into
`CAMUNDA_CLUSTER_INITIALCONTACTPOINTS`. The StatefulSet and headless service are named
`<release>-zeebe`, not `-orchestration`.

## Testing approach

`test/scenarios.js` is the single source of deployment shapes, consumed by both the
golden-file tests and the helm check — so a scenario that is unit-tested is also
proven to render against the real chart.

Golden files in `test/golden/` are committed so output changes show up as reviewable
YAML diffs. After `npm test -- -u`, **read the diff** before committing.

## Before building a feature

Check the chart actually consumes the value before building a form around it —
`helm template` with and without the key takes two minutes. An `identity.firstUser`
section was built, merged and reverted because the chart only reads it when the
bundled Keycloak is enabled, which this tool never does. A field that writes a key
nothing reads is worse than no field: it reads as though something was configured.

## Gotchas

- `src/schemas/` and `src/uiSchema.json` are generated. Never hand-edit; regenerate
  with `npm run parse`. CI fails if they are stale.
- Adding a Camunda release is data, not code: vendor its values.yaml under
  `public/charts/<release>/`, add it to `camundaCharts` in package.json, re-parse.
  The first entry is the UI default.
- Port coercion keys off `field.id.includes("port")` — a port field named otherwise
  emits a quoted string the chart rejects.
- Renovate ignores `public/charts/**` deliberately; those are vendored copies of
  published chart releases. Chart upgrades follow the procedure in
  `docs/architecture.md`.
- `displayConfig.constraints` mirrors the chart's `templates/common/constraints.tpl`.
  Keep it in sync on chart upgrades.

## Styling

Plain CSS, no framework. `src/styles/theme.css` defines three themes as CSS variables
under `[data-theme="dark"|"light"|"camunda"]`. New colors belong there as variables for
all three themes, not inline in components.
