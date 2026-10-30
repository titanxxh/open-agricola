import { once } from 'node:events'
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFrontendHosting } from '../frontend-hosting'

const BUILD_ID = '7123456789abcdef0123456789abcdef0123456789'
const APP_URL = 'https://game.example/open-agricola/'
const HTML = '<!doctype html><title>Hosted Agricola</title><main>Game</main>'
const SCRIPT = 'globalThis.hostedAgricola = true'
type HttpResult = { status: number; headers: IncomingHttpHeaders; body: string }

let temporary: string
let directory: string
let env: NodeJS.ProcessEnv
let servers: Server[]

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'agricola-frontend-'))
  directory = join(temporary, 'dist')
  mkdirSync(join(directory, 'assets'), { recursive: true })
  mkdirSync(join(directory, 'i18n'), { recursive: true })
  mkdirSync(join(directory, 'card-encyclopedia'), { recursive: true })
  writeFileSync(join(directory, 'index.html'), HTML)
  writeFileSync(join(directory, 'frontend-build.json'), JSON.stringify({ format: 1, gameBuildId: BUILD_ID, basePath: '/open-agricola/' }))
  writeFileSync(join(directory, 'assets/index-Ab1234Cd.js'), SCRIPT)
  writeFileSync(join(directory, 'assets/index-Ab1234Cd.css'), 'body{color:green}')
  writeFileSync(join(directory, 'i18n/zh.0123456789abcdef.json'), '{"locale":"zh"}')
  writeFileSync(join(directory, 'i18n/manifest.json'), '{"version":1}')
  writeFileSync(join(directory, 'cards-manifest.json'), '{"cards":[]}')
  writeFileSync(join(directory, 'card-encyclopedia/catalog.0123456789abcdef.json'), '{"version":1}')
  writeFileSync(join(directory, 'card-encyclopedia/manifest.json'), '{"version":1}')
  env = { FRONTEND_ROOT: directory, GAME_BUILD_ID: BUILD_ID, PUBLIC_APP_ORIGIN: APP_URL, PUBLIC_API_BASE: 'https://game.example' }
  servers = []
})

afterEach(async () => {
  for (const server of servers) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
  rmSync(temporary, { recursive: true, force: true })
})

