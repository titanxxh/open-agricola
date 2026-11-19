import { parseOfflineEncyclopediaPack, type OfflineEncyclopediaPack } from '../../shared/contract/offline-encyclopedia'

const databaseName = 'open-agricola-offline-encyclopedia'
const storeName = 'archive'
const archiveKey = 'package'
const intentKey = 'intent'

export type SavedOfflineEncyclopedia = Readonly<{
  pack: OfflineEncyclopediaPack
  savedAt: number
  archive: Blob
}>

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(databaseName, 1)
  let blocked = false
  request.onupgradeneeded = () => { request.result.createObjectStore(storeName) }
  request.onerror = () => reject(request.error)
  request.onblocked = () => {
    blocked = true
    reject(new Error('Offline encyclopedia storage is blocked'))
  }
  request.onsuccess = () => {
    const database = request.result
    database.onversionchange = () => database.close()
    if (blocked) database.close()
    else resolve(database)
  }
})

async function transactArchive<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => T | Promise<T>,
): Promise<T> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(storeName, mode)
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline encyclopedia transaction aborted'))
    })
    const result = new Promise<T>(resolve => resolve(operation(transaction.objectStore(storeName))))
    try {
      return (await Promise.all([result, completion]))[0]
    } catch (error) {
      try { transaction.abort() } catch { /* The transaction may already have finished. */ }
      throw error
    }
  } finally {
    database.close()
  }
}

const readArchive = () => transactArchive('readonly', store => new Promise<unknown>((resolve, reject) => {
  const request = store.get(archiveKey)
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
}))

export async function readSavedOfflineEncyclopedia(): Promise<SavedOfflineEncyclopedia | null> {
  const value = await readArchive()
  if (!value || typeof value !== 'object' || !('pack' in value)
    || !('savedAt' in value) || typeof value.savedAt !== 'number' || !Number.isSafeInteger(value.savedAt)
    || value.savedAt < 0 || value.savedAt > 8.64e15
    || !('archive' in value) || !(value.archive instanceof Blob)) return null
  try {
    const pack = parseOfflineEncyclopediaPack(value.pack)
    if (value.archive.size !== pack.size) return null
    return { pack, savedAt: value.savedAt, archive: value.archive }
  } catch {
    return null
  }
}

export const beginOfflineEncyclopediaSave = (intent: string) =>
  transactArchive('readwrite', store => { store.put(intent, intentKey) })

/** A newer save or a deletion in another tab takes precedence over an in-flight download. */
export const saveVerifiedOfflineEncyclopedia = (intent: string, candidate: SavedOfflineEncyclopedia) =>
  transactArchive('readwrite', store => new Promise<boolean>((resolve, reject) => {
    const request = store.get(intentKey)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (request.result !== intent) {
        resolve(false)
        return
      }
      try {
        store.put(candidate, archiveKey)
        resolve(true)
      } catch (error) {
        reject(error)
      }
    }
  }))

export const deleteOfflineEncyclopedia = () => transactArchive('readwrite', store => {
  store.delete(archiveKey)
  store.delete(intentKey)
})
