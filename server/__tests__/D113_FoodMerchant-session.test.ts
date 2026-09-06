import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { PlayerState, Resource } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/D/D113_FoodMerchant'

const CARD_ID = 'D113_FoodMerchant'
const FILLER = '__test_placeholder__'

type CropField = { row: number; col: number; crop: 'grain' | 'vegetable'; remaining: number }

const setup = ({
  played = true, food = 10, fields = [], round = 4,
}: {
  played?: boolean
  food?: number
  fields?: CropField[]
  round?: number
} = {}) => {
  const session = new GameSession(6113, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
  })

  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources.food = food
  player.fields = fields.map(({ row, col, crop, remaining }) => ({
    row, col, stacks: [{ kind: crop, remaining }],
  }))

  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  const state = session.getState().state
  state.round = 5
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    player.workers.forEach((worker) => { worker.isActive = true })
  })
  session.loadState(state)
  let response = session.takeAction(0, 'lessons')
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const matchesResources = (
  candidate: Record<string, number> | undefined,
  expected: Partial<Resource>,
) => Object.entries(expected).every(([resource, amount]) =>
  candidate?.[resource] === amount)

const purchaseOption = (
  response: SessionResponse,
  food: number,
  vegetable: number,
) => options(response).find((option) =>
  matchesResources(option.effectPreview?.resourcesPaid, { food })
    && matchesResources(option.effectPreview?.resourcesGained, { vegetable }))

const finishHarvest = (
  session: GameSession,
  purchase?: { food: number; vegetable: number },
) => {
  let sawMerchant = false
  const response = autoAdvanceRoundEnd(session, {
    maxIterations: 80,
    onChoice: (interaction, currentSession) => {
      if (interaction.sourceCard !== CARD_ID) return undefined
      sawMerchant = true
      const current = currentSession.emitResponse()
      if (!purchase) return currentSession.resolveChoice(interaction.playerIndex, '__skip__')
      const option = purchaseOption(current, purchase.food, purchase.vegetable)
      expect(option, JSON.stringify(interaction)).toBeDefined()
      return currentSession.resolveChoice(interaction.playerIndex, option!.value)
    },
  })
  return { response, sawMerchant }
}

const fieldRemaining = (player: PlayerState, row: number, col: number) =>
  player.fields.find((field) => field.row === row && field.col === col)?.stacks[0]?.remaining ?? 0

describe('D113 Food Merchant parity', () => {
  it('D113 S1: Food Merchant can be played as the first occupation through Lessons', () => {
    const response = playOccupation(setup({ played: false, food: 0, round: 5 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D113 S2: one grain from a nondepleted field buys one vegetable for three food', () => {
    const session = setup({ food: 7, fields: [{ row: 0, col: 0, crop: 'grain', remaining: 2 }] })
    const { response, sawMerchant } = finishHarvest(session, { food: 3, vegetable: 1 })

    expect(sawMerchant).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 0 })
    expect(fieldRemaining(response.state.players[0]!, 0, 0)).toBe(1)
  })

  it('D113 S3: the last grain from a field buys one vegetable for two food', () => {
    const session = setup({ food: 6, fields: [{ row: 0, col: 0, crop: 'grain', remaining: 1 }] })
    const { response, sawMerchant } = finishHarvest(session, { food: 2, vegetable: 1 })

    expect(sawMerchant).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 0 })
    expect(fieldRemaining(response.state.players[0]!, 0, 0)).toBe(0)
  })

  it('D113 S4: two harvested grain with one depleted field buy two vegetables for five food', () => {
    const session = setup({
      food: 9,
      fields: [
        { row: 0, col: 0, crop: 'grain', remaining: 1 },
        { row: 0, col: 1, crop: 'grain', remaining: 2 },
      ],
    })
    const { response, sawMerchant } = finishHarvest(session, { food: 5, vegetable: 2 })

    expect(sawMerchant).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 2, food: 0 })
  })

  it('D113 S5: a two-grain harvest may buy only the discounted first vegetable', () => {
    const session = setup({
      food: 6,
      fields: [
        { row: 0, col: 0, crop: 'grain', remaining: 1 },
        { row: 0, col: 1, crop: 'grain', remaining: 2 },
      ],
    })
    const { response, sawMerchant } = finishHarvest(session, { food: 2, vegetable: 1 })

    expect(sawMerchant).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 1, food: 0 })
  })

  it('D113 S6: the harvest purchase can be declined', () => {
    const session = setup({ food: 7, fields: [{ row: 0, col: 0, crop: 'grain', remaining: 2 }] })
    const { response, sawMerchant } = finishHarvest(session)

    expect(sawMerchant).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 0, food: 3 })
  })

  it('D113 S7: insufficient food offers no executable vegetable purchase', () => {
    const session = setup({ food: 1, fields: [{ row: 0, col: 0, crop: 'grain', remaining: 1 }] })
    const { response, sawMerchant } = finishHarvest(session)

    expect(sawMerchant).toBe(false)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('D113 S8: harvesting only a vegetable does not trigger Food Merchant', () => {
    const session = setup({ food: 7, fields: [{ row: 0, col: 0, crop: 'vegetable', remaining: 1 }] })
    const { response, sawMerchant } = finishHarvest(session)

    expect(sawMerchant).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 3 })
  })
})
