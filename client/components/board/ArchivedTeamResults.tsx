import type { CompletedGameContextDescriptor } from '../../../shared/contract/protocol/game-context'
import { t, type Locale } from '../../../shared/i18n'
import { formatScore } from '../../utils/format-score'
import { getPlayerDisplayName } from '../../utils/player-name'
import './archived-team-results.css'

export const ArchivedTeamResults = ({ result, locale, onWatch }: {
  result: CompletedGameContextDescriptor['result']
  locale: Locale
  onWatch?: (playerIndex: number) => void
}) => {
  const archive = result.team
  if (!archive) return null
  const playerName = (player: typeof result.players[number]) =>
    getPlayerDisplayName(locale, player.displayName, player.playerIndex, player.nameIsDefault)
  return <ol className="archived-team-results">
    {[...archive.scores].sort((left, right) => left.rank - right.rank || left.teamIndex - right.teamIndex).map(team => {
      const members = result.players.filter(player => player.teamIndex === team.teamIndex)
      return <li key={team.teamIndex} data-team-index={team.teamIndex}>
        <div className="archived-team-heading">
          <span>{t(locale, 'team.rank', { rank: team.rank })}</span>
          <strong>{archive.mode === 'multihand' && members[0]
            ? playerName(members[0]) : t(locale, 'team.name', { number: team.teamIndex + 1 })}</strong>
          <span>{t(locale, 'team.score')} <b data-team-total>{formatScore(team.total)}</b></span>
        </div>
        <p>{t(locale, `team.scoring.${archive.scoring}`)}</p>
        <ul>{members.map(player => <li key={player.playerIndex}>
          <span>{playerName(player)}</span>
          <strong>{formatScore(player.score)}</strong>
          {onWatch ? <button type="button" onClick={() => onWatch(player.playerIndex)}>
            {t(locale, 'platform.gameContext.watchAs', { player: playerName(player) })}
          </button> : null}
        </li>)}</ul>
      </li>
    })}
  </ol>
}
