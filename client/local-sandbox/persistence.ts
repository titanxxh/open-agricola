/**
 * Single-slot persistence for browser-local sandbox games.
 *
 * The transport's `onPersist` hook feeds every good snapshot into a debounced
 * saver; on return to the workshop, `loadResumable` hands back the saved game
 * (or clears it when the schema no longer matches / the record is corrupt) so
 * the UI can offer "continue last game" via `startFromPersisted`.
 *
 * IndexedDB is used directly (no wrapper dependency); environments without it
 * (Node tests, exotic privacy modes) fall back to an in-memory store.
 */
import { LOCAL_SANDBOX_SCHEMA_VERSION, type PersistedLocalGame } from './protocol.ts'

const DB_NAME = 'open-agricola-local-sandbox'
const DB_VERSION = 1
const STORE_NAME = 'games'
const SLOT_KEY = 'current'

export interface LocalGameStore {
  save(persisted: PersistedLocalGame): Promise<void>
  load(): Promise<PersistedLocalGame | null>
  clear(): Promise<void>
}

export class MemoryGameStore implements LocalGameStore {
  private slot: PersistedLocalGame | null = null

  save(persisted: PersistedLocalGame): Promise<void> {
    this.slot = persisted
    return Promise.resolve()
  }

  load(): Promise<PersistedLocalGame | null> {
    return Promise.resolve(this.slot)
  }

  clear(): Promise<void> {
    this.slot = null
    return Promise.resolve()
  }
}

export class IndexedDbGameStore implements LocalGameStore {
  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'))
    })
  }

  private async transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDb()
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'))
      })
    } finally {
      db.close()
    }
  }

  async save(persisted: PersistedLocalGame): Promise<void> {
    await this.transact('readwrite', (store) => store.put(persisted, SLOT_KEY))
  }

  async load(): Promise<PersistedLocalGame | null> {
    const value = await this.transact<unknown>('readonly', (store) => store.get(SLOT_KEY))
    return (value as PersistedLocalGame | undefined) ?? null
  }

  async clear(): Promise<void> {
    await this.transact('readwrite', (store) => store.delete(SLOT_KEY))
  }
}

export const openLocalGameStore = (): LocalGameStore =>
  typeof indexedDB === 'undefined' ? new MemoryGameStore() : new IndexedDbGameStore()

/**
 * Load the saved game if it is safe to resume. A record from another schema
 * version or one that fails to read is dropped silently — the project keeps
 * no backward compatibility for old saves; the player just starts fresh.
 */
export const loadResumable = async (store: LocalGameStore): Promise<PersistedLocalGame | null> => {
  try {
    const persisted = await store.load()
    if (!persisted) return null
    if (persisted.schemaVersion !== LOCAL_SANDBOX_SCHEMA_VERSION) {
      await store.clear()
      return null
    }
    return persisted
  } catch {
    try { await store.clear() } catch { /* already unusable */ }
    return null
  }
}

export type DebouncedSaver = {
  /** Feed to `LocalTransportOptions.onPersist`. */
  push: (persisted: PersistedLocalGame) => void
  /** Write the latest pending snapshot immediately (e.g. on pagehide). */
  flush: () => Promise<void>
  cancel: () => void
}

export const createDebouncedSaver = (store: LocalGameStore, delayMs = 500): DebouncedSaver => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let latest: PersistedLocalGame | null = null

  const write = async () => {
    timer = null
    const pending = latest
    latest = null
    if (!pending) return
    try {
      await store.save(pending)
    } catch (error) {
      console.warn('[local-sandbox] failed to persist game:', error)
    }
  }

  return {
    push: (persisted) => {
      latest = persisted
      if (timer === null) {
        timer = setTimeout(() => { void write() }, delayMs)
      }
    },
    flush: () => {
      if (timer !== null) clearTimeout(timer)
      return write()
    },
    cancel: () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      latest = null
    },
  }
}
