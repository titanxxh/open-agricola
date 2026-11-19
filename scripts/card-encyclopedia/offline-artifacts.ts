import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import type { OfflineEncyclopediaManifest } from '../../shared/contract/offline-encyclopedia'
import { formatMessage } from '../../shared/i18n'
import type { CardEncyclopediaArtifacts } from './artifacts'
import { publishArtifact, sha256 } from './artifacts'
import { buildEncyclopediaEntries } from './catalog'
import { buildSearchDocuments, loadEncyclopediaLanguages, type EncyclopediaLanguage } from './search'
import { loadEncyclopediaSources } from './sources'

const prefix = 'ui.encyclopedia.offline.'
const template = new URL('./offline-reader.js', import.meta.url)
const stylesheet = `
  :root { color-scheme: light dark; font: 100%/1.6 system-ui, sans-serif }
  body { margin: 0 auto; max-width: 48rem; padding: 1.25rem }
  input { display: block; width: 100%; box-sizing: border-box; font: inherit; margin: .4rem 0 1rem; padding: .5rem }
  details { border-block-end: 1px solid GrayText; padding: .55rem 0 }
  summary { cursor: pointer; overflow-wrap: anywhere }
  p { overflow-wrap: anywhere }
  small { border: 1px solid GrayText; border-radius: .2rem; padding: 0 .3rem; white-space: nowrap }
`

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const text = (language: EncyclopediaLanguage, suffix: string) => formatMessage(language.messages, prefix + suffix)

function documentHtml({ language, title, body, scriptHash }: { language: string; title: string; body: string; scriptHash?: string }) {
  const script = scriptHash ? `'sha256-${scriptHash}'` : "'none'"
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${script}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)}</title><style>${stylesheet}</style></head>
<body><main>${body}</main></body></html>
`
}

const openOnline = (language: EncyclopediaLanguage) => `<a href="/?page=encyclopedia">${escapeHtml(text(language, 'openOnline'))}</a>`

type BuildInput = Omit<CardEncyclopediaArtifacts, 'languages'> & {
  languages: readonly EncyclopediaLanguage[]
}

/** Publishes one complete, independently replaceable text reader per supported language. */
export function writeOfflineEncyclopedia({ outputDir, entries, documents, languages }: BuildInput): OfflineEncyclopediaManifest {
  const reader = readFileSync(template, 'utf8').replaceAll('\r\n', '\n')
  const scriptHash = Buffer.from(sha256(reader), 'hex').toString('base64')
  mkdirSync(outputDir, { recursive: true })
  const manifest: OfflineEncyclopediaManifest = {
    format: 1,
    packs: languages.map((language) => {
      const localized = entries.map((entry, index) => {
        const document = documents[index]
        if (!document || document.key !== entry.key) throw new Error(`Missing encyclopedia search document for ${entry.key}`)
        const fields = document.locales[language.id]
        if (!fields) throw new Error(`Missing encyclopedia text for ${entry.key} in ${language.id}`)
        return { number: entry.displayNumber ?? entry.sourceId, identifiers: document.identifiers, fields }
      })
      const contentVersion = sha256(JSON.stringify(localized))
      const labels = {
        noResults: text(language, 'noResults'),
        englishFallback: formatMessage(language.messages, 'ui.encyclopedia.fallback.english'),
        missing: formatMessage(language.messages, 'ui.encyclopedia.fallback.missing'),
      }
      const pageData = JSON.stringify({ locale: language.id, entries: localized, labels }).replaceAll('<', '\\u003c')
      const title = text(language, 'title')
      const html = documentHtml({
        language: language.id,
        title,
        scriptHash,
        body: `<h1>${escapeHtml(title)}</h1><p>${openOnline(language)}</p>
<label for="offline-search">${escapeHtml(text(language, 'search'))}</label>
<input id="offline-search" type="search">
<div id="offline-results"></div>
<script type="application/json" id="offline-cards">${pageData}</script><script>${reader}</script>`,
      })
      const hash = sha256(html)
      const file = `${language.id}.${hash.slice(0, 16)}.html`
      publishArtifact(resolve(outputDir, file), html)
      return { locale: language.id, contentVersion, file, sha256: hash, size: Buffer.byteLength(html) }
    }),
  }
  const fallbackLanguage = languages[0]
  if (!fallbackLanguage) throw new Error('The offline encyclopedia requires at least one language')
  const fallback = documentHtml({
    language: fallbackLanguage.id,
    title: text(fallbackLanguage, 'title'),
    body: languages.map(language => `<section lang="${escapeHtml(language.id)}"><h1>${escapeHtml(text(language, 'title'))}</h1>
<p>${escapeHtml(text(language, 'downloadRequired'))}</p><p>${openOnline(language)}</p></section>`).join('\n'),
  })
  publishArtifact(resolve(outputDir, 'index.html'), fallback)
  publishArtifact(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const current = new Set(manifest.packs.map(pack => pack.file))
  for (const file of readdirSync(outputDir)) {
    if (/^[a-z]{2,3}(?:-[a-z0-9]+)*\.[a-f0-9]{16}\.html$/.test(file) && !current.has(file)) {
      rmSync(resolve(outputDir, file), { force: true })
    }
  }
  return manifest
}

export function buildOfflineEncyclopedia(root: string) {
  const languages = loadEncyclopediaLanguages(root)
  const entries = buildEncyclopediaEntries(loadEncyclopediaSources())
  return writeOfflineEncyclopedia({
    outputDir: resolve(root, 'output/offline-encyclopedia'),
    entries,
    documents: buildSearchDocuments(entries, languages),
    languages,
  })
}
