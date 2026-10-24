import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { CardHoverPreview } from './CardHoverPreview'
import { CardDetails } from './CardDetails'
import type { CardPlayOutcome } from '../../hooks/useCardPlayChoice'
import { useRequestActivation, type RequestActivation } from '../../hooks/useRequestActivation'

export type CardTouchInteraction = { kind: 'inspect' } | { kind: 'play'; requestKey: string }

type Props = {
  locale: Locale
  cardId: string
  children: ReactNode
  className?: string
  onClick?: () => CardPlayOutcome
  disabled?: boolean
  touchInteraction?: CardTouchInteraction
  devMode?: boolean
  enablePreview?: boolean
  previewCard?: ReactNode
  previewWidth?: number
  previewHeight?: number
  previewClassName?: string
  'data-card-anchor'?: string
  'data-card-id'?: string
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
  touchInteraction,
  devMode = false,
  enablePreview = true,
  previewCard,
  previewWidth,
  previewHeight,
  previewClassName,
  'data-card-anchor': dataCardAnchor,
  'data-card-id': dataCardId,
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
  const touchGestureRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const activation = useRequestActivation(touchInteraction?.kind === 'play' ? touchInteraction.requestKey : null)
  const submittedRequestRef = useRef<RequestActivation | null>(null)
  const [details, setDetails] = useState<{ activation: RequestActivation } | null>(null)
  const [submittedRequest, setSubmittedRequest] = useState<RequestActivation | null>(null)

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
    if (e.pointerType && e.pointerType !== 'mouse') return
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
    touchGestureRef.current = null
    if (e.pointerType === 'mouse') return
    if (touchInteraction && enablePreview && previewCard) {
      touchGestureRef.current = { x: e.clientX, y: e.clientY, moved: false }
      return
    }
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
    const gesture = touchGestureRef.current
    if (gesture && (e.clientX - gesture.x) ** 2 + (e.clientY - gesture.y) ** 2 > LONG_PRESS_MOVE_THRESHOLD_SQ) {
      gesture.moved = true
    }
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

  const handleClick = () => {
    const gesture = touchGestureRef.current
    touchGestureRef.current = null
    if (gesture && touchInteraction && previewCard) {
      if (!gesture.moved) {
        clearShowTimer()
        clearHideTimer()
        setAnchor(null)
        setDetails({ activation })
      }
      return
    }
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    if (!disabled) onClick?.()
  }

  const closeDetails = () => {
    setDetails(null)
    rootRef.current?.focus({ preventScroll: true })
  }
  const canPlayDetails = details?.activation === activation && touchInteraction?.kind === 'play' &&
    !disabled && !!onClick && submittedRequest !== activation

  const keyboardPreview = enablePreview && !!previewCard

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
        onPointerCancel={(event) => {
          if (touchGestureRef.current) touchGestureRef.current.moved = true
          handlePointerUp(event)
        }}
        aria-disabled={disabled}
        tabIndex={keyboardPreview ? 0 : undefined}
        onFocus={(event) => {
          if (!keyboardPreview || !rootRef.current || !event.currentTarget.matches(':focus-visible')) return
          stateRef.current.card = true
          setAnchor(rootRef.current.getBoundingClientRect())
        }}
        onBlur={(event) => {
          if (!keyboardPreview || event.currentTarget.contains(event.relatedTarget)) return
          stateRef.current.card = false
          evaluate()
        }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ') && onClick && !disabled) {
            event.preventDefault()
            onClick()
          }
          if (event.key === 'Escape') {
            clearShowTimer()
            clearHideTimer()
            setAnchor(null)
          }
        }}
        data-card-anchor={dataCardAnchor}
        data-card-id={dataCardId}
      >
        {children}
      </div>
      {details && previewCard && (
        <CardDetails
          locale={locale}
          card={previewCard}
          onClose={closeDetails}
          play={details.activation.requestKey === null ? undefined : {
            disabled: !canPlayDetails,
            onPlay: () => {
              if (!canPlayDetails || touchInteraction?.kind !== 'play' || submittedRequestRef.current === activation) return
              submittedRequestRef.current = activation
              setSubmittedRequest(activation)
              const submittedActivation = activation
              const settle = (accepted: boolean) => {
                if (submittedRequestRef.current !== submittedActivation) return
                if (accepted) setDetails(current => current?.activation === submittedActivation ? null : current)
                else {
                  submittedRequestRef.current = null
                  setSubmittedRequest(null)
                }
              }
              try {
                const result = onClick?.()
                if (result instanceof Promise) void result.then(settle, () => settle(false))
                else settle(result !== false)
              } catch {
                settle(false)
              }
            },
          }}
        />
      )}
      {anchor && previewCard && (
        <CardHoverPreview
          locale={locale}
          cardId={cardId}
          devMode={devMode}
          anchor={anchor}
          card={previewCard}
          width={previewWidth}
          height={previewHeight}
          className={previewClassName}
          onPreviewEnter={handlePreviewEnter}
          onPreviewLeave={handlePreviewLeave}
        />
      )}
    </>
  )
}
