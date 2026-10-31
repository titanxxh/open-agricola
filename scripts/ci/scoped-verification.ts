#!/usr/bin/env tsx
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { assertPlanCurrent, createRepositoryPlan, formatPlanSummary, type PlannedCheck, type VerificationPlan } from './verification-plan'
import { FULL_TASK_IDS, selectedTasks, taskCommands, verificationTask, type VerificationCommand } from './verification-tasks'
import { assertRoutineGate, NO_CATALOG_TASKS } from './routine-verification-gate'
import { executionPartition, routinePartitionManifest, routinePartitions, type RoutinePartitionId } from './routine-partitions'
import { assertVitestResults } from './vitest-results'
import { readTestConsumerIndex } from './test-consumers'

export type ExecutionPartition = RoutinePartitionId | 'all'
type CommandRunner = (command: string, args: string[], cwd: string) => number
type CommandResult = VerificationCommand & {
  startedAt: string; completedAt: string; durationMs: number
} & ({ exitCode: number } | { exitCode: null; error: string })
type CheckResult = { check: PlannedCheck; status: 'passed' | 'failed'; commands: CommandResult[] }
type RoutineResult = {
  schemaVersion: 1
  kind: 'routine'
  status: 'running' | 'passed' | 'failed'
  partition: ExecutionPartition
  partitionDigest: string
  planDigest: string
  identity: VerificationPlan['identity']
  preparation: CommandResult[]
  checks: CheckResult[]
  error?: string
}

const write = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}
const outputs = (value: Record<string, string | number>) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(value).map(([key, entry]) => `${key}=${entry}\n`).join(''))
}
const execute: CommandRunner = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

export function routinePlanManifest(plan: VerificationPlan) {
  const tasks = plan.checks.flatMap(check => check.kind === 'catalog' ? [check.taskId] : [])
  return {
    mode: plan.mode,
    plan_digest: createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
    tested_sha: plan.identity.testedSha,
    partitions: JSON.stringify(routinePartitionManifest(routinePartitions(plan))),
    catalog_tasks: tasks.length ? selectedTasks(tasks.join(',')).join(',') : NO_CATALOG_TASKS,
    browsers: plan.checks.some(check => check.kind === 'browser') ? 'chromium webkit' : '',
  }
}

function repositoryPlan(input: { cwd: string; base: string; head: string }): VerificationPlan {
  const plan = createRepositoryPlan({ ...input, fullTaskIds: FULL_TASK_IDS })
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== plan.identity.testedSha) {
    throw new Error('The actual checkout does not match the workflow SHA')
  }
  return plan
}

export function plannedCheckCommands(cwd: string, check: PlannedCheck): VerificationCommand[] {
  switch (check.kind) {
    case 'catalog': return [
      ...(verificationTask(check.taskId).services ? [{ command: process.execPath, args: ['scripts/local-services.mjs', '--test'] }] : []),
      ...taskCommands(cwd, check.taskId),
    ]
    case 'vitest': return [
      { command: 'pnpm', args: ['exec', 'vitest', 'run', '--project', check.project, ...check.files] },
    ]
    case 'browser': return [{
      command: 'pnpm', args: ['verify', ...check.files, `--browser=${check.browser}`, ...(check.grep ? ['--grep', check.grep] : [])],
    }]
  }
}

function unitServicesRequired(cwd: string, checks: Array<Extract<PlannedCheck, { kind: 'vitest' }>>): boolean {
  if (checks.some(check => check.project === 'fast-server' || check.project === 'slow')) return true
  const consumers = readTestConsumerIndex(cwd, {
    vitest: checks.flatMap(check => check.files.map(file => ({ file, project: check.project }))), browser: [],
  })
  if (consumers.expansionReasons.length) throw new Error(`Cannot establish selected test service requirements: ${consumers.expansionReasons.join('; ')}`)
  return consumers.tests.some(test => test.dependencies.some(file =>
    /^server\/(?:__tests__\/_helpers\/(?:postgres|objects)\.|database\/|db\.|storage\/s3-store\.)/.test(file))
    || test.uncertaintyReasons.some(reason => /^(?:Computed module|Unresolved module|Unknown module loader|Indirect module)/.test(reason)))
}

