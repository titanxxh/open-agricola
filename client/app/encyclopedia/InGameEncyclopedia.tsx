import { lazy, Suspense, useId, useLayoutEffect, useRef, useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import { AppErrorBoundary } from '../AppErrorBoundary'
import { EncyclopediaLoadError } from './EncyclopediaLoadError'
import { initialEncyclopediaAttention, nextEncyclopediaAttention } from './encyclopedia-attention'

const loadContent = () => import('./InGameEncyclopediaContent').then(m => ({ default: m.InGameEncyclopediaContent }))
// A rejected lazy component stays rejected, so a retry needs a fresh one.
let ContentLazy = lazy(loadContent)

type InGameEncyclopediaProps = {
  locale: Locale
  /** The window when the player opened the panel, so a remount does not swallow a newer one. */
  openedWindow: string | null
  /** From `encyclopediaAttentionWindow`; the panel only compares successive values. */
  attentionWindow: string | null
  onClose: () => void
}

/**
 * Rendered beside the game tree rather than inside it. It gets no transport and
 * never reads or writes the URL, so opening it cannot remount the game or send a command.
 */
export function InGameEncyclopedia({ locale, openedWindow, attentionWindow, onClose }: InGameEncyclopediaProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [contentAttempt, setContentAttempt] = useState(0)
  const [attention, setAttention] = useState(() => initialEncyclopediaAttention(openedWindow))
  const nextAttention = nextEncyclopediaAttention(attention, attentionWindow)
  if (nextAttention !== attention) setAttention(nextAttention)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  // The entry outside stays inert until the modal is closed.
  const close = () => {
    dialogRef.current?.close()
    onClose()
  }
  const backToGame = (variant: 'primary' | 'secondary') => (
    <button type="button" className={`btn-${variant}`} onClick={close}>{t(locale, 'ui.encyclopedia.inGame.backToGame')}</button>
  )

  return (
    <dialog
      ref={dialogRef}
      className="encyclopedia-in-game"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        close()
      }}
      onClick={(event) => { if (event.target === event.currentTarget) close() }}
    >
      <div className="encyclopedia-in-game__panel">
        <header className="encyclopedia-in-game__header">
          <h2 id={titleId} className="encyclopedia-in-game__title">{t(locale, 'ui.encyclopedia.title')}</h2>
          <button type="button" className="btn-secondary" aria-label={t(locale, 'ui.encyclopedia.inGame.close')} onClick={close}>
            {t(locale, 'ui.close')}
          </button>
        </header>
        <div className="encyclopedia-in-game__attention" data-pending={attention.pending ? 'true' : undefined}>
          <p className="encyclopedia-in-game__status" role="status">
            {attention.pending ? t(locale, 'ui.encyclopedia.inGame.attention') : null}
          </p>
          {attention.pending ? backToGame('primary') : null}
        </div>
        <div className="encyclopedia-in-game__body">
          <AppErrorBoundary
            key={contentAttempt}
            fallback={(
              <EncyclopediaLoadError
                locale={locale}
                onRetry={() => {
                  ContentLazy = lazy(loadContent)
                  setContentAttempt(attempt => attempt + 1)
                }}
              >
                {backToGame('secondary')}
              </EncyclopediaLoadError>
            )}
          >
            <Suspense fallback={<p className="encyclopedia-page__loading" role="status">{t(locale, 'platform.loading')}</p>}>
              <ContentLazy locale={locale} onBackToGame={close} />
            </Suspense>
          </AppErrorBoundary>
        </div>
      </div>
    </dialog>
  )
}
