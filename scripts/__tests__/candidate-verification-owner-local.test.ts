import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { FULL_TASK_IDS, verificationConfiguration } from '../ci/verification-tasks'
import { canonicalOwnerLocalCommands, checkOwnerLocalVerification, rebindOwnerLocalReceipt } from '../ci/owner-local-verification'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'oa-owner-local-')); roots.push(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  mkdirSync(join(cwd, 'scripts/ci'), { recursive: true }); mkdirSync(join(cwd, '.github/workflows'), { recursive: true }); mkdirSync(join(cwd, 'e2e-tests'))
  for (const name of ['verification-tasks.ts', 'candidate-verification.ts']) writeFileSync(join(cwd, 'scripts/ci', name), '// fixture\n')
  writeFileSync(join(cwd, '.github/workflows/candidate-verification.yml'), 'name: fixture\n')
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { 'check:architecture': 'pnpm run lint' } }))
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(cwd, 'e2e-tests/first.spec.ts'), '// test\n')
  git('init', '-b', 'main'); git('config', 'user.name', 'Owner Test'); git('config', 'user.email', 'owner@example.test')
  git('add', '.'); git('commit', '-m', 'tested source')
  const testedSha = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}')
  git('commit', '--allow-empty', '-m', 'native final snapshot')
  const candidateSha = git('rev-parse', 'HEAD'), configuration = verificationConfiguration(cwd, candidateSha)
  const startedAt = '2026-11-14T00:00:00Z', completedAt = '2026-11-14T00:01:00Z'
  const commands = canonicalOwnerLocalCommands(cwd, testedSha)
  const receipt = { format: 1, kind: 'owner-local-verification', repository: 'titanxxh/open-agricola', repositoryId: 123,
    testedSha, candidateSha: testedSha, tree, configuration, producerConfiguration: configuration, startedAt, completedAt,
    environment: { node: 'v24.15.0', platform: 'linux', arch: 'arm64', nodeExecutable: '/usr/bin/node' },
    tasks: FULL_TASK_IDS.map(id => ({ id, startedAt, completedAt,
      commands: commands[id].map(command => ({ ...command, exitCode: 0, logSha256: 'a'.repeat(64) })) })),
  }
  const rebound = () => rebindOwnerLocalReceipt(cwd, receipt, { repository: receipt.repository, repositoryId: 123, candidateSha, producerSha: candidateSha })
  const owner = { id: 7, login: 'titanxxh', type: 'User' }, url = 'https://github.com/titanxxh/open-agricola/releases/download/v0.12.9/owner-local-verification.json'
  const bytes = Buffer.from(JSON.stringify(rebound()) + '\n'), digest = createHash('sha256').update(bytes).digest('hex')
  const status = { id: 10, context: 'owner-local-verification', state: 'success', creator: owner, created_at: '2026-11-14T00:03:00Z',
    target_url: url, description: `owner-local sha256:${digest}` }
  const asset = { id: 12, name: 'owner-local-verification.json', size: bytes.length, state: 'uploaded', uploader: owner,
    browser_download_url: url, created_at: '2026-11-14T00:02:00Z' }
  const release = { id: 11, tag_name: 'v0.12.9', target_commitish: candidateSha, draft: false, prerelease: false,
    author: owner, assets: [asset], created_at: '2026-11-14T00:01:01Z', published_at: '2026-11-14T00:04:00Z' }
  const api: Record<string, unknown> = {
    'repos/titanxxh/open-agricola': { id: 123, full_name: receipt.repository, owner },
    [`repos/titanxxh/open-agricola/commits/${candidateSha}/statuses?per_page=100`]: [status],
    'repos/titanxxh/open-agricola/releases/tags/v0.12.9': release,
    'repos/titanxxh/open-agricola/git/ref/tags/v0.12.9': { object: { type: 'commit', sha: candidateSha } },
  }
  const check = () => checkOwnerLocalVerification({ cwd, repository: receipt.repository, repositoryId: 123, candidateSha, producerSha: candidateSha,
    read: endpoint => { if (!(endpoint in api)) throw new Error(`Unexpected GitHub endpoint ${endpoint}`); return api[endpoint] },
    download: endpoint => { expect(endpoint).toBe('repos/titanxxh/open-agricola/releases/assets/12'); return bytes },
  })
  return { cwd, git, receipt, rebound, check, status, asset, release, owner, bytes, api, candidateSha }
}

