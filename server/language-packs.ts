import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerLanguagePack, type LanguageManifest } from '../shared/i18n'

const manifest: LanguageManifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/i18n/manifest.json'), 'utf8'))
for (const language of manifest.languages) {
  registerLanguagePack(JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/i18n', language.file), 'utf8')))
}
