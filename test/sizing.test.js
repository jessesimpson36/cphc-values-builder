/**
 * sizing.test.js — Sizing model tests
 *
 * These assertions encode the calibration data in src/sizing.js. If a benchmark
 * refresh changes the constants, these tests should be updated deliberately —
 * they are the record of what the tool currently recommends.
 */

import { describe, it, expect } from 'vitest'
import { calculateSizing, presetSizing, SIZING_PRESETS, CALIBRATION_PROFILES } from '../src/sizing.js'
import { transformAnswers } from '../src/transform.js'

describe('calculateSizing', () => {
  it('rejects a target that is not a positive number', () => {
    expect(calculateSizing({ processInstancesPerSecond: 0 })).toBeNull()
    expect(calculateSizing({ processInstancesPerSecond: 'many' })).toBeNull()
  })

  it('sizes 1000 PI/s to a cluster large enough on both CPU and partitions', () => {
    const result = calculateSizing({ processInstancesPerSecond: 1000, tasksPerInstance: 10 })
    const { tasksPerPartition, tasksPerVcpu } = CALIBRATION_PROFILES.balanced

    expect(result.tasksPerSecond).toBe(10000)
    expect(result.partitionCount * tasksPerPartition).toBeGreaterThanOrEqual(10000)
    expect(result.totalVcpu * tasksPerVcpu).toBeGreaterThanOrEqual(10000)
  })

  it('scales roughly linearly with throughput', () => {
    const single = calculateSizing({ processInstancesPerSecond: 500 })
    const double = calculateSizing({ processInstancesPerSecond: 1000 })
    expect(double.partitionCount).toBeGreaterThan(single.partitionCount)
    expect(double.totalVcpu).toBeGreaterThanOrEqual(single.totalVcpu * 1.8)
  })

  it('accounts for task count — a 50-task process needs more than a 10-task one', () => {
    const light = calculateSizing({ processInstancesPerSecond: 100, tasksPerInstance: 10 })
    const heavy = calculateSizing({ processInstancesPerSecond: 100, tasksPerInstance: 50 })
    expect(heavy.partitionCount).toBeGreaterThan(light.partitionCount)
  })

  it('orders the calibration profiles from most to least conservative', () => {
    const sizes = ['conservative', 'balanced', 'optimistic'].map(
      (calibration) => calculateSizing({ processInstancesPerSecond: 1000, calibration }).clusterSize,
    )
    expect(sizes[0]).toBeGreaterThan(sizes[1])
    expect(sizes[1]).toBeGreaterThan(sizes[2])
  })

  it('never returns a cluster that cannot lose a broker, except in development', () => {
    for (const preset of SIZING_PRESETS.filter((p) => p.id !== 'development')) {
      const result = presetSizing(preset.id)
      expect(result.clusterSize, preset.id).toBeGreaterThanOrEqual(3)
      expect(result.replicationFactor, preset.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps partitions within the observed per-broker ceiling', () => {
    const result = calculateSizing({ processInstancesPerSecond: 5000, tasksPerInstance: 50 })
    expect(result.partitionCount / result.clusterSize).toBeLessThanOrEqual(12)
  })
})

describe('multi-region sizing', () => {
  it('produces a broker count divisible by the region count', () => {
    for (const pis of [100, 480, 1000, 2500]) {
      const result = calculateSizing({ processInstancesPerSecond: pis, regions: 2 })
      expect(result.clusterSize % 2, `${pis} PI/s`).toBe(0)
    }
  })

  it('uses replication factor 4 so a quorum survives losing a region', () => {
    expect(calculateSizing({ processInstancesPerSecond: 480, regions: 2 }).replicationFactor).toBe(4)
  })
})

describe('sizing reaches the generated values', () => {
  it('emits clusterSize as a string — the chart schema rejects a number', () => {
    const out = transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      sizing_mode: 'Throughput target',
      target_pi_per_second: '1000',
    })
    expect(typeof out.orchestration.clusterSize).toBe('string')
    expect(typeof out.orchestration.partitionCount).toBe('string')
    expect(typeof out.orchestration.replicationFactor).toBe('string')
  })

  it('leaves sizing untouched when the user keeps chart defaults', () => {
    const out = transformAnswers({
      products: ['orchestration'],
      databaseType: 'elasticsearch',
      sizing_mode: 'Chart defaults',
    })
    expect(out.orchestration.clusterSize).toBeUndefined()
  })
})
