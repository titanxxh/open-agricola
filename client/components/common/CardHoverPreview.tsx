import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'

const PREVIEW_WIDTH = 300
const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * 299) / 188)
const ANCHOR_GAP = 12
const VIEWPORT_MARGIN = 8

type Pos = { left: number; top: number }

const computePos = (anchor: DOMRect, devMode: boolean): Pos => {
  if (typeof window === 'undefined') return { left: 0, top: 0 }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const footerH = devMode ? 44 : 0
  const totalH = PREVIEW_HEIGHT + footerH

  let left = anchor.right + ANCHOR_GAP
  if (left + PREVIEW_WIDTH + VIEWPORT_MARGIN > vw) {
    left = anchor.left - PREVIEW_WIDTH - ANCHOR_GAP
  }
  if (left < VIEWPORT_MARGIN) {
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(
        vw - PREVIEW_WIDTH - VIEWPORT_MARGIN,
        anchor.left + anchor.width / 2 - PREVIEW_WIDTH / 2,
      ),
    )
  }

  let top = anchor.top + anchor.height / 2 - totalH / 2
  top = Math.max(VIEWPORT_MARGIN, Math.min(vh - totalH - VIEWPORT_MARGIN, top))

  return { left, top }
}

type Props = {
  locale: Locale
  cardId: string
  devMode?: boolean
  anchor: DOMRect
  card: ReactNode
  onPreviewEnter: () => void
  onPreviewLeave: () => void
}

export const CardHoverPreview = ({
  locale,
  cardId,
  devMode = false,
  anchor,
  card,
  onPreviewEnter,
  onPreviewLeave,
}: Props) => {
  const pos = useMemo(() => computePos(anchor, devMode), [anchor, devMode])
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(cardId)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = cardId
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [cardId])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="card-hover-preview"
      style={{ left: pos.left, top: pos.top, width: PREVIEW_WIDTH }}
      onPointerEnter={onPreviewEnter}
      onPointerLeave={onPreviewLeave}
    >
      <div
        className="card-hover-preview-card"
        style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
      >
        {card}
      </div>
      {devMode && (
        <div className="card-hover-preview-footer">
          <code className="card-hover-preview-id">{cardId}</code>
          <button
            type="button"
            className="card-hover-preview-copy"
            onClick={handleCopy}
          >
            {copied ? t(locale, 'ui.cardCopied') : t(locale, 'ui.cardCopy')}
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
