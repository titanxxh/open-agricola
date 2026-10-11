import { t, type Locale } from '../../../shared/i18n'
import type { ClientGameState } from '../../services/rehydrate'
import { formatScore } from '../../utils/format-score'
import type { PlayerScoreRow } from './ScorePanel'

const resources = ['wood', 'clay', 'reed', 'stone', 'grain', 'vegetable', 'food', 'sheep', 'boar', 'cattle', 'begging', 'fuel', 'horse'] as const

type Props = {
  locale: Locale
  players: ClientGameState['players']
  playerNames: Record<string, string>
  scores: PlayerScoreRow[]
  viewedPlayerId: string
  currentPlayerId: string
  onViewPlayer: (playerId: string) => void
}

export function DesktopPlayerOverview({ locale, players, playerNames, scores, viewedPlayerId, currentPlayerId, onViewPlayer }: Props) {
  return (
    <div className="desktop-player-overview">
      {players.map(player => (
        <section key={player.id} className="desktop-player-overview__player" data-player-color={player.color}>
          <button type="button" className="desktop-player-overview__name" aria-pressed={player.id === viewedPlayerId} onClick={() => onViewPlayer(player.id)}>
            <span>{playerNames[player.id]}</span>
            {player.id === currentPlayerId ? <span className="desktop-player-overview__turn" aria-label={t(locale, 'ui.currentPlayer')}>◀</span> : null}
            <span className="desktop-player-overview__score">{formatScore(scores.find(row => row.id === player.id)?.total ?? 0)}</span>
          </button>
          <div className="desktop-player-overview__resources">
            {resources.filter(resource => player.resources[resource] !== undefined).map(resource => (
              <span key={resource} title={`${t(locale, `resources.${resource}`)}: ${player.resources[resource]}`}>
                <span className={`res-icon res-icon-${resource}`} aria-hidden="true" />
                <span>{player.resources[resource]}</span>
              </span>
            ))}
            <span title={t(locale, 'ui.family')}><span className="res-icon res-icon-child" aria-hidden="true" /><span>{player.playerPanelSummary.family.used}/{player.playerPanelSummary.family.limit}</span></span>
          </div>
        </section>
      ))}
    </div>
  )
}
