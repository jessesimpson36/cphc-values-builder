/**
 * sizing.js — Throughput-driven cluster sizing
 *
 * Turns a throughput target ("I need 1000 process instances per second") into
 * concrete Helm values: partition count, broker count, replication factor,
 * per-broker resources and disk.
 *
 * ─── Where these numbers come from ───────────────────────────────────────────
 *
 * Calibrated against Camunda's internal benchmark result set. Of ~330 recorded
 * runs, the subset that reflects a production-shaped cluster is:
 *
 *   - engine version 8.7 or newer, and
 *   - replication factor >= 3 (a cluster that survives losing a broker)
 *
 * which leaves 26 runs. Their observed per-unit throughput:
 *
 *   tasks/s per partition   p25 156   median 288   p75 446   max 688
 *   tasks/s per vCPU        p25  63   median 108   p75 167   max 258
 *   partitions per broker   p25   9   median  12   p75  12   max  12.5
 *
 * Sizing is done in tasks per second rather than process instances because
 * tasks are the resource driver — a 50-task process costs roughly five times a
 * 10-task one at equal instance throughput. Camunda's documented rule of thumb
 * is 10 tasks per instance when the process model is not yet known.
 *
 *   https://docs.camunda.io/docs/components/best-practices/architecture/sizing-your-environment/
 *
 * Two limits are applied and the tighter one wins: partition throughput sets a
 * floor on partition count, and per-vCPU throughput sets a floor on total CPU
 * (and therefore broker count). Runs at the top of the range used heavily tuned
 * clusters, so the default profile is the median rather than the best result.
 *
 * ─── What this is not ────────────────────────────────────────────────────────
 *
 * A starting point, not a guarantee. Throughput depends on the shape of the
 * process model, payload size, exporter configuration and disk latency, and the
 * spread above is wide — a factor of three between p25 and p75. Camunda's
 * guidance is to size for roughly 20x average load and to validate with a load
 * test before go-live. The UI states this alongside the result.
 */

/**
 * Calibration profiles taken from the percentiles of the benchmark subset above.
 * "balanced" is the median and the default; "conservative" sizes for a workload
 * heavier than the benchmark's, "optimistic" assumes a tuned cluster.
 */
export const CALIBRATION_PROFILES = {
  conservative: { label: 'Conservative', tasksPerPartition: 156, tasksPerVcpu: 63,  note: '25th percentile of benchmark runs — headroom for a heavier process model.' },
  balanced:     { label: 'Balanced',     tasksPerPartition: 288, tasksPerVcpu: 108, note: 'Median of benchmark runs. Recommended starting point.' },
  optimistic:   { label: 'Optimistic',   tasksPerPartition: 446, tasksPerVcpu: 167, note: '75th percentile — assumes a tuned cluster and a light process model.' },
}

export const DEFAULT_CALIBRATION = 'balanced'

// Camunda's documented rule of thumb when the process model is not yet known.
export const DEFAULT_TASKS_PER_INSTANCE = 10

// vCPU allocated to each broker. The benchmarks ran 32-vCPU machines, which is
// larger than most deployments provision; 8 keeps brokers to a size that
// schedules onto ordinary nodes while staying within the observed ratio.
const DEFAULT_VCPU_PER_BROKER = 8

// Observed ceiling of partitions per broker in the benchmark set. Beyond this,
// partitions contend for the same CPU instead of adding throughput.
const MAX_PARTITIONS_PER_BROKER = 12

// The benchmark machines ran roughly 3 GiB of RAM per vCPU.
const GIB_RAM_PER_VCPU = 3

// Headroom on limits over requests, so a burst is absorbed rather than throttled.
const LIMIT_HEADROOM = 1.5

// Three brokers is the smallest cluster that keeps a Raft quorum when one is
// lost, so it is the floor for anything that is not a throwaway environment.
const MIN_HA_BROKERS = 3
const MIN_HA_PARTITIONS = 3

// Zeebe keeps its own state on disk. 32Gi is the chart default and a floor.
const MIN_PVC_SIZE_GI = 32
const GI_PER_1K_TASKS_PER_SECOND = 16

const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

/**
 * Compute a cluster shape for a target throughput.
 *
 * @param {object}   input
 * @param {number}   input.processInstancesPerSecond  target sustained throughput
 * @param {number}  [input.tasksPerInstance]          tasks in a typical instance
 * @param {number}  [input.regions]                   1, or 2 for dual-region
 * @param {string}  [input.calibration]               key of CALIBRATION_PROFILES
 * @param {number}  [input.vcpuPerBroker]             CPU budget per broker
 * @param {boolean} [input.highAvailability]          enforce the 3-broker quorum floor
 */
