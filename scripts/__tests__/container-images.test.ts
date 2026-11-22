import { checkCandidateVerification } from '../ci/candidate-acceptance'
import { stableConfiguration } from '../ci/candidate-format'
import { finalSnapshotMetadata } from './_helpers/candidate-provenance'
import { checkPrereleaseVerification } from '../ci/prerelease-acceptance'
import { prereleaseConfiguration } from '../ci/prerelease-format'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { FULL_TASK_IDS, verificationConfiguration } from '../ci/verification-tasks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseContainerImageReceipt, containerImageVerification, verifyContainerImageBuild, CONTAINER_IMAGE_WORKFLOW, containerImageArtifactName } from '../ci/container-images'

const policyReceipt = () => ({
  format: 1, repository: 'titanxxh/open-agricola', repositoryId: 123,
  purpose: 'trusted-policy', channel: 'stable', sourceSha: 'a'.repeat(40), producerSha: 'a'.repeat(40),
  platform: 'linux/amd64', registryRepository: 'ghcr.io/titanxxh/open-agricola-images',
  manifestDigest: `sha256:${'b'.repeat(64)}`, imageId: `sha256:${'c'.repeat(64)}`,
  build: { runId: 42, runAttempt: 2 }, verification: { kind: 'main-policy', configuration: 'd'.repeat(64) },
})

describe('container image receipts', () => {
  it('retains owner-local authorization without inventing GitHub candidate job identifiers', () => {
    const receipt = { ...policyReceipt(), purpose: 'formal-candidate', verification: { kind: 'owner-local', configuration: 'd'.repeat(64),
      producerConfiguration: 'e'.repeat(64), receiptSha256: 'f'.repeat(64), statusId: 10, releaseId: 11, assetId: 12, ownerId: 7,
      url: 'https://github.com/titanxxh/open-agricola/releases/download/v0.12.9/owner-local-verification.json' } }
    expect(parseContainerImageReceipt(receipt)).toEqual(receipt)
    expect(() => parseContainerImageReceipt({ ...receipt, purpose: 'candidate', channel: 'prerelease' })).toThrow()
    expect(() => parseContainerImageReceipt({ ...receipt, verification: { ...receipt.verification,
      url: 'https://github.com/v1.2.3/fixture/releases/download/v0.12.9-beta.1/owner-local-verification.json' } })).toThrow()
  })
  it('retains distinct prerelease owner-local image authority and rejects either channel impersonation', () => {
    const receipt = { ...policyReceipt(), purpose: 'candidate', channel: 'prerelease', verification: { kind: 'owner-local-prerelease', executionEvidenceSha256: 'a'.repeat(64),
      configuration: 'd'.repeat(64), producerConfiguration: 'e'.repeat(64), receiptSha256: 'f'.repeat(64),
      statusId: 10, releaseId: 11, assetId: 12, ownerId: 7,
      url: 'https://github.com/titanxxh/open-agricola/releases/download/v0.12.9-beta.1/owner-local-verification.json' } }
    expect(parseContainerImageReceipt(receipt)).toEqual(receipt)
    expect(() => parseContainerImageReceipt({ ...receipt, purpose: 'formal-candidate', channel: 'stable' })).toThrow()
    expect(() => parseContainerImageReceipt({ ...receipt, verification: { ...receipt.verification, kind: 'owner-local' } })).toThrow()
  })
  it('accepts an exact trusted-policy image without granting candidate deployment authority', () => {
    expect(parseContainerImageReceipt(policyReceipt())).toEqual(policyReceipt())
    expect(() => parseContainerImageReceipt({ ...policyReceipt(), channel: 'prerelease' })).toThrow()
  })
})

