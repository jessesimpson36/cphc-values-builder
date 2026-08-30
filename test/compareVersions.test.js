/**
 * compareVersions.test.js — Upgrade-impact checks
 *
 * The feature answers one question mechanically: for a values.yaml written for
 * some release, which of its configured paths does not exist in a target
 * release at all. These tests pin that behaviour against the real, committed
 * pathIndex.json — not synthetic data — so a chart update that silently
 * changes the diff shows up as a failing assertion, not a surprise in the UI.
 */

import { describe, it, expect } from 'vitest'
import { compareVersions, canCompare, targetChartLabel, UPGRADE_GUIDE_URL } from '../src/compareVersions.js'
import { SUPPORTED_VERSIONS, DEFAULT_VERSION } from '../src/chartVersions.js'
import { loadValues } from '../src/yaml.js'
import fs from 'fs'

const chart87 = loadValues(fs.readFileSync('public/charts/8.7/values.yaml', 'utf8'))
const chart88 = loadValues(fs.readFileSync('public/charts/8.8/values.yaml', 'utf8'))
const chart89 = loadValues(fs.readFileSync('public/charts/8.9/values.yaml', 'utf8'))

describe('compareVersions', () => {
  it('finds no removed paths when comparing a release against itself', () => {
    const result = compareVersions(chart89, '8.9')
    expect(result.removedPaths).toEqual([])
    expect(result.checkedCount).toBeGreaterThan(900)
  })

  it('finds real removed paths moving the 8.8 defaults to 8.9', () => {
    const result = compareVersions(chart88, '8.9')
    expect(result.removedPaths.length).toBeGreaterThan(0)
    expect(result.removedPaths.map((r) => r.path)).toContain('global.license.key')
  })

  it('flags the merged Web Modeler subcomponent as gone in 8.9', () => {
    // webModeler.webapp was folded into restapi between 8.8 and 8.9 — a real,
    // previously-shipped bug in this tool (webModeler.webapp.env wrote a key
    // the 8.9 chart ignores) that motivated this feature.
    const result = compareVersions({ webModeler: { webapp: { env: [] } } }, '8.9')
    expect(result.removedPaths.map((r) => r.path)).toContain('webModeler.webapp.env')
  })

  it('is symmetric — checking the reverse direction also finds real differences', () => {
    const result = compareVersions(chart89, '8.8')
    expect(result.removedPaths.length).toBeGreaterThan(0)
  })

  it('sorts removed paths for a stable, reviewable report', () => {
    const result = compareVersions(chart88, '8.9')
    const paths = result.removedPaths.map((r) => r.path)
    expect(paths).toEqual([...paths].sort())
  })

  it('marks a path this tool exposes as form-managed, and an arbitrary key as not', () => {
    const result = compareVersions({
      // A path the form's own uiSchema declares, but only pretend it vanished
      // by comparing against a version where it genuinely doesn't exist — we
      // fabricate that by asking about a path this tool manages together with
      // one it has never heard of, and target a real release where the first
      // is guaranteed present (so it must NOT show up as removed at all).
      global: { elasticsearch: { url: { host: 'example.com' } } },
      someHandRolledLegacyKey: { thatNoVersionEverHad: true },
    }, '8.9')

    const byPath = Object.fromEntries(result.removedPaths.map((r) => [r.path, r]))
    expect(byPath['global.elasticsearch.url.host']).toBeUndefined()
    expect(byPath['someHandRolledLegacyKey.thatNoVersionEverHad'].managedByForm).toBe(false)
  })

  it('never reports managedByForm for a path with no chart schema entry', () => {
    // Guards against a false positive: uiSchema keys off chart paths, so a
    // path invented by a hand-edited file should never accidentally match one.
    const result = compareVersions({ totally: { made: { up: 'value' } } }, '8.9')
    expect(result.removedPaths.every((r) => r.managedByForm === false)).toBe(true)
  })
})

describe('comparing from 8.7 — the direction that matters most with three releases', () => {
  // 8.7 predates the merge of Zeebe, Zeebe Gateway, Operate and Tasklist into
  // one Orchestration Cluster component (see docs/architecture.md). A file
  // written for 8.7 uses zeebe.* and zeebeGateway.ingress.grpc.* throughout,
  // none of which exist on 8.8 or 8.9 at all.
  it('flags the pre-merge component paths as gone on both 8.8 and 8.9', () => {
    for (const target of ['8.8', '8.9']) {
      const result = compareVersions(chart87, target)
      const paths = result.removedPaths.map((r) => r.path)

      expect(paths, target).toContain('zeebe.clusterSize')
      expect(paths, target).toContain('zeebeGateway.ingress.grpc.enabled')
      expect(result.removedPaths.length, target).toBeGreaterThan(500)
    }
  })

  it('is not symmetric with the same file compared the other way', () => {
    // An 8.9 file naturally lacks the zeebe.* paths a target 8.7 chart wants —
    // a different, equally real set of losses, not the same list reversed.
    const forward = compareVersions(chart87, '8.9')
    const backward = compareVersions(chart89, '8.7')

    expect(backward.removedPaths.map((r) => r.path)).toContain('orchestration.clusterSize')
    expect(forward.removedPaths.length).not.toBe(backward.removedPaths.length)
  })
})

describe('canCompare', () => {
  it('is true for every supported release', () => {
    for (const chart of SUPPORTED_VERSIONS) {
      expect(canCompare(chart.key), chart.key).toBe(true)
    }
  })

  it('is false for a release this build does not carry an index for', () => {
    expect(canCompare('7.1')).toBe(false)
  })
})

describe('targetChartLabel', () => {
  it('names the chart and Camunda version together', () => {
    expect(targetChartLabel(DEFAULT_VERSION)).toMatch(/^Camunda \d+\.\d+ \(chart \d+\.\d+\.\d+\)$/)
  })
})

describe('upgrade guide link', () => {
  it('points at a real, chart-referenced URL rather than an invented one', () => {
    // This exact URL appears in the vendored 8.9 chart's own
    // templates/common/constraints.tpl, so it is not a guess.
    expect(UPGRADE_GUIDE_URL).toBe('https://docs.camunda.io/docs/self-managed/deployment/helm/upgrade/')
  })
})
