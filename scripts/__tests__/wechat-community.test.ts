import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createCanvas } from 'canvas'
import { afterEach, expect, it } from 'vitest'
import { createCommunityQrHandler } from '../../server/community-qr'

const repository = resolve(import.meta.dirname, '../..')
const roots: string[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-wechat-'))
  roots.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}
const {spawnSync}=require('node:child_process');
const input=require('node:fs').readFileSync(0);
const result=spawnSync('bash',['-c',process.argv[3]],{
  input:process.env.TRUNCATE_QR==='1'?input.subarray(0,20):input,stdio:['pipe','inherit','inherit']
});
process.exit(result.status??1);
`)
  chmodSync(join(bin, 'ssh'), 0o755)
  const game = join(root, "game's files")
  const directory = join(game, 'data/community')
  const update = (image: string, truncate = false) => spawnSync('bash', [join(repository, 'deploy-operations.sh'), '--wechat-qr', 'fixture-host', image, game], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TRUNCATE_QR: truncate ? '1' : '0' },
  })
  const image = (name: string, color: string, format: 'image/png' | 'image/jpeg' = 'image/png') => {
    const canvas = createCanvas(300, 400)
    const context = canvas.getContext('2d')
    context.fillStyle = color
    context.fillRect(0, 0, 300, 400)
    context.fillStyle = '#000'
    context.fillText(`TEST IMAGE ${name}`, 20, 40)
    const path = join(root, `${name}.image`)
    const bytes = format === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg')
    writeFileSync(path, bytes)
    return path
  }
  return { root, directory, update, image }
}

it('serves the latest original image without caching across maintenance updates in one HTTP process', async () => {
  const { directory, update, image } = fixture()
  const handler = createCommunityQrHandler(directory)
  const server = createServer((req, res) => { void handler(req, res).then(handled => { if (!handled) res.writeHead(404).end() }) })
  servers.push(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address')
  const url = `http://127.0.0.1:${address.port}/api/community/wechat-qr`
  const missing = await fetch(url)
  expect(missing.status).toBe(404)
  expect(missing.headers.get('cache-control')).toBe('no-store')
  for (const [name, color, format] of [['A', '#fff', 'image/png'], ['B', '#0f0', 'image/jpeg']] as const) {
    const path = image(name, color, format)
    const result = update(path)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).wechatQrSha256).toBe(createHash('sha256').update(readFileSync(path)).digest('hex'))
    const response = await fetch(url)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe(format)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(readFileSync(path))
  }
  expect((await fetch(url, { method: 'HEAD' })).status).toBe(200)
  expect((await fetch(url, { method: 'POST', body: 'anonymous upload' })).status).toBe(405)
})

it('preserves the valid image when decoding, dimensions, size or transfer validation fails', () => {
  const { root, directory, update, image } = fixture()
  const original = image('original', '#fff')
  expect(update(original).status).toBe(0)
  const target = join(directory, 'wechat-qr')
  const invalid = join(root, 'invalid.png')
  const cases = [Buffer.from('<svg/>'), readFileSync(original).subarray(0, 25), Buffer.alloc(5 * 1024 * 1024 + 1), createCanvas(32, 32).toBuffer('image/png')]
  for (const bytes of cases) {
    writeFileSync(invalid, bytes)
    expect(update(invalid).status).not.toBe(0)
    expect(readFileSync(target)).toEqual(readFileSync(original))
  }
  expect(update(image('replacement', '#0f0'), true).status).not.toBe(0)
  expect(readFileSync(target)).toEqual(readFileSync(original))
  expect(readdirSync(directory).filter(file => file.startsWith('.wechat-qr.'))).toEqual(['.wechat-qr.lock'])
  expect(existsSync(join(root, 'deployed-build-id'))).toBe(false)
})
