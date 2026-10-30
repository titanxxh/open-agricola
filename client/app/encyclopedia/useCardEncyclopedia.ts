import { useCallback, useEffect, useState } from 'react'
import { loadCardEncyclopedia, type CardEncyclopedia } from '../../services/card-encyclopedia'

export type CardEncyclopediaLoad =
  | { status: 'loading' }
  | { status: 'ready'; encyclopedia: CardEncyclopedia }
  | { status: 'error' }

/** The only importer of the catalog loader, so the catalog stays out of every other chunk. */
export function useCardEncyclopedia(): CardEncyclopediaLoad & { retry: () => void } {
  const [load, setLoad] = useState<CardEncyclopediaLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    loadCardEncyclopedia().then(
      (encyclopedia) => { if (current) setLoad({ status: 'ready', encyclopedia }) },
      () => { if (current) setLoad({ status: 'error' }) },
    )
    return () => { current = false }
  }, [attempt])

  const retry = useCallback(() => {
    setLoad({ status: 'loading' })
    setAttempt(value => value + 1)
  }, [])

  return { ...load, retry }
}
