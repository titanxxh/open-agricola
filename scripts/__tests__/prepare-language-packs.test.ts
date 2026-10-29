import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareLanguagePacks } from '../prepare-language-packs'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
function fixture(message = 'Ferme') {
  const root = mkdtempSync(join(tmpdir(), 'agricola-language-cache-'))
  roots.push(root)
  const source = JSON.stringify({ $name: 'Français', ui: { title: message } })
  const pack = JSON.stringify({ version: 1, locale: 'fr', messages: { 'ui.title': message } })
  const file = `fr.${digest(pack).slice(0, 16)}.json`
  const manifest = JSON.stringify({ version: 1, defaultLocale: 'fr', languages: [{
    id: 'fr', name: 'Français', file, sha256: digest(pack), sourceSha256: digest(source),
  }] })
  for (const [path, text] of Object.entries({
    'i18n.ref': JSON.stringify({ repository: 'owner/languages', revision: 'a'.repeat(40), manifestSha256: digest(manifest) }),
    'public/i18n/manifest.json': manifest, [`public/i18n/${file}`]: pack, 'output/i18n/locales/fr.json': source,
  })) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
  vi.stubEnv('AGRICOLA_I18N_DIR', '')
  return { root, file, pack, source, manifest }
}

describe('pinned language package preparation', () => {
  it('uses the verified cache without making a network request', async () => {
    const { root, file, pack } = fixture()
    const fetch = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    expect((await prepareLanguagePacks(root)).defaultLocale).toBe('fr')
    expect(readFileSync(join(root, 'public/i18n', file), 'utf8')).toBe(pack)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('replaces corrupt cached data with content that matches the pinned hash', async () => {
    const { root, file, pack } = fixture()
    writeFileSync(join(root, 'public/i18n', file), 'corrupt')
    const fetch = vi.fn().mockResolvedValue(new Response(pack))
    vi.stubGlobal('fetch', fetch)
    await prepareLanguagePacks(root)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(root, 'public/i18n', file), 'utf8')).toBe(pack)
  })

  it('preserves complete bytes for existing and new readers across cache repair and preparation', async () => {
    const { root, file, pack, source, manifest } = fixture()
    const files = new Map([
      ['packs/manifest.json', { target: join(root, 'public/i18n/manifest.json'), text: manifest }],
      [`packs/${file}`, { target: join(root, 'public/i18n', file), text: pack }],
      ['locales/fr.json', { target: join(root, 'output/i18n/locales/fr.json'), text: source }],
    ])
    const fetch = vi.fn((url: string) => {
      const entry = [...files].find(([path]) => url.endsWith(`/${path}`))?.[1]
      if (!entry) throw new Error(`Unexpected language request: ${url}`)
      return Promise.resolve(new Response(entry.text))
    })
    vi.stubGlobal('fetch', fetch)
    const replaceWithNonCanonicalBytes = (suffix: string) => {
      for (const { target, text } of files.values()) {
        writeFileSync(`${target}.replacement`, text + suffix)
        renameSync(`${target}.replacement`, target)
      }
    }
    replaceWithNonCanonicalBytes('\n')
    const reader = new Worker(`
      const { fstatSync, openSync, readFileSync, readSync } = require('node:fs')
      const { parentPort, workerData } = require('node:worker_threads')
      const files = workerData.paths.map(path => ({ path, fd: openSync(path, 'r') }))
      const read = fd => {
        const bytes = Buffer.alloc(fstatSync(fd).size)
        readSync(fd, bytes, 0, bytes.length, 0)
        const text = bytes.toString('utf8')
        JSON.parse(text)
        return text
      }
      parentPort.postMessage(files.map(({ fd }) => read(fd)))
      parentPort.on('message', () => parentPort.postMessage(files.map(({ path, fd }) => {
        const newlyOpened = readFileSync(path, 'utf8')
        JSON.parse(newlyOpened)
        return { existing: read(fd), newlyOpened }
      })))
    `, { eval: true, workerData: { paths: [...files.values()].map(entry => entry.target) } })
    try {
      const [opened] = await once(reader, 'message')
      expect(opened).toEqual([...files.values()].map(({ text }) => `${text}\n`))
      for (let repair = 0; repair < 2; repair++) {
        if (repair) replaceWithNonCanonicalBytes('\n\n')
        await prepareLanguagePacks(root)
        const reading = once(reader, 'message')
        reader.postMessage('read')
        const [observed] = await reading
        expect(observed).toEqual([...files.values()].map(({ text }) => ({
          existing: `${text}\n`, newlyOpened: text,
        })))
      }
      await prepareLanguagePacks(root)
      expect(fetch).toHaveBeenCalledTimes(6)
    } finally {
      await reader.terminate()
    }
  })
})
