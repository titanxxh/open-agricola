import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

const CARD_ID = 'A170_Hayward'

const fenceEdgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const setup = (wood = 8) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.resources.wood = wood
  state.players[0]!.occupationPlayed = [CARD_ID]
  session.loadState(state)
  return session
}

const findHaywardAnytime = (session: GameSession) =>
  session.getState().interaction.anytimeActions.find((action) => action.sourceCard === CARD_ID)

describe('A170 Hayward', () => {
  it('lets the owner build fences as an anytime action without placing a worker', () => {
    const session = setup()
    const action = findHaywardAnytime(session)
    expect(action).toBeDefined()

    let resp = session.takeAnytimeAction(0, action!.id)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected fence selection')
    expect(resp.interaction.farm.farmType).toBe('fence')

    resp = session.commitSelectionChoice(0, {
      edges: fenceEdgesForTile(1, 1),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.pastures).toHaveLength(1)
    expect(resp.state.actionSpaces.every((space) =>
      !space.takenBy.some((worker) => worker.playerId === 'p1'),
    )).toBe(true)
  })

  it('does not expose the anytime action when fencing is not legal', () => {
    const session = setup(3)

    expect(findHaywardAnytime(session)).toBeUndefined()
  })
})
