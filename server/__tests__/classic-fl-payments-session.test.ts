import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { flCard, flSession, chooseBranch, takeFlAnytime } from './_helpers/classic-fl'
import {
  playImprovement,
  playOccupation,
  restoreSession,
  choose,
} from './_helpers/card-play-lifecycle'

const sessions: GameSession[] = []
const keep = (session: GameSession) => {
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('FL: payments and persistent choices', () => {
  it('Jenever Distillery: pays and stores the chosen wood after restoring the purchase decision', () => {
    let session = keep(
      flSession((state) => {
        state.players[0]!.minorHand = [flCard(14).id]
        Object.assign(state.players[0]!.resources, { clay: 3, stone: 1, wood: 4 })
      }),
    )
    let response = playImprovement(session, flCard(14).id, 'meeting-place')
    expect(response.interaction.stateId).toBe('wait')
    session = keep(restoreSession(session))
    response = chooseBranch(session, session.getState(), 3)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0, wood: 0 })
    expect(response.state.players[0]!.cardStates[flCard(14).id]?.counters?.wood).toBe(4)
    response = takeFlAnytime(session, 14, 'withdraw')
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.cardStates[flCard(14).id]?.counters?.wood).toBe(3)
  })

  it('Cosmographer: a claimed farmyard token cannot be taken twice after restoration', () => {
    let session = keep(
      flSession((state) => {
        state.players[0]!.occupationHand = [flCard(39).id]
      }),
    )
    let response = playOccupation(session, flCard(39).id)
    response = choose(session, response, '0-1')
    expect(response.ok, response.error).toBe(true)
    session = keep(restoreSession(session))
    response = choose(session, session.getState(), '0-2')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(2)
    response = takeFlAnytime(session, 39, 'take')
    response = choose(session, response, '0-1')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(1)
    response = takeFlAnytime(session, 39, 'take')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
      response = choose(session, session.getState(), '0-2')
    expect(response.state.players[0]!.resources.stone).toBe(1)
    expect(session.takeAnytimeAction(0, `${flCard(39).id}-take`).ok).toBe(false)
  })
})
