import { t, type Locale } from '../../shared/i18n'

interface Props {
  playerName: string
  locale: Locale
  onConfirm: () => void
}

/**
 * Screen cover shown between two seats in a local hotseat game, so the next
 * player does not walk in on the previous player's cards.
 */
export function HotseatHandoff({ playerName, locale, onConfirm }: Props) {
  return (
    <div className="hotseat-handoff" role="dialog" aria-label="Hotseat handoff">
      <div className="hotseat-handoff-panel">
        <h2 className="hotseat-handoff-title">
          {t(locale, 'ui.hotseatHandoffPrompt', { player: playerName })}
        </h2>
        <p className="hotseat-handoff-hint">
          {t(locale, 'ui.hotseatHandoffHint', { player: playerName })}
        </p>
        <button type="button" className="btn-primary" onClick={onConfirm}>
          {t(locale, 'ui.hotseatHandoffConfirm', { player: playerName })}
        </button>
      </div>
    </div>
  )
}
