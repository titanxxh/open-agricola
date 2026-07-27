import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs.length = 0
})

describe('room capacity probe', () => {
  it('runs a deterministic smoke workload and writes a reproducible report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-room-capacity-'))
    tempDirs.push(dir)
    const report = join(dir, 'baseline.md')
    const stdout = execFileSync(process.execPath, [
      '--import',
      'tsx',
      'scripts/bench/room-capacity.ts',
      '--smoke',
      '--allow-unconstrained',
      '--report',
      report,
    ], {
      cwd: root,
      encoding: 'utf8',
    })
    const summary = JSON.parse(stdout.trim().split('\n').at(-1)!)

    expect(summary.config.levels).toEqual([2])
    expect(summary.levels).toHaveLength(1)
    expect(summary.levels[0]).toEqual(expect.objectContaining({
      roomCount: 2,
      passed: true,
    }))
    expect(summary.levels[0].actions).toBeGreaterThan(0)
    expect(summary.levels[0].failures).toEqual([])
    const reportText = readFileSync(report, 'utf8')
    expect(reportText).toContain('# Room Capacity Baseline')
    expect(reportText).toContain('Exact invocation')
    expect(reportText).toContain('Steady action p50 ms')
    expect(reportText).toContain('| DB | WAL |')
  }, 30_000)

  it('writes bounded replay checkpoints and deltas in the action-to-broadcast path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-room-capacity-replay-'))
    tempDirs.push(dir)
    const report = join(dir, 'replay.md')
    const stdout = execFileSync(process.execPath, [
      '--import',
      'tsx',
      'scripts/bench/room-capacity.ts',
      '--smoke',
      '--allow-unconstrained',
      '--replay-archive',
      '--label',
      'replay',
      '--report',
      report,
    ], {
      cwd: root,
      encoding: 'utf8',
    })
    const summary = JSON.parse(stdout.trim().split('\n').at(-1)!)
    const replay = summary.levels[0].replay

    expect(summary.config.replayArchive).toBe(true)
    expect(replay.writes).toBeGreaterThan(0)
    expect(replay.acceptedCommands).toBe(replay.writes)
    expect(replay.deltas).toBeGreaterThan(0)
    expect(replay.checkpoints + replay.deltas).toBe(replay.writes)
    const reportText = readFileSync(report, 'utf8')
    expect(reportText).toContain('# Room Capacity Replay')
    expect(reportText).toContain('State fixture: deterministic played session')
    expect(reportText).toContain('## Durable Replay commits')
  }, 30_000)
})
