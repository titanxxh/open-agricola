import { useSyncExternalStore } from 'react'
import { EMPTY_ENCYCLOPEDIA_FILTERS, type EncyclopediaFilters } from './encyclopedia-filters'

export type EncyclopediaBrowseState = Readonly<{
  query: string
  filters: EncyclopediaFilters
  /** 1-based; the result view clamps it to the current page count. */
  page: number
}>

export type EncyclopediaBrowseSnapshot = EncyclopediaBrowseState & Readonly<{ scrollTop: number }>

export type EncyclopediaBrowsePersistence = {
  load(): EncyclopediaBrowseSnapshot | undefined
  save(snapshot: EncyclopediaBrowseSnapshot): void
}

export type EncyclopediaBrowseStore = {
  getState(): EncyclopediaBrowseState
  subscribe(listener: () => void): () => void
  setQuery(query: string): void
  setFilters(filters: EncyclopediaFilters): void
  setPage(page: number): void
  /** Clears search and filters and returns to the top of the first page. */
  reset(): void
  /** Not part of the subscribed state: hosts read it when they mount and write it when they leave. */
  getScrollTop(): number
  setScrollTop(scrollTop: number): void
}

const INITIAL_STATE: EncyclopediaBrowseState = Object.freeze({ query: '', filters: EMPTY_ENCYCLOPEDIA_FILTERS, page: 1 })

export function createEncyclopediaBrowseStore(
  { persistence }: { persistence?: EncyclopediaBrowsePersistence } = {},
): EncyclopediaBrowseStore {
  const restored = persistence?.load()
  let state: EncyclopediaBrowseState = restored
    ? { query: restored.query, filters: restored.filters, page: restored.page }
    : INITIAL_STATE
  let scrollTop = restored?.scrollTop ?? 0
  const listeners = new Set<() => void>()
  const save = () => persistence?.save({ ...state, scrollTop })
  const update = (next: EncyclopediaBrowseState) => {
    state = next
    save()
    for (const listener of listeners) listener()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setQuery(query) {
      if (query !== state.query) update({ ...state, query, page: 1 })
    },
    setFilters(filters) {
      if (filters !== state.filters) update({ ...state, filters, page: 1 })
    },
    setPage(page) {
      if (page !== state.page) update({ ...state, page })
    },
    reset() {
      scrollTop = 0
      update(INITIAL_STATE)
    },
    getScrollTop: () => scrollTop,
    setScrollTop(next) {
      scrollTop = next
      save()
    },
  }
}

/** Shared by the standalone page and the in-game panel so both see the same search within a tab. */
export const encyclopediaBrowseStore = createEncyclopediaBrowseStore()

export const useEncyclopediaBrowseState = (store: EncyclopediaBrowseStore = encyclopediaBrowseStore): EncyclopediaBrowseState =>
  useSyncExternalStore(store.subscribe, store.getState)
