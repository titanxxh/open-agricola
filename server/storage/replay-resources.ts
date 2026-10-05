import type { CustomCardDef } from '../../shared/contract/protocol/game'
import type { ResourceStore } from './resource-store'
import { objectHash } from './s3-store'

export class ReplayAssetValidationError extends Error {}
export type ViewerManifest = { entrypoint: 'index.html'; files: Record<string, string> }
const HASH = /^[a-f0-9]{64}$/
export function validViewerPath(path: string): boolean {
  return !!path && !path.includes('\\') && path.split('/').every(part => !!part && part !== '.' && part !== '..')
}
export function parseViewerManifest(body: Buffer, buildId: string): ViewerManifest {
  if (!HASH.test(buildId) || objectHash(body) !== buildId) throw new Error('Invalid viewer manifest hash')
  const value = JSON.parse(body.toString('utf8')) as ViewerManifest
  if (value.entrypoint !== 'index.html' || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)
    || !Object.hasOwn(value.files, 'index.html')
    || Object.entries(value.files).some(([path, hash]) => path === 'manifest.json' || !validViewerPath(path) || typeof hash !== 'string' || !HASH.test(hash))) throw new Error('Invalid viewer manifest')
  return value
}

export class ReplayResources {
  readonly storage: ResourceStore
  constructor(storage: ResourceStore) { this.storage = storage }

  async publishViewer(buildId: string, manifest: Buffer): Promise<void> {
    const parsed = parseViewerManifest(manifest, buildId)
    const keys: string[] = []
    for (const [path, hash] of Object.entries(parsed.files)) {
      const key = `replay-viewers/${buildId}/${path}`
      const object = await this.storage.read(key)
      if (!object || objectHash(object.body) !== hash) throw new Error(`Viewer file unavailable: ${path}`)
      keys.push(key)
    }
    const manifestKey = `replay-viewers/${buildId}/manifest.json`
    await this.storage.stage(manifestKey, manifest, 'application/json')
    keys.push(manifestKey)
    await this.storage.db.transaction(async () => {
      await this.storage.reference('viewer', buildId, keys)
      await this.storage.db.prepare('INSERT INTO replay_viewer_builds(build_id, manifest_text, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(buildId, manifest.toString('utf8'), Date.now())
    })()
  }

  async viewer(buildId: string): Promise<ViewerManifest | null> {
    if (!HASH.test(buildId)) return null
    const row = await this.storage.db.prepare('SELECT manifest_text FROM replay_viewer_builds WHERE build_id = ?').get(buildId) as { manifest_text: string } | undefined
    if (!row) return null
    const object = await this.storage.read(`replay-viewers/${buildId}/manifest.json`)
    if (!object || object.body.toString('utf8') !== row.manifest_text) return null
    return parseViewerManifest(object.body, buildId)
  }

  async archiveCards(roomId: string, definitions: CustomCardDef[]): Promise<CustomCardDef[]> {
    const archived: CustomCardDef[] = []
    for (const definition of definitions) {
      if (!definition.artUrl) { archived.push({ ...definition }); continue }
      if (!/^\/(?:card-art\/[A-Za-z0-9._-]+|replay-assets\/[a-f0-9]{64})$/.test(definition.artUrl)) throw new ReplayAssetValidationError('unsupported custom card art URL')
      const object = await this.storage.read(definition.artUrl.slice(1))
      if (!object) {
        const catalog = await this.storage.db.prepare('SELECT content_hash, blocked FROM stored_objects WHERE object_key = ?').get(definition.artUrl.slice(1)) as { content_hash: string; blocked: boolean } | undefined
        if (catalog && (catalog.blocked || await this.storage.ledger.isHashRemoved(catalog.content_hash))) throw new ReplayAssetValidationError('replay asset has been removed')
        throw new Error('custom card art is not available yet')
      }
      const hash = objectHash(object.body)
      const key = `replay-assets/${hash}`
      await this.storage.stage(key, object.body, object.contentType)
      // Survives process exit and frozen-commit retries. Initial Replay commit
      // atomically converts this preparation into its permanent reference.
      await this.storage.reference('room-preparation', roomId, [key])
      archived.push({ ...definition, artUrl: `/${key}` })
    }
    return archived
  }

  async releasePreparation(roomId: string): Promise<void> { await this.storage.release('room-preparation', roomId) }
  async collect(): Promise<void> { await this.storage.collect() }
}
