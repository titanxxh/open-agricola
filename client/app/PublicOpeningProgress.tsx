import type { GameState } from '../../shared/contract/types'
import { t, type Locale } from '../../shared/i18n'
import { getPlayerDisplayName } from '../utils/player-name'
import { computeDraftViewModel } from './draft/DraftOverlay'

export function PublicOpeningProgress({ state, locale }: { state: GameState; locale: Locale }) {
  const draft = state.phase === 'draft' ? state.draft : null
  const submitted = new Set(draft
    ? computeDraftViewModel(draft, null).submittedPlayerIds
    : Object.entries(state.parentSelection?.submissions ?? {}).filter(([, value]) => value !== null).map(([id]) => id))
  return (
    <section className="draft-overlay" aria-label={t(locale, 'platform.spectating.live')}>
      <div className="draft-overlay-panel">
        <h2>{draft
          ? t(locale, 'ui.draft.title', { round: draft.round, total: draft.totalRounds })
          : t(locale, 'ui.parentSelection.title')}</h2>
        <ol className="draft-opening-players">
          {state.players.map((player, index) => (
            <li className="draft-opening-player" key={player.id}>
              <span className="draft-opening-rank">{index + 1}</span>
              <span className="draft-opening-name">{getPlayerDisplayName(locale, player.name, index, player.nameIsDefault)}</span>
              <span className="draft-opening-selection" data-submitted={submitted.has(player.id)}>
                {t(locale, submitted.has(player.id) ? 'ui.draft.submitted' : 'ui.draft.selecting')}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
