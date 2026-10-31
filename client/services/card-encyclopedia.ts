import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type {
  CardEncyclopediaCatalogFile,
  CardEncyclopediaFileRef,
  CardEncyclopediaManifest,
  CardEncyclopediaSearchFile,
  EncyclopediaEntry,
  EncyclopediaSearchDocument,
} from '../../shared/contract/card-encyclopedia'

export type CardEncyclopedia = {
  /** In default catalog order. */
  readonly byKey: ReadonlyMap<string, { readonly entry: EncyclopediaEntry; readonly document: EncyclopediaSearchDocument }>
}

const base = `${import.meta.env.BASE_URL}card-encyclopedia/`
let loading: Promise<CardEncyclopedia> | undefined

const isFileRef = (value: unknown, name: string): value is CardEncyclopediaFileRef =>
  !!value && typeof value === 'object'
  && 'sha256' in value && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)
  && 'file' in value && value.file === `${name}.${value.sha256.slice(0, 16)}.json`

const parseManifest = (value: unknown): CardEncyclopediaManifest => {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('catalog' in value) || !isFileRef(value.catalog, 'catalog')
    || !('search' in value) || !isFileRef(value.search, 'search')) throw new Error('Invalid card encyclopedia list')
  return value as CardEncyclopediaManifest
}

const fetchVerified = async (ref: CardEncyclopediaFileRef): Promise<unknown> => {
  const response = await fetch(`${base}${ref.file}`)
  if (!response.ok) throw new Error(`Card encyclopedia unavailable (${response.status})`)
  const raw = await response.text()
  if (bytesToHex(sha256(utf8ToBytes(raw))) !== ref.sha256) throw new Error('Card encyclopedia checksum mismatch')
  return JSON.parse(raw)
}

const load = async (): Promise<CardEncyclopedia> => {
  const response = await fetch(`${base}manifest.json`, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Card encyclopedia unavailable (${response.status})`)
  const manifest = parseManifest(await response.json())
  const [catalog, search] = await Promise.all([fetchVerified(manifest.catalog), fetchVerified(manifest.search)]) as
    [CardEncyclopediaCatalogFile, CardEncyclopediaSearchFile]
  if (catalog.version !== 1 || search.version !== 1) throw new Error('Unsupported card encyclopedia version')
  const byKey = new Map(catalog.entries.map((entry, index) => {
    const document = search.documents[index]
    if (document?.key !== entry.key) throw new Error(`Search data out of step with ${entry.key}`)
    return [entry.key, { entry, document }] as const
  }))
  if (search.documents.length !== catalog.entries.length) throw new Error('Search data does not match the catalog')
  return { byKey }
}

/** Loads on first use only; a failed load is forgotten so the next call retries. */
export function loadCardEncyclopedia(): Promise<CardEncyclopedia> {
  loading ??= load().catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}
