import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { PublicEventCardPassAnimation as PublicEventCardPassAnimationCue } from '../../app/public-event-notifications'

type Props = {
  animations: PublicEventCardPassAnimationCue[]
}

export function PublicEventCardPassAnimation({ animations }: Props) {
  const [played, setPlayed] = useState<Set<string>>(new Set())
  const onDone = useCallback((animationId: string) => {
    setPlayed((prev) => {
      const next = new Set(prev)
      next.add(animationId)
      return next
    })
  }, [])
  const unplayed = animations.filter((animation) => !played.has(animation.id))
  return (
    <>
      {unplayed.map((animation) => (
        <CardFlyOverlay
          key={animation.id}
          animation={animation}
          onDone={onDone}
        />
      ))}
    </>
  )
}

function CardFlyOverlay({
  animation,
  onDone,
}: {
  animation: PublicEventCardPassAnimationCue
  onDone: (animationId: string) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    const fromEl = document.querySelector(`[data-card-anchor="${animation.cardId}"]`) as HTMLElement | null
    const toEl = document.querySelector(`[data-hand-anchor="${animation.toPlayerId}"]`) as HTMLElement | null
    if (!fromEl || !toEl) {
      onDone(animation.id)
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
    const timer = window.setTimeout(() => onDone(animation.id), 1200)
    return () => window.clearTimeout(timer)
  }, [animation.cardId, animation.toPlayerId, animation.id, onDone])

  if (!style) return <div ref={rootRef} style={{ display: 'none' }} />
  return (
    <div className="card-pass-animation-layer" ref={rootRef} aria-hidden="true">
      <div className="card-pass-overlay" style={style}>
        <div className="card-pass-card">{animation.cardId}</div>
      </div>
    </div>
  )
}
