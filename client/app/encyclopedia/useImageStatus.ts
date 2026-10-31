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

const combinedStatus = (urls: readonly string[]): ImageStatus => {
  const statuses = urls.map(url => settled.get(url))
  if (statuses.includes('failed')) return 'failed'
  return statuses.every(status => status === 'loaded') ? 'loaded' : 'loading'
}

/**
 * One probe per URL for the page's lifetime, so gallery and detail agree without refetching.
 * Several URLs report `failed` as soon as any of them fails.
 */
export function useImageStatus(urls: readonly string[]): ImageStatus | undefined {
  const key = urls.join('\n')
  const status = useSyncExternalStore(subscribe, () => combinedStatus(urls))
  useEffect(() => {
    if (key) for (const url of key.split('\n')) probe(url)
  }, [key])
  return urls.length > 0 ? status : undefined
}
