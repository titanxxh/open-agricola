import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { t, type Locale } from '../../shared/i18n'
import { draftSeatProgress } from '../../shared/projections/draft-progress'
import { PlayerCard } from '../components/common/PlayerCard'
import { getPlayerDisplayName } from '../utils/player-name'
import { useModalDialog } from './encyclopedia/useModalDialog'
import type { MultihandInput } from './multihand-seat'
import './multihand.css'

type OwnedSeat = { player: PlayerState; index: number }
const seatName = (locale: Locale, { player, index }: OwnedSeat) => getPlayerDisplayName(locale, player.name, index, player.nameIsDefault)

function OwnHandDialog({ state, seats, locale, operatingPlayerId, onClose }: {
  state: GameState; seats: OwnedSeat[]; locale: Locale; operatingPlayerId: string; onClose: () => void
}) {
  const ref = useModalDialog()
  const titleId = useId()
  const [viewedId, setViewedId] = useState(operatingPlayerId)
  const viewed = seats.find(seat => seat.player.id === viewedId) ?? seats[0]!
  const operating = seats.find(seat => seat.player.id === operatingPlayerId)
  const hand = state.phase === 'draft' && state.draft ? draftSeatProgress(state.draft, viewed.player.id).kept
    : { occ: viewed.player.occupationHand, minor: viewed.player.minorHand }
  return createPortal(<dialog ref={ref} className="multihand-hand-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2 id={titleId}>{t(locale, 'team.viewOwnHand')}</h2>
      <button type="button" className="btn-secondary" onClick={onClose}>{t(locale, 'ui.close')}</button></header>
    {operating && <p className="multihand-operation" data-operation-player-id={operating.player.id}>
      {t(locale, 'team.operatingSeat', { number: operating.index + 1, player: seatName(locale, operating) })}</p>}
    <label>{t(locale, 'team.viewOwnHand')}
      <select value={viewed.player.id} onChange={event => setViewedId(event.target.value)}>
        {seats.map(seat => <option key={seat.player.id} value={seat.player.id}>
          {t(locale, 'team.seatLabel', { number: seat.index + 1, player: seatName(locale, seat) })}</option>)}
      </select>
    </label>
    <div data-hand-player-id={viewed.player.id}>
      <h3>{t(locale, 'ui.occupationCards')}</h3><div className="multihand-hand-row">
        {hand.occ.map(cardId => <PlayerCard key={cardId} locale={locale} cardId={cardId} cardType="occupation" enablePreview={false} />)}
        {hand.occ.length === 0 && <p>{t(locale, 'ui.noOccupationCards')}</p>}
      </div>
      <h3>{t(locale, 'ui.minorCards')}</h3><div className="multihand-hand-row">
        {hand.minor.map(cardId => <PlayerCard key={cardId} locale={locale} cardId={cardId} cardType="minor" enablePreview={false} />)}
        {hand.minor.length === 0 && <p>{t(locale, 'ui.noHandCards')}</p>}
      </div>
    </div>
  </dialog>, document.body)
}

export function MultihandSeatControls({ state, locale, controlledPlayerIndexes, pending, operatingPlayerId, onChoose }: {
  state: GameState; locale: Locale; controlledPlayerIndexes: readonly number[]; pending: readonly MultihandInput[]
  operatingPlayerId: string; onChoose: (input: MultihandInput) => void
}) {
  const [handOpen, setHandOpen] = useState(false)
  const seats = state.players.flatMap((player, index) => controlledPlayerIndexes.includes(index) ? [{ player, index }] : [])
  const operating = seats.find(seat => seat.player.id === operatingPlayerId)
  if (!operating) return null
  return <div className="multihand-seat-controls">
    <p className="multihand-operation" data-operation-player-id={operatingPlayerId}>
      {t(locale, 'team.operatingSeat', { number: operating.index + 1, player: seatName(locale, operating) })}
    </p>
    {pending.length > 0 && <fieldset><legend>{t(locale, 'team.pendingSeats')}</legend>
      <label>{t(locale, 'team.choosePendingSeat')}
        <select value={operatingPlayerId} onChange={event => {
          const input = pending.find(candidate => candidate.playerId === event.target.value)
          if (input) onChoose(input)
        }}>
          {pending.map(input => {
            const seat = seats.find(candidate => candidate.player.id === input.playerId)
            return seat && <option key={input.playerId} value={input.playerId}>
              {t(locale, 'team.handleSeat', { number: seat.index + 1, player: seatName(locale, seat) })}</option>
          })}
        </select>
      </label>
    </fieldset>}
    <button type="button" className="btn-secondary" onClick={() => setHandOpen(true)}>{t(locale, 'team.viewOwnHand')}</button>
    {handOpen && <OwnHandDialog state={state} seats={seats} locale={locale} operatingPlayerId={operatingPlayerId} onClose={() => setHandOpen(false)} />}
  </div>
}
