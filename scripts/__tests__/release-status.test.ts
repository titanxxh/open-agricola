import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const cleanups: Array<() => unknown> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const cli = resolve(import.meta.dirname, '../release/status.ts')
const sha = 'a'.repeat(40), producer = 'b'.repeat(40), operationId = '12345678-1234-1234-1234-123456789abc'

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-release-status-')); cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'bin'); mkdirSync(bin)
  const calls = join(root, 'calls.jsonl'), statePath = join(root, 'state.json'), configPath = join(root, 'config.json'), acceptanceFile = join(root, 'acceptance.json')
  const state = { gh: 'unavailable', backend: 'accepted', public: 'valid', image: 'in_progress' }
  const save = () => writeFileSync(statePath, JSON.stringify(state)); save()
  const common = `const fs=require('node:fs'),a=process.argv.slice(2),s=JSON.parse(fs.readFileSync(${JSON.stringify(statePath)},'utf8'));fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({tool:require('node:path').basename(process.argv[1]),args:a})+'\\n');const out=x=>console.log(JSON.stringify(x));`
  writeFileSync(join(bin, 'gh'), `#!${process.execPath}\n${common}
if(a[0]!=='api'||a.includes('--method'))process.exit(90);
if(s.gh==='absent'){console.error('gh: Not Found (HTTP 404)');process.exit(1)}
if(a[1].includes('/releases/tags/')&&s.gh!=='unavailable')out({id:11,tag_name:'v9.9.9',draft:s.gh==='draft',prerelease:false});
else if(a[1].includes('/git/ref/tags/'))out({object:{type:'commit',sha:s.gh==='conflict'?'f'.repeat(40):${JSON.stringify(sha)}}});
else if(a[1].includes('/actions/runs/'))out({id:42,run_attempt:2,status:s.image,conclusion:s.image==='completed'?'success':null});
else{console.error('Fixture native unavailable PRIVATE_TOKEN_SENTINEL');process.exit(1)}
`, { mode: 0o700 })
  writeFileSync(join(bin, 'git'), `#!${process.execPath}\n${common}if(a.includes('rev-parse'))console.log(${JSON.stringify(producer)});else if(!a.includes('status'))process.exit(91);\n`, { mode: 0o700 })
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}\n${common}if(!a[1].includes("'status'")||a[1].includes("'resume'"))process.exit(92);out({kind:'backend-image-operation',operationId:${JSON.stringify(operationId)},sourceSha:${JSON.stringify(sha)},producerSha:${JSON.stringify(producer)},bindingSha256:'d'.repeat(64),state:s.backend,phase:s.backend==='accepted'?'accepted':'validating',nextAction:s.backend==='accepted'?'none':'wait',validatorExitCode:null});\n`, { mode: 0o700 })
  const server = createServer((req, res) => {
    if (state.public === 'redirect') { res.writeHead(302, { Location: 'https://never-follow.invalid/' }).end(); return }
    if (state.public === 'missing') { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', 'application/json')
    const build = state.public === 'conflict' ? 'f'.repeat(40) : sha
    if (req.url === '/frontend-build.json') res.end(JSON.stringify({ format: 1, gameBuildId: build, basePath: '/', releaseChannel: 'stable', deploymentTarget: 'stable-pages' }))
    else if (req.url === '/api/auth/browser-policy') res.end(JSON.stringify({ version: 2, buildId: build, appOrigin: origin, apiOrigin: origin }))
    else if (req.url === '/api/health') res.end(JSON.stringify({ ok: true }))
    else res.writeHead(404).end()
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local status fixture address')
  const origin = `http://127.0.0.1:${address.port}`
  const closeServer = async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())) }
  cleanups.push(closeServer)
  const config = { repository: 'titanxxh/open-agricola', version: 'v9.9.9', candidateSha: sha, apiOrigin: origin, appOrigin: origin,
    image: { runId: 42, runAttempt: 2, artifactId: 99 }, backend: { host: 'owner@host.test', directory: '/srv/formal', operationId }, acceptanceFile }
  const report = { format: 1, expectedBuild: sha, appOrigin: origin, apiOrigin: origin, startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:01:00Z', passed: true,
    gamesCreated: 0, gameplayCommands: 0, privateSession: 'PRIVATE_TOKEN_SENTINEL', browsers: ['chromium', 'webkit'].map(engine => ({ engine,
      login: true, logout: true, cookie: true, lobby: true, routedInstances: 2, ordinaryRoom: true, reconnect: true, replay: true, blockedRequests: 0, cleanupFailures: Array<string>() })) }
  const writeConfig = (value: unknown = config) => writeFileSync(configPath, JSON.stringify(value), { mode: 0o600 })
  const writeReport = (value: unknown = report) => writeFileSync(acceptanceFile, JSON.stringify(value), { mode: 0o600 })
  writeConfig(); writeReport()
  const run = () => new Promise<{ status: number | null; stdout: string; stderr: string }>((done, reject) => {
    const child = spawn(process.execPath, [cli, '--config', configPath], { cwd: root, env: { ...process.env, CI: '', GITHUB_ACTIONS: '', PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject); child.on('close', status => done({ status, stdout, stderr }))
  })
  const events = (): Array<{ tool: string; args: string[] }> => existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
  return { root, state, save, config, configPath, acceptanceFile, report, writeConfig, writeReport, run, events, closeServer }
}

it('queries real read-only provider boundaries and separates saved acceptance from live Pages', async () => {
  const value = await fixture(), result = await value.run()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'release-status', candidateSha: sha, stages: {
    release: { state: 'unavailable', evidence: 'native' }, image: { state: 'pending' }, backend: { state: 'verified' },
    pages: { state: 'verified', evidence: 'live' }, acceptance: { state: 'verified', evidence: 'saved', reason: 'saved-acceptance-passed-not-live', observedAt: '2026-01-01T00:01:00.000Z' },
  } })
  expect(result.stdout + result.stderr).not.toContain('PRIVATE_TOKEN_SENTINEL')
  expect(value.events().some(event => event.tool === 'ssh' && event.args[1]?.includes("'status'"))).toBe(true)
  expect(value.events().every(event => !event.args.includes('--method'))).toBe(true)
})

