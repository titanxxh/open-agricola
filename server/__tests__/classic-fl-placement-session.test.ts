import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { flCard, flSession, chooseBranch, confirmTurns } from './_helpers/classic-fl'
import { bonusScore, choose, playImprovement } from './_helpers/card-play-lifecycle'
import { createWorkSession } from './_helpers/session-fixtures'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { createDefaultRoomTiles } from '../../shared/domain/farmyard-geometry'
import { grantGuest } from '../../shared/domain/guests'
import { familySize, workersAvailable } from '../../shared/domain/player'

const sessions: GameSession[] = []
const keep = (session: GameSession) => {
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const chaplainSession = (guestRound: number) => keep(createWorkSession({
  seed: 6100,
  options: { playerCount: 2 },
  configure: (state) => {
    state.round = 7
    state.currentPlayerIndex = 1
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed = [flCard(57).id]
    owner.resources.wood = 0
    opponent.rooms = 3
    opponent.roomTiles = createDefaultRoomTiles(3)
    const occupiedSpaces = ['day-laborer', 'grain-seeds']
    owner.workers.filter((worker) => worker.isActive).forEach((worker, index) => {
      const space = state.actionSpaces.find((entry) => entry.id === occupiedSpaces[index])!
      space.takenBy.push({ playerId: owner.id, workerId: worker.id })
      recordRoundPlacement(owner, space.id, worker.id)
    })
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    grantGuest(owner, { sourceCardId: flCard(26).id, round: guestRound })
  },
}))

describe('FL: real work-phase placement', () => {
  it('Beguine Courtyard: completes the five-room C and activates all remaining adults on purchase', () => {
    const session = keep(
      flSession((state) => {
        const p = state.players[0]!
        p.minorHand = [flCard(2).id]
        p.roomTiles = [
          { row: 0, col: 0 },
          { row: 1, col: 0 },
          { row: 2, col: 0 },
          { row: 0, col: 1 },
          { row: 2, col: 1 },
        ]
        p.rooms = 5
        Object.assign(p.resources, { clay: 2, stone: 2 })
      }),
    )
    const response = playImprovement(session, flCard(2).id, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(5)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.workers.some((worker) => worker.isNewborn)).toBe(false)
  })

  it('Chaplain: dispatches the available Guest when no family member is left', () => {
    const session = chaplainSession(7)
    const cardId = flCard(57).id
    const ownerId = session.state.players[0]!.id
    const opponentId = session.state.players[1]!.id
    expect(workersAvailable(session.state, session.state.players[0]!)).toBe(0)

    const grown = session.takeAction(1, 'wish-children')
    expect(grown.ok, grown.error).toBe(true)
    expect(grown.state.players[1]!.workers.filter((worker) => worker.isNewborn)).toHaveLength(1)
    const offer = confirmTurns(session, grown)
    expect(offer.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: cardId })
    const targets = chooseBranch(session, offer)
    expect(targets.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      promptKey: 'ui.interactionPlaceFarmerExtra',
    })
    const placed = choose(session, targets, 'forest')
    expect(placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([
      { playerId: ownerId, workerId: 'guest:1', guest: true },
    ])
    expect(placed.state.players[0]!.resources.wood).toBe(3)
    expect(familySize(placed.state.players[0]!)).toBe(2)
    expect(placed.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: flCard(26).id, round: 7, dispatched: true },
    ])
    expect(placed.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.familyGrowth', playerId: opponentId }),
      expect.objectContaining({ key: 'log.guestDispatched', playerId: ownerId }),
    ]))
    expect(bonusScore(placed, cardId)).toBe(0)
    const returned = confirmTurns(session, placed)
    expect(returned.interaction.stateId).toBe('idle')
    expect(returned.state.currentPlayerIndex).toBe(1)
  })

  it('Chaplain: offers no placement for a Guest booked for the next round', () => {
    const session = chaplainSession(8)
    const cardId = flCard(57).id
    const grown = session.takeAction(1, 'wish-children')
    expect(grown.ok, grown.error).toBe(true)
    expect(grown.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 1,
      request: { kind: 'confirm-next-player' },
    })
    expect(grown.state.players[1]!.workers.filter((worker) => worker.isNewborn)).toHaveLength(1)
    const handoff = confirmTurns(session, grown)
    expect(handoff.interaction.stateId).toBe('idle')
    expect(handoff.state.currentPlayerIndex).toBe(1)
    expect(handoff.state.players[0]!.resources.wood).toBe(0)
    expect(handoff.state.players[0]!.guests).toEqual([
      { id: 'guest:1', sourceCardId: flCard(26).id, round: 8 },
    ])
    expect(handoff.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([])
    expect(handoff.state.log).not.toContainEqual(expect.objectContaining({ key: 'log.guestDispatched' }))
    expect(bonusScore(handoff, cardId)).toBe(0)
  })
})