const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const path of roots.splice(0)) rmSync(path, { force: true, recursive: true }) })
function githubFixture(cwd = resolve(import.meta.dirname, '../..')) {
  const root = mkdtempSync(join(tmpdir(), 'oa-image-github-'))
  roots.push(root); const bin = join(root, 'bin'); mkdirSync(bin)
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  const api: Record<string, unknown> = {
    'repos/titanxxh/open-agricola': { id: 123, full_name: 'titanxxh/open-agricola', default_branch: 'main' },
    'repos/titanxxh/open-agricola/git/ref/heads/main': { ref: 'refs/heads/main', object: { type: 'commit', sha } },
    'repos/titanxxh/open-agricola/rules/branches/main?per_page=100': ['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history'].map(type => ({ type })),
  }
  const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
  const save = () => {
    const responses = Object.entries(api).flatMap(([endpoint, value], index) => {
      if (value === undefined) return []
      if (value === null) return [`${shellQuote(endpoint)}) exit 1 ;;`]
      if (typeof value === 'object' && 'binary' in value && value.binary) {
        if (typeof value.binary !== 'string') throw new Error('Invalid fixture binary path')
        return [`${shellQuote(endpoint)}) exec /bin/cat -- ${shellQuote(value.binary)} ;;`]
      }
      const normal = join(root, `response-${index}.json`), page = join(root, `response-${index}.jsonl`)
      writeFileSync(normal, JSON.stringify(value) + '\n')
      const rows = Array.isArray(value) ? value : typeof value === 'string' ? Array.from(value) : null
      if (rows) writeFileSync(page, rows.map(row => JSON.stringify(row) + '\n').join(''))
      return [`${shellQuote(endpoint)}) if [ "$paginated" = 1 ]; then ${rows ? `exec /bin/cat -- ${shellQuote(page)}` : 'exit 1'}; else exec /bin/cat -- ${shellQuote(normal)}; fi ;;`]
    })
    writeFileSync(join(bin, 'gh'), `#!/bin/sh
paginated=0
for arg do
  if [ "$arg" = --paginate ]; then paginated=1; fi
done
case "\${2-}" in
${responses.join('\n')}
*) exit 1 ;;
esac
`, { mode: 0o700 })
  }
  save()
  chmodSync(join(bin, 'gh'), 0o700);vi.stubEnv('PATH', bin + ':' + process.env.PATH)
  vi.stubEnv('CI', '');vi.stubEnv('GITHUB_ACTIONS', '')
  return { cwd, root, bin, sha, api, save }
}
it('preserves JSON, paginated and live binary fixture bytes without evaluating shell input', () => {
  const value = githubFixture(), endpoint = "fixture/'$(touch SHELL_EVALUATED)*"
  const binary = join(value.root, "artifact 'quoted' $(touch BINARY_EVALUATED).zip")
  value.api[endpoint] = { message: 'public' }
  value.api['fixture/rows'] = [{ id: 1 }, { id: 2 }]
  value.api['fixture/empty'] = []
  value.api['fixture/binary'] = { binary }
  writeFileSync(binary, Buffer.from([0, 255, 13, 10])); value.save()
  const gh = (...args: string[]) => execFileSync(join(value.bin, 'gh'), ['api', ...args], { cwd: value.root })
  expect(gh(endpoint).toString()).toBe('{"message":"public"}\n')
  expect(gh('fixture/rows').toString()).toBe('[{"id":1},{"id":2}]\n')
  expect(gh('fixture/rows', '--paginate', '--jq', '.[] | @json').toString()).toBe('{"id":1}\n{"id":2}\n')
  expect(gh('fixture/empty', '--paginate').toString()).toBe('')
  expect(gh('fixture/binary')).toEqual(Buffer.from([0, 255, 13, 10]))
  writeFileSync(binary, Buffer.from([1, 2, 3]))
  expect(gh('fixture/binary')).toEqual(Buffer.from([1, 2, 3]))
  value.api[endpoint] = { message: 'changed' }; value.save()
  expect(gh(endpoint).toString()).toBe('{"message":"changed"}\n')
  expect(spawnSync(join(value.bin, 'gh'), ['api', 'missing-endpoint'], { cwd: value.root }).status).toBe(1)
  expect(existsSync(join(value.root, 'SHELL_EVALUATED'))).toBe(false)
  expect(existsSync(join(value.root, 'BINARY_EVALUATED'))).toBe(false)
})

