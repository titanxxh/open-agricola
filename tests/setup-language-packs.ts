import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerLanguagePack, type LanguageManifest } from '../shared/i18n'

const manifest: LanguageManifest = JSON.parse(readFileSync(resolve('public/i18n/manifest.json'), 'utf8'))
const read = (file: string): unknown => JSON.parse(readFileSync(resolve('public/i18n', file), 'utf8'))
for (const language of manifest.languages) {
  registerLanguagePack(read(language.core.file), 'core')
  registerLanguagePack(read(language.cards.file), 'cards')
}
