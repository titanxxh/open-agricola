import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createWhatsNewHandler } from '../../server/whats-new'

const repository = resolve(import.meta.dirname, '../..')
const roots: string[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const releases = (count: number, first = 1) => Array.from({ length: count }, (_, index) => ({
  version: `v1.0.${first + count - 1 - index}`,
  date: `2026-10-${String(10 + count - index).padStart(2, '0')}`,
  items: [{ zh: `第 ${first + count - 1 - index} 版`, en: `Release ${first + count - 1 - index}` }],
}))

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-whats-new-'))
  roots.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}
const {spawnSync}=require('node:child_process');
const input=require('node:fs').readFileSync(0);
const result=spawnSync('bash',['-c',process.argv[3]],{
  input:process.env.TRUNCATE==='1'?input.subarray(0,20):input,stdio:['pipe','inherit','inherit']
});
process.exit(result.status??1);
`)
  chmodSync(join(bin, 'ssh'), 0o755)
  const game = join(root, "game's files")
  const directory = join(game, 'data/community')
  let written = 0
  const notes = (value: unknown) => {
    const path = join(root, `notes-${written++}.json`)
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    return path
  }
  const update = (path: string, truncate = false) => spawnSync('bash', [join(repository, 'deploy-operations.sh'), '--whats-new', 'fixture-host', path, game], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TRUNCATE: truncate ? '1' : '0' },
  })
  return { root, directory, notes, update }
}

async function serve(directory: string) {
  const handler = createWhatsNewHandler(directory)
  const server = createServer((req, res) => { void handler(req, res).then(handled => { if (!handled) res.writeHead(404).end() }) })
  servers.push(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address')
  return `http://127.0.0.1:${address.port}/api/whats-new`
}

it('serves the newest five releases of each update without caching or restarting', async () => {
  const { directory, notes, update } = fixture()
  const url = await serve(directory)
  const missing = await fetch(url)
  expect(missing.status).toBe(404)
  expect(missing.headers.get('cache-control')).toBe('no-store')

  const first = notes({ releases: releases(3) })
  const result = update(first)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({
    whatsNewSha256: createHash('sha256').update(readFileSync(first)).digest('hex'), releases: 3, latest: 'v1.0.3',
  })
  expect(readFileSync(join(directory, 'whats-new.json'))).toEqual(readFileSync(first))
  const served = await fetch(url)
  expect(served.status).toBe(200)
  expect(served.headers.get('cache-control')).toBe('no-store')
  expect(served.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(await served.json()).toEqual({ releases: releases(3) })

  expect(update(notes({ releases: releases(7) })).status).toBe(0)
  const trimmed = await (await fetch(url)).json()
  expect(trimmed.releases.map((release: { version: string }) => release.version)).toEqual(['v1.0.7', 'v1.0.6', 'v1.0.5', 'v1.0.4', 'v1.0.3'])
  expect((await fetch(url, { method: 'HEAD' })).status).toBe(200)
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(405)
})

it('keeps the live notes when the upload is invalid, oversized or truncated in transfer', () => {
  const { root, directory, notes, update } = fixture()
  const original = notes({ releases: releases(2) })
  expect(update(original).status).toBe(0)
  const target = join(directory, 'whats-new.json')
  const oversized = { releases: [{ version: 'v1', date: '2026-11-02', items: Array.from({ length: 30 }, () => ({ zh: '字'.repeat(500), en: 'x'.repeat(500) })) }] }
  for (const [invalid, message, truncate] of [
    ['{ not json', 'Invalid What\'s New file', false],
    [{ releases: releases(2).reverse() }, 'releases[1].date: list releases newest first', false],
    [{ releases: Array.from({ length: 6 }, () => oversized.releases[0]).map((release, index) => ({ ...release, version: `v${index}` })) }, 'no larger than 256 KiB', false],
    [{ releases: releases(4) }, 'Release notes transfer checksum mismatch', true],
  ] as const) {
    const result = update(notes(invalid), truncate)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(message)
    expect(readFileSync(target)).toEqual(readFileSync(original))
  }
  expect(readFileSync(target)).toEqual(readFileSync(original))
  expect(readdirSync(directory).filter(file => file.startsWith('.whats-new.json.'))).toEqual(['.whats-new.json.lock'])
  expect(readdirSync(root).includes('deployed-build-id')).toBe(false)
})

it('answers 503 for a live file edited by hand into an invalid state, then recovers on the next valid write', async () => {
  const { directory, notes, update } = fixture()
  const url = await serve(directory)
  expect(update(notes({ releases: releases(1) })).status).toBe(0)
  writeFileSync(join(directory, 'whats-new.json'), '{"releases":[{"version":"v1","date":"yesterday","items":[]}]}')
  const broken = await fetch(url)
  expect(broken.status).toBe(503)
  expect(broken.headers.get('cache-control')).toBe('no-store')
  expect(update(notes({ releases: releases(1) })).status).toBe(0)
  expect((await fetch(url)).status).toBe(200)
})
