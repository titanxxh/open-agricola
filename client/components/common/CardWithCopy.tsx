import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { CardHoverPreview } from './CardHoverPreview'

type Props = {
  locale: Locale
  cardId: string
  children: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
  devMode?: boolean
  enablePreview?: boolean
  previewCard?: ReactNode
  'data-card-anchor'?: string
}

const SHOW_DELAY_MS = 250
const HIDE_DELAY_MS = 120
const LONG_PRESS_MS = 400
const LONG_PRESS_MOVE_THRESHOLD_SQ = 100 // (10px)^2

export const CardWithCopy = ({
  locale,
  cardId,
  children,
  className = '',
  onClick,
  disabled,
  devMode = false,
  enablePreview = true,
  previewCard,
  'data-card-anchor': dataCardAnchor,
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const pressStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressFiredRef = useRef(false)
  const stateRef = useRef<{ card: boolean; preview: boolean }>({
    card: false,
    preview: false,
  })
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [touchPinned, setTouchPinned] = useState(false)

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }
  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    pressStartRef.current = null
  }

  useEffect(
    () => () => {
      clearShowTimer()
      clearHideTimer()
      clearLongPressTimer()
    },
    [],
  )

  // While the preview is touch-pinned, dismiss it on a tap that lands outside
  // both the card and the preview. Mouse hover has its own pointerleave
  // dismissal, so this listener only matters for the touch path.
  useEffect(() => {
    if (!touchPinned) return
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (rootRef.current?.contains(target)) return
      const previewEls = document.querySelectorAll('.card-hover-preview')
      for (const el of previewEls) {
        if (el.contains(target)) return
      }
      setTouchPinned(false)
      setAnchor(null)
    }
    document.addEventListener('pointerdown', handler, { capture: true })
    return () =>
      document.removeEventListener('pointerdown', handler, { capture: true })
  }, [touchPinned])

  const evaluate = () => {
    if (touchPinned) {
      clearHideTimer()
      return
    }
    const visible = stateRef.current.card || stateRef.current.preview
    if (visible) {
      clearHideTimer()
    } else {
      clearShowTimer()
      if (anchor && hideTimerRef.current === null) {
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = null
          if (!stateRef.current.card && !stateRef.current.preview) {
            setAnchor(null)
          }
        }, HIDE_DELAY_MS)
      }
    }
  }

  const handleCardEnter = (e: React.PointerEvent) => {
    if (!enablePreview || !previewCard) return
    if (e.pointerType !== 'mouse') return
    stateRef.current.card = true
    clearHideTimer()
    if (anchor) return
    if (showTimerRef.current === null) {
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null
        if (rootRef.current && stateRef.current.card) {
          setAnchor(rootRef.current.getBoundingClientRect())
        }
      }, SHOW_DELAY_MS)
    }
  }

  const handleCardLeave = () => {
    stateRef.current.card = false
    evaluate()
  }

  const handlePreviewEnter = () => {
    stateRef.current.preview = true
    evaluate()
  }
  const handlePreviewLeave = () => {
    stateRef.current.preview = false
    evaluate()
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    longPressFiredRef.current = false
    if (e.pointerType === 'mouse') return
    if (!enablePreview || !previewCard) return
    clearLongPressTimer()
    pressStartRef.current = { x: e.clientX, y: e.clientY }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      pressStartRef.current = null
      if (rootRef.current) {
        longPressFiredRef.current = true
        setAnchor(rootRef.current.getBoundingClientRect())
        setTouchPinned(true)
      }
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    const start = pressStartRef.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_THRESHOLD_SQ) {
      clearLongPressTimer()
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') clearLongPressTimer()
  }

  const handleClick = useCallback(() => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    onClick?.()
  }, [onClick])

  return (
    <>
      <div
        ref={rootRef}
        className={className}
        onClick={handleClick}
        onPointerEnter={handleCardEnter}
        onPointerLeave={handleCardLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-disabled={disabled}
        data-card-anchor={dataCardAnchor}
      >
        {children}
      </div>
      {anchor && previewCard && (
        <CardHoverPreview
          locale={locale}
          cardId={cardId}
          devMode={devMode}
          anchor={anchor}
          card={previewCard}
          onPreviewEnter={handlePreviewEnter}
          onPreviewLeave={handlePreviewLeave}
        />
      )}
    </>
  )
}
