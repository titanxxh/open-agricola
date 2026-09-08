import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { familySize, inactiveWorkersInSupply, setActiveWorkerCount, workersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

const CARD_ID = 'E093_Motivator'

const setup = (condition: 'full' | 'gap' | 'no-supply' | 'no-card' = 'full') => {
  const session = new GameSession(4059, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.round = 6
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.resources.food = 20
    player.resources.wood = 0
    player.cardStates = {}
  })
  const player = state.players[0]!
  player.occupationPlayed = condition === 'no-card' ? [] : [CARD_ID]
  player.roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
  player.fields = Array.from({ length: 15 }, (_, index) => ({
    row: Math.floor(index / 5), col: index % 5, crop: null, remaining: 0,
  })).filter(({ row, col }) => row !== 2 || col > 1)
  if (condition === 'gap') player.fields.pop()
  if (condition === 'no-supply') setActiveWorkerCount(player, 5)
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
  session.loadState(state)
  return session
}

describe('E093 Motivator normal rotation', () => {
  it('uses a supply person on the first turn and then rotates to the opponent', () => {
    const session = setup()
    const workerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    chooseSupplyWorkerTurn(session, CARD_ID)
    const response = session.resolveChoice(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual({ playerId: response.state.players[0]!.id, workerId })
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(2)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).interaction.stateId).toBe('idle')
    for (const spaceId of ['clay-pit', 'reed-bank', 'grain-seeds']) {
      expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    expect(session.state.round).toBe(7)
    expect(chooseSupplyWorkerTurn(session, CARD_ID).ok).toBe(true)
  })

  it('forfeits the opportunity after choosing an ordinary person first', () => {
    const session = setup()
    expect(takeNormalWorkerTurn(session, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    const response = confirmNextPlayer(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(1)
  })

  it.each(['gap', 'no-supply', 'no-card'] as const)('has no supply opportunity with %s', (condition) => {
    expect(setup(condition).getState().interaction.stateId).toBe('idle')
  })
})
