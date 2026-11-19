import { OFFLINE_ENCYCLOPEDIA_PATH, parseOfflineEncyclopediaManifest } from '../../shared/contract/offline-encyclopedia'
import { fetchVerifiedResource } from './fetch-verified-resource'
import { beginOfflineEncyclopediaSave, saveVerifiedOfflineEncyclopedia } from './offline-encyclopedia-storage'

export async function loadOfflineEncyclopediaManifest() {
  const response = await fetch(`${OFFLINE_ENCYCLOPEDIA_PATH}manifest.json`, {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
  })
  if (!response.ok) throw new Error('The offline encyclopedia is unavailable')
  return parseOfflineEncyclopediaManifest(await response.json())
}

export async function downloadOfflineEncyclopedia(locale: string) {
  const intent = crypto.randomUUID()
  await beginOfflineEncyclopediaSave(intent)
  const manifest = await loadOfflineEncyclopediaManifest()
  const pack = manifest.packs.find(candidate => candidate.locale === locale)
  if (!pack) throw new Error('The offline encyclopedia does not include this language')
  const response = await fetchVerifiedResource(`${OFFLINE_ENCYCLOPEDIA_PATH}${pack.file}`, pack.sha256, {
    credentials: 'omit', redirect: 'error',
  })
  if (!response.ok) throw new Error('The offline encyclopedia download failed')
  const archive = await response.blob()
  if (archive.size !== pack.size) throw new Error('The offline encyclopedia download is incomplete')
  if (!await saveVerifiedOfflineEncyclopedia(intent, { pack, archive, savedAt: Date.now() })) {
    throw new Error('The offline encyclopedia download was superseded')
  }
}
