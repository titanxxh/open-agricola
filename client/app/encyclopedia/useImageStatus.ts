import { useEffect, useSyncExternalStore } from 'react'

export type ImageStatus = 'loading' | 'loaded' | 'failed'

const settled = new Map<string, 'loaded' | 'failed'>()
const requested = new Set<string>()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const probe = (url: string) => {
  if (requested.has(url)) return
  requested.add(url)
  const image = new Image()
  const settle = (status: 'loaded' | 'failed') => {
    settled.set(url, status)
    for (const listener of listeners) listener()
  }
  image.onload = () => settle('loaded')
  image.onerror = () => settle('failed')
  image.src = url
}

/** One probe per URL for the page's lifetime, so gallery and detail agree without refetching. */
export function useImageStatus(url: string | undefined): ImageStatus | undefined {
  const status = useSyncExternalStore(subscribe, () => (url ? settled.get(url) : undefined))
  useEffect(() => {
    if (url) probe(url)
  }, [url])
  if (!url) return undefined
  return status ?? 'loading'
}
