import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../..')
const workflows = ['ci.yml', 'ci-full.yml']
const architectureChecks = [
  'pnpm run lint',
  'pnpm run check:test-project-coverage',
  'pnpm run check:direct-session-log',
  'pnpm run check:effects-file-list',
  'pnpm run check:generated-cards-sync',
  'pnpm run check:no-dsl -- --strict',
  'pnpm run check:catalog-types',
  'pnpm run check:card-impl-boundaries',
  'pnpm run check:card-state-boundaries',
  'pnpm run check:architecture-types',
  'pnpm run check:architecture-tests',
  'pnpm run check:prompt-sync -- --strict',
  'pnpm run check:dependencies',
  'pnpm run check:browser-boundaries',
]

describe('canonical architecture verification wiring', () => {
  it('defines the exact architecture checks in one package script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts['check:architecture']?.split(' && ')).toEqual(architectureChecks)
    const architectureTests = [
      'shared/actions/effects/__tests__/architecture-guard.test.ts',
      'shared/cards/__tests__/provenance-result-audit.test.ts',
      'shared/events/__tests__/event-mapping-policy.test.ts',
      'shared/session/__tests__/interaction-command-policy.test.ts',
      'shared/cards/__tests__/card-source.test.ts',
      'shared/contract/__tests__/prompt-keys.test.ts',
      'client/services/__tests__/generation-prompt.test.ts',
      'server/__tests__/workshop-prompt-runtime.test.ts',
      'scripts/__tests__/ci-card-impl-boundaries.test.ts',
      'scripts/__tests__/check-card-state-boundaries.test.ts',
      'shared/cards/__tests__/listener-purity-guard.test.ts',
      'server/__tests__/listener-purity-gate-session.test.ts',
    ]
    expect(pkg.scripts['check:architecture-tests']?.split(' ')).toEqual(['vitest', 'run', ...architectureTests])
    for (const file of architectureTests) expect(fs.existsSync(path.join(repoRoot, file))).toBe(true)
    expect(pkg.scripts['check:reaches']).toBeUndefined()
  })

  it.each(workflows)('%s calls the canonical check once', (name) => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8')

    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/)
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/)
    expect(workflow.match(/pnpm run check:architecture/g)).toHaveLength(1)
    expect(workflow).not.toContain('pnpm run check:reaches')
    expect(workflow).not.toContain('pnpm run check:card-impl-boundaries')
    expect(workflow).not.toContain('pnpm run check:prompt-sync')
  })

  it.each(workflows)('%s starts isolated dependencies before architecture and storage tests', (name) => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8')
    const dependencies = workflow.indexOf('run: node scripts/local-services.mjs --test')
    const architecture = workflow.indexOf('run: pnpm run check:architecture')
    const tests = workflow.indexOf(name === 'ci.yml' ? 'run: pnpm run test:fast' : 'run: pnpm test')

    expect(dependencies).toBeGreaterThanOrEqual(0)
    expect(dependencies).toBeLessThan(architecture)
    expect(dependencies).toBeLessThan(tests)
  })

  it.each([...workflows, 'e2e.yml'])('%s is ready for public PRs without running automatic private jobs', (name) => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8')

    expect(workflow).toMatch(/^ {2}pull_request:\n {4}branches: \[main\]$/m)
    expect(workflow).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m)
    expect(workflow).toMatch(/^ {2}workflow_dispatch:$/m)
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/)
    expect(workflow).not.toContain('pull_request_target:')
    expect(workflow).not.toContain('secrets.')
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}')

    const jobCount = name === 'ci.yml' ? 2 : 1
    expect(workflow.match(/if: github.event_name == 'workflow_dispatch' \|\| github.event.repository.private == false/g))
      .toHaveLength(jobCount)
  })
})
