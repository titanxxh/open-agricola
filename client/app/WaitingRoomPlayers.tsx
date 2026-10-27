import { playerColorOptions } from '../../shared/contract/state-constants'
import type { PlayerState } from '../../shared/contract/types'
import type { RoomColorErrorCode } from '../../shared/contract/protocol/ws'
import { useLocale } from '../contexts/LocaleContext'
import { getPlayerDisplayName } from '../utils/player-name'
import type { WsStatus } from './ws-status'

type Waiting = Extract<WsStatus, { phase: 'waiting' }>

type Props = Pick<Waiting, 'players' | 'playerColors' | 'colorConfirmationPlayerIndex'> & {
  playerIndex: number | undefined
  onColorChange: (color: PlayerState['color']) => void
  colorError: RoomColorErrorCode | null
  onConfirmColor: () => void
  disabled?: boolean
}

export function WaitingRoomPlayers({ players, playerColors, playerIndex, onColorChange, colorError, colorConfirmationPlayerIndex, onConfirmColor, disabled }: Props) {
  const { locale, t } = useLocale()
  const confirmingPlayer = players.find(player => player.playerIndex === colorConfirmationPlayerIndex)
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
      {playerIndex !== undefined && (
        <fieldset className="ws-color-picker">
          <legend>{t('platform.yourColor')}</legend>
          <div className="ws-color-options">
            {playerColorOptions.map(color => {
              const taken = players.some(player => player.playerIndex !== playerIndex && playerColors[player.playerIndex] === color)
              return (
                <button key={color} type="button" className="ws-color-option" data-player-color={color}
                  aria-pressed={playerColors[playerIndex] === color} disabled={taken || disabled}
                  onClick={() => onColorChange(color)}>
                  <span className="ws-seat-color" aria-hidden="true" />
                  {t(`platform.playerColors.${color}`)}
                </button>
              )
            })}
          </div>
          {colorError && <p className="ws-color-error" role="alert">{t(`platform.colorErrors.${colorError}`)}</p>}
        </fieldset>
      )}
      {confirmingPlayer && (playerIndex === colorConfirmationPlayerIndex ? (
        <button type="button" className="btn-primary ws-confirm-color" onClick={onConfirmColor} disabled={disabled}>
          {t('platform.confirmColorAndStart')}
        </button>
      ) : (
        <p className="ws-waiting-color-confirmation" role="status">
          {t('platform.waitingForColorConfirmation', { player: getPlayerDisplayName(locale, confirmingPlayer.name, confirmingPlayer.playerIndex) })}
        </p>
      ))}
    </section>
  )
}
