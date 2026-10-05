import { ObjectConflictError, S3ObjectStore } from './s3-store'

export type ErasureEntry = {
  version: 1; roomId: string; reason: 'removed' | 'moderation' | 'legal'
  removedAt: number; assetHashes: string[]; eraseResult: boolean
}
export type AssetTakedown = { hash: string; reason: ErasureEntry['reason']; removedAt: number }
export type ErasureBatch = { version: 1; entries: ErasureEntry[]; assetTakedowns: AssetTakedown[] }
const KEY = 'erasure/ledger.json'

/** Independent of PostgreSQL backups. Never restored or collected with app data. */
export class ErasureLedger {
  private readonly objects: S3ObjectStore
  constructor(objects: S3ObjectStore) { this.objects = objects }

  private decode(raw: Buffer): ErasureBatch[] {
    const ledger: unknown = JSON.parse(raw.toString('utf8'))
    if (!ledger || typeof ledger !== 'object' || !('version' in ledger) || ledger.version !== 1 || !('batches' in ledger) || !Array.isArray(ledger.batches)) throw new Error('Invalid independent erasure ledger')
    // Full domain validation occurs before applying the ledger. Resource reads
    // also fail closed if its minimal deny-list structure has been damaged.
    for (const batch of ledger.batches) {
      if (!batch || batch.version !== 1 || !Array.isArray(batch.entries) || !Array.isArray(batch.assetTakedowns)
        || batch.assetTakedowns.some((rule: AssetTakedown) => !rule || !/^[a-f0-9]{64}$/.test(rule.hash))) throw new Error('Invalid independent erasure ledger')
    }
    return ledger.batches
  }

  async read(): Promise<ErasureBatch[]> {
    const object = await this.objects.get(KEY)
    return object ? this.decode(object.body) : []
  }

  async append(batch: ErasureBatch): Promise<void> {
    if (!batch.entries.length && !batch.assetTakedowns.length) return
    for (let attempt = 0; attempt < 32; attempt++) {
      const object = await this.objects.get(KEY)
      const batches = object ? this.decode(object.body) : []
      try {
        await this.objects.replace(KEY, Buffer.from(JSON.stringify({ version: 1, batches: [...batches, batch] })), object?.etag ?? null)
        return
      } catch (error) { if (!(error instanceof ObjectConflictError)) throw error }
    }
    throw new Error('Erasure ledger is busy; retry the operation')
  }

  async isHashRemoved(hash: string): Promise<boolean> {
    return (await this.read()).some(batch => batch.assetTakedowns.some(rule => rule.hash === hash))
  }
}