it('derives policy identity from protected main without requiring full stable release evidence', () => {
  const value = githubFixture()
  expect(containerImageVerification({ cwd: value.cwd, purpose: 'trusted-policy', sourceSha: value.sha, producerSha: value.sha }))
    .toEqual({ kind: 'main-policy', configuration: verificationConfiguration(value.cwd, value.sha) })
  expect(() => containerImageVerification({ cwd: value.cwd, purpose: 'trusted-policy', sourceSha: 'f'.repeat(40), producerSha: value.sha })).toThrow()
})

function buildArtifactFixture(overrides: Partial<ReturnType<typeof policyReceipt>> = {}) {
  const value = githubFixture(), prefix = 'repos/titanxxh/open-agricola'
  const receipt = { ...policyReceipt(), ...overrides, sourceSha: value.sha, producerSha: value.sha,
    verification: { kind: 'main-policy', configuration: verificationConfiguration(value.cwd, value.sha) } }
  const path = join(value.root, 'container-image-receipt.json'), zip = join(value.root, 'receipt.zip')
  writeFileSync(path, JSON.stringify(receipt));execFileSync('zip', ['-jq', zip, path])
  const artifactBytes = readFileSync(zip)
  value.api[`${prefix}/actions/workflows/container-image-build.yml`] = { id: 50, path: CONTAINER_IMAGE_WORKFLOW }
  const run = { id: 42, run_attempt: 2, workflow_id: 50, path: CONTAINER_IMAGE_WORKFLOW, event: 'workflow_dispatch',
    head_branch: 'main', head_sha: value.sha, status: 'completed', conclusion: 'success', run_started_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:02:00Z',
    repository: { id: 123, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 123, full_name: 'titanxxh/open-agricola' } }
  const artifact = { id: 99, name: containerImageArtifactName(42, 2), expired: false, size_in_bytes: artifactBytes.length,
    digest: `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`, created_at: '2026-11-13T00:01:00Z',
    workflow_run: { id: 42, head_sha: value.sha, head_branch: 'main', repository_id: 123, head_repository_id: 123 } }
  value.api[`${prefix}/actions/runs/42/attempts/2`] = run
  value.api[`${prefix}/actions/artifacts/99`] = artifact
  value.api[`${prefix}/actions/artifacts/99/zip`] = { binary: zip };value.save()
  return { ...value, receipt, run, artifact, zip, verify: () => verifyContainerImageBuild({ cwd: value.cwd, runId: 42, runAttempt: 2, artifactId: 99 }) }
}
it('obtains image authority from a successful main attempt and its digest-verified receipt artifact', () => {
  const value = buildArtifactFixture()
  expect(value.verify()).toMatchObject(value.receipt)
})
/** Points protected main at a descendant whose package.json differs, which changes the verification configuration. */
function advanceMainConfiguration(value: ReturnType<typeof buildArtifactFixture>) {
  const git = (args: string[], input?: string, env: NodeJS.ProcessEnv = process.env) => execFileSync('git', args, { cwd: value.cwd, input, encoding: 'utf8', env }).trim()
  const index = join(value.root, 'advance.index'), env = { ...process.env, GIT_INDEX_FILE: index }
  git(['read-tree', value.sha], undefined, env)
  const blob = git(['hash-object', '-w', '--stdin'], '{"changed":"verification configuration"}\n')
  git(['update-index', '--cacheinfo', `100644,${blob},package.json`], undefined, env)
  const tree = git(['write-tree'], undefined, env)
  const main = git(['-c', 'user.name=Image fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', tree, '-p', value.sha], 'Main changes package.json\n')
  value.api['repos/titanxxh/open-agricola/git/ref/heads/main'] = { ref: 'refs/heads/main', object: { type: 'commit', sha: main } }
  value.save()
  return main
}
it('keeps the owner policy trusted-policy image importable after main changes its verification configuration', () => {
  const value = buildArtifactFixture()
  advanceMainConfiguration(value)
  expect(value.verify).toThrow(/not compatible protected main/)
  expect(verifyContainerImageBuild({ cwd: value.cwd, runId: 42, runAttempt: 2, artifactId: 99, ownerPolicy: value.sha })).toMatchObject(value.receipt)
  // Another policy commit does not lift the check.
  expect(() => verifyContainerImageBuild({ cwd: value.cwd, runId: 42, runAttempt: 2, artifactId: 99, ownerPolicy: 'f'.repeat(40) })).toThrow(/not compatible protected main/)
})

