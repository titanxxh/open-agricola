import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startupCheckScript } from '../prerelease/docker'

const origin = 'https://pre.example.test'
const buildId = 'a'.repeat(40)
const generation = '00000000-0000-4000-8000-000000000001'
const servers: Server[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(done => server.close(done))))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** Mirrors the candidate public entry: production rejects every non-health path on another Host,
 * and prerelease admission requires a session for served frontend resources. */
async function candidateEntry(served: { buildId: string } = { buildId }) {
  const seen: Array<{ path: string; host: string | undefined; proto: string | string[] | undefined }> = []
  const server = createServer((req, res) => {
    seen.push({ path: req.url ?? '', host: req.headers.host, proto: req.headers['x-forwarded-proto'] })
    const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (req.url !== '/api/health' && req.headers.host !== new URL(origin).host) return send(403, { ok: false, message: 'Invalid public host' })
    if (req.url === '/api/health') return send(200, { ok: true })
    if (req.url === '/api/app-location') return send(200, { buildId: served.buildId })
    if (req.url === '/open-agricola/frontend-build.json') return send(401, { ok: false, code: 'prerelease_auth_required' })
    send(404, {})
  })
  servers.push(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return { port: (server.address() as AddressInfo).port, seen }
}

function frontendRoot(gameBuildId = buildId) {
  const directory = mkdtempSync(join(tmpdir(), 'oa-startup-check-'))
  directories.push(directory)
  writeFileSync(join(directory, 'frontend-build.json'), JSON.stringify({ format: 1, gameBuildId, basePath: '/open-agricola/', releaseChannel: 'prerelease', deploymentTarget: 'prerelease-hosted' }))
  return directory
}

function runCheck(port: number, root = frontendRoot()) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', startupCheckScript({ buildId, generation, origin }, port)],
      { env: { ...process.env, PRERELEASE_DATA_GENERATION: generation, FRONTEND_ROOT: root } })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', fail)
    child.on('close', code => done({ code, stdout, stderr }))
  })
}

describe('prerelease startup identity check', () => {
  it('reaches the candidate public entry with the target Host and verifies its identity', async () => {
    const entry = await candidateEntry()

    const result = await runCheck(entry.port)

    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ buildId, channel: 'prerelease', generation })
    expect(entry.seen.filter(request => request.path !== '/api/health'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ path: '/api/app-location', host: 'pre.example.test', proto: 'https' })]))
  })

  it('fails when the live server build differs from the installed build', async () => {
    const entry = await candidateEntry({ buildId: 'b'.repeat(40) })

    const result = await runCheck(entry.port)

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('Prerelease identity mismatch')
  })

  it('fails when the image frontend build differs from the installed build', async () => {
    const entry = await candidateEntry()

    const result = await runCheck(entry.port, frontendRoot('c'.repeat(40)))

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('Prerelease identity mismatch')
  })
})
