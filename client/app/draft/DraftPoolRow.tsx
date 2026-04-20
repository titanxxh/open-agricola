import type { Locale } from '../../../shared/i18n'
import { PlayerCard, type CardType } from '../../components/common/PlayerCard'

export type DraftPoolKind = 'occ' | 'minor'

interface Props {
  kind: DraftPoolKind
  ids: string[]
  selectedId: string | null
  onSelect: (id: string) => void
  locale: Locale
  disabled?: boolean
}

/**
 * Renders a horizontal row of cards from one draft pool. Each card is clickable
 * and calls `onSelect(id)` — the selected id is highlighted. When `disabled` the
 * row is non-interactive (used after the player submits while waiting on others).
 */
export function DraftPoolRow({ kind, ids, selectedId, onSelect, locale, disabled }: Props) {
  const cardType: CardType = kind === 'occ' ? 'occupation' : 'minor'
  return (
    <div className={`draft-pool-row draft-pool-row-${kind}`} data-kind={kind}>
      {ids.length === 0 && (
        <div className="draft-pool-empty" data-empty="1">
          {kind === 'occ' ? 'No occupation cards in pool' : 'No minor cards in pool'}
        </div>
      )}
      {ids.map((id) => (
        <PlayerCard
          key={id}
          locale={locale}
          cardId={id}
          cardType={cardType}
          selectable
          selected={id === selectedId}
          disabled={disabled}
          onClick={() => onSelect(id)}
          className="draft-card"
        />
      ))}
    </div>
  )
}
