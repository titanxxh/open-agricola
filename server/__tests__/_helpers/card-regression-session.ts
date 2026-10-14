import type { GameSession, SessionResponse } from '../../game/authoritative-session'

export const sessionOptions = (response: SessionResponse) => {
  const i = response.interaction
  return i.stateId === 'wait' && 'options' in i.request ? i.request.options ?? [] : []
}

/** Resolve the real card/branch request; unrelated interactions remain visible to the test. */
export const playMinor = (session: GameSession, cardId: string) => {
  let r = session.takeAction(0, 'meeting-place')
  for (let n = 0; n < 8 && r.ok && r.state.players[0]!.minorHand.includes(cardId); n++) {
    const i = r.interaction
    if (i.stateId !== 'wait') break
    const options = sessionOptions(r)
    const next = options.find(o => o.value === cardId)
      ?? options.find(o => o.value.startsWith('action-improvement-'))
    if (!next) break
    r = session.resolveChoice(i.playerIndex, next.value)
  }
  return r
}

export const playOccupation = (session: GameSession, cardId: string) => {
  const r = session.takeAction(0, 'lessons')
  const i = r.interaction
  return r.ok && i.stateId === 'wait' && sessionOptions(r).some(o => o.value === cardId)
    ? session.resolveChoice(i.playerIndex, cardId)
    : r
}