export function calculateSizing({
  processInstancesPerSecond,
  tasksPerInstance = DEFAULT_TASKS_PER_INSTANCE,
  regions = 1,
  calibration = DEFAULT_CALIBRATION,
  vcpuPerBroker = DEFAULT_VCPU_PER_BROKER,
  highAvailability = true,
}) {
  const pis = Number(processInstancesPerSecond)
  const tasks = Number(tasksPerInstance)
  const profile = CALIBRATION_PROFILES[calibration] || CALIBRATION_PROFILES[DEFAULT_CALIBRATION]

  if (!Number.isFinite(pis) || pis <= 0) return null
  if (!Number.isFinite(tasks) || tasks <= 0) return null

  const tasksPerSecond = pis * tasks
  const notes = []

  // Limit 1: partition throughput.
  let partitionCount = Math.max(1, Math.ceil(tasksPerSecond / profile.tasksPerPartition))

  // Limit 2: total CPU. This is what actually sets broker count — sizing on
  // partitions alone under-provisions CPU at higher throughputs.
  const totalVcpu = Math.ceil(tasksPerSecond / profile.tasksPerVcpu)
  let clusterSize = Math.max(1, Math.ceil(totalVcpu / vcpuPerBroker))

  // Partitions still have to fit on the brokers we have.
  const partitionCapacity = clusterSize * MAX_PARTITIONS_PER_BROKER
  if (partitionCount > partitionCapacity) {
    clusterSize = Math.ceil(partitionCount / MAX_PARTITIONS_PER_BROKER)
    notes.push(`Broker count raised to ${clusterSize} so ${partitionCount} partitions stay within ${MAX_PARTITIONS_PER_BROKER} per broker.`)
  }

  // A low-throughput target would otherwise produce a single broker with no
  // redundancy. Only the development preset opts out.
  if (highAvailability) {
    if (clusterSize < MIN_HA_BROKERS || partitionCount < MIN_HA_PARTITIONS) {
      notes.push(`Throughput alone would need fewer brokers; raised to ${MIN_HA_BROKERS} so the cluster survives losing one.`)
    }
    clusterSize = Math.max(clusterSize, MIN_HA_BROKERS)
    partitionCount = Math.max(partitionCount, MIN_HA_PARTITIONS)
  }

  // A multi-region cluster is split evenly across regions: the chart runs
  // clusterSize / regions brokers in each, so clusterSize must divide evenly.
  if (regions > 1 && clusterSize % regions !== 0) {
    clusterSize += regions - (clusterSize % regions)
    notes.push(`Broker count rounded up to ${clusterSize} so it divides evenly across ${regions} regions.`)
  }

  // Camunda's dual-region architecture requires replication factor 4 so that a
  // quorum survives the loss of an entire region.
  const replicationFactor = regions > 1 ? 4 : Math.min(3, clusterSize)
  if (regions > 1) {
    notes.push('Replication factor 4 is required for dual-region so a quorum survives losing a region.')
  }

  const memRequestGi = Math.ceil(vcpuPerBroker * GIB_RAM_PER_VCPU)

  const pvcSize = clamp(
    Math.ceil((tasksPerSecond / 1000) * GI_PER_1K_TASKS_PER_SECOND),
    MIN_PVC_SIZE_GI,
    2048,
  )

  return {
    tasksPerSecond,
    clusterSize,
    partitionCount,
    replicationFactor,
    totalVcpu: clusterSize * vcpuPerBroker,
    pvcSize: `${pvcSize}Gi`,
    calibration: profile,
    resources: {
      requests: { cpu: `${vcpuPerBroker * 1000}m`, memory: `${memRequestGi}Gi` },
      limits: {
        cpu: `${Math.round(vcpuPerBroker * LIMIT_HEADROOM * 1000)}m`,
        memory: `${Math.ceil(memRequestGi * LIMIT_HEADROOM)}Gi`,
      },
    },
    notes,
  }
}

/**
 * Named starting points, so a user who does not have a throughput number yet
 * still gets a defensible configuration rather than the chart defaults.
 */
export const SIZING_PRESETS = [
  { id: 'development', label: 'Development', processInstancesPerSecond: 5,    description: 'Single broker, no redundancy. Not for production.' },
  { id: 'small',       label: 'Small',       processInstancesPerSecond: 50,   description: 'Around 50 process instances per second.' },
  { id: 'medium',      label: 'Medium',      processInstancesPerSecond: 200,  description: 'Around 200 process instances per second.' },
  { id: 'large',       label: 'Large',       processInstancesPerSecond: 500,  description: 'Around 500 process instances per second.' },
  { id: 'xlarge',      label: 'High volume', processInstancesPerSecond: 1000, description: 'Around 1000 PI/s — load test before go-live.' },
]

/**
 * Development is a deliberate special case: a single broker with no replication,
 * which the throughput model would never produce on its own.
 */
export function presetSizing(presetId, options = {}) {
  if (presetId === 'development') {
    return {
      tasksPerSecond: 50,
      clusterSize: 1,
      partitionCount: 1,
      replicationFactor: 1,
      totalVcpu: 1,
      pvcSize: '32Gi',
      calibration: CALIBRATION_PROFILES[DEFAULT_CALIBRATION],
      resources: {
        requests: { cpu: '600m', memory: '2Gi' },
        limits: { cpu: '2000m', memory: '4Gi' },
      },
      notes: ['Single broker with replication factor 1 — a broker restart loses availability.'],
    }
  }

  const preset = SIZING_PRESETS.find((p) => p.id === presetId)
  if (!preset) return null

  return calculateSizing({ ...options, processInstancesPerSecond: preset.processInstancesPerSecond })
}
