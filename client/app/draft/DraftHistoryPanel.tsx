import { t, type Locale } from '../../../shared/i18n'
import { PlayerCard } from '../../components/common/PlayerCard'

interface Props {
  occIds: string[]
  minorIds: string[]
  locale: Locale
}

/**
 * Shows the cards the player has already kept across previous draft rounds.
 * Non-interactive — purely informational.
 */
export function DraftHistoryPanel({ occIds, minorIds, locale }: Props) {
  return (
    <div className="draft-history">
      <div className="draft-history-section" data-section="occ">
        <h4 className="draft-history-title">
          {t(locale, 'ui.draftKeptOccupations', { count: occIds.length })}
        </h4>
        <div className="draft-history-row">
          {occIds.length === 0 && <div className="draft-history-empty">—</div>}
          {occIds.map((id) => (
            <PlayerCard
              key={id}
              locale={locale}
              cardId={id}
              cardType="occupation"
              disabled
              className="draft-card draft-card-kept"
            />
          ))}
        </div>
      </div>
      <div className="draft-history-section" data-section="minor">
        <h4 className="draft-history-title">
          {t(locale, 'ui.draftKeptMinorImprovements', { count: minorIds.length })}
        </h4>
        <div className="draft-history-row">
          {minorIds.length === 0 && <div className="draft-history-empty">—</div>}
          {minorIds.map((id) => (
            <PlayerCard
              key={id}
              locale={locale}
              cardId={id}
              cardType="minor"
              disabled
              className="draft-card draft-card-kept"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