async function start(options = env) {
  const handle = createFrontendHosting(options)
  const server = createServer((req, res) => {
    void handle(req, res).then(handled => {
      if (!handled) { res.writeHead(418, { 'Content-Type': 'text/plain' }); res.end('Other route') }
    }).catch(() => { res.writeHead(500); res.end('Handler failed') })
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('HTTP fixture is not listening')
  return (path: string, method = 'GET', headers: Record<string, string> = {}): Promise<HttpResult> => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, method, headers }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { body += chunk })
      res.on('error', reject)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('frontend hosting', () => {
  it('moves only old API application entries to the configured same-site Pages host', async () => {
    const get = await start({ ...env, PUBLIC_APP_ORIGIN: 'https://open-agricola.titanxxh.com/', PUBLIC_API_BASE: 'https://openagapi.titanxxh.com' })
    for (const path of ['/open-agricola', '/open-agricola/', '/open-agricola/index.html']) {
      const response = await get(`${path}?room=retained&step=7&frame=abc&perspective=p1&token=private&next=https://elsewhere.example`)
      expect(response.status).toBe(308)
      expect(response.headers.location).toBe('https://open-agricola.titanxxh.com/?room=retained&step=7&frame=abc&perspective=p1#')
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(await get('/open-agricola/', 'HEAD')).toMatchObject({ status: 308, body: '' })
    expect(await get('/open-agricola/', 'POST')).toMatchObject({ status: 405 })
    for (const path of ['/open-agricola/assets/index-Ab1234Cd.js', '/api/auth/me', '/ops/', '/replay-viewers/build/index.html']) {
      expect(await get(path)).toMatchObject({ status: 418 })
    }
    expect(JSON.parse((await get('/api/app-location')).body)).toEqual({ mode: 'disabled' })
  })

  it('restarts an old-origin onboarding flow instead of forwarding its credentials', async () => {
    const get = await start({ ...env, PUBLIC_APP_ORIGIN: 'https://open-agricola.titanxxh.com/', PUBLIC_API_BASE: 'https://openagapi.titanxxh.com' })
    const response = await get('/open-agricola/?page=onboarding&onboardingTicket=private')
    expect(response.status).toBe(308)
    expect(response.headers.location).toBe('https://open-agricola.titanxxh.com/?page=login&authMode=register&authError=oauth_onboarding_expired#')
  })

  it('publishes canonical location without credentials and gives HEAD the same metadata headers', async () => {
    const get = await start()
    const response = await get('/api/app-location?cache=ignored', 'GET', { origin: 'https://old-pages.example', cookie: 'oa_session=not-public', authorization: 'Bearer not-public', host: 'untrusted.example' })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ mode: 'canonical', appUrl: APP_URL, buildId: BUILD_ID })
    expect(response.headers['access-control-allow-origin']).toBe('*')
    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.body).not.toContain('not-public')
    const head = await get('/api/app-location', 'HEAD')
    expect(head.status).toBe(200)
    expect(head.body).toBe('')
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength(response.body)))
    expect(head.headers['cache-control']).toBe('no-store')
  })

  it.each([
    { FRONTEND_ROOT: undefined },
    { PUBLIC_APP_ORIGIN: undefined },
    { PUBLIC_API_BASE: undefined },
    { PUBLIC_APP_ORIGIN: 'https://pages.example/open-agricola/' },
    { PUBLIC_API_BASE: 'https://game.example/agricola-api' },
    { PUBLIC_APP_ORIGIN: 'https://game.example/' },
    { PUBLIC_APP_ORIGIN: 'https://game.example/another-app/' },
    { PUBLIC_APP_ORIGIN: 'https://game.example/open-agricola' },
  ])('leaves valid unsupported topology untouched: %j', async overrides => {
    const get = await start({ ...env, ...overrides })
    const metadata = await get('/api/app-location')
    expect(metadata.status).toBe(200)
    expect(JSON.parse(metadata.body)).toEqual({ mode: 'disabled' })
    expect(await get('/open-agricola/')).toMatchObject({ status: 418, body: 'Other route' })
  })

  it.each([
    ['PUBLIC_APP_ORIGIN', 'not a URL'],
    ['PUBLIC_API_BASE', 'ftp://game.example'],
    ['PUBLIC_APP_ORIGIN', 'https://user:secret@game.example/open-agricola/'],
    ['PUBLIC_APP_ORIGIN', 'https://game.example/open-agricola/?redirect=elsewhere'],
    ['PUBLIC_API_BASE', 'https://game.example/#secret'],
  ])('rejects malformed configured %s', (key, value) => {
    expect(() => createFrontendHosting({ ...env, [key]: value })).toThrow(`Invalid ${key}`)
  })

  it('requires a real directory, index, metadata and exact build identity only when hosting is enabled', () => {
    expect(() => createFrontendHosting({ ...env, FRONTEND_ROOT: join(temporary, 'missing') })).toThrow('Hosted frontend directory is missing')
    expect(() => createFrontendHosting({ ...env, FRONTEND_ROOT: join(directory, 'index.html') })).toThrow('Invalid hosted frontend directory')
    expect(() => createFrontendHosting({ ...env, GAME_BUILD_ID: undefined })).toThrow('build identity')
    expect(() => createFrontendHosting({ ...env, GAME_BUILD_ID: 'another-build' })).toThrow('build identity')
    unlinkSync(join(directory, 'index.html'))
    expect(() => createFrontendHosting(env)).toThrow('missing index.html')
    writeFileSync(join(directory, 'index.html'), HTML)
    unlinkSync(join(directory, 'frontend-build.json'))
    expect(() => createFrontendHosting(env)).toThrow('missing frontend-build.json')
    expect(() => createFrontendHosting({ ...env, PUBLIC_APP_ORIGIN: 'https://pages.example/' })).not.toThrow()
  })

  it.each([
    'not JSON',
    '{"format":2,"gameBuildId":"other","basePath":"/open-agricola/"}',
    '{"format":1,"gameBuildId":"","basePath":"/open-agricola/"}',
    '{"format":1,"gameBuildId":1,"basePath":"/open-agricola/"}',
    '{"format":1,"gameBuildId":"other","basePath":"/"}',
  ])('rejects invalid build metadata: %s', metadata => {
    writeFileSync(join(directory, 'frontend-build.json'), metadata)
    expect(() => createFrontendHosting(env)).toThrow('Invalid hosted frontend build metadata')
  })

  it.each(['index.html', 'frontend-build.json'])('rejects an escaping startup symlink for %s', file => {
    const outside = join(temporary, `outside-${file}`)
    writeFileSync(outside, readFileSync(join(directory, file)))
    unlinkSync(join(directory, file))
    symlinkSync(outside, join(directory, file))
    expect(() => createFrontendHosting(env)).toThrow(`Invalid hosted frontend ${file}`)
  })

  it('serves actual application files with MIME, nosniff and bounded cache semantics', async () => {
    const get = await start()
    const index = await get('/open-agricola/?room=retained')
    expect(index).toMatchObject({ status: 200, body: HTML })
    expect(index.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(index.headers['cache-control']).toBe('no-cache')
    const script = await get('/open-agricola/assets/index-Ab1234Cd.js')
    expect(script).toMatchObject({ status: 200, body: SCRIPT })
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(script.headers['x-content-type-options']).toBe('nosniff')
    const head = await get('/open-agricola/assets/index-Ab1234Cd.js', 'HEAD')
    expect(head).toMatchObject({ status: 200, body: '' })
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength(SCRIPT)))
    expect(head.headers['content-type']).toBe(script.headers['content-type'])
    const css = await get('/open-agricola/assets/index-Ab1234Cd.css')
    expect(css).toMatchObject({ status: 200, body: 'body{color:green}' })
    expect(css.headers['content-type']).toBe('text/css; charset=utf-8')
    const language = await get('/open-agricola/i18n/zh.0123456789abcdef.json')
    expect(language).toMatchObject({ status: 200, body: '{"locale":"zh"}' })
    expect(language.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const catalog = await get('/open-agricola/card-encyclopedia/catalog.0123456789abcdef.json')
    expect(catalog).toMatchObject({ status: 200, body: '{"version":1}' })
    expect(catalog.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    for (const path of ['i18n/manifest.json', 'card-encyclopedia/manifest.json', 'cards-manifest.json', 'frontend-build.json']) {
      const response = await get(`/open-agricola/${path}`)
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
      expect(response.headers['cache-control']).toBe('no-cache')
    }
  })

  it('adds the base slash without losing the game query', async () => {
    const get = await start()
    const response = await get('/open-agricola?room=retained&step=7&frame=abc')
    expect(response.status).toBe(308)
    expect(response.headers.location).toBe('/open-agricola/?room=retained&step=7&frame=abc')
  })

  it('returns 404 for missing assets and never substitutes the application HTML', async () => {
    const get = await start()
    for (const path of ['assets/unknown.js', 'i18n/unknown.json', 'unknown-page', 'assets/']) {
      const response = await get(`/open-agricola/${path}`)
      expect(response).toMatchObject({ status: 404, body: 'Not found' })
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8')
    }
  })

  it.each([
    '/open-agricola/../outside.txt',
    '/open-agricola/%2e%2e/outside.txt',
    '/open-agricola/assets/%2e%2e/index.html',
    '/open-agricola/assets/./index-Ab1234Cd.js',
    '/open-agricola/.env',
    '/open-agricola/assets/%2Ehidden',
    '/open-agricola/assets%5cindex-Ab1234Cd.js',
    '/open-agricola/%00index.html',
    '/open-agricola/%zz',
  ])('rejects unsafe raw path %s', async path => {
    const get = await start()
    expect(await get(path)).toMatchObject({ status: 400, body: 'Invalid path' })
  })

  it('does not follow an escaping asset symlink', async () => {
    writeFileSync(join(temporary, 'private.js'), 'private-contents')
    symlinkSync(join(temporary, 'private.js'), join(directory, 'assets/escaped.js'))
    const get = await start()
    expect(await get('/open-agricola/assets/escaped.js')).toMatchObject({ status: 404, body: 'Not found' })
  })

  it('limits owned routes to GET/HEAD and leaves API, Replay and operational namespaces alone', async () => {
    const get = await start()
    for (const path of ['/api/app-location', '/open-agricola/']) {
      const response = await get(path, 'POST')
      expect(response.status).toBe(405)
      expect(response.headers.allow).toBe('GET, HEAD')
    }
    for (const path of ['/api/health', '/api/app-location/extra', '/api/rooms/locate', '/nodes/instance/ws', '/internal/metrics', '/ops/', '/replay-viewers/build/index.html', '/open-agricola-other/']) {
      expect(await get(path)).toMatchObject({ status: 418, body: 'Other route' })
    }
  })
})
