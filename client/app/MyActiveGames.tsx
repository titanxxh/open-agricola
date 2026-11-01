import type { LobbyExpansion, MyActiveRoom } from '../../shared/contract/lobby'
import { Section } from '../components/common/Section'
import { useLocale } from '../contexts/LocaleContext'
import { getPlayerDisplayName } from '../utils/player-name'

const expansionIcons = {
  enableParentCards: { icon: '👪', label: 'ui.parentSelection.title' },
  enableThroughTheSeasons: { icon: '🍂', label: 'platform.sandboxVariantThroughTheSeasons' },
  enableFarmersOfTheMoor: { icon: '🐴', label: 'platform.sandboxVariantFarmersOfTheMoor' },
  enableCommunityDeck: { icon: '🛠️', label: 'ui.copy.client_app_WorkshopPage_tsx.community_cards_954882' },
} satisfies Record<LobbyExpansion, { icon: string; label: string }>

export function MyActiveGames({ rooms, onResume }: { rooms: MyActiveRoom[]; onResume: (roomId: string) => void }) {
  const { locale, t } = useLocale()
  const dates = new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return (
    <Section icon="🎯" title={t('platform.myActiveGames')} variant="default" className="lobby-rooms">
      <ul className="room-list">
        {rooms.map(room => {
          const currentPlayer = room.players.find(player => player.playerIndex === room.current_player_index)
          const waitingPlayers = room.players.filter(player => room.waiting_player_indexes.includes(player.playerIndex))
          const name = (player: MyActiveRoom['players'][number]) => getPlayerDisplayName(locale, player.name, player.playerIndex, player.nameIsDefault)
          const timestamp = room.started_at ?? room.created_at
          const progress = room.progress
          return (
            <li key={`${room.id}:${room.player_index}`} className={`room-item my-game${room.my_turn === 1 ? ' room-item--my-turn' : ''}`}>
              <div className="my-game__details">
                <div className="my-game__players">
                  {room.players.map(player => (
                    <span key={player.playerIndex} className="my-game__player" data-current={room.waiting_player_indexes.includes(player.playerIndex)}>
                      <span className="my-game__color" role="img" aria-label={t(`platform.playerColors.${player.color}`)}
                        data-player-color={player.color} style={{ backgroundColor: player.color }} />
                      <span className="my-game__name">{name(player)}</span>
                      {player.playerIndex === room.player_index && <small>({t('platform.me')})</small>}
                    </span>
                  ))}
                </div>
                <div className="my-game__meta">
                  {progress && <span className="my-game__progress">
                    {progress.phase === 'playing' ? t('ui.roundHeader', { round: progress.round })
                      : t(progress.phase === 'draft' ? 'ui.draft.dialog'
                        : progress.phase === 'parent-selection' ? 'ui.parentSelection.dialog' : 'solo.handTitle')}
                  </span>}
                  {room.expansions.length > 0 && <span className="my-game__expansions">
                    {room.expansions.map(expansion => <span key={expansion} role="img" data-expansion={expansion}
                      aria-label={t(expansionIcons[expansion].label)} title={t(expansionIcons[expansion].label)}>
                      {expansionIcons[expansion].icon}
                    </span>)}
                  </span>}
                  <span>{t(room.started_at === null ? 'platform.roomCreatedAt' : 'platform.gameStartedAt')}{' '}
                    <time dateTime={new Date(timestamp).toISOString()}>{dates.format(timestamp)}</time>
                  </span>
                </div>
                <span className="my-game__turn" data-my-turn={room.my_turn === 1}>
                  {(progress?.phase === 'draft' || progress?.phase === 'parent-selection') && waitingPlayers.length > 0
                    ? t('ui.draft.waitingForPlayers', { players: new Intl.ListFormat(locale).format(waitingPlayers.map(name)) })
                    : room.my_turn === 1 ? t('platform.yourTurn')
                    : currentPlayer ? t('ui.waitingForPlayerAction', { player: name(currentPlayer) })
                      : t(room.status === 'waiting' ? 'platform.statusWaiting' : 'platform.statusPlaying')}
                </span>
              </div>
              <button type="button" className="btn-small" onClick={() => onResume(room.id)}>{t('platform.resume')}</button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
