import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C099_GardenDesigner'

const CARD_ID = 'C099_GardenDesigner'
const FILLER = '__test_placeholder__'

const setup = ({ emptyFields = 1, scoringFood = 1 } = {}) => {
  const session = new GameSession(5099, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.gameOver = false
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  owner.resources.food = scoringFood + 4
  owner.fields = Array.from({ length: emptyFields }, (_, col) => ({
    row: 0, col, stacks: [],
  }))
  session.loadState(state)
  return session
}

const finishFinalHarvest = (session: GameSession) => {
  let response = session.performRoundEnd()
  for (let step = 0; step < 8 && !response.state.gameOver; step += 1) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') break
    const { request, playerIndex } = response.interaction
    if (request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
      continue
    }
    const skip = request.options?.find((option) => option.value === '__skip__')
    expect(skip, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(playerIndex, skip!.value)
  }
  expect(response.state.gameOver).toBe(true)
  expect(response.interaction.stateId).toBe('gameover')
  return response
}

const category = (response: SessionResponse, key: string) =>
  response.scores[0]!.categories.find((entry) => entry.key === key)

const gardenDesignerBonus = (response: SessionResponse) =>
  category(response, 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

describe('C099 Garden Designer parity', () => {
  for (const [scenario, scoringFood, bonus] of [
    ['S1', 1, 1],
    ['S2', 4, 2],
    ['S3', 7, 3],
  ] as const) {
    it(`C099 ${scenario}: one empty field automatically reserves ${scoringFood} food for ${bonus} bonus VP`, () => {
      const response = finishFinalHarvest(setup({ scoringFood }))

      expect(gardenDesignerBonus(response)).toBe(bonus)
      expect(category(response, 'fields')).toMatchObject({ quantity: 1, total: -1 })
      expect(response.state.players[0]!.resources.food).toBe(scoringFood)
    })
  }

  it('C099 S4: the optimal Garden Designer exchange is applied without a decline prompt', () => {
    const response = finishFinalHarvest(setup({ scoringFood: 7 }))

    expect(gardenDesignerBonus(response)).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(7)
    expect(response.interaction.stateId).toBe('gameover')
  })

  it('C099 S5: without an empty field Garden Designer neither prompts nor scores', () => {
    const response = finishFinalHarvest(setup({ emptyFields: 0, scoringFood: 7 }))

    expect(gardenDesignerBonus(response)).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(7)
  })

  it('C099 S6: two empty fields automatically reserve eight food for four bonus VP', () => {
    const response = finishFinalHarvest(setup({ emptyFields: 2, scoringFood: 8 }))

    expect(gardenDesignerBonus(response)).toBe(4)
    expect(category(response, 'fields')).toMatchObject({ quantity: 2, total: 1 })
    expect(response.state.players[0]!.resources.food).toBe(8)
  })
})
