import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLanguageManifest, parseLanguagePack } from '../shared/i18n'

type LanguageRef = { repository: string; revision: string; manifestSha256: string }
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export async function prepareLanguagePacks(root = resolve('.')) {
  const ref: LanguageRef = JSON.parse(readFileSync(resolve(root, 'i18n.ref'), 'utf8'))
  if (!/^[\w.-]+\/[\w.-]+$/.test(ref.repository) || !/^[a-f0-9]{40}$/.test(ref.revision)
    || !/^[a-f0-9]{64}$/.test(ref.manifestSha256)) throw new Error('Invalid i18n.ref')
  const local = process.env.AGRICOLA_I18N_DIR
  const read = async (path: string, checksum: string) => {
    if (local) return readFileSync(resolve(local, path), 'utf8')
    const cached = path.startsWith('packs/') ? resolve(root, 'public/i18n', path.slice(6)) : resolve(root, 'output/i18n', path)
    if (existsSync(cached)) {
      const text = readFileSync(cached, 'utf8')
      if (sha256(text) === checksum) return text
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`https://raw.githubusercontent.com/${ref.repository}/${ref.revision}/${path}`, { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error(`Language download failed: ${path} (${response.status})`)
        return await response.text()
      } catch (error) {
        if (attempt === 2) throw error
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
      }
    }
  }
  const raw = await read('packs/manifest.json', ref.manifestSha256)
  if (sha256(raw) !== ref.manifestSha256) throw new Error('Language manifest checksum mismatch')
  const manifest = parseLanguageManifest(JSON.parse(raw))
  const output = resolve(root, 'public/i18n')
  mkdirSync(output, { recursive: true })
  for (const language of manifest.languages) {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(language.id) || !/^[a-z0-9.-]+\.json$/.test(language.file)) throw new Error('Invalid language path')
    const pack = await read(`packs/${language.file}`, language.sha256)
    if (sha256(pack) !== language.sha256) throw new Error(`Language checksum mismatch: ${language.id}`)
    const parsed = parseLanguagePack(JSON.parse(pack))
    if (parsed.locale !== language.id) throw new Error('Language identity mismatch')
    writeFileSync(resolve(output, language.file), pack)
    // Authoring data is an ignored build cache for translation checks, never imported by the app.
    const sourcePath = resolve(root, `output/i18n/locales/${language.id}.json`)
    mkdirSync(dirname(sourcePath), { recursive: true })
    const source = await read(`locales/${language.id}.json`, language.sourceSha256)
    if (sha256(source) !== language.sourceSha256) throw new Error(`Language source checksum mismatch: ${language.id}`)
    writeFileSync(sourcePath, source)
  }
  writeFileSync(resolve(output, 'manifest.json'), raw)
  const files = new Set(manifest.languages.map(language => language.file))
  for (const file of readdirSync(output)) {
    if (/^[a-z0-9-]+\.[a-f0-9]{16}\.json$/.test(file) && !files.has(file)) unlinkSync(resolve(output, file))
  }
  console.log(`[prepare-language-packs] verified ${manifest.languages.length} packs from ${ref.repository}@${ref.revision.slice(0, 12)}`)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareLanguagePacks()
