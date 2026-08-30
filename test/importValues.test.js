/**
 * importValues.test.js — Round-trip and import tests
 *
 * The contract: a file this tool generated must import back into an equivalent
 * form state, and regenerate byte-equivalent values. If that breaks, someone
 * loading last quarter's file silently loses configuration.
 */

import { describe, it, expect } from 'vitest'
import yaml from 'js-yaml'
import { transformAnswers } from '../src/transform.js'
import { importValues, parseContactPoints, getNestedValue } from '../src/importValues.js'
import { scenarios } from './scenarios.js'

// Compares by leaf path so key ordering is not treated as a difference.
function flatten(obj, parentPath = '') {
  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = parentPath ? `${parentPath}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path))
    } else {
      out[path] = value
    }
  }
  return out
}

describe('round-trip', () => {
  for (const scenario of scenarios) {
    it(`${scenario.name} survives generate → import → generate`, () => {
      const generated = transformAnswers(scenario.answers)
      const { answers } = importValues(generated)
      const regenerated = transformAnswers(answers)

      expect(flatten(regenerated)).toEqual(flatten(generated))
    })
  }

  it('round-trips through YAML text, not just objects', () => {
    const scenario = scenarios.find((s) => s.name === 'production-full-stack')
    const text = yaml.dump(transformAnswers(scenario.answers), { indent: 2, lineWidth: -1 })
    const { answers } = importValues(yaml.load(text))

    expect(flatten(transformAnswers(answers))).toEqual(flatten(yaml.load(text)))
  })
})

describe('product and mode detection', () => {
  it('reads back the selected products, ignoring disabled ones', () => {
    const { answers } = importValues(transformAnswers({
      products: ['orchestration', 'connectors'],
      databaseType: 'elasticsearch',
    }))
    expect(answers.products.sort()).toEqual(['connectors', 'orchestration'])
  })

  it('detects the database type', () => {
    const { answers } = importValues(transformAnswers({
      products: ['orchestration'],
      databaseType: 'opensearch',
    }))
    expect(answers.databaseType).toBe('opensearch')
  })

  it('detects OpenShift from the security context flag', () => {
    const { answers } = importValues(transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      isOpenShift: true,
    }))
    expect(answers.isOpenShift).toBe(true)
  })

  it('switches a credential to existing-secret mode when the file references one', () => {
    const { answers } = importValues({
      orchestration: { enabled: true },
      global: {
        elasticsearch: {
          enabled: true,
          auth: { secret: { existingSecret: 'es-creds', existingSecretKey: 'password' } },
        },
      },
    })
    expect(answers.es_password_secret_mode).toBe('Existing secret')
    expect(answers.es_password_existing_secret).toBe('es-creds')
  })
})

describe('multi-region import', () => {
  const generated = transformAnswers({
    products: ['orchestration'],
    databaseType: 'elasticsearch',
    sizing_mode: 'Manual',
    cluster_size: '6',
    partition_count: '6',
    replication_factor: '4',
    multiregion_enabled: true,
    multiregion_region_id: '1',
    multiregion_namespaces: ['camunda-region-0', 'camunda-region-1'],
    multiregion_release_name: 'camunda',
    multiregion_cluster_domain: 'cluster.local',
  })

  it('recovers the namespaces from the generated contact point list', () => {
    const { answers } = importValues(generated)
    expect(answers.multiregion_enabled).toBe(true)
    expect(answers.multiregion_namespaces).toEqual(['camunda-region-0', 'camunda-region-1'])
    expect(answers.multiregion_release_name).toBe('camunda')
    expect(answers.multiregion_cluster_domain).toBe('cluster.local')
    expect(answers.multiregion_region_id).toBe('1')
  })

  it('lists one contact point per broker across every region', () => {
    const env = getNestedValue(generated, 'orchestration.env')
    const points = env[0].value.split(',')
    // clusterSize 6 across 2 regions = 3 brokers per region, 6 addresses total.
    expect(points).toHaveLength(6)
    expect(points.filter((p) => p.includes('camunda-region-0'))).toHaveLength(3)
    expect(points.filter((p) => p.includes('camunda-region-1'))).toHaveLength(3)
  })

  it('rejects a contact point list it cannot parse', () => {
    expect(parseContactPoints('not-a-broker-address')).toBeNull()
  })
})

describe('unmapped keys', () => {
  it('reports configuration the form cannot represent instead of dropping it silently', () => {
    const { unmapped } = importValues({
      orchestration: { enabled: true, someAdvancedTuning: { threadCount: 8 } },
    })
    expect(unmapped).toContain('orchestration.someAdvancedTuning.threadCount')
  })

  it('reports nothing for a file this tool generated', () => {
    const { unmapped } = importValues(transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      es_host: 'es.example.com',
    }))
    expect(unmapped).toEqual([])
  })
})
