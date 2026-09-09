import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
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

const choiceValue = (food: number, score: number) => `${CARD_ID}:food:${food}:score:${score}`

const finishFinalHarvest = (session: GameSession, food = 0, score = 0, shouldChoose = true) => {
  let chosen = false
  const response = autoAdvanceRoundEnd(session, {
    onChoice: (interaction) => {
      const option = interaction.request.options?.find((candidate) => candidate.value === choiceValue(food, score))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      chosen = true
      return session.resolveChoice(interaction.playerIndex, option!.value)
    },
  })
  expect(chosen).toBe(shouldChoose)
  expect(response.state.gameOver).toBe(true)
  return response
}

const category = (response: SessionResponse, key: string) =>
  response.scores[0]!.categories.find((entry) => entry.key === key)

const gardenDesignerBonus = (response: SessionResponse) =>
  category(response, 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

describe('C099 Garden Designer scoring choices', () => {
  it.each([[1, 1], [4, 2], [7, 3]])('pays %i food for %i bonus VP in one empty field', (food, score) => {
    const session = setup({ scoringFood: food })
    const response = finishFinalHarvest(session, food, score)

    expect(gardenDesignerBonus(response)).toBe(score)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(category(response, 'fields')).toMatchObject({ quantity: 1, total: -1 })
    expect(gardenDesignerBonus(session.getState())).toBe(score)
    expect(session.getState().state.players[0]!.resources.food).toBe(0)
    const repeated = session.resolveChoice(0, choiceValue(food, score))
    expect(repeated.ok).toBe(false)
    expect(repeated.state.players[0]!.resources.food).toBe(0)
  })

  it.each([[0, 0], [1, 1], [4, 2], [7, 3], [8, 4]])('allows a chosen investment of %i food for %i VP across two fields', (food, score) => {
    const response = finishFinalHarvest(setup({ emptyFields: 2, scoringFood: 8 }), food, score)
    expect(gardenDesignerBonus(response)).toBe(score)
    expect(response.state.players[0]!.resources.food).toBe(8 - food)
  })

  it.each([{ emptyFields: 0, scoringFood: 7 }, { emptyFields: 2, scoringFood: 0 }])('does not prompt without a payable scoring option: %j', (options) => {
    const response = finishFinalHarvest(setup(options), 0, 0, false)
    expect(gardenDesignerBonus(response)).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(options.scoringFood)
  })

  it('can invest in an empty Card Field without adding base field points', () => {
    const session = setup({ emptyFields: 0, scoringFood: 4 })
    session.state.players[0]!.minorPlayed = ['B068_Beanfield']
    session.loadState(session.state)
    const response = finishFinalHarvest(session, 4, 2)
    expect(gardenDesignerBonus(response)).toBe(2)
    expect(category(response, 'fields')).toMatchObject({ quantity: 0, total: -1 })
  })

  it.each([CARD_ID, 'C133_Soldier'])('supports terminal trigger order starting with %s', (first) => {
    const session = setup({ scoringFood: 7 })
    const owner = session.state.players[0]!
    owner.occupationPlayed.push('C133_Soldier')
    owner.resources.wood = 1
    owner.resources.stone = 1
    session.loadState(session.state)
    let invested = false
    const response = autoAdvanceRoundEnd(session, {
      onChoice: (interaction) => {
        const options = interaction.request.options ?? []
        const trigger = options.find((option) => option.value === first)
          ?? options.find((option) => option.value === CARD_ID || option.value === 'C133_Soldier')
        if (trigger) return session.resolveChoice(0, trigger.value)
        const investment = options.find((option) => option.value === choiceValue(4, 2))
        if (investment) {
          invested = true
          const paid = session.resolveChoice(0, investment.value)
          if (!paid.state.gameOver) {
            const undone = session.undoStep(0)
            expect(undone.ok, undone.error).toBe(true)
            expect(undone.state.players[0]!.resources.food).toBe(7)
            return session.resolveChoice(0, investment.value)
          }
          return paid
        }
        return session.resolveChoice(0, 'C133_Soldier:pairs:0')
      },
    })
    expect(invested).toBe(true)
    expect(gardenDesignerBonus(response)).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('restores a pending investment and rejects an invented payment', () => {
    const session = setup({ emptyFields: 2, scoringFood: 8 })
    const pending = session.performRoundEnd()
    expect(pending.interaction.stateId).toBe('wait')
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    const rejected = restored.resolveChoice(0, choiceValue(3, 9))
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources.food).toBe(8)
    const response = finishFinalHarvest(restored, 7, 3)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(gardenDesignerBonus(response)).toBe(3)
  })
})