it.each(['run', 'attempt', 'producer', 'repository', 'artifact source', 'artifact digest', 'artifact time', 'extra files'])('rejects a forged image %s', failure => {
  const value = buildArtifactFixture()
  if (failure === 'run') value.run.conclusion = 'failure'
  if (failure === 'attempt') value.run.run_attempt = 1
  if (failure === 'producer') {
    value.run.head_sha = execFileSync('git', ['-c', 'user.name=Image fixture', '-c', 'user.email=fixture@example.invalid',
      'commit-tree', `${value.sha}^{tree}`, '-p', value.sha], { cwd: value.cwd, input: 'Unmerged image producer\n', encoding: 'utf8' }).trim()
    expect(value.run.head_sha).not.toBe(value.sha)
  }
  if (failure === 'repository') value.run.head_repository.id = 999
  if (failure === 'artifact source') value.artifact.workflow_run.id = 999
  if (failure === 'artifact digest') value.artifact.digest = `sha256:${'f'.repeat(64)}`
  if (failure === 'artifact time') value.artifact.created_at = '2026-11-12T00:00:00Z'
  if (failure === 'extra files') {
    const extra = join(value.root, 'image-layer.tar');writeFileSync(extra, 'private image must never be a public artifact')
    execFileSync('zip', ['-jq', value.zip, extra]);const bytes = readFileSync(value.zip)
    value.artifact.size_in_bytes = bytes.length;value.artifact.digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  }
  value.save();expect(value.verify).toThrow()
})

