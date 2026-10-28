import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const repository = resolve(import.meta.dirname, '../..')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const deploy = (fail: boolean, { archive = false }: { archive?: boolean } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'oa-operations-'))
  roots.push(root)
  const build = archive ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim() : 'a'.repeat(40)
  const release = join(root, 'releases', build)
  const game = join(root, 'game')
  const bin = join(root, 'bin')
  mkdirSync(bin)
  mkdirSync(join(game, 'data'), { recursive: true })
  if (!archive) cpSync(join(repository, 'operations'), join(release, 'operations'), { recursive: true, filter: source => !source.includes('node_modules') })
  writeFileSync(join(game, '.env'), 'PUBLIC_API_BASE=https://api.example.invalid\n')
  writeFileSync(join(game, 'data/dependencies.compose.env'), 'DATABASE_URL=postgresql://owner:private@postgres/agricola\nOBSERVABILITY_METRICS_TOKEN=private-scrape-token\n')
  const calls = join(root, 'calls')
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs');
const args=process.argv.slice(2);
fs.appendFileSync(process.env.OPS_TEST_CALLS, JSON.stringify(args)+'\\n');
if(args[0]==='ps') {
 const service=args.find(x=>x.startsWith('label=com.docker.compose.service=')).split('=').at(-1);
 process.stdout.write(service==='app'?'game-container':'legacy-'+service);
} else if(args[0]==='inspect') process.stdout.write('game-container game-image original-start-time');
else if(args.includes('up') && process.env.OPS_TEST_FAIL==='1') process.exit(1);
`)
  chmodSync(join(bin, 'docker'), 0o755)
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');\nconst r=spawnSync('bash',['-c',process.argv.slice(3).join(' ')],{stdio:'inherit'});\nprocess.exit(r.status??1);\n`)
  chmodSync(join(bin, 'ssh'), 0o755)
  const result = spawnSync(archive ? 'bash' : process.execPath, archive
    ? [join(repository, 'deploy-operations.sh'), 'fixture-host', 'HEAD', root, game]
    : [join(release, 'operations/deploy.mjs'), root, game, build], {
    cwd: repository, encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, OPS_TEST_CALLS: calls, OPS_TEST_FAIL: fail ? '1' : '0', COMPOSE_PROJECT_NAME: 'open-agricola' },
  })
  const recorded: string[][] = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  return { root, build, result, recorded }
}

it('publishes only monitoring services, preserves game identity and keeps credentials out of output', () => {
  const { root, build, result, recorded } = deploy(false)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout.trim())).toEqual({ operationsBuildId: build, gameContainersUnchanged: true })
  expect(readFileSync(join(root, 'deployed-build-id'), 'utf8')).toBe(build + '\n')
  expect(recorded.filter(args => args[0] === 'stop')).toEqual([['stop', 'legacy-prometheus', 'legacy-grafana', 'legacy-node-exporter']])
  expect(recorded.filter(args => args[0] === 'inspect')).toHaveLength(2)
  for (const args of recorded.filter(args => args[0] === 'compose')) {
    expect(args.slice(0, 3)).toEqual(['compose', '--project-name', 'open-agricola-operations'])
  }
  expect(recorded.some(args => args.includes('container-entry.ts') || args.includes('storage-archive-cli.ts') || args.includes('game-container') && args[0] !== 'inspect')).toBe(false)
  expect(result.stdout + result.stderr).not.toContain('private-scrape-token')
  expect(result.stdout + result.stderr).not.toContain('owner:private')
})

it('restores legacy monitoring when the first independent deployment fails and leaves the version marker absent', () => {
  const { root, result, recorded } = deploy(true)
  expect(result.status).not.toBe(0)
  expect(existsSync(join(root, 'deployed-build-id'))).toBe(false)
  expect(recorded.some(args => args.includes('down'))).toBe(true)
  expect(recorded.at(-1)).toEqual(['start', 'legacy-prometheus', 'legacy-grafana', 'legacy-node-exporter'])
})

it('preserves readable source permissions under the non-root deployment umask while keeping credentials private', () => {
  const { root, build, result } = deploy(false, { archive: true })
  expect(result.status, result.stderr).toBe(0)
  const release = join(root, 'releases', build)
  for (const file of ['accounts-exporter.ts', 'provision.ts', 'package.json']) {
    expect(statSync(join(release, 'operations', file)).mode & 0o777).toBe(0o644)
  }
  expect(statSync(join(release, 'config/runtime.env')).mode & 0o777).toBe(0o600)
  expect(statSync(join(root, 'accounts-password')).mode & 0o777).toBe(0o600)
})

it('rebuilds the local accounts image when the normal restart prepares monitoring', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-operations-local-'))
  roots.push(root)
  const bin = join(root, 'bin')
  const data = join(root, 'data')
  mkdirSync(bin)
  mkdirSync(data)
  writeFileSync(join(data, 'dependencies.local'), 'DATABASE_URL=postgresql://test@localhost/test\nOBSERVABILITY_METRICS_TOKEN=test-token\n')
  const calls = join(root, 'calls')
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs');
const args=process.argv.slice(2);
fs.appendFileSync(process.env.OPS_TEST_CALLS,JSON.stringify(args)+'\\n');
if(args.includes('config')) process.stdout.write(JSON.stringify({services:{grafana:{image:'fixture-grafana'}}}));
else if(args[0]==='run') fetch(args.at(-1)).then(r=>r.text()).then(body=>process.stdout.write(body));
`)
  chmodSync(join(bin, 'docker'), 0o755)
  const result = spawnSync(process.execPath, ['scripts/observability.mjs'], {
    cwd: repository, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PATH: bin + ':' + process.env.PATH, SHARED_DATA_DIR: data, OPS_TEST_CALLS: calls },
  })
  expect(result.status, result.stderr).toBe(0)
  const recorded: string[][] = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(recorded.at(-1)).toEqual(['compose', '-f', 'operations/compose.local.yml', 'up', '-d', '--build', '--force-recreate'])
})
