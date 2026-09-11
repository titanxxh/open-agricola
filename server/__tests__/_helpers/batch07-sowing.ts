import { expect } from 'vitest'
import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import { setWorkersAtHome } from '../../../shared/domain/player'
import { stabilizeRandomHands } from './stabilize-random-hands'

export const sowOptions = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

export const setupSowingSession = ({ cardId, grain = 0, vegetable = 0, wood = 0, stone = 0 }: {
  cardId: string
  grain?: number
  vegetable?: number
  wood?: number
  stone?: number
}) => {
  const session = new GameSession(9811, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 10
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.roundAvailable = 1
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.minorPlayed = [cardId]
  player.resources.grain = grain
  player.resources.vegetable = vegetable
  player.resources.wood = wood
  player.resources.stone = stone
  session.loadState(state)
  return session
}

export const commitFirstPlow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    return response
  }
  return session.commitSelectionChoice(response.interaction.playerIndex, {
    tile: response.interaction.request.farm.selectableTiles[0]!,
  })
}

export const sowCrops = (
  session: GameSession,
  crops: Array<{ row: number; col: number; crop: 'grain' | 'vegetable' | 'wood' | 'stone' }>,
) => {
  let response = session.takeAction(0, 'grain-utilization')
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'farm-select') {
    const sowOption = sowOptions(response).find((option) =>
      option.value === 'sow' || option.labelKey === 'actions.sow.name')
    expect(sowOption, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, sowOption!.value)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
  return session.commitSelectionChoice(0, { crops })
}
