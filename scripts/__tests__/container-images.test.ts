import { checkPrereleaseVerification, prereleaseConfiguration } from '../ci/prerelease-verification'
import { prepareContainerImageArchive } from '../release/container-images-owner'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { FULL_TASK_IDS, verificationConfiguration } from '../ci/verification-tasks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseContainerImageReceipt, containerImageVerification, verifyContainerImageBuild, CONTAINER_IMAGE_WORKFLOW, containerImageArtifactName } from '../release/container-images'

const policyReceipt = () => ({
  format: 1, repository: 'titanxxh/open-agricola', repositoryId: 123,
  purpose: 'trusted-policy', channel: 'stable', sourceSha: 'a'.repeat(40), producerSha: 'a'.repeat(40),
  platform: 'linux/amd64', registryRepository: 'ghcr.io/titanxxh/open-agricola-images',
  manifestDigest: `sha256:${'b'.repeat(64)}`, imageId: `sha256:${'c'.repeat(64)}`,
  build: { runId: 42, runAttempt: 2 }, verification: { kind: 'main-policy', configuration: 'd'.repeat(64) },
})

describe('container image receipts', () => {
  it('accepts an exact trusted-policy image without granting candidate deployment authority', () => {
    expect(parseContainerImageReceipt(policyReceipt())).toEqual(policyReceipt())
    expect(() => parseContainerImageReceipt({ ...policyReceipt(), channel: 'prerelease' })).toThrow()
  })
})

