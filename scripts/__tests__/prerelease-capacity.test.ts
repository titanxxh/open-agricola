import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parsePrereleaseTarget } from '../prerelease/config'
import { assertCapacity, candidateTool, inspectImage, trustedArchiveTool } from '../prerelease/docker'
import { readRuntime, writeRuntime } from '../prerelease/runtime'

const memory = vi.hoisted(() => ({ bytes: 1408 * 1024 * 1024 }))
vi.mock('node:os', async importOriginal => ({ ...await importOriginal<typeof import('node:os')>(), freemem: () => memory.bytes }))
const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); memory.bytes = 1408 * 1024 * 1024 })

function fixture() {
  const temporary = mkdtempSync(join(tmpdir(), 'agricola-pre-capacity-'))
  roots.push(temporary)
  const template = parsePrereleaseTarget(JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')))
  const target = { ...template, directory: join(temporary, 'open-agricola-prerelease-main'), policyDirectory: resolve('.'),
    budgets: { ...template.budgets, app: { memoryMiB: 512, cpus: 1, pids: 128 }, tools: { memoryMiB: 256, cpus: 1, pids: 128 },
      import: { maxArchiveMiB: 256, memoryHeadroomMiB: 128 }, reserveMemoryMiB: 256, diskMiB: 256 } }
  mkdirSync(target.directory)
  mkdirSync(join(target.directory, 'data'))
  const objects = `S3_BUCKET=${target.objects.bucket}\nS3_PREFIX=live/\nS3_SECRET_ACCESS_KEY=fixture\nS3_ENDPOINT=${target.objects.endpoint}\nS3_REGION=us-east-1\nS3_FORCE_PATH_STYLE=true\n`
  writeFileSync(join(target.directory, '.env'), `DATABASE_URL=postgres://${target.database.appRole}:fixture@${target.database.host}/${target.database.name}\nS3_ACCESS_KEY_ID=${target.objects.appKeyId}\n${objects}`, { mode: 0o600 })
  writeFileSync(join(target.directory, 'data/dependencies.compose.env'), `DATABASE_URL=postgres://${target.database.backupRole}:fixture@${target.database.host}/${target.database.name}\nVALIDATION_DATABASE_URL=postgres://${target.validationDatabase.role}:fixture@${target.validationDatabase.host}/${target.validationDatabase.name}\nS3_ACCESS_KEY_ID=${target.objects.backupKeyId}\n${objects}`, { mode: 0o600 })
  const bin = join(temporary, 'bin'); mkdirSync(bin)
  const buildId = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), image = `sha256:${'d'.repeat(64)}`
  const state = { app: false, tool: false, appProject: target.project, appMemory: 512 * 1024 * 1024 }
  const statePath = join(temporary, 'state.json'), callsPath = join(temporary, 'calls.jsonl')
  const save = () => writeFileSync(statePath, JSON.stringify(state))
  save()
  writeFileSync(join(bin, 'docker'), String.raw`#!${process.execPath}
const fs = require('node:fs'), args = process.argv.slice(2), line = args.join(' ');
const path = ${JSON.stringify(statePath)}, state = JSON.parse(fs.readFileSync(path, 'utf8'));
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(args)+'\n');
const output = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
if (args[0] === 'ps') {
  if (line.includes('com.docker.compose.service=app') && state.app) output('${'a'.repeat(64)}');
  if (line.includes('org.open-agricola.backup.environment=') && state.tool) output('${'c'.repeat(64)}');
} else if (args[0] === 'inspect') {
  const field=args[2];
  if (field==='{{json .}}') output({Image:${JSON.stringify(image)},State:{Running:state.app},HostConfig:{Memory:state.appMemory},
    Config:{Labels:{'com.docker.compose.project':state.appProject,'com.docker.compose.service':'app'}}});
  if(field==='{{json .Config.Labels}}') output({'org.open-agricola.environment':${JSON.stringify(target.targetId)}});
  if(field==='{{json .State}}') output({Running:state.app,OOMKilled:false,ExitCode:0});
  if(field==='{{json .Config}}') output({User:'1000:1000'});
  if(field==='{{json .Mounts}}') output([]);
  if(field==='{{json .HostConfig}}') output({Privileged:false,Memory:1073741824,NanoCpus:1000000000,PidsLimit:256});
} else if (args[0] === 'image') {
  if(args[3]==='{{.Id}}') output(${JSON.stringify(image)});
  else output({'org.opencontainers.image.revision':${JSON.stringify(buildId)},'io.open-agricola.release-channel':'prerelease'});
} else if (line.includes('/app/frontend-dist/frontend-build.json')) output({format:1,gameBuildId:${JSON.stringify(buildId)},basePath:'/open-agricola/',releaseChannel:'prerelease',deploymentTarget:'prerelease-hosted'});
`, { mode: 0o700 })
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
  return { target, state, save, image, buildId, calls: () => readFileSync(callsPath, 'utf8') }
}

it('refuses a missing trusted policy import without building or creating a runtime record', () => {
  const value = fixture()
  expect(() => trustedArchiveTool(value.target, 'tools', ['export-online'])).toThrow('Missing verified imported image')
  expect(value.calls()).not.toMatch(/buildx|"build"|"start"/)
})

function installed(value: ReturnType<typeof fixture>) {
  writeRuntime(value.target, { ...readRuntime(value.target), buildId: value.buildId,
    installed: { buildId: value.buildId, image: value.image, installedAt: 1 } })
}

it('uses the actual stopped app state for tools and reserves its full cap when it is running', () => {
  const value = fixture()
  installed(value)
  memory.bytes = 600 * 1024 * 1024
  expect(candidateTool(value.target, 'tools', ['test'])).toBe('')
  value.state.app = true; value.save()
  expect(() => candidateTool(value.target, 'tools', ['test'])).toThrow('tool capacity is below the conservative budget')
  expect(value.calls().split('["compose"')).toHaveLength(2)
  expect(value.calls()).not.toContain('["stop"')
})

it('gates the 64 MiB image inspection before starting its container', () => {
  const value = fixture()
  memory.bytes = 380 * 1024 * 1024
  expect(() => inspectImage(value.target, value.image, value.buildId)).toThrow('inspect-image capacity')
  expect(value.calls()).not.toContain('["run"')
})

it.each(['project', 'unbounded-memory'])('rejects a running app with %s outside the sealed target', mismatch => {
  const value = fixture()
  installed(value)
  value.state.app = true
  if (mismatch === 'project') value.state.appProject = 'open-agricola'
  else value.state.appMemory = 0
  value.save()
  expect(() => candidateTool(value.target, 'tools', ['test'])).toThrow('application identity or memory limit')
  expect(value.calls()).not.toContain('["compose"')
})

it("rejects an overlapping archive tool without removing another operation's containers", () => {
  const value = fixture()
  value.state.tool = true; value.save()
  expect(() => candidateTool(value.target, 'tools', ['test'])).toThrow('other tools to be stopped')
  expect(value.calls()).not.toContain('["rm"')
  expect(value.calls()).not.toContain('["compose"')
})



it('gates import on its separate headroom without a build-memory budget', () => {
  const value = fixture()
  memory.bytes = 447 * 1024 * 1024
  expect(() => assertCapacity(value.target, 'import')).toThrow('import capacity is below the conservative budget')
  memory.bytes = 448 * 1024 * 1024
  expect(() => assertCapacity(value.target, 'import')).not.toThrow()
  expect(value.calls()).not.toMatch(/buildx|"build"|"load"/)
})
