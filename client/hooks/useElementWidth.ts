import { useLayoutEffect, useState, type RefObject } from 'react'

export const useElementWidth = (ref: RefObject<HTMLElement | null>, enabled: boolean) => {
  const [width, setWidth] = useState<number>()
  useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || !element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled, ref])
  return enabled ? width : undefined
}
