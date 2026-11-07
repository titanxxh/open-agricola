import type { GameState } from '../../shared/contract/types'
import { t, type Locale } from '../../shared/i18n'
import { getPlayerDisplayName } from '../utils/player-name'
import { DraftPlayersProgress } from './draft/DraftOverlay'

export function PublicOpeningProgress({ state, locale, connectedPlayerIndexes }: { state: GameState; locale: Locale; connectedPlayerIndexes?: number[] | null }) {
  const draft = state.phase === 'draft' ? state.draft : null
  const submitted = new Set(Object.entries(state.parentSelection?.submissions ?? {}).filter(([, value]) => value !== null).map(([id]) => id))
  return (
    <section className="draft-overlay" aria-label={t(locale, 'platform.spectating.live')}>
      <div className="draft-overlay-panel">
        <h2>{draft
          ? t(locale, 'ui.draft.heading')
          : t(locale, 'ui.parentSelection.title')}</h2>
        {draft ? <DraftPlayersProgress state={state} locale={locale} connectedPlayerIndexes={connectedPlayerIndexes} /> : <ol className="draft-opening-players">
          {state.players.map((player, index) => (
            <li className="draft-opening-player" key={player.id}>
              <span className="draft-opening-rank">{index + 1}</span>
              <span className="draft-opening-name">{getPlayerDisplayName(locale, player.name, index, player.nameIsDefault)}</span>
              <span className="draft-opening-selection" data-submitted={submitted.has(player.id)}>
                {t(locale, submitted.has(player.id) ? 'ui.draft.submitted' : 'ui.draft.selecting')}
              </span>
            </li>
          ))}
        </ol>}
      </div>
    </section>
  )
}
