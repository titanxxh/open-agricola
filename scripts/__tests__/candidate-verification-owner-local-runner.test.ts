import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(mode = 'success') {
  const root = mkdtempSync(join(tmpdir(), 'oa-pre-local-runner-')); roots.push(root)
  const repository = resolve(import.meta.dirname, '../..')
  cpSync(join(repository, 'scripts/ci'), join(root, 'scripts/ci'), { recursive: true })
  cpSync(join(repository, 'scripts/release'), join(root, 'scripts/release'), { recursive: true })
  mkdirSync(join(root, '.github/workflows'), { recursive: true }); mkdirSync(join(root, 'e2e-tests'))
  writeFileSync(join(root, '.github/workflows/candidate-verification.yml'), 'fixture')
  writeFileSync(join(root, '.github/workflows/prerelease-candidate-verification.yml'), 'fixture')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'check:architecture': 'pnpm run lint' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'fixture')
  writeFileSync(join(root, '.gitignore'), 'node_modules\nbin/\ncandidate/\nowner/\nevents.jsonl\n')
  writeFileSync(join(root, 'scripts/local-services.mjs'), 'console.log("real fixture service preparation");\n')
  for (const name of ['a', 'b', 'c', 'd']) writeFileSync(join(root, 'e2e-tests', `${name}.spec.ts`), '')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main'); git('config', 'user.name', 'Runner Fixture'); git('config', 'user.email', 'runner@example.test')
  git('add', '.'); git('commit', '-m', 'trusted fixture producer')
  const producerSha = git('rev-parse', 'HEAD')
  git('checkout', '-b', 'prerelease')
  writeFileSync(join(root, 'prerelease-integration.json'), JSON.stringify({ format: 1, repository: 'titanxxh/open-agricola', baselineMainSha: producerSha, features: [] }))
  git('add', '.'); git('commit', '-m', 'fixed prerelease')
  const sha = git('rev-parse', 'HEAD'), candidate = join(root, 'candidate')
  git('checkout', 'main'); git('worktree', 'add', candidate, 'prerelease')
  symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'))
  const prefix = 'repos/titanxxh/open-agricola'
  const api = {
    [prefix]: { id: 123, full_name: 'titanxxh/open-agricola', default_branch: 'main' },
    [`${prefix}/git/ref/heads/main`]: { ref: 'refs/heads/main', object: { type: 'commit', sha: producerSha } },
    [`${prefix}/git/ref/heads/prerelease`]: { object: { type: 'commit', sha } },
    [`${prefix}/git/ref/heads/verification/prerelease/${sha}`]: { object: { type: 'commit', sha } },
    [`${prefix}/rules/branches/main?per_page=100`]: ['pull_request', 'non_fast_forward', 'deletion', 'required_linear_history'].map(type => ({ type })),
    [`${prefix}/rules/branches/verification%2Fprerelease%2F${sha}?per_page=100`]: ['non_fast_forward', 'deletion', 'update'].map(type => ({ type })),
  }
  const bin = join(root, 'bin'); mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}
const api=${JSON.stringify(api)}, args=process.argv.slice(2), value=api[args[1]];
if(value===undefined)process.exit(1); if(args.includes('--paginate'))value.forEach(row=>console.log(JSON.stringify(row)));else console.log(JSON.stringify(value));
`, { mode: 0o700 })
  writeFileSync(join(bin, 'pnpm'), `#!${process.execPath}
import fs from 'node:fs';const row={args:process.argv.slice(2), channel:process.env.RELEASE_CHANNEL, verification:process.env.VERIFICATION_CHANNEL, build:process.env.GAME_BUILD_ID, token:process.env.GH_TOKEN??null};
fs.appendFileSync('events.jsonl',JSON.stringify(row)+'\\n');console.log(JSON.stringify(row));
if(${JSON.stringify(mode)}==='failed')process.exit(17);
if(${JSON.stringify(mode)}==='changed')fs.writeFileSync('changed.txt','changed during execution');
`, { mode: 0o700 })
  const owner = join(root, 'owner'); mkdirSync(owner, { mode: 0o700 }); chmodSync(owner, 0o700)
  const output = join(owner, 'verification.json')
  const run = () => spawnSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/ci/owner-local-prerelease.ts'),
    'verify', '--sha', sha, '--candidate-directory', candidate, '--output', output], { cwd: root,
    env: { ...process.env, CI: '', GITHUB_ACTIONS: '', GITHUB_SHA: '', GH_TOKEN: 'fixture-token-must-be-stripped', PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8', timeout: 30_000 })
  return { root, candidate, owner, sha, producerSha, output, run }
}

it('records the real complete pre commands, channel environment and exact log bytes through its owner CLI', () => {
  const value = fixture(), result = value.run()
  expect(result.status, result.stderr).toBe(0)
  const receipt = JSON.parse(readFileSync(value.output, 'utf8'))
  expect(receipt).toMatchObject({ kind: 'owner-local-prerelease-verification', channel: 'prerelease', testedSha: value.sha, candidateSha: value.sha, producerSha: value.producerSha })
  expect(receipt.tasks.map((task: { id: string }) => task.id)).toEqual(['quality', 'fast', 'slow', 'build', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'])
  const rows: { args: string[]; channel: string; verification: string; build: string; token: unknown }[] = readFileSync(join(value.candidate, 'events.jsonl'), 'utf8').trim().split('\n').map(row => JSON.parse(row))
  expect(rows.find(row => row.args.join(',') === 'run,build:hosted-frontend')).toMatchObject({ channel: 'prerelease' })
  expect(rows.filter(row => row.args.join(',') !== 'run,build:hosted-frontend').every(row => row.channel === 'stable')).toBe(true)
  expect(rows.every(row => row.verification === 'prerelease' && row.build === value.sha && row.token === null)).toBe(true)
  const logs = readdirSync(value.owner).find(name => name.startsWith('owner-local-logs-'))
  if (!logs) throw new Error('Missing retained command logs')
  const hashes = readdirSync(join(value.owner, logs)).map(name => createHash('sha256').update(readFileSync(join(value.owner, logs, name))).digest('hex'))
  expect(receipt.tasks.flatMap((task: { commands: { logSha256: string }[] }) => task.commands.map(command => command.logSha256)).sort()).toEqual(hashes.sort())
})

it.each(['failed', 'changed'])('preserves real logs without writing a successful receipt after %s execution', mode => {
  const value = fixture(mode), result = value.run()
  expect(result.status).not.toBe(0)
  expect(existsSync(value.output)).toBe(false)
  const logs = readdirSync(value.owner).find(name => name.startsWith('owner-local-logs-'))
  expect(logs).toBeDefined()
  if (!logs) throw new Error('Missing failed command logs')
  expect(readdirSync(join(value.owner, logs)).length).toBeGreaterThan(0)
})
