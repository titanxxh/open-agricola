export const OFFLINE_ENCYCLOPEDIA_PATH = '/offline-encyclopedia/'

export type OfflineEncyclopediaPack = Readonly<{
  locale: string
  contentVersion: string
  file: string
  sha256: string
  size: number
}>

export type OfflineEncyclopediaManifest = Readonly<{
  format: 1
  packs: readonly OfflineEncyclopediaPack[]
}>

const digest = /^[a-f0-9]{64}$/
const localeId = /^[a-z]{2,3}(?:-[a-z0-9]+)*$/

export const parseOfflineEncyclopediaPack = (item: unknown): OfflineEncyclopediaPack => {
  if (!item || typeof item !== 'object'
    || !('locale' in item) || typeof item.locale !== 'string' || !localeId.test(item.locale)
    || !('sha256' in item) || typeof item.sha256 !== 'string' || !digest.test(item.sha256)
    || !('contentVersion' in item) || typeof item.contentVersion !== 'string' || !digest.test(item.contentVersion)
    || !('file' in item) || item.file !== `${item.locale}.${item.sha256.slice(0, 16)}.html`
    || !('size' in item) || typeof item.size !== 'number' || !Number.isSafeInteger(item.size) || item.size <= 0) {
    throw new Error('Invalid offline encyclopedia pack')
  }
  return { locale: item.locale, contentVersion: item.contentVersion, file: item.file, sha256: item.sha256, size: item.size }
}

export const parseOfflineEncyclopediaManifest = (input: unknown): OfflineEncyclopediaManifest => {
  if (!input || typeof input !== 'object' || !('format' in input) || input.format !== 1
    || !('packs' in input) || !Array.isArray(input.packs) || input.packs.length === 0) {
    throw new Error('Invalid offline encyclopedia manifest')
  }
  const seen = new Set<string>()
  const packs = input.packs.map((item: unknown) => {
    const pack = parseOfflineEncyclopediaPack(item)
    if (seen.has(pack.locale)) throw new Error('Duplicate offline encyclopedia language')
    seen.add(pack.locale)
    return pack
  })
  return { format: 1, packs }
}
