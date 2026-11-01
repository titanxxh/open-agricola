import type { ActionReferenceCatalog } from '../../shared/contract/action-reference'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

let pending: Promise<ActionReferenceCatalog> | undefined

/** Static build data, loaded on the first reference inspection. Failures can be retried. */
export function loadActionReferences(): Promise<ActionReferenceCatalog> {
  pending ??= fetch(`${import.meta.env.BASE_URL}action-references.json`, { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error(`Action references unavailable (${response.status})`)
    const manifest: unknown = await response.json()
    if (!manifest || typeof manifest !== 'object' || !('version' in manifest) || manifest.version !== 1
      || !('sha256' in manifest) || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)
      || !('file' in manifest) || manifest.file !== `action-references.${manifest.sha256.slice(0, 16)}.json`) {
      throw new Error('Invalid action reference manifest')
    }
    const content = await fetch(`${import.meta.env.BASE_URL}${manifest.file}`)
    if (!content.ok) throw new Error(`Action references unavailable (${content.status})`)
    const raw = await content.text()
    if (bytesToHex(sha256(utf8ToBytes(raw))) !== manifest.sha256) throw new Error('Action reference checksum mismatch')
    // The digest binds this value to the static catalog produced by the build projection.
    const catalog: ActionReferenceCatalog = JSON.parse(raw)
    if (catalog.version !== 1 || !Array.isArray(catalog.spaces) || !Array.isArray(catalog.moorCards)) {
      throw new Error('Invalid action reference catalog')
    }
    return catalog
  }).catch((error: unknown) => { pending = undefined; throw error })
  return pending
}
