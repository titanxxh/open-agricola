import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C103_GreenGrocer'

const CARD_ID = 'C103_GreenGrocer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, round = 1, resources = {},
}: {
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = new GameSession(5103, undefined, { playerCount: 2 })
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
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources = { ...owner.resources, food: 0, ...resources }
  owner.pastures = [
    {
      id: 'green-grocer-pasture',
      size: 1,
      tiles: [{ row: 0, col: 2 }],
      stables: 0,
      animalType: owner.resources.sheep > 0 ? 'sheep' : null,
      animalCount: owner.resources.sheep,
    },
  ]
  if (owner.resources.cattle > 0) {
    owner.houseAnimalType = 'cattle'
    owner.houseAnimalCount = owner.resources.cattle
  }
  if (played) state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session
}

const playGreenGrocer = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const greenGrocerPrompt = (session: GameSession, start: SessionResponse) => {
  const response = resolveTriggerIfPresent(session, start, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Green Grocer choice')
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  return response
}

const chooseExchange = (
  session: GameSession,
  start: SessionResponse,
  paid: Partial<Resource>,
  gained: Partial<Resource>,
) => {
  const offered = greenGrocerPrompt(session, start)
  const exchange = offered.interaction.request.options?.find((option) =>
    option.effectPreview?.kind === 'resourceExchange'
      && Object.entries(paid).every(([resource, count]) =>
        option.effectPreview?.resourcesPaid?.[resource as keyof Resource] === count)
      && Object.entries(gained).every(([resource, count]) =>
        option.effectPreview?.resourcesGained?.[resource as keyof Resource] === count),
  )
  expect(exchange, JSON.stringify(offered.interaction)).toBeDefined()
  return session.resolveChoice(offered.interaction.playerIndex, exchange!.value)
}

describe('C103 Green Grocer parity', () => {
  it('C103 S1: Green Grocer can be played as the first occupation for no food', () => {
    const response = playGreenGrocer(setup({ played: false, round: 5, resources: { food: 0 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  for (const [scenario, paid, gained] of [
    ['S2', { cattle: 1 }, { vegetable: 1 }],
    ['S3', { vegetable: 1 }, { cattle: 1 }],
    ['S4', { sheep: 2 }, { vegetable: 1 }],
    ['S5', { vegetable: 1 }, { sheep: 2 }],
    ['S6', { food: 2 }, { grain: 1 }],
    ['S7', { grain: 1 }, { food: 2 }],
  ] as const) {
    it(`C103 ${scenario}: the matching round-start exchange pays and gains exactly once`, () => {
      const session = setup({ resources: paid })

      const response = chooseExchange(session, session.performRoundEnd(), paid, gained)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.round).toBe(2)
      const owner = response.state.players[0]!
      for (const [resource, count] of Object.entries(paid)) {
        expect(owner.resources[resource as keyof Resource]).toBe(0)
      }
      for (const [resource, count] of Object.entries(gained)) {
        expect(owner.resources[resource as keyof Resource]).toBe(count)
      }
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
        .not.toBe(CARD_ID)
    })
  }

  it('C103 S8: the round-start exchange may be declined', () => {
    const session = setup({ resources: { food: 2 } })
    const offered = greenGrocerPrompt(session, session.performRoundEnd())
    expect(offered.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0 })
  })

  it('C103 S9: no payable exchange suppresses the Green Grocer offer', () => {
    const response = setup({ resources: { food: 0 } }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, grain: 0, vegetable: 0, sheep: 0, cattle: 0,
    })
  })
})
