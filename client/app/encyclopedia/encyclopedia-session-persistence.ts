import type { EncyclopediaBrowsePersistence, EncyclopediaBrowseSnapshot } from './encyclopedia-browse-store'
import { EMPTY_ENCYCLOPEDIA_FILTERS, type EncyclopediaFilters } from './encyclopedia-filters'

const STORAGE_KEY = 'open-agricola:encyclopedia-browse'

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type EncyclopediaSessionPersistenceOptions = {
  /** Read on every access: browsers throw when storage is blocked. */
  storage?: () => SessionStorageLike | null | undefined
  isReload?: () => boolean
  /** Turns whatever was saved under `filters` into filters the current build understands. */
  normalizeFilters?: (value: unknown) => EncyclopediaFilters
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

const keepPlainObjectFilters = (value: unknown): EncyclopediaFilters =>
  isPlainObject(value) ? value as EncyclopediaFilters : EMPTY_ENCYCLOPEDIA_FILTERS

const documentWasReloaded = (): boolean => {
  try {
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    return navigation?.type === 'reload'
  } catch {
    return false
  }
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function createEncyclopediaSessionPersistence({
  storage = () => window.sessionStorage,
  isReload = documentWasReloaded,
  normalizeFilters = keepPlainObjectFilters,
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
      if (isReload()) {
        withStorage(target => target.removeItem(STORAGE_KEY))
        return undefined
      }
      const raw = withStorage(target => target.getItem(STORAGE_KEY))
      const saved = raw ? parseJson(raw) : undefined
      if (!isPlainObject(saved)) return undefined
      const { query, filters, page, scrollTop } = saved
      return {
        query: typeof query === 'string' ? query : '',
        filters: normalizeFilters(filters),
        page: typeof page === 'number' && Number.isSafeInteger(page) && page >= 1 ? page : 1,
        scrollTop: typeof scrollTop === 'number' && Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
      }
    },
    save(snapshot) {
      withStorage(target => target.setItem(STORAGE_KEY, JSON.stringify(snapshot)))
    },
  }
}
