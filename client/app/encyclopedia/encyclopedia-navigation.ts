import { useCallback, useEffect, useMemo, useState } from 'react'
import { encyclopediaEntryHref, readEncyclopediaEntry } from './encyclopedia-url'

/** How the browser opens and closes a detail; it never reads or writes the URL itself. */
export type EncyclopediaNavigation = Readonly<{
  selectedKey: string | null
  openEntry: (key: string) => void
  closeEntry: () => void
}>

/** For surfaces that must not touch the URL, such as the in-game panel. */
export function useMemoryEncyclopediaNavigation(initialKey: string | null = null): EncyclopediaNavigation {
  const [selectedKey, setSelectedKey] = useState(initialKey)
  const closeEntry = useCallback(() => setSelectedKey(null), [])
  return useMemo(() => ({ selectedKey, openEntry: setSelectedKey, closeEntry }), [selectedKey, closeEntry])
}

const DETAIL_STATE_KEY = 'encyclopediaDetail'

/**
 * History state survives a reload but the entry before it then belongs to a discarded document,
 * so only details opened by this document may close with `history.back()`.
 */
const DOCUMENT_TOKEN = `${Date.now()}-${Math.random()}`

const openedHere = () => {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[DETAIL_STATE_KEY] === DOCUMENT_TOKEN
}

export function useEncyclopediaUrlNavigation(): EncyclopediaNavigation {
  const [selectedKey, setSelectedKey] = useState(() => readEncyclopediaEntry(window.location.search))

  useEffect(() => {
    const syncFromUrl = () => setSelectedKey(readEncyclopediaEntry(window.location.search))
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  const openEntry = useCallback((key: string) => {
    window.history.pushState({ [DETAIL_STATE_KEY]: DOCUMENT_TOKEN }, '', encyclopediaEntryHref(window.location, key))
    setSelectedKey(key)
  }, [])

  const closeEntry = useCallback(() => {
    setSelectedKey(null)
    if (openedHere()) window.history.back()
    else window.history.replaceState(null, '', encyclopediaEntryHref(window.location, null))
  }, [])

  return useMemo(() => ({ selectedKey, openEntry, closeEntry }), [selectedKey, openEntry, closeEntry])
}
