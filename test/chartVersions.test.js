/**
 * chartVersions.test.js — Multi-release behaviour
 *
 * The tool supports several Camunda releases at once. The contract is that a
 * file generated for a release only contains paths that release has, and that
 * choosing a release changes the output rather than just a label.
 */

import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_VERSIONS,
  DEFAULT_VERSION,
  getChart,
  selectedVersion,
  isPathAvailable,
  fieldApplies,
  describePath,
  unsupportedFields,
} from '../src/chartVersions.js'
import { displayConfig } from '../src/displayConfig.js'
import { transformAnswers } from '../src/transform.js'
import { scenarios } from '../test/scenarios.js'

describe('supported versions', () => {
  it('declares at least one release, newest first', () => {
    expect(SUPPORTED_VERSIONS.length).toBeGreaterThan(0)
    expect(SUPPORTED_VERSIONS[0].key).toBe(DEFAULT_VERSION)
  })

  it('gives every release a chart version and an app version', () => {
    for (const chart of SUPPORTED_VERSIONS) {
      expect(chart.version, chart.key).toMatch(/^\d+\.\d+\.\d+$/)
      expect(chart.appVersion, chart.key).toMatch(/^\d+\.\d+$/)
    }
  })
})

describe('selectedVersion', () => {
  it('falls back to the default for answers that never chose one', () => {
    expect(selectedVersion({})).toBe(DEFAULT_VERSION)
    expect(selectedVersion(undefined)).toBe(DEFAULT_VERSION)
  })

  it('ignores a release this build does not support', () => {
    expect(selectedVersion({ chartVersion: '7.1' })).toBe(DEFAULT_VERSION)
  })

  it('honours a supported release', () => {
    for (const chart of SUPPORTED_VERSIONS) {
      expect(selectedVersion({ chartVersion: chart.key })).toBe(chart.key)
    }
  })
})

describe('getChart', () => {
  it('returns the default rather than undefined for an unknown key', () => {
    expect(getChart('nope').key).toBe(DEFAULT_VERSION)
  })
})

describe('path availability', () => {
  it('treats paths uiSchema does not track as available', () => {
    // transform.js writes many paths no displayed field declares; those are
    // covered by npm run validate against the full schemas instead.
    expect(isPathAvailable('some.path.no.field.declares', DEFAULT_VERSION)).toBe(true)
  })

  it('hides a field whose path the selected release lacks', () => {
    const field = { id: 'x', path: 'global.elasticsearch.url.host' }
    const available = isPathAvailable(field.path, DEFAULT_VERSION)
    expect(fieldApplies(field, { products: [], chartVersion: DEFAULT_VERSION })).toBe(available)
  })

  it('still respects a field\'s own showIf', () => {
    const field = { id: 'x', path: null, showIf: () => false }
    expect(fieldApplies(field, { products: [] })).toBe(false)
  })
})

describe('descriptions', () => {
  it('carries a description for displayed paths, for the field tooltips', () => {
    const described = displayConfig.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.path)
      .filter((f) => describePath(f.path))

    // Not every chart key carries a ## @param comment, so this is a floor
    // rather than a total — but most fields should have help text.
    expect(described.length).toBeGreaterThan(50)
  })

  it('returns an empty string rather than undefined for unknown paths', () => {
    expect(describePath('not.a.real.path')).toBe('')
  })
})

describe('generating for each release', () => {
  it('produces output for every scenario on every supported release', () => {
    for (const chart of SUPPORTED_VERSIONS) {
      for (const scenario of scenarios) {
        const out = transformAnswers({ ...scenario.answers, chartVersion: chart.key })
        expect(Object.keys(out).length, `${scenario.name} on ${chart.key}`).toBeGreaterThan(0)
      }
    }
  })

  it('never writes a path the target release does not have', () => {
    for (const chart of SUPPORTED_VERSIONS) {
      const absent = unsupportedFields({ chartVersion: chart.key })
      if (absent.length === 0) continue

      for (const scenario of scenarios) {
        const text = JSON.stringify(transformAnswers({ ...scenario.answers, chartVersion: chart.key }))
        for (const missing of absent) {
          const leaf = missing.split('.').pop()
          expect(text, `${scenario.name} on ${chart.key} leaked ${missing}`).not.toContain(`"${leaf}"`)
        }
      }
    }
  })
})
