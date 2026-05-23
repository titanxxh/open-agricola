import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { CardPassedEvent } from '../../../shared/contract/events'

type Props = {
  events: CardPassedEvent[]
}

export function PublicEventCardPassAnimation({ events }: Props) {
  const [played, setPlayed] = useState<Set<string>>(new Set())
  const onDone = useCallback((eventId: string) => {
    setPlayed((prev) => {
      const next = new Set(prev)
      next.add(eventId)
      return next
    })
  }, [])
  const unplayed = events.filter((e) => !played.has(e.id))
  return (
    <>
      {unplayed.map((event) => (
        <CardFlyOverlay
          key={event.id}
          event={event}
          onDone={onDone}
        />
      ))}
    </>
  )
}

function CardFlyOverlay({ event, onDone }: { event: CardPassedEvent; onDone: (eventId: string) => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    const fromEl = document.querySelector(`[data-card-anchor="${event.cardId}"]`) as HTMLElement | null
    const toEl = document.querySelector(`[data-hand-anchor="${event.toPlayerId}"]`) as HTMLElement | null
    if (!fromEl || !toEl) {
      onDone(event.id)
      return
    }
    const fromBox = fromEl.getBoundingClientRect()
    const toBox = toEl.getBoundingClientRect()
    const root = rootRef.current
    const rootRect = root ? root.getBoundingClientRect() : { left: 0, top: 0 }
    setStyle({
      '--from-x': `${fromBox.left + fromBox.width / 2 - rootRect.left}px`,
      '--from-y': `${fromBox.top + fromBox.height / 2 - rootRect.top}px`,
      '--to-x': `${toBox.left + toBox.width / 2 - rootRect.left}px`,
      '--to-y': `${toBox.top + toBox.height / 2 - rootRect.top}px`,
    } as CSSProperties)
    const timer = window.setTimeout(() => onDone(event.id), 1200)
    return () => window.clearTimeout(timer)
  }, [event.cardId, event.toPlayerId, event.id, onDone])

  if (!style) return <div ref={rootRef} style={{ display: 'none' }} />
  return (
    <div className="card-pass-animation-layer" ref={rootRef} aria-hidden="true">
      <div className="card-pass-overlay" style={style}>
        <div className="card-pass-card">{event.cardId}</div>
      </div>
    </div>
  )
}
