import { describe, expect, it, vi } from 'vitest'
import { createEncyclopediaBrowseStore, type EncyclopediaBrowseSnapshot } from '../encyclopedia-browse-store'
import { EMPTY_ENCYCLOPEDIA_FILTERS } from '../encyclopedia-filters'

describe('encyclopedia browse store', () => {
  it('starts from an empty search on the first page', () => {
    const store = createEncyclopediaBrowseStore()

    expect(store.getState()).toEqual({ query: '', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 1 })
    expect(store.getScrollTop()).toBe(0)
  })

  it('returns to the first page when the query or filters change, but not when the query is unchanged', () => {
    const store = createEncyclopediaBrowseStore()
    store.setPage(3)
    store.setQuery('fireplace')
    expect(store.getState()).toMatchObject({ query: 'fireplace', page: 1 })

    store.setPage(2)
    store.setQuery('fireplace')
    expect(store.getState().page).toBe(2)

    store.setFilters({ ...EMPTY_ENCYCLOPEDIA_FILTERS })
    expect(store.getState().page).toBe(1)
  })

  it('notifies subscribers of state changes until they unsubscribe', () => {
    const store = createEncyclopediaBrowseStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.setPage(2)
    store.setPage(2)
    unsubscribe()
    store.setPage(3)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears search, filters, page and scroll position together', () => {
    const store = createEncyclopediaBrowseStore()
    store.setQuery('oven')
    store.setPage(4)
    store.setScrollTop(640)

    store.reset()

    expect(store.getState()).toEqual({ query: '', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 1 })
    expect(store.getScrollTop()).toBe(0)
  })

  it('restores from and writes through an injected persistence', () => {
    const saved: EncyclopediaBrowseSnapshot[] = []
    const store = createEncyclopediaBrowseStore({
      persistence: {
        load: () => ({ query: 'oven', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 2, scrollTop: 300 }),
        save: snapshot => saved.push(snapshot),
      },
    })

    expect(store.getState()).toEqual({ query: 'oven', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 2 })
    expect(store.getScrollTop()).toBe(300)

    store.setPage(3)
    store.setScrollTop(120)

    expect(saved).toEqual([
      { query: 'oven', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 3, scrollTop: 300 },
      { query: 'oven', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 3, scrollTop: 120 },
    ])
  })
})
