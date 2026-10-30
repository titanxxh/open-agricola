import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { verificationPlan } from '../verify'
import { taskCommands } from '../ci/verification-tasks'
import { plannedCheckCommands } from '../ci/scoped-verification'

const repoRoot = path.resolve(__dirname, '../..')
const architectureChecks = [
  'pnpm run lint',
  'pnpm run check:test-project-coverage',
  'pnpm run check:test-rule-environments',
  'pnpm run check:test-state-copies',
  'pnpm run check:direct-session-log',
  'pnpm run check:effects-file-list',
  'pnpm run check:generated-cards-sync',
  'pnpm run check:no-dsl -- --strict',
  'pnpm run check:catalog-types',
  'pnpm run check:card-impl-boundaries',
  'pnpm run check:card-state-boundaries',
  'pnpm run check:architecture-types',
  'pnpm run check:verification-types',
  'pnpm run check:architecture-tests',
  'pnpm run check:dependencies',
  'pnpm run check:browser-boundaries',
]

describe('canonical architecture verification wiring', () => {
  it('defines the exact architecture checks in one package script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts['check:architecture']?.split(' && ')).toEqual(architectureChecks)
    expect(pkg.scripts['check:verification-types']).toBe('tsc -p tsconfig.verification-tools.json --noEmit')
    const solution: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tsconfig.json'), 'utf8'))
    expect(solution).not.toMatchObject({ references: expect.arrayContaining([{ path: './tsconfig.verification-tools.json' }]) })
    const architectureTests = [
      'shared/actions/effects/__tests__/architecture-guard.test.ts',
      'shared/cards/__tests__/provenance-result-audit.test.ts',
      'shared/events/__tests__/event-mapping-policy.test.ts',
      'shared/session/__tests__/interaction-command-policy.test.ts',
      'shared/cards/__tests__/card-source.test.ts',
      'shared/contract/__tests__/prompt-keys.test.ts',
      'client/services/__tests__/generation-prompt.test.ts',
      'server/__tests__/workshop-timing-payment-session.test.ts',
      'scripts/__tests__/ci-card-impl-boundaries.test.ts',
      'scripts/__tests__/check-card-state-boundaries.test.ts',
      'shared/cards/__tests__/listener-purity-guard.test.ts',
      'server/__tests__/listener-purity-gate-session.test.ts',
      'scripts/__tests__/check-test-rule-environments.test.ts',
      'scripts/__tests__/docs-budget.test.ts',
      'scripts/__tests__/check-card-impl-boundaries.test.ts',
      'shared/cards/__tests__/listener-admission-registry.test.ts',
      'scripts/__tests__/verification.test.ts',
      'scripts/__tests__/listener-contract-admission.test.ts',
    ]
    expect(pkg.scripts['check:architecture-tests']?.split(' ')).toEqual(['vitest', 'run', ...architectureTests])
    for (const file of architectureTests) expect(fs.existsSync(path.join(repoRoot, file))).toBe(true)
    expect(pkg.scripts['check:reaches']).toBeUndefined()
  })

  it('uses the production scanner in both architecture and prepush without warn-only', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts['check:card-impl-boundaries']).toBe('tsx scripts/check-card-impl-boundaries.ts')
    const production = verificationPlan(repoRoot, ['prepush']).steps.filter(step => step.args.includes('check:card-impl-boundaries'))
    expect(production).toEqual([{ name: 'card-impl-boundaries', command: 'pnpm', args: ['run', 'check:card-impl-boundaries'] }])
    expect(pkg.scripts['check:architecture']?.split(' && ').filter(command => command.includes('check:card-impl-boundaries')))
      .toEqual(['pnpm run check:card-impl-boundaries'])
  })

  it('uses one automatic PR/main verifier without scheduled full or duplicate preview workflows', () => {
    const workflows = fs.readdirSync(path.join(repoRoot, '.github/workflows')).filter(file => file.endsWith('.yml'))
      .map(file => ({ file, source: fs.readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8') }))
    expect(workflows.filter(workflow => /^ {2}(?:pull_request|push):/m.test(workflow.source)).map(workflow => workflow.file).sort())
      .toEqual(['ci.yml'])
    expect(workflows.some(workflow => /^ {2}schedule:/m.test(workflow.source))).toBe(false)
    expect(workflows.some(workflow => /runs-on:.*self-hosted/.test(workflow.source))).toBe(false)
    for (const retired of ['ci-full.yml', 'e2e.yml', 'verification-plan.yml']) {
      expect(workflows.map(workflow => workflow.file)).not.toContain(retired)
    }
  })

  it.each(['fast', 'slow'])('starts isolated dependencies before the canonical %s storage tests', taskId => {
    expect(plannedCheckCommands(repoRoot, { kind: 'catalog', taskId })).toEqual([
      { command: process.execPath, args: ['scripts/local-services.mjs', '--test'] },
      { command: 'pnpm', args: [taskId === 'fast' ? 'test:fast' : 'test:slow'] },
    ])
  })

  it('routes selected CI tasks to the canonical runner and always evaluates the stable required gate', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')
    const gate = workflow.slice(workflow.indexOf('\n  verify:'))
    expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:/m)
    expect(workflow).toContain('scripts/ci/scoped-verification.ts plan --base "$BASE_REF" --head "$HEAD_REF"')
    expect(workflow).toContain('--partition inline --expected-digest "$EXPECTED_PLAN_DIGEST"')
    expect(workflow).toContain('uses: ./.github/workflows/candidate-verification.yml')
    expect(workflow).toContain('tasks: ${{ needs.plan.outputs.catalog_tasks }}')
    expect(workflow).toContain("if: needs.plan.outputs.catalog_tasks != '' && needs.plan.outputs.catalog_tasks != 'none'")
    expect(workflow).toContain('candidate_sha: ${{ github.sha }}')
    expect(workflow).toContain('base_sha:\n        description: Optional full comparison base SHA for a manual scope probe')
    expect(workflow.match(/BASE_REF: \$\{\{ github.event_name == 'workflow_dispatch' && inputs.base_sha \|\| github.event.pull_request.base.sha \|\| github.event.before \|\| github.sha \}\}/g)).toHaveLength(2)
    expect(workflow.match(/HEAD_REF: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/g)).toHaveLength(2)
    expect(gate).toContain('name: verify\n    if: always()\n    needs: [plan, inline, catalog]')
    expect(gate).toContain('NEEDS_JSON: ${{ toJSON(needs) }}')
    expect(gate).toContain('scripts/ci/scoped-verification.ts gate --sha "$GITHUB_SHA"')
    expect(workflow).not.toContain('continue-on-error:')
    expect(taskCommands(repoRoot, 'quality')).toContainEqual({ command: 'pnpm', args: ['run', 'check:card-impl-boundaries'] })
    expect(taskCommands(repoRoot, 'quality')).toContainEqual({ command: 'pnpm', args: ['run', 'lint'] })
  })

  it('exports reusable catalog completion only after the manifest and every matrix task succeed', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/candidate-verification.yml'), 'utf8')
    const completion = workflow.slice(workflow.indexOf('\n  complete:'))
    expect(workflow).toContain('matrix: ${{ fromJSON(needs.manifest.outputs.matrix) }}')
    expect(workflow).toContain('run-task "$VERIFICATION_TASK" --sha "$CANDIDATE_SHA"')
    expect(completion).toContain('if: always()\n    needs: [manifest, task]')
    expect(completion).toContain('MANIFEST_RESULT: ${{ needs.manifest.result }}')
    expect(completion).toContain('TASK_RESULT: ${{ needs.task.result }}')
    expect(completion).toContain('"$MANIFEST_RESULT" != success || "$TASK_RESULT" != success')
    expect(completion).toContain('"$VERIFIED_SHA" != "$EXPECTED_SHA"')
    expect(workflow).not.toContain('continue-on-error:')
  })

  it('installs both engines in browser catalog lanes and declared inline browser checks', () => {
    const candidate = fs.readFileSync(path.join(repoRoot, '.github/workflows/candidate-verification.yml'), 'utf8')
    const routine = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')

    expect(candidate).toContain("if: startsWith(matrix.task, 'chromium-') || matrix.task == 'browser-sandbox' || matrix.task == 'webkit'")
    expect(candidate).toContain('run: pnpm exec playwright install --with-deps chromium webkit')
    expect(routine).toContain("if: contains(needs.plan.outputs.browsers, 'chromium')\n        run: pnpm exec playwright install --with-deps chromium")
    expect(routine).toContain("if: contains(needs.plan.outputs.browsers, 'webkit')\n        run: pnpm exec playwright install --with-deps webkit")
  })

  it('verifies public PRs and main with read-only permissions and preserves manual verification', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')

    expect(workflow).toMatch(/^ {2}pull_request:\n {4}branches: \[main\]$/m)
    expect(workflow).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m)
    expect(workflow).toMatch(/^ {2}workflow_dispatch:$/m)
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/)
    expect(workflow).not.toContain('pull_request_target:')
    expect(workflow).not.toContain('secrets.')
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}')

    expect(workflow.match(/if: github.event_name == 'workflow_dispatch' \|\| github.event.repository.private == false/g))
      .toHaveLength(1)
  })
})
