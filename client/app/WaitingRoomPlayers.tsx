import { useLocale } from '../contexts/LocaleContext'
import { getPlayerDisplayName } from '../utils/player-name'
import type { WsStatus } from './ws-status'

type Waiting = Extract<WsStatus, { phase: 'waiting' }>

export function WaitingRoomPlayers({ players, playerColors }: Pick<Waiting, 'players' | 'playerColors'>) {
  const { locale, t } = useLocale()
  return (
    <section className="ws-waiting-seats" aria-label={t('platform.roomSeats')}>
      <div className="ws-waiting-count" aria-live="polite">
        {t('platform.playersJoined', { current: players.length, max: playerColors.length })}
      </div>
      <ol className="ws-invite-players">
        {playerColors.map((color, playerIndex) => {
          const player = players.find(candidate => candidate.playerIndex === playerIndex)
          return (
            <li key={playerIndex} className={`ws-invite-player${player ? '' : ' is-empty'}`} data-player-color={color}>
              <span className="ws-seat-color" role="img" aria-label={t(`platform.playerColors.${color}`)} />
              <div className="ws-seat-details">
                <span className="ws-seat-label">{t('platform.seatLabel', { index: playerIndex + 1 })}</span>
                <span className="ws-seat-name">{player ? getPlayerDisplayName(locale, player.name, playerIndex) : t('platform.emptySeat')}</span>
              </div>
              {player && !player.connected && <span className="ws-seat-offline">{t('platform.seatOffline')}</span>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
