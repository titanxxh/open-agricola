import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, onTestFailed } from 'vitest'
import type { GameSession } from '../../game/authoritative-session'

const runId = randomUUID()
const checkpointLimit = 4 * 1024 * 1024
const sessionLimit = 1024 * 1024
const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)
type Scenario = {
  name: string
  id: string
  taskId: string
  sessions: Set<GameSession>
  records: string[]
  recordBytes: number
  omittedRecords: number
  checkpoint?: string
  written: boolean
}

function outsideCheckout(directory: string): string {
  const checkout = fileURLToPath(new URL('../../../', import.meta.url))
  const roots = [checkout]
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    roots.push(path.dirname(path.resolve(checkout, common)))
  } catch { /* A sealed migration candidate has no .git directory. */ }
  let ancestor = path.resolve(directory)
  const suffix: string[] = []
  while (!fs.existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor))
    ancestor = path.dirname(ancestor)
  }
  const resolved = path.join(fs.realpathSync(ancestor), ...suffix)
  for (const root of roots) {
    const relative = path.relative(fs.realpathSync(root), resolved)
    if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
      throw new Error('Scenario evidence must be outside the checkout')
    }
  }
  return resolved
}

/** Owns tracked sessions; freeze evidence before dispose changes their rules. */
export function createScenarioEvidence(file: string) {
  const output = outsideCheckout(process.env.AGRICOLA_TEST_EVIDENCE_DIR ?? path.join(os.tmpdir(), 'open-agricola-test-evidence'))
  const fileDirectory = path.join(output, runId, `${path.basename(fileURLToPath(file))}-${digest(file)}`)
  let current: Scenario | undefined
  const report = (scenario: Scenario, error: unknown) => {
    process.stderr.write(`${JSON.stringify({ type: 'scenario-evidence-error', file, scenario: scenario.name, error: String(error) })}\n`)
  }
  const persist = (scenario: Scenario) => {
    if (scenario.written || !scenario.checkpoint) return
    try {
      fs.mkdirSync(fileDirectory, { recursive: true })
      fs.writeFileSync(path.join(fileDirectory, `${digest(scenario.name)}-${scenario.id}.json`), scenario.checkpoint, { flag: 'wx' })
      scenario.written = true
    } catch (error) { report(scenario, error) }
  }
  beforeEach(({ task }) => {
    if (task.concurrent) throw new Error('Scenario evidence supports parallel files, not concurrent tests in one suite')
    const scenario: Scenario = { name: task.name, taskId: task.id, id: `${task.id}-${randomUUID()}`, sessions: new Set(), records: [], recordBytes: 0, omittedRecords: 0, written: false }
    current = scenario
    // Later teardown hooks can fail after our own cleanup has finished.
    onTestFailed(() => persist(scenario))
  })
  afterEach(({ task }) => {
    const scenario = current
    if (!scenario || scenario.taskId !== task.id) return
    const cleanupErrors: unknown[] = []
    try {
      const snapshots: string[] = []
      let bytes = scenario.recordBytes
      let omitted = 0
      for (const session of scenario.sessions) {
        const serialized = JSON.stringify({ response: session.getState(), engineCursor: session.getEngineStack().toCursor() })
        const size = Buffer.byteLength(serialized)
        if (snapshots.length >= 64 || size > sessionLimit || bytes + size > checkpointLimit - 4096) { omitted++; continue }
        snapshots.push(serialized)
        bytes += size
      }
      scenario.checkpoint = `{"file":${JSON.stringify(file)},"scenario":${JSON.stringify(scenario.name)},"sessions":[${snapshots.join(',')}],"records":[${scenario.records.join(',')}],"omittedRecords":${scenario.omittedRecords},"omittedSessions":${omitted},"checkpointLimitBytes":${checkpointLimit}}`
    } catch (error) {
      scenario.checkpoint = JSON.stringify({ file, scenario: scenario.name, captureError: String(error) })
      report(scenario, error)
    } finally {
      for (const session of scenario.sessions) {
        try { session.dispose() } catch (error) { cleanupErrors.push(error); report(scenario, error) }
      }
      scenario.sessions.clear()
    }
    if (process.env.AGRICOLA_TEST_DIAGNOSTIC === '1') persist(scenario)
    if (cleanupErrors.length && task.result?.state !== 'fail') throw new AggregateError(cleanupErrors, 'Session evidence cleanup failed')
  })
  return {
    record(label: string, value: unknown): void {
      if (!current) throw new Error('Record Session evidence inside a running test')
      const serialized = JSON.stringify({ label, value })
      const size = Buffer.byteLength(serialized)
      if (current.records.length >= 64 || current.recordBytes + size > sessionLimit) { current.omittedRecords++; return }
      current.records.push(serialized)
      current.recordBytes += size
    },
    track(session: GameSession): GameSession {
      if (!current) throw new Error('Track Session evidence inside a running test')
      current.sessions.add(session)
      return session
    },
  }
}
