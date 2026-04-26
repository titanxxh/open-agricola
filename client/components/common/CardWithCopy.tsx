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
}

const SHOW_DELAY_MS = 250
const HIDE_DELAY_MS = 120

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
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const stateRef = useRef<{ card: boolean; preview: boolean }>({
    card: false,
    preview: false,
  })
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

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

  useEffect(
    () => () => {
      clearShowTimer()
      clearHideTimer()
    },
    [],
  )

  const evaluate = () => {
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

  const handleClick = useCallback(() => {
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
        aria-disabled={disabled}
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
