import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t, type Locale } from '../../../shared/i18n'
import './CardDetails.css'

type Props = {
  locale: Locale
  card: ReactNode
  onClose: () => void
  play?: { disabled: boolean; onPlay: () => void }
}

export const CardDetails = ({ locale, card, onClose, play }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="card-details"
      aria-label={t(locale, 'ui.cardDetails')}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="card-details__layout">
        <div className="card-details__header">
          <span>{t(locale, 'ui.cardDetails')}</span>
          <button type="button" onClick={onClose}>{t(locale, 'ui.close')}</button>
        </div>
        <div className="card-details__body">{card}</div>
        {play && (
          <div className="card-details__footer">
            <button type="button" disabled={play.disabled} onClick={play.onPlay}>
              {t(locale, 'ui.cardPlay')}
            </button>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  )
}
