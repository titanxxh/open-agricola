import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEncyclopediaBrowseStore } from '../encyclopedia-browse-store'
import { EMPTY_ENCYCLOPEDIA_FILTERS, type EncyclopediaFilters } from '../encyclopedia-filters'
import { createEncyclopediaSessionPersistence } from '../encyclopedia-session-persistence'

const memoryStorage = () => {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value) },
    removeItem: (key: string) => { items.delete(key) },
    overwriteAll: (value: string) => { for (const key of items.keys()) items.set(key, value) },
  }
}

type Storage = ReturnType<typeof memoryStorage>

/** Each call stands for the store a new document in the same tab creates. */
const storeInTab = (storage: Storage, { reload = false } = {}) => createEncyclopediaBrowseStore({
  persistence: createEncyclopediaSessionPersistence({ storage: () => storage, isReload: () => reload }),
})

const someFilters = { groups: ['A'], types: ['minor'] } as unknown as EncyclopediaFilters

afterEach(() => {
  vi.restoreAllMocks()
})

describe('encyclopedia session persistence', () => {
  it('restores the search, filters, page and scroll position a previous page of the tab left', () => {
    const storage = memoryStorage()
    const earlier = storeInTab(storage)
    earlier.setQuery('fireplace')
    earlier.setFilters(someFilters)
    earlier.setPage(3)
    earlier.setScrollTop(840)

    const later = storeInTab(storage)

    expect(later.getState()).toEqual({ query: 'fireplace', filters: { groups: ['A'], types: ['minor'] }, page: 3 })
    expect(later.getScrollTop()).toBe(840)
  })

  it('starts empty after a reload and forgets what the tab had saved', () => {
    const storage = memoryStorage()
    const earlier = storeInTab(storage)
    earlier.setQuery('fireplace')
    earlier.setPage(3)
    earlier.setScrollTop(840)

    const reloaded = storeInTab(storage, { reload: true })
    const afterwards = storeInTab(storage)

    for (const store of [reloaded, afterwards]) {
      expect(store.getState()).toEqual({ query: '', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 1 })
      expect(store.getScrollTop()).toBe(0)
    }
  })

  it('tells a reload from other arrivals by the navigation timing of the document', () => {
    const storage = memoryStorage()
    const navigationType = vi.spyOn(performance, 'getEntriesByType')
    const storeArrivingBy = (type: string) => {
      navigationType.mockReturnValue([{ type } as PerformanceNavigationTiming])
      return createEncyclopediaBrowseStore({ persistence: createEncyclopediaSessionPersistence({ storage: () => storage }) })
    }
    storeArrivingBy('navigate').setPage(2)

    expect(storeArrivingBy('navigate').getState().page).toBe(2)
    expect(storeArrivingBy('back_forward').getState().page).toBe(2)
    expect(navigationType).toHaveBeenLastCalledWith('navigation')
    expect(storeArrivingBy('reload').getState().page).toBe(1)
    expect(storeArrivingBy('navigate').getState().page).toBe(1)
  })

  it.each([
    ['storage is blocked', () => { throw new DOMException('The operation is insecure.', 'SecurityError') }],
    ['storage is missing', () => undefined],
    ['every storage call fails', () => ({
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError') },
      removeItem: () => { throw new Error('denied') },
    })],
  ])('keeps browsing in memory when %s', (_case, storage) => {
    for (const reload of [false, true]) {
      const store = createEncyclopediaBrowseStore({
        persistence: createEncyclopediaSessionPersistence({ storage, isReload: () => reload }),
      })
      expect(store.getState()).toEqual({ query: '', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 1 })

      store.setQuery('oven')
      store.setPage(2)
      store.setScrollTop(300)

      expect(store.getState()).toEqual({ query: 'oven', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 2 })
      expect(store.getScrollTop()).toBe(300)
    }
  })

  it.each([
    ['broken JSON', '{"query":'],
    ['null', 'null'],
    ['a string', '"fireplace"'],
    ['an array', '[{"query":"oven","page":2}]'],
    ['fields of the wrong kind', '{"query":7,"filters":"A","page":"2","scrollTop":"640"}'],
    ['out-of-range numbers', '{"query":"","filters":[],"page":0,"scrollTop":-40}'],
  ])('falls back to an empty search when the saved state is %s', (_case, raw) => {
    const storage = memoryStorage()
    storeInTab(storage).setPage(2)
    storage.overwriteAll(raw)

    const store = storeInTab(storage)

    expect(store.getState()).toEqual({ query: '', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 1 })
    expect(store.getScrollTop()).toBe(0)
  })

  it('keeps the readable fields when only some are damaged', () => {
    const storage = memoryStorage()
    storeInTab(storage).setPage(2)
    storage.overwriteAll('{"query":"oven","filters":null,"page":2.5,"scrollTop":120}')

    const store = storeInTab(storage)

    expect(store.getState()).toEqual({ query: 'oven', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 1 })
    expect(store.getScrollTop()).toBe(120)
  })

  it('hands the saved filters to the injected normalizer and keeps its result', () => {
    const storage = memoryStorage()
    storeInTab(storage).setFilters(someFilters)
    const received: unknown[] = []
    const normalized = { groups: ['B'] } as unknown as EncyclopediaFilters

    const store = createEncyclopediaBrowseStore({
      persistence: createEncyclopediaSessionPersistence({
        storage: () => storage,
        isReload: () => false,
        normalizeFilters: (value) => {
          received.push(value)
          return normalized
        },
      }),
    })

    expect(received).toEqual([{ groups: ['A'], types: ['minor'] }])
    expect(store.getState().filters).toBe(normalized)
  })

  it('treats a browser without navigation timing as an ordinary arrival', () => {
    const storage = memoryStorage()
    storeInTab(storage).setPage(2)
    vi.spyOn(performance, 'getEntriesByType').mockImplementation(() => { throw new TypeError('not supported') })

    const store = createEncyclopediaBrowseStore({ persistence: createEncyclopediaSessionPersistence({ storage: () => storage }) })

    expect(store.getState().page).toBe(2)
  })
})
