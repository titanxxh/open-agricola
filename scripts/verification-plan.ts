#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createRepositoryPlan, formatPlanSummary } from './ci/verification-plan'
import { FULL_TASK_IDS } from './ci/verification-tasks'

const cwd = process.cwd()
let output = resolve(cwd, 'output/verification/plan.json')
let summary = process.env.GITHUB_STEP_SUMMARY
const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

try {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'origin/main' },
      head: { type: 'string', default: 'HEAD' },
      output: { type: 'string' }, summary: { type: 'string' },
      json: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    process.stdout.write('Usage: pnpm exec tsx scripts/verification-plan.ts --base <ref> [--head <ref>] [--output <file>] [--summary <file>] [--json]\n')
  } else {
    if (values.output) output = resolve(cwd, values.output)
    if (values.summary) summary = resolve(cwd, values.summary)
    const plan = createRepositoryPlan({ cwd, base: values.base, head: values.head, fullTaskIds: FULL_TASK_IDS })
    const serialized = JSON.stringify(plan, null, 2) + '\n'
    write(output, serialized)
    if (summary) write(summary, formatPlanSummary(plan))
    process.stdout.write(values.json ? serialized : `Verification scope: ${plan.mode}; ${plan.checks.length} checks. Plan: ${output}\n`)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  write(output, JSON.stringify({ schemaVersion: 1, status: 'failed', error: message }, null, 2) + '\n')
  if (summary) write(summary, `# Scope planning failed\n\nNo successful verification plan was produced.\n\n\`\`\`text\n${message}\n\`\`\`\n`)
  process.stderr.write(`Scope planning failed: ${message}\n`)
  process.exitCode = 1
}
