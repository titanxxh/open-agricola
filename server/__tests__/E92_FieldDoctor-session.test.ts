import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import {
  familySize,
  newbornCount,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import '../../shared/cards/E/E092_FieldDoctor'

const CARD_ID = 'E092_FieldDoctor'
const SURROUNDING_FIELDS = [[0, 0], [0, 1], [1, 1], [2, 1]] as const

const setup = (
  spaceId: 'wish-children' | 'urgent-wish-children',
  fieldPositions: readonly (readonly [number, number])[],
) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = spaceId === 'urgent-wish-children' ? 5 : 2
  state.roundActionOrder = state.roundActionOrder.map((id) => id === spaceId ? null : id)
  state.roundActionOrder[0] = spaceId

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.rooms = 2
  player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }]
  player.fields = fieldPositions.map(([row, col]) => ({ row, col, crop: null, remaining: 0 }))
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(state, player, 2)

  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} space missing`)
  space.takenBy = []

  session.loadState(state)
  return session
}

describe('E092_FieldDoctor session', () => {
  it('does not unlock Wish for Children when four fields are in the wrong positions', () => {
    const session = setup('wish-children', [[0, 1], [1, 1], [2, 1], [0, 2]])

    expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
    const response = session.takeAction(0, 'wish-children')
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('uses the exact four surrounding fields to grow without room once', () => {
    const session = setup('wish-children', SURROUNDING_FIELDS)

    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)
    const offered = session.takeAction(0, 'wish-children')
    expect(familySize(offered.state.players[0]!)).toBe(2)
    expect(offered.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(offered.interaction.request.options).toHaveLength(1)
    const replacement = offered.interaction.request.options!.find((option) => option.sourceCard === CARD_ID)!
    const response = session.resolveChoice(0, replacement.value)
    expect(response.ok).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(newbornCount(response.state.players[0]!)).toBe(1)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('does not consume Field Doctor on Urgent Wish for Children', () => {
    const session = setup('urgent-wish-children', SURROUNDING_FIELDS)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(true)
    const response = session.takeAction(0, 'urgent-wish-children')
    expect(response.ok).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })
})