export function executeRepositoryPlan(input: {
  cwd: string; base: string; head: string; partition: ExecutionPartition; output: string
  expectedPlan?: unknown; expectedDigest?: string
}, run: CommandRunner = execute): RoutineResult {
  let record: RoutineResult | undefined
  try {
    const plan = repositoryPlan(input)
    const manifest = routinePlanManifest(plan)
    if (input.expectedPlan !== undefined && !isDeepStrictEqual(input.expectedPlan, plan)) {
      throw new Error('Submitted verification plan differs from the canonical repository plan')
    }
    if (input.expectedDigest !== undefined && input.expectedDigest !== manifest.plan_digest) {
      throw new Error('Verification plan digest changed; regenerate the plan')
    }
    const partition = routinePartitions(plan).find(partition => partition.id === input.partition)
    const checks = input.partition === 'all' ? plan.checks : partition?.checks ?? []
    if (!checks.length) throw new Error('No checks are selected for this execution partition')
    record = {
      schemaVersion: 1, kind: 'routine', status: 'running', partition: input.partition,
      partitionDigest: partition?.digest ?? manifest.plan_digest,
      planDigest: manifest.plan_digest, identity: plan.identity, preparation: [], checks: [],
    }
    write(input.output, record)
    const current = record
    const runCommand = (command: VerificationCommand, commands: CommandResult[], kind: string) => {
      assertPlanCurrent(input.cwd, plan)
      const startedAt = new Date().toISOString()
      const started = performance.now()
      let outcome: { exitCode: number } | { exitCode: null; error: string }
        = { exitCode: null, error: 'Command did not complete' }
      try {
        const exitCode = run(command.command, command.args, input.cwd)
        outcome = { exitCode }
        if (exitCode !== 0) throw new Error(`Selected ${kind} check failed (exit ${exitCode})`)
      } catch (error) {
        if (outcome.exitCode === null) outcome = { exitCode: null, error: error instanceof Error ? error.message : String(error) }
        throw error
      } finally {
        commands.push({ ...command, ...outcome, startedAt, completedAt: new Date().toISOString(), durationMs: performance.now() - started })
        write(input.output, current)
      }
      assertPlanCurrent(input.cwd, plan)
    }
    const units = checks.filter(check => check.kind === 'vitest')
    let reports: string | undefined
    if (units.length) {
      if (unitServicesRequired(input.cwd, units)) {
        runCommand({ command: process.execPath, args: ['scripts/local-services.mjs', '--test'] }, record.preparation, 'preparation')
      }
      runCommand({ command: 'pnpm', args: ['run', 'build:cards-manifest'] }, record.preparation, 'preparation')
      const directory = join(input.cwd, 'output/verification/vitest-results')
      mkdirSync(directory, { recursive: true })
      reports = mkdtempSync(join(directory, 'run-'))
    }
    for (const check of checks) {
      const result: CheckResult = { check, status: 'failed', commands: [] }
      record.checks.push(result)
      const report = check.kind === 'vitest' && reports ? join(reports, `${record.checks.length}-${check.project}.json`) : undefined
      for (const command of plannedCheckCommands(input.cwd, check)) {
        runCommand(report ? { ...command, args: [...command.args,
          '--reporter=default', '--reporter=json', ...(process.env.GITHUB_ACTIONS === 'true' ? ['--reporter=github-actions'] : []),
          `--outputFile.json=${report}`,
        ] } : command, result.commands, check.kind)
      }
      if (check.kind === 'vitest') {
        if (!report) throw new Error('Selected Vitest check has no report destination')
        assertVitestResults({ cwd: input.cwd, report, files: check.files })
      }
      result.status = 'passed'
      write(input.output, record)
    }
    record.status = 'passed'
    outputs({ partition_id: input.partition, partition_digest: record.partitionDigest,
      plan_digest: manifest.plan_digest, tested_sha: plan.identity.testedSha, completed_checks: record.checks.length, status: record.status })
    return record
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (record) {
      record.status = 'failed'
      record.error = message
    } else write(input.output, { schemaVersion: 1, kind: 'routine', status: 'failed', error: message })
    throw error
  } finally {
    if (record) write(input.output, record)
    if (record && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '\n## Routine verification execution', '',
      `Status: **${record.status}**. Partition: \`${input.partition}\`. Plan: \`${record.planDigest}\`.`, '',
      'This routine result is not a dedicated full candidate receipt.', '',
      ...record.checks.map(result => `- ${result.status}: \`${JSON.stringify(result.check)}\``), '',
    ].join('\n'))
  }
}

