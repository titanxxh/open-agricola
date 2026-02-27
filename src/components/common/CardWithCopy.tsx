import { useState, useCallback, type ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'

type Props = {
  locale: Locale
  cardId: string
  children: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
  devMode?: boolean
}

export const CardWithCopy = ({ locale, cardId, children, className = '', onClick, disabled, devMode = false }: Props) => {
  const [showCopy, setShowCopy] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(cardId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = cardId
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch { }
      document.body.removeChild(textArea)
    }
  }, [cardId])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.card-copy-overlay')) return
    onClick?.()
  }, [onClick])

  if (!devMode) {
    return (
      <div
        className={className}
        onClick={handleClick}
        aria-disabled={disabled}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={`card-with-copy ${className}`}
      onMouseEnter={() => setShowCopy(true)}
      onMouseLeave={() => {
        setShowCopy(false)
        setCopied(false)
      }}
      onClick={handleClick}
      aria-disabled={disabled}
    >
      {children}
      {showCopy && (
        <div className="card-copy-overlay">
          <div className="card-copy-id">{cardId}</div>
          <button
            type="button"
            className="card-copy-btn"
            onClick={handleCopy}
          >
            {copied ? t(locale, 'ui.cardCopied') : t(locale, 'ui.cardCopy')}
          </button>
        </div>
      )}
    </div>
  )
}