it('requires the current complete prerelease verification and binds every native task attempt', () => {
  const value = githubFixture(), clone = join(value.root, 'checkout')
  execFileSync('git', ['clone', '--shared', '--no-checkout', value.cwd, clone], { stdio: 'ignore' })
  const git = (...args: string[]) => execFileSync('git', args, { cwd: clone, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('checkout', '--detach', value.sha)
  writeFileSync(join(clone, 'prerelease-integration.json'), JSON.stringify({ format: 1, repository: 'titanxxh/open-agricola', baselineMainSha: value.sha, features: [] }))
  git('add', 'prerelease-integration.json');git('-c', 'user.name=Image fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'candidate')
  const sha = git('rev-parse', 'HEAD'), configuration = prereleaseConfiguration(clone, sha, value.sha), prefix = 'repos/titanxxh/open-agricola'
  const step = (name: string) => ({ name, status: 'completed', conclusion: 'success' })
  const workflow = { id: 200, path: '.github/workflows/prerelease-candidate-verification.yml' }
  const run = { id: 60, workflow_id: 200, path: workflow.path, event: 'workflow_dispatch', head_sha: value.sha, head_branch: 'main',
    display_title: `prerelease / ${sha} / all`, repository: { id: 123, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 123, full_name: 'titanxxh/open-agricola' },
    status: 'completed', run_attempt: 2, updated_at: '2026-11-13T01:10:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/60' }
  const jobs = FULL_TASK_IDS.map((id, index) => ({ id: index + 1000, run_id: 60, run_attempt: 2, name: `candidate / ${id} / ${configuration}`, status: 'completed', conclusion: 'success',
    started_at: '2026-11-13T01:05:00Z', completed_at: '2026-11-13T01:06:00Z', html_url: run.html_url,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers', 'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics'].map(step) }))
  const manifest = { ...jobs[0], id: 999, name: 'candidate-manifest', started_at: '2026-11-13T01:00:00Z', completed_at: '2026-11-13T01:01:00Z', steps: [step('Generate candidate manifest'), step(`Prerelease manifest / 123 / prerelease / ${sha} / ${configuration} / ${value.sha} / ${FULL_TASK_IDS.join(',')}`)] }
  value.api[`${prefix}/git/ref/heads/verification/prerelease/${sha}`] = { object: { type: 'commit', sha } }
  value.api[`${prefix}/rules/branches/prerelease?per_page=100`] = ['pull_request', 'deletion', 'required_linear_history'].map(type => ({ type }))
  value.api[`${prefix}/rules/branches/${encodeURIComponent('verification/prerelease/' + sha)}?per_page=100`] = ['non_fast_forward', 'deletion', 'update'].map(type => ({ type }))
  value.api[`${prefix}/actions/workflows/prerelease-candidate-verification.yml`] = workflow
  value.api[`${prefix}/actions/workflows/200/runs?event=workflow_dispatch&per_page=100`] = [run]
  value.api[`${prefix}/actions/runs/60/jobs?filter=all&per_page=100`] = [manifest, ...jobs]
  for (const job of jobs) value.api[`${prefix}/actions/jobs/${job.id}`] = job
  value.save()
  expect(checkPrereleaseVerification(clone, 'titanxxh/open-agricola', sha).status).toBe('passed')
  const verified = containerImageVerification({ cwd: clone, purpose: 'candidate', sourceSha: sha, producerSha: value.sha })
  expect(verified).toMatchObject({ kind: 'prerelease', configuration })
  if (verified.kind !== 'prerelease') throw new Error('Wrong verification purpose')
  expect(verified.tasks).toHaveLength(10)
  expect(verified.tasks.every(task => task.runAttempt === 2 && task.runId === 60)).toBe(true)
  jobs[0].conclusion = 'failure';value.save()
  expect(() => containerImageVerification({ cwd: clone, purpose: 'candidate', sourceSha: sha, producerSha: value.sha })).toThrow(/Complete/)
})

it.each([
  { platform: 'linux/arm64' }, { sourceSha: 'a'.repeat(39) }, { producerSha: 'b'.repeat(40) },
  { purpose: 'candidate' }, { repository: 'other/open-agricola' }, { registryRepository: 'ghcr.io/other/images' },
  { build: { runId: 42, runAttempt: 0 } }, { token: 'must not enter public receipt' },
])('rejects wrong identity fields in a policy receipt: %j', changes => {
  expect(() => parseContainerImageReceipt({ ...policyReceipt(), ...changes })).toThrow()
})
it('rejects an incomplete or duplicated candidate task set', () => {
  const receipt = { ...policyReceipt(), purpose: 'candidate', channel: 'prerelease', verification: { kind: 'prerelease', configuration: 'c'.repeat(64), producerConfiguration: 'd'.repeat(64),
    tasks: FULL_TASK_IDS.map((id, index) => ({ id, runId: 3, jobId: index + 1, runAttempt: 1 })) } }
  expect(parseContainerImageReceipt(receipt).purpose).toBe('candidate')
  receipt.verification.tasks.pop();expect(() => parseContainerImageReceipt(receipt)).toThrow(/Complete/)
  receipt.verification.tasks.push(receipt.verification.tasks[0]);expect(() => parseContainerImageReceipt(receipt)).toThrow(/Complete/)
})


function stableImageFixture() {
  const source = resolve(import.meta.dirname, '../..'), cwd = mkdtempSync(join(tmpdir(), 'oa-stable-image-source-'))
  roots.push(cwd)
  const configurationPaths = [
    '.github/workflows/candidate-verification.yml', '.github/workflows/prerelease-candidate-verification.yml',
    '.github/workflows/candidate-rehearsal.yml', 'scripts/ci',
    'package.json', 'pnpm-lock.yaml', 'vitest.config.ts', 'playwright.config.ts', 'vite.config.ts',
    ...readdirSync(join(source, 'scripts')).filter(name => /^(?:verification[^/]*\.ts|verify[^/]*\.(?:ts|sh)|test-project-globs\.ts)$/.test(name)).map(name => `scripts/${name}`),
    ...readdirSync(source).filter(name => /^tsconfig[^/]*\.json$/.test(name)),
  ]
  for (const path of configurationPaths) {
    const target = join(cwd, path); mkdirSync(dirname(target), { recursive: true })
    cpSync(join(source, path), target, { recursive: true })
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main'); git('config', 'user.name', 'Image fixture'); git('config', 'user.email', 'fixture@example.invalid')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**'); git('commit', '-m', 'self-contained verification source')
  expect(git('rev-parse', '--is-shallow-repository')).toBe('false')
  const value = githubFixture(cwd), prefix = 'repos/titanxxh/open-agricola'
  Object.assign(value.api, finalSnapshotMetadata(value.sha, value.sha, { id: 123, full_name: 'titanxxh/open-agricola' }))
  const configuration = stableConfiguration(value.cwd, value.sha, value.sha)
  const step = (name: string) => ({ name, status: 'completed', conclusion: 'success' })
  const workflow = { id: 201, path: '.github/workflows/candidate-verification.yml' }
  const run = { id: 61, workflow_id: 201, path: workflow.path, event: 'workflow_dispatch', head_sha: value.sha, head_branch: 'main',
    display_title: `stable / ${value.sha} / all`, repository: { id: 123, full_name: 'titanxxh/open-agricola' }, head_repository: { id: 123, full_name: 'titanxxh/open-agricola' },
    status: 'completed', run_attempt: 2, updated_at: '2026-11-13T01:10:00Z', html_url: 'https://github.com/titanxxh/open-agricola/actions/runs/61' }
  const jobs = FULL_TASK_IDS.map((id, index) => ({ id: index + 2000, run_id: 61, run_attempt: 2, name: `candidate / ${id} / ${configuration}`, status: 'completed', conclusion: 'success',
    started_at: '2026-11-13T01:05:00Z', completed_at: '2026-11-13T01:06:00Z', html_url: `https://github.com/titanxxh/open-agricola/actions/runs/61/job/${id}`,
    steps: ['Checkout candidate', 'Install dependencies', 'Verify candidate checkout', 'Execute verification task', 'Install browsers', 'Prepare candidate isolation', 'Prove native candidate isolation', 'Stop candidate descendants and collect private diagnostics'].map(step) }))
  const manifest = { ...jobs[0], id: 1999, name: 'candidate-manifest', started_at: '2026-11-13T01:00:00Z', completed_at: '2026-11-13T01:01:00Z',
    steps: [step('Generate candidate manifest'), step(`Stable manifest / 123 / stable / ${value.sha} / ${configuration} / ${value.sha} / ${FULL_TASK_IDS.join(',')}`)] }
  value.api[`${prefix}/actions/workflows/candidate-verification.yml`] = workflow
  value.api[`${prefix}/actions/workflows/201/runs?event=workflow_dispatch&per_page=100`] = [run]
  value.api[`${prefix}/actions/runs/61/jobs?filter=all&per_page=100`] = [manifest, ...jobs]
  for (const job of jobs) value.api[`${prefix}/actions/jobs/${job.id}`] = job
  value.save()
  return { value, configuration, jobs }
}

it('requires complete stable verification before authorizing a formal candidate image', () => {
  const { value, configuration } = stableImageFixture()
  const verified = containerImageVerification({ cwd: value.cwd, purpose: 'formal-candidate', sourceSha: value.sha, producerSha: value.sha })
  expect(verified).toEqual({ kind: 'stable', configuration, producerConfiguration: verificationConfiguration(value.cwd, value.sha),
    tasks: FULL_TASK_IDS.map((id, index) => ({ id, runId: 61, jobId: index + 2000, runAttempt: 2 })).sort((a, b) => a.id.localeCompare(b.id)) })
  const receipt = { ...policyReceipt(), sourceSha: value.sha, producerSha: value.sha,
    purpose: 'formal-candidate', channel: 'stable', verification: verified }
  expect(parseContainerImageReceipt(receipt).purpose).toBe('formal-candidate')
  expect(() => parseContainerImageReceipt({ ...receipt, purpose: 'trusted-policy' })).toThrow()
  expect(() => parseContainerImageReceipt({ ...receipt, channel: 'prerelease' })).toThrow()
})

it('rejects a failed current task after stable verification previously passed', () => {
  const { value, jobs } = stableImageFixture()
  expect(checkCandidateVerification(value.cwd, 'titanxxh/open-agricola', value.sha).status).toBe('passed')
  jobs[0].conclusion = 'failure'; value.save()
  expect(() => containerImageVerification({ cwd: value.cwd, purpose: 'formal-candidate', sourceSha: value.sha, producerSha: value.sha })).toThrow(/Complete/)
})