const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const path of roots.splice(0)) rmSync(path, { force: true, recursive: true }) })
function githubFixture() {
  const cwd = resolve(import.meta.dirname, '../..'), root = mkdtempSync(join(tmpdir(), 'oa-image-github-'))
  roots.push(root); const bin = join(root, 'bin'); mkdirSync(bin)
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  const api: Record<string, unknown> = {
    'repos/titanxxh/open-agricola': { id: 123, full_name: 'titanxxh/open-agricola', default_branch: 'main' },
    'repos/titanxxh/open-agricola/git/ref/heads/main': { ref: 'refs/heads/main', object: { type: 'commit', sha } },
    'repos/titanxxh/open-agricola/rules/branches/main?per_page=100': ['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history'].map(type => ({ type })),
  }
  const file = join(root, 'api.json'), save = () => writeFileSync(file, JSON.stringify(api)); save()
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}
const fs=require('node:fs');const api=JSON.parse(fs.readFileSync(${JSON.stringify(file)},'utf8'));const args=process.argv.slice(2),value=api[args[1]];
if(value===undefined)process.exit(1);if(value.binary){process.stdout.write(fs.readFileSync(value.binary));process.exit(0)}if(args.includes('--paginate'))for(const row of value)console.log(JSON.stringify(row));else console.log(JSON.stringify(value));
`)
  chmodSync(join(bin, 'gh'), 0o700);vi.stubEnv('PATH', bin + ':' + process.env.PATH)
  vi.stubEnv('CI', '');vi.stubEnv('GITHUB_ACTIONS', '')
  return { cwd, root, bin, sha, api, save }
}
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
it.each(['run', 'attempt', 'producer', 'repository', 'artifact source', 'artifact digest', 'artifact time', 'extra files'])('rejects a forged image %s', failure => {
  const value = buildArtifactFixture()
  if (failure === 'run') value.run.conclusion = 'failure'
  if (failure === 'attempt') value.run.run_attempt = 1
  if (failure === 'producer') value.run.head_sha = execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd: value.cwd, encoding: 'utf8' }).trim()
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

it.each(['complete', 'bounded export', 'failed pull', 'remote daemon'])('prepares a private owner image archive: %s', async outcome => {
  const cwd = resolve(import.meta.dirname, '../..'), sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  const config = JSON.stringify({ os: 'linux', architecture: 'amd64', config: { Labels: { 'org.opencontainers.image.revision': sourceSha, 'io.open-agricola.release-channel': 'stable' } }, rootfs: { type: 'layers', diff_ids: [] } })
  const imageId = `sha256:${createHash('sha256').update(config).digest('hex')}`, value = buildArtifactFixture({ imageId })
  const payload = join(value.root, 'payload');mkdirSync(payload)
  writeFileSync(join(payload, 'config.json'), config);writeFileSync(join(payload, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: null, Layers: [] }]))
  const archive = join(value.root, 'source.tar');execFileSync('tar', ['-cf', archive, '-C', payload, 'config.json', 'manifest.json'])
  const authFile = join(value.root, 'auth.json'), log = join(value.root, 'docker.jsonl')
  writeFileSync(authFile, JSON.stringify({ username: 'fixture-owner', token: 'fixture-private-registry-token' }), { mode: 0o600 })
  const receipt = value.verify()
  const metadata = { format: 1, gameBuildId: sourceSha, basePath: '/open-agricola/', releaseChannel: 'stable', deploymentTarget: 'stable-hosted' }
  writeFileSync(join(value.bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');
const cmd=a[0]==='--config'?a.slice(4):a;
if(a[0]==='context')console.log(JSON.stringify([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]));
else if(cmd[0]==='login'){if(fs.readFileSync(0,'utf8').trim()!=='fixture-private-registry-token')process.exit(2);fs.writeFileSync(a[1]+'/config.json','private auth');}
else if(cmd[0]==='pull')process.exit(0);
else if(cmd[0]==='image'&&cmd[1]==='save')process.stdout.write(fs.readFileSync(${JSON.stringify(archive)}));
else if(cmd[0]==='image'&&cmd[1]==='inspect')console.log(JSON.stringify([{Id:${JSON.stringify(imageId)},Os:'linux',Architecture:'amd64',Config:JSON.parse(${JSON.stringify(config)}).config,RepoDigests:[${JSON.stringify(receipt.registryRepository+'@'+receipt.manifestDigest)}]}]));
else if(cmd[0]==='create')console.log('f'.repeat(64));
else if(cmd[0]==='cp')fs.writeFileSync(cmd.at(-1),${JSON.stringify(JSON.stringify(metadata))});
else if(cmd[0]!=='rm')process.exit(3);
`, { mode: 0o700 })
  const docker = join(value.bin, 'docker')
  if (outcome === 'failed pull') writeFileSync(docker, readFileSync(docker, 'utf8').replace("cmd[0]==='pull')process.exit(0)", "cmd[0]==='pull')process.exit(19)"))
  if (outcome === 'remote daemon') writeFileSync(docker, readFileSync(docker, 'utf8').replace('unix:///var/run/docker.sock', 'ssh://formal-host'))
  if (outcome !== 'complete') {
    await expect(prepareContainerImageArchive({ receipt, authFile, directory: value.root, maxBytes: outcome === 'bounded export' ? 64 : 1024 * 1024 })).rejects.toThrow()
    const commands: string[][] = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const login = commands.find(args => args.includes('login'))
    if (outcome === 'remote daemon') expect(login).toBeUndefined()
    if (login) expect(existsSync(login[1])).toBe(false)
    for (const directory of readdirSync(value.root).filter(name => name.startsWith('image-'))) expect(existsSync(join(value.root, directory, 'transfer.json'))).toBe(false)
    expect(readFileSync(log, 'utf8')).not.toContain('fixture-private-registry-token')
    return
  }
  const result = await prepareContainerImageArchive({ receipt, authFile, directory: value.root, maxBytes: 1024 * 1024 })
  expect(result.transfer.receipt).toMatchObject(value.receipt)
  expect(result.transfer.archive.bytes).toBe(readFileSync(archive).length)
  const calls: string[][] = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(calls.find(args => args.includes('pull'))?.at(-1)).toBe(`${receipt.registryRepository}@${receipt.manifestDigest}`)
  expect(calls.find(args => args.includes('save'))?.at(-1)).toBe(imageId)
  expect(readFileSync(log, 'utf8')).not.toContain('fixture-private-registry-token')
  const login = calls.find(args => args.includes('login'));expect(login).toBeDefined()
  if (!login) throw new Error('Missing login fixture')
  expect(() => readFileSync(join(login[1], 'config.json'))).toThrow()
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