export function scopedVerificationCli(cwd: string, args: string[]): number {
  const command = args[0]
  let output = resolve(cwd, command === 'plan' ? 'output/verification/scoped-plan.json' : 'output/verification/scoped-result.json')
  // Resolve the failure artifact even when strict parsing rejects a different option.
  try {
    const preliminary = parseArgs({ args: args.slice(1), strict: false, allowPositionals: true, options: { output: { type: 'string' } } })
    if (typeof preliminary.values.output === 'string') output = resolve(cwd, preliminary.values.output)
  } catch { /* Strict parsing below reports malformed output arguments. */ }
  let executionOwnsRecord = false
  try {
    if (command === 'plan' || command === 'run') write(output, { schemaVersion: 1, kind: command === 'run' ? 'routine' : 'plan', status: 'running' })
    const { values } = parseArgs({ args: args.slice(1), options: {
      base: { type: 'string', default: 'origin/main' }, head: { type: 'string', default: 'HEAD' },
      output: { type: 'string' }, plan: { type: 'string' }, 'expected-digest': { type: 'string' },
      partition: { type: 'string', default: 'all' }, sha: { type: 'string' }, needs: { type: 'string' },
    } })
    if (command === 'gate') {
      const needs: unknown = JSON.parse(values.needs ?? process.env.NEEDS_JSON ?? 'null')
      const result = assertRoutineGate({ sha: values.sha ?? process.env.GITHUB_SHA ?? '', needs })
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `\n## Required verification gate\n\nPassed for \`${result.sha}\`, plan \`${result.planDigest}\` (${result.mode}).\n`)
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else if (command === 'plan') {
      const plan = repositoryPlan({ cwd, base: values.base, head: values.head })
      write(output, plan)
      const manifest = routinePlanManifest(plan)
      outputs(manifest)
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatPlanSummary(plan))
      process.stdout.write(JSON.stringify(manifest, null, 2) + '\n')
    } else if (command === 'run') {
      const partition = executionPartition(values.partition)
      const expectedPlan: unknown = values.plan ? JSON.parse(readFileSync(resolve(cwd, values.plan), 'utf8')) : undefined
      executionOwnsRecord = true
      executeRepositoryPlan({ cwd, base: values.base, head: values.head, partition,
        output, expectedPlan, expectedDigest: values['expected-digest'] })
    } else throw new Error('Usage: scoped-verification.ts plan|run --base <ref> [--head <ref>] [--plan <file>] [--partition units|browser-1|browser-2|browser-3|browser-4|all] [--expected-digest <sha256>], or gate --sha <sha>')
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (command === 'plan' || command === 'run' && !executionOwnsRecord) {
      write(output, { schemaVersion: 1, kind: command === 'run' ? 'routine' : 'plan', status: 'failed', error: message })
    }
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `\n## Routine verification failed\n\n${message}\n`)
    process.stderr.write(`Routine verification failed: ${message}\n`)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = scopedVerificationCli(process.cwd(), process.argv.slice(2))
}