it.each(['absent', 'draft', 'conflict', 'published'])('reports native release %s without publishing or bypassing candidate verification', async gh => {
  const value = await fixture(); value.state.gh = gh; value.save()
  const result = await value.run(), expected = gh === 'absent' ? 'absent' : gh === 'draft' ? 'pending' : gh === 'conflict' ? 'conflict' : 'unavailable'
  expect(JSON.parse(result.stdout).stages.release.state).toBe(expected)
  if (gh === 'published') expect(value.events().some(event => event.args[1] === 'repos/titanxxh/open-agricola')).toBe(true)
  expect(value.events().every(event => !event.args.includes('--method'))).toBe(true)
})

it('uses the existing native image verifier instead of accepting a successful build alone', async () => {
  const value = await fixture(); value.state.image = 'completed'; value.save()
  const result = await value.run()
  expect(JSON.parse(result.stdout).stages.image).toMatchObject({ state: 'unavailable', reason: 'image-proof-unavailable' })
  expect(value.events().some(event => event.args[1] === 'repos/titanxxh/open-agricola/actions/workflows/container-image-build.yml')).toBe(true)
})

it.each(['running', 'resumable', 'blocked', 'unknown'])('observes backend %s without authorizing continuation', async backend => {
  const value = await fixture(); value.state.backend = backend; value.save()
  const result = await value.run()
  expect(JSON.parse(result.stdout).stages.backend.state).toBe(backend === 'blocked' ? 'conflict' : backend === 'unknown' ? 'unavailable' : 'pending')
  expect(value.events().filter(event => event.tool === 'ssh')).toHaveLength(1)
})

it.each(['conflict', 'redirect', 'missing', 'connection'])('does not treat public %s as current live readiness', async mode => {
  const value = await fixture(); value.state.public = mode
  if (mode === 'connection') await value.closeServer()
  const result = await value.run()
  expect(JSON.parse(result.stdout).stages.pages.state).toBe(mode === 'conflict' ? 'conflict' : mode === 'missing' ? 'absent' : 'unavailable')
})

it.each(['candidate', 'game writes', 'browser', 'cleanup'])('rejects saved acceptance with mismatched %s', async failure => {
  const value = await fixture()
  if (failure === 'candidate') value.report.expectedBuild = 'f'.repeat(40)
  if (failure === 'game writes') value.report.gameplayCommands = 1
  if (failure === 'browser') value.report.browsers.pop()
  if (failure === 'cleanup') value.report.browsers[0]!.cleanupFailures = ['own-session-logout']
  value.writeReport()
  expect(JSON.parse((await value.run()).stdout).stages.acceptance.state).toBe('conflict')
})

it.each(['appOrigin', 'apiOrigin'] satisfies Array<'appOrigin' | 'apiOrigin'>)('rejects saved acceptance from another %s for the same candidate', async field => {
  const value = await fixture()
  value.report[field] = 'https://other.agricola.test'
  value.writeReport()
  const stages = JSON.parse((await value.run()).stdout).stages
  expect(stages.pages).toMatchObject({ state: 'verified', evidence: 'live' })
  expect(stages.acceptance).toMatchObject({ state: 'conflict', evidence: 'saved', reason: 'saved-acceptance-origin-mismatch' })
})

it.each(['appOrigin', 'apiOrigin'])('rejects legacy saved acceptance missing %s', async field => {
  const value = await fixture()
  value.writeReport(Object.fromEntries(Object.entries(value.report).filter(([key]) => key !== field)))
  expect(JSON.parse((await value.run()).stdout).stages.acceptance)
    .toMatchObject({ state: 'conflict', evidence: 'saved', reason: 'saved-acceptance-origins-missing' })
})

it('reports missing optional evidence explicitly instead of inferring stage success', async () => {
  const value = await fixture()
  const { image: _image, backend: _backend, acceptanceFile: _acceptanceFile, ...minimal } = value.config
  value.writeConfig(minimal)
  const stages = JSON.parse((await value.run()).stdout).stages
  for (const name of ['image', 'backend', 'acceptance']) expect(stages[name].state).toBe('unavailable')
  expect(value.events().some(event => event.tool === 'ssh')).toBe(false)
})

it.each(['permissions', 'symlink', 'unknown key'])('rejects invalid private configuration %s before querying providers', async failure => {
  const value = await fixture()
  if (failure === 'permissions') chmodSync(value.configPath, 0o644)
  if (failure === 'symlink') { const target = join(value.root, 'actual.json'); writeFileSync(target, JSON.stringify(value.config), { mode: 0o600 }); rmSync(value.configPath); symlinkSync(target, value.configPath) }
  if (failure === 'unknown key') value.writeConfig({ ...value.config, token: 'PRIVATE_TOKEN_SENTINEL' })
  const result = await value.run()
  expect(result.status).toBe(1); expect(result.stderr).not.toContain('PRIVATE_TOKEN_SENTINEL'); expect(value.events()).toEqual([])
})
