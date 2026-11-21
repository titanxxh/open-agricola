import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { verificationPlan } from '../verify'
import { taskCommands } from '../ci/verification-tasks'
import { plannedCheckCommands } from '../ci/scoped-verification'
import { ROUTINE_PARTITION_IDS } from '../ci/routine-partitions'

const repoRoot = path.resolve(__dirname, '../..')
const architectureChecks = [
  'pnpm run lint',
  'pnpm run check:test-project-coverage',
  'pnpm run check:test-rule-environments',
  'pnpm run check:test-state-copies',
  'pnpm run check:test-covers',
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
    const workflows = fs.readdirSync(path.join(repoRoot, '.github/workflows')).filter(file => /\.ya?ml$/.test(file))
      .map(file => ({ file, source: fs.readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8') }))
    const workflowsTriggeredBy = (event: RegExp) => workflows.filter(({ source }) => event.test(source)).map(({ file }) => file).sort()
    expect(workflowsTriggeredBy(/^ {2}pull_request:/m)).toEqual(['ci.yml'])
    expect(workflowsTriggeredBy(/^ {2}push:/m)).toEqual(['ci.yml', 'prerelease-runtime.yml'])
    const runtime = workflows.find(({ file }) => file === 'prerelease-runtime.yml')
    expect(runtime?.source.match(/^on:\n(?: {2}[^\n]*\n)+/m)?.[0]).toBe(
      "on:\n  workflow_dispatch:\n  push:\n    branches: [main]\n    paths: ['deploy/prerelease-runtime/**']\n",
    )
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
    const worker = fs.readFileSync(path.join(repoRoot, '.github/workflows/scoped-verification.yml'), 'utf8')
    const gate = workflow.slice(workflow.indexOf('\n  verify:'))
    expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:/m)
    expect(workflow).toContain('scripts/ci/scoped-verification.ts plan --base "$BASE_REF" --head "$HEAD_REF"')
    expect(workflow).toContain('      base_ref: ${{ steps.plan.outputs.base_ref }}')
    expect(workflow).not.toContain('\n  inline:')
    expect(worker).toContain('--partition "$VERIFICATION_PARTITION" --expected-digest "$EXPECTED_PLAN_DIGEST"')
    for (const id of ROUTINE_PARTITION_IDS) {
      const caller = workflow.split(`\n  ${id}:`)[1].split(/\n {2}[a-z0-9-]+:/)[0]
      expect(caller).toContain('    needs: plan\n')
      expect(caller).toContain(`fromJSON(needs.plan.outputs.partitions)['${id}'] != null`)
      expect(caller).toContain('    uses: ./.github/workflows/scoped-verification.yml\n')
      expect(caller).toContain(`      partition: ${id}\n`)
      expect(caller).toContain('      base_ref: ${{ needs.plan.outputs.base_ref }}')
      expect(caller).toContain('      plan_digest: ${{ needs.plan.outputs.plan_digest }}')
    }
    expect(workflow).toContain('uses: ./.github/workflows/candidate-rehearsal.yml')
    expect(workflow).toContain('tasks: ${{ needs.plan.outputs.catalog_tasks }}')
    expect(workflow).toContain("if: needs.plan.outputs.catalog_tasks != '' && needs.plan.outputs.catalog_tasks != 'none'")
    expect(workflow).toContain('candidate_sha: ${{ github.sha }}')
    expect(workflow).toContain('base_sha:\n        description: Optional full comparison base SHA for a manual scope probe')
    expect(workflow.match(/(?:BASE_REF|base_ref): \$\{\{ github.event_name == 'workflow_dispatch' && inputs.base_sha \|\| github.event.pull_request.base.sha \|\| github.event.before \|\| github.sha \}\}/g)).toHaveLength(1)
    expect(workflow.match(/(?:HEAD_REF|head_ref): \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/g)).toHaveLength(8)
    expect(gate).toContain('name: verify\n    if: always()\n    needs: [plan, units-1, units-2, units-3, browser-1, browser-2, browser-3, browser-4, catalog]')
    expect(gate).toContain('NEEDS_JSON: ${{ toJSON(needs) }}')
    expect(gate).toContain('scripts/ci/scoped-verification.ts gate --sha "$GITHUB_SHA"')
    expect(workflow).not.toContain('continue-on-error:')
    expect(taskCommands(repoRoot, 'quality')).toContainEqual({ command: 'pnpm', args: ['run', 'check:card-impl-boundaries'] })
    expect(taskCommands(repoRoot, 'quality')).toContainEqual({ command: 'pnpm', args: ['run', 'lint'] })
  })

  it('exports reusable catalog completion only after the manifest and every matrix task succeed', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/candidate-rehearsal.yml'), 'utf8')
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
    const candidate = fs.readFileSync(path.join(repoRoot, '.github/workflows/candidate-rehearsal.yml'), 'utf8')
    const routine = fs.readFileSync(path.join(repoRoot, '.github/workflows/scoped-verification.yml'), 'utf8')
    const script = fs.readFileSync(path.join(repoRoot, 'scripts/ci/install-browser-system-packages.sh'), 'utf8')

    expect(candidate).toContain("if: startsWith(matrix.task, 'chromium-') || matrix.task == 'browser-sandbox' || matrix.task == 'webkit'")
    expect(candidate).toContain('bash "$GITHUB_WORKSPACE/candidate/scripts/ci/install-browser-system-packages.sh" "$APT_ARCHIVES"')
    expect(script).toContain('engines=(chromium webkit firefox)')
    expect(script).toContain('deps=(pnpm exec playwright install-deps "${engines[@]}")')
    expect(candidate).toContain('run: node candidate/scripts/ci/candidate-isolation.ts browsers')
    expect(routine).toContain('bash scripts/ci/install-browser-system-packages.sh "$APT_ARCHIVES"\n          pnpm exec playwright install chromium webkit firefox')
  })

  it('installs browser system packages from a restored apt archive and saves it only on a miss', () => {
    const lanes = [
      ['candidate-verification.yml', 'trusted browser system packages', 'Install trusted browser prerequisites', 'Prepare candidate isolation'],
      ['prerelease-candidate-verification.yml', 'trusted browser system packages', 'Install trusted browser prerequisites', 'Prepare candidate isolation'],
      ['candidate-rehearsal.yml', 'trusted browser system packages', 'Install trusted browser prerequisites', 'Prepare candidate isolation'],
      ['scoped-verification.yml', 'browser system packages', 'Install both browser engines for explicit embedded launches', 'Checkout pinned public assets'],
    ] as const
    for (const [file, packages, installName, next] of lanes) {
      const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8')
      const at = (name: string) => workflow.indexOf(`name: ${name}\n`)
      const steps = [`Key ${packages}`, `Restore ${packages}`, installName, `Save ${packages}`, next].map(at)
      expect(steps.every((index, i) => index > (steps[i - 1] ?? 0)), file).toBe(true)
      expect(workflow.slice(steps[1], steps[2]), file).toContain('uses: actions/cache/restore@v6')
      expect(workflow.slice(steps[3], steps[4]), file).toContain("&& steps.browser-packages.outputs.cache-hit != 'true'\n        uses: actions/cache/save@v6")
      const install = workflow.slice(steps[2], steps[3])
      expect(install, file).toContain('APT_ARCHIVES: ${{ runner.temp }}/browser-system-packages')
      expect(install, file).toMatch(/bash \S*scripts\/ci\/install-browser-system-packages\.sh"? "\$APT_ARCHIVES"/)
      expect(install, file).not.toContain('--with-deps')
    }
    // The cache directory is configured before Playwright's apt commands and removed on every exit; the
    // time-limited download-only pass precedes the real install.
    const script = fs.readFileSync(path.join(repoRoot, 'scripts/ci/install-browser-system-packages.sh'), 'utf8')
    const at = (text: string) => script.indexOf(text)
    expect(at('trap cleanup EXIT')).toBeGreaterThan(-1)
    expect(at('Dir::Cache::archives')).toBeLessThan(at('if ! download "$first_limit"'))
    expect(at('timeout --kill-after=15 "$limit" "${deps[@]}"')).toBeGreaterThan(-1)
    expect(at('if ! download "$first_limit"')).toBeLessThan(script.lastIndexOf('"${deps[@]}"'))
    expect(script).toMatch(/cleanup\(\) \{\n {2}sudo rm -rf "\$conf" "\$download_only"/)
  })

  it('serves pinned public assets to every browser task instead of GitHub Pages', () => {
    const routine = fs.readFileSync(path.join(repoRoot, '.github/workflows/scoped-verification.yml'), 'utf8')
    expect(routine).toContain("if: startsWith(inputs.partition, 'browser-')\n        run: bash scripts/ci/checkout-public-assets.sh . \"$RUNNER_TEMP/public-assets\"")
    expect(routine).toContain('E2E_PUBLIC_ASSET_DIR: ${{ steps.public-assets.outputs.directory }}')
    expect(routine).toContain('PUBLIC_ASSET_VALIDATION_DIR: ${{ steps.public-assets.outputs.directory }}')
    for (const [file, scripts] of [['candidate-verification.yml', 'policy'], ['prerelease-candidate-verification.yml', 'policy'], ['candidate-rehearsal.yml', 'candidate']] as const) {
      const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8')
      const checkout = workflow.indexOf('name: Checkout pinned public assets'), isolation = workflow.indexOf('name: Prepare candidate isolation')
      expect(checkout, file).toBeGreaterThan(-1)
      expect(checkout, file).toBeLessThan(isolation)
      expect(workflow, file).toContain(`if: startsWith(matrix.task, 'chromium-') || matrix.task == 'browser-sandbox' || matrix.task == 'webkit'\n        run: bash ${scripts}/scripts/ci/checkout-public-assets.sh candidate "$RUNNER_TEMP/public-assets"`)
      expect(workflow, file).toContain('PUBLIC_ASSETS: ${{ steps.public-assets.outputs.directory }}')
      expect(workflow, file).toMatch(/setup-candidate-isolation\.sh "\$PWD\/candidate" "\$PWD\/(policy|candidate)" "\$\(command -v node\)" "\$\(id -u\)" "\$PUBLIC_ASSETS"/)
    }
    const setup = fs.readFileSync(path.join(repoRoot, 'scripts/ci/setup-candidate-isolation.sh'), 'utf8')
    expect(setup).toContain('cp -a "$public_assets_directory" /home/oa-candidate/public-assets')
    expect(setup.indexOf('cp -a "$public_assets_directory"')).toBeLessThan(setup.indexOf('chown -R --no-dereference 61000:61000 /home/oa-candidate'))
  })

  it('verifies public PRs and both integration branches with read-only permissions and preserves manual verification', () => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')

    expect(workflow).toMatch(/^ {2}pull_request:\n {4}branches: \[main, prerelease\]$/m)
    expect(workflow).toMatch(/^ {2}push:\n {4}branches: \[main, prerelease\]$/m)
    expect(workflow).toMatch(/^ {2}workflow_dispatch:$/m)
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/)
    expect(workflow).not.toContain('pull_request_target:')
    expect(workflow).not.toContain('secrets.')
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}')

    expect(workflow.match(/if: github.event_name == 'workflow_dispatch' \|\| github.event.repository.private == false/g))
      .toHaveLength(1)
  })
})

it('keeps formal main control distinct from non-authorizing implementation rehearsal', () => {
  const formal = fs.readFileSync(path.join(repoRoot, '.github/workflows/candidate-verification.yml'), 'utf8')
  const rehearsal = fs.readFileSync(path.join(repoRoot, '.github/workflows/candidate-rehearsal.yml'), 'utf8')
  expect(formal).toContain("if: github.ref == 'refs/heads/main'")
  expect(formal).toContain('pull-requests: read')
  expect(formal).toContain('candidate-verification.ts formal-manifest')
  expect(formal).toContain('candidate-verification.ts formal-source')
  expect(formal).toContain('candidate-verification.ts formal-run-task')
  expect(formal).toContain('bash policy/scripts/ci/setup-candidate-isolation.sh')
  expect(formal).not.toContain('bash candidate/scripts/')
  expect(formal.indexOf('name: Verify candidate checkout')).toBeLessThan(formal.indexOf('name: Prepare candidate isolation'))
  expect(rehearsal).toContain('name: Candidate implementation rehearsal')
  expect(rehearsal).toContain('  workflow_call:')
  expect(rehearsal).toContain('name: implementation-rehearsal /')
})
