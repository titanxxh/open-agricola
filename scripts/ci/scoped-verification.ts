#!/usr/bin/env tsx
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { assertPlanCurrent, createRepositoryPlan, formatPlanSummary, type PlannedCheck, type VerificationPlan } from './verification-plan'
import { FULL_TASK_IDS, selectedTasks, taskCommands, verificationTask, type VerificationCommand } from './verification-tasks'
import { assertRoutineGate } from './routine-verification-gate'

export type ExecutionPartition = 'inline' | 'all'
type CommandRunner = (command: string, args: string[], cwd: string) => number
type CheckResult = { check: PlannedCheck; status: 'passed' | 'failed'; commands: Array<VerificationCommand & { exitCode: number }> }
type RoutineResult = {
  schemaVersion: 1
  kind: 'routine'
  status: 'running' | 'passed' | 'failed'
  partition: ExecutionPartition
  planDigest: string
  identity: VerificationPlan['identity']
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
    inline_checks: plan.checks.filter(check => check.kind !== 'catalog').length,
    catalog_tasks: tasks.length ? selectedTasks(tasks.join(',')).join(',') : '',
    browsers: [...new Set(plan.checks.flatMap(check => check.kind === 'browser' ? [check.browser] : []))].sort().join(' '),
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
      ...(['fast-server', 'slow'].includes(check.project) ? [{ command: process.execPath, args: ['scripts/local-services.mjs', '--test'] }] : []),
      { command: 'pnpm', args: ['run', 'build:cards-manifest'] },
      { command: 'pnpm', args: ['exec', 'vitest', 'run', '--project', check.project, ...check.files] },
    ]
    case 'browser': return [{
      command: 'pnpm', args: ['verify', ...check.files, `--browser=${check.browser}`, ...(check.grep ? ['--grep', check.grep] : [])],
    }]
  }
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
    const checks = plan.checks.filter(check => input.partition === 'all' || check.kind !== 'catalog')
    if (!checks.length) throw new Error('No checks are selected for this execution partition')
    record = {
      schemaVersion: 1, kind: 'routine', status: 'running', partition: input.partition,
      planDigest: manifest.plan_digest, identity: plan.identity, checks: [],
    }
    write(input.output, record)
    for (const check of checks) {
      const result: CheckResult = { check, status: 'failed', commands: [] }
      record.checks.push(result)
      for (const command of plannedCheckCommands(input.cwd, check)) {
        assertPlanCurrent(input.cwd, plan)
        const exitCode = run(command.command, command.args, input.cwd)
        result.commands.push({ ...command, exitCode })
        write(input.output, record)
        if (exitCode !== 0) throw new Error(`Selected ${check.kind} check failed (exit ${exitCode})`)
        assertPlanCurrent(input.cwd, plan)
      }
      result.status = 'passed'
      write(input.output, record)
    }
    record.status = 'passed'
    outputs({ plan_digest: manifest.plan_digest, tested_sha: plan.identity.testedSha, completed_checks: record.checks.length, status: record.status })
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
      if (values.partition !== 'inline' && values.partition !== 'all') throw new Error('Unknown execution partition')
      const expectedPlan: unknown = values.plan ? JSON.parse(readFileSync(resolve(cwd, values.plan), 'utf8')) : undefined
      executionOwnsRecord = true
      executeRepositoryPlan({ cwd, base: values.base, head: values.head, partition: values.partition,
        output, expectedPlan, expectedDigest: values['expected-digest'] })
    } else throw new Error('Usage: scoped-verification.ts plan|run --base <ref> [--head <ref>] [--plan <file>] [--partition inline|all] [--expected-digest <sha256>], or gate --sha <sha>')
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
