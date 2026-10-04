import { readFileSync, writeFileSync } from 'node:fs'

const improvementMetrics = ['cpuMs', 'latencyP50Ms', 'latencyP95Ms', 'latencyP99Ms'] as const
type ImprovementMetric = typeof improvementMetrics[number]
type Metric = ImprovementMetric | 'rssBytes' | 'dbWalWrittenBytes'

export type WorkloadResult = Record<ImprovementMetric | 'rssBytes', number> & {
  players: number
  commands: number
  hashes: string[]
  classifications: string[]
}
export type Measurement = {
  node: string
  cgroupCpuCores: number
  cgroupMemoryBytes: number
  commit: string
  results: WorkloadResult[]
}
type WriteTotals = Record<string, { db: number; wal: number }>
export type FrozenBaseline = {
  baselineSource: string
  runtime: string
  rawRuns: Measurement[]
  rawWriteTotals: WriteTotals[]
  thresholds: Record<string, {
    minimumImprovement: Record<ImprovementMetric, number>
    permittedRegression: Record<'rssBytes' | 'dbWalWrittenBytes', number>
  }>
}
export type MeasurementPair = { baseline: Measurement; after: Measurement }

const median = (values: number[]): number => {
  if (!values.length || values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('expected finite positive measurement samples')
  }
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

const workload = (measurement: Measurement, players: number): WorkloadResult => {
  const matches = measurement.results.filter(result => result.players === players)
  if (matches.length !== 1) throw new Error(`expected one ${players}-player workload`)
  return matches[0]!
}

/** Evaluate fixed gates; timing collection and syscall tracing remain separate. */
export const evaluateRoomCommit = (
  frozen: FrozenBaseline,
  pairs: MeasurementPair[],
  afterWrites: WriteTotals[],
) => {
  if (frozen.rawRuns.length !== 5 || pairs.length !== 5 ||
      frozen.rawWriteTotals.length !== 5 || afterWrites.length !== 5) {
    throw new Error('acceptance requires five baseline runs, five alternating pairs and five write traces per version')
  }
  for (const pair of pairs) {
    if (pair.baseline.commit !== frozen.baselineSource) throw new Error('control source differs from frozen baseline')
    for (const measurement of [pair.baseline, pair.after]) {
      if (measurement.node !== frozen.runtime || measurement.cgroupCpuCores !== 2 ||
          measurement.cgroupMemoryBytes !== 2 * 1024 ** 3) {
        throw new Error('runtime or resource limits differ from frozen baseline')
      }
    }
  }
  const checks: Array<{
    players: number
    metric: Metric
    before: number
    after: number
    reduction: number
    requiredReduction: number
    passed: boolean
  }> = []
  for (const players of [2, 4]) {
    const reference = workload(frozen.rawRuns[0]!, players)
    for (const measurement of [...frozen.rawRuns, ...pairs.flatMap(pair => [pair.baseline, pair.after])]) {
      const actual = workload(measurement, players)
      if (actual.commands !== reference.commands ||
          JSON.stringify(actual.hashes) !== JSON.stringify(reference.hashes) ||
          JSON.stringify(actual.classifications) !== JSON.stringify(reference.classifications)) {
        throw new Error(`${players}-player command transcript, Frame Hash chain or commit classifications changed`)
      }
    }
    const threshold = frozen.thresholds[String(players)]!
    const add = (metric: Metric, beforeValues: number[], afterValues: number[], requiredReduction: number) => {
      if (!Number.isFinite(requiredReduction)) throw new Error(`missing frozen threshold for ${metric}`)
      const before = median(beforeValues)
      const after = median(afterValues)
      const reduction = 1 - after / before
      // Compare the measurements directly so subtracting a rounded ratio does
      // not reject an exact boundary such as 100 -> 101 at a 1% allowance.
      checks.push({ players, metric, before, after, reduction, requiredReduction, passed: after <= before * (1 - requiredReduction) })
    }
    for (const metric of improvementMetrics) {
      add(metric,
        pairs.map(pair => workload(pair.baseline, players)[metric]),
        pairs.map(pair => workload(pair.after, players)[metric]),
        threshold.minimumImprovement[metric])
    }
    add('rssBytes',
      pairs.map(pair => workload(pair.baseline, players).rssBytes),
      pairs.map(pair => workload(pair.after, players).rssBytes),
      -threshold.permittedRegression.rssBytes)
    const writes = (totals: WriteTotals): number => {
      const result = totals[String(players)]
      if (!result || !Number.isFinite(result.db) || !Number.isFinite(result.wal)) {
        throw new Error(`missing physical write totals for ${players} players`)
      }
      return result.db + result.wal
    }
    add('dbWalWrittenBytes', frozen.rawWriteTotals.map(writes), afterWrites.map(writes),
      -threshold.permittedRegression.dbWalWrittenBytes)
  }
  return { passed: checks.every(check => check.passed), exactFrameChainsAndClassifications: true, checks }
}

if (process.argv[1]?.endsWith('room-commit-acceptance.ts')) {
  const [baselinePath, pairsPath, writesPath, outputPath] = process.argv.slice(2)
  if (!baselinePath || !pairsPath || !writesPath || !outputPath) {
    throw new Error('usage: room-commit-acceptance.ts <frozen-baseline.json> <pairs.json> <write-totals.json> <output.json>')
  }
  const result = evaluateRoomCommit(
    JSON.parse(readFileSync(baselinePath, 'utf8')) as FrozenBaseline,
    JSON.parse(readFileSync(pairsPath, 'utf8')) as MeasurementPair[],
    JSON.parse(readFileSync(writesPath, 'utf8')) as WriteTotals[],
  )
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  for (const check of result.checks) {
    process.stdout.write(`${check.passed ? 'PASS' : 'FAIL'} ${check.players}p ${check.metric}: ${(check.reduction * 100).toFixed(2)}% reduction; required ${(check.requiredReduction * 100).toFixed(0)}%\n`)
  }
  process.exitCode = result.passed ? 0 : 1
}
