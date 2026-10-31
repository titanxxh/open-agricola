import type { EncyclopediaBrowsePersistence, EncyclopediaBrowseSnapshot } from './encyclopedia-browse-store'
import { normalizeEncyclopediaFilters } from './encyclopedia-filters'
import { ENCYCLOPEDIA_BROWSE_STORAGE_KEY, forgetEncyclopediaBrowseOnReload } from './encyclopedia-session-reset'

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type EncyclopediaSessionPersistenceOptions = {
  /** Read on every access: browsers throw when storage is blocked. */
  storage?: () => SessionStorageLike | null | undefined
  isReload?: () => boolean
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function createEncyclopediaSessionPersistence({
  storage = () => window.sessionStorage,
  isReload,
}: EncyclopediaSessionPersistenceOptions = {}): EncyclopediaBrowsePersistence {
  const withStorage = <T>(access: (target: SessionStorageLike) => T): T | undefined => {
    try {
      const target = storage()
      return target ? access(target) : undefined
    } catch {
      return undefined
    }
  }

  return {
    load(): EncyclopediaBrowseSnapshot | undefined {
      forgetEncyclopediaBrowseOnReload({ storage, isReload })
      const raw = withStorage(target => target.getItem(ENCYCLOPEDIA_BROWSE_STORAGE_KEY))
      const saved = raw ? parseJson(raw) : undefined
      if (!isPlainObject(saved)) return undefined
      const { query, filters, page, scrollTop } = saved
      return {
        query: typeof query === 'string' ? query : '',
        filters: normalizeEncyclopediaFilters(filters),
        page: typeof page === 'number' && Number.isSafeInteger(page) && page >= 1 ? page : 1,
        scrollTop: typeof scrollTop === 'number' && Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
      }
    },
    save(snapshot) {
      withStorage(target => target.setItem(ENCYCLOPEDIA_BROWSE_STORAGE_KEY, JSON.stringify(snapshot)))
    },
  }
}