it('accepts native owner authority for all actual local tasks and preserves the tested SHA after an identical-tree rebase', () => {
  const value = fixture()
  expect(value.rebound()).toMatchObject({ testedSha: value.receipt.testedSha, candidateSha: value.candidateSha, tree: value.receipt.tree })
  expect(value.check()).toMatchObject({ kind: 'owner-local', ownerId: 7, statusId: 10, releaseId: 11, assetId: 12,
    receiptSha256: createHash('sha256').update(value.bytes).digest('hex') })
})

it.each(['task missing', 'failed command', 'changed command', 'unsupported Node', 'future time', 'changed source', 'changed config'])('rejects local evidence with %s', failure => {
  const value = fixture()
  if (failure === 'task missing') value.receipt.tasks.pop()
  if (failure === 'failed command') value.receipt.tasks[0].commands[0].exitCode = 1
  if (failure === 'changed command') value.receipt.tasks[0].commands[0].args = ['run', 'unrelated']
  if (failure === 'unsupported Node') value.receipt.environment.node = 'v25.1.0'
  if (failure === 'future time') value.receipt.completedAt = '2099-01-01T00:00:00Z'
  if (failure === 'changed source') { writeFileSync(join(value.cwd, 'different.txt'), 'changed'); value.git('add', '.'); value.git('commit', '-m', 'different source') }
  if (failure === 'changed config') value.receipt.producerConfiguration = 'f'.repeat(64)
  expect(() => rebindOwnerLocalReceipt(value.cwd, value.receipt, { repository: value.receipt.repository, repositoryId: 123,
    candidateSha: value.git('rev-parse', 'HEAD'), producerSha: value.git('rev-parse', 'HEAD') })).toThrow()
})

it('ignores a newer foreign context status when selecting the native owner authorization', () => {
  const value = fixture()
  value.api[`repos/titanxxh/open-agricola/commits/${value.candidateSha}/statuses?per_page=100`] = [value.status,
    { ...value.status, id: 99, creator: { ...value.owner, id: 8 }, target_url: 'https://foreign.example/invalid', state: 'failure' }]
  expect(value.check()).toMatchObject({ kind: 'owner-local', statusId: 10, ownerId: 7 })
})

it('returns no local authorization when only foreign actors posted the same context', () => {
  const value = fixture()
  value.status.creator = { ...value.owner, id: 8 }
  value.status.target_url = 'https://foreign.example/invalid'
  expect(value.check()).toBeNull()
})

it.each([
  { name: 'deleted creator', creator: null },
  { name: 'missing creator', creator: undefined },
  { name: 'scalar creator', creator: 'foreign' },
  { name: 'wrong creator ID type', creator: { id: '7' } },
  { name: 'foreign creator', creator: { id: 8 } },
])('ignores context statuses with $name before validating their IDs or proof', ({ creator }) => {
  const value = fixture()
  value.api[`repos/titanxxh/open-agricola/commits/${value.candidateSha}/statuses?per_page=100`] = [{ ...value.status, id: 'ignored foreign ID', creator, target_url: null }]
  expect(value.check()).toBeNull()
})

it.each(['pending', 'failure', 'error'])('withdraws local authorization after the owner latest %s without reviving an older success', state => {
  const value = fixture()
  value.api[`repos/titanxxh/open-agricola/commits/${value.candidateSha}/statuses?per_page=100`] = [value.status, { ...value.status, id: 13, state }]
  expect(value.check()).toBeNull()
})

it.each(['uploader', 'release author', 'other URL', 'digest', 'tag', 'draft', 'status predates task'])('rejects forged or invalid native %s', failure => {
  const value = fixture()
  if (failure === 'uploader') value.asset.uploader = { ...value.owner, id: 99 }
  if (failure === 'release author') value.release.author = { ...value.owner, id: 99 }
  if (failure === 'other URL') value.status.target_url = 'https://example.test/receipt.json'
  if (failure === 'digest') value.status.description = `owner-local sha256:${'f'.repeat(64)}`
  if (failure === 'tag') value.api['repos/titanxxh/open-agricola/git/ref/tags/v0.12.9'] = { object: { type: 'commit', sha: value.receipt.testedSha } }
  if (failure === 'draft') value.release.draft = true
  if (failure === 'status predates task') value.status.created_at = '2026-11-13T00:00:00Z'
  expect(value.check).toThrow()
})
