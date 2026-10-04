import { describe, expect, it } from 'vitest'
import { evaluateRoomCommit, type FrozenBaseline, type Measurement, type MeasurementPair } from '../bench/room-commit-acceptance.ts'

const measurement = (cost: number): Measurement => ({
  commit: 'baseline', node: 'v24.19.0', cgroupCpuCores: 2, cgroupMemoryBytes: 2 * 1024 ** 3,
  results: [2, 4].map(players => ({
    players, commands: 3, cpuMs: cost, latencyP50Ms: cost / 4,
    latencyP95Ms: cost / 2, latencyP99Ms: cost, rssBytes: 100,
    hashes: ['initial-next', 'cursor-only-repeat'], classifications: ['committed', 'committed'],
  })),
})
const writes = () => ({ '2': { db: 20, wal: 80 }, '4': { db: 40, wal: 160 } })
const setup = () => {
  const frozen: FrozenBaseline = {
    baselineSource: 'baseline', runtime: 'v24.19.0',
    rawRuns: Array.from({ length: 5 }, () => measurement(100)),
    rawWriteTotals: Array.from({ length: 5 }, writes),
    thresholds: Object.fromEntries([2, 4].map(players => [players, {
      minimumImprovement: { cpuMs: 0.05, latencyP50Ms: 0.05, latencyP95Ms: 0.05, latencyP99Ms: 0.05 },
      permittedRegression: { rssBytes: 0.02, dbWalWrittenBytes: 0.01 },
    }])),
  }
  const pairs: MeasurementPair[] = Array.from({ length: 5 }, () => ({ baseline: measurement(100), after: measurement(80) }))
  return { frozen, pairs, afterWrites: Array.from({ length: 5 }, writes) }
}

describe('Room commit frozen performance acceptance', () => {
  it('rejects unchanged performance and accepts improvements with identical durable behavior', () => {
    const { frozen, pairs, afterWrites } = setup()
    expect(evaluateRoomCommit(frozen, pairs, afterWrites).passed).toBe(true)
    for (const pair of pairs) pair.after = pair.baseline
    const unchanged = evaluateRoomCommit(frozen, pairs, afterWrites)
    expect(unchanged.passed).toBe(false)
    expect(unchanged.checks.filter(check => !check.passed)).toHaveLength(8)
  })

  it('cannot hide a tail regression in one workload behind faster CPU or the other workload', () => {
    const { frozen, pairs, afterWrites } = setup()
    for (const pair of pairs) pair.after.results[0]!.latencyP99Ms = 120
    const result = evaluateRoomCommit(frozen, pairs, afterWrites)
    expect(result.passed).toBe(false)
    expect(result.checks.filter(check => !check.passed)).toMatchObject([{ players: 2, metric: 'latencyP99Ms' }])
  })

  it('rejects lost cursor-only steps and altered Frame chains even when performance is faster', () => {
    const { frozen, pairs, afterWrites } = setup()
    pairs[3]!.after.results[1]!.classifications[1] = 'unchanged'
    expect(() => evaluateRoomCommit(frozen, pairs, afterWrites)).toThrow('commit classifications changed')
    pairs[3]!.after.results[1]!.classifications[1] = 'committed'
    pairs[2]!.after.results[0]!.hashes[0] = 'different-frame'
    expect(() => evaluateRoomCommit(frozen, pairs, afterWrites)).toThrow('Frame Hash chain')
  })

  it('rejects incomplete runs, changed resource limits and increased physical writes', () => {
    const { frozen, pairs, afterWrites } = setup()
    expect(() => evaluateRoomCommit(frozen, pairs.slice(1), afterWrites)).toThrow('five alternating pairs')
    pairs[0]!.after.cgroupCpuCores = 4
    expect(() => evaluateRoomCommit(frozen, pairs, afterWrites)).toThrow('resource limits')
    pairs[0]!.after.cgroupCpuCores = 2
    for (const totals of afterWrites) totals['4'].wal = 180
    expect(evaluateRoomCommit(frozen, pairs, afterWrites).checks.filter(check => !check.passed))
      .toMatchObject([{ players: 4, metric: 'dbWalWrittenBytes' }])
  })

  it('accepts exact frozen improvement and regression endpoints without widening them', () => {
    const { frozen, pairs, afterWrites } = setup()
    for (const thresholds of Object.values(frozen.thresholds)) {
      thresholds.minimumImprovement = {
        cpuMs: 0.07, latencyP50Ms: 0.07, latencyP95Ms: 0.07, latencyP99Ms: 0.07,
      }
    }
    for (const pair of pairs) {
      pair.after = measurement(93)
      for (const result of pair.after.results) result.rssBytes = 102
    }
    for (const totals of afterWrites) {
      totals['2'].wal = 81
      totals['4'].wal = 162
    }
    expect(evaluateRoomCommit(frozen, pairs, afterWrites).passed).toBe(true)

    for (const pair of pairs) pair.after.results[0]!.latencyP99Ms = 93.000001
    for (const totals of afterWrites) totals['4'].wal = 163
    expect(evaluateRoomCommit(frozen, pairs, afterWrites).checks.filter(check => !check.passed))
      .toMatchObject([
        { players: 2, metric: 'latencyP99Ms' },
        { players: 4, metric: 'dbWalWrittenBytes' },
      ])
  })
})
