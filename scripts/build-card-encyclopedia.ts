import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeCardEncyclopedia } from './card-encyclopedia/artifacts'
import { buildEncyclopediaEntries } from './card-encyclopedia/catalog'
import { buildSearchDocuments, loadEncyclopediaLanguages } from './card-encyclopedia/search'
import { loadEncyclopediaSources } from './card-encyclopedia/sources'
import { buildActionReferences } from './build-action-references'

/** Runs after `prepare-language-packs`, which provides the pinned packs and their source dictionaries. */
export function buildCardEncyclopedia(root = resolve('.')) {
  buildActionReferences(root)
  const languages = loadEncyclopediaLanguages(root)
  const entries = buildEncyclopediaEntries(loadEncyclopediaSources())
  const manifest = writeCardEncyclopedia({
    outputDir: resolve(root, 'public/card-encyclopedia'),
    entries,
    documents: buildSearchDocuments(entries, languages),
    languages: languages.map((language) => language.id),
  })
  console.log(`[build-card-encyclopedia] wrote ${manifest.entryCount} entries (${manifest.catalog.file}, ${manifest.search.file})`)
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildCardEncyclopedia()
