import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect, computeExtraSowableFields } from '../../shared/cards/card-effects'
import { reap } from '../../shared/actions/effects/reap'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/E/E069_MelonPatch'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E069_MelonPatch'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  round?: number
}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable = options?.round && harvestRounds.includes(options.round) ? 0 : 2
  player.resources.food = 10
  player.resources.grain = options?.grain ?? 0
  player.resources.vegetable = options?.vegetable ?? 0
  player.fields = options?.fields ?? []

  if (options?.withCard ?? true) {
    player.minorPlayed.push(CARD_ID)
  }

  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
    }
  }

  session.loadState(state)
  return session
}

describe('E069_MelonPatch session', () => {
  describe('extra sowable field', () => {
    it('only vegetable is sowable (grain not allowed)', () => {
      const session = setup({ vegetable: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      const extras = computeExtraSowableFields(player)
      expect(extras.length).toBe(1)
      expect(extras[0].tile).toEqual({ row: -1, col: 5069 })
      expect(extras[0].allowedCrops).toEqual(['vegetable'])
      expect(extras[0].sourceCard).toBe(CARD_ID)
    })

    it('grain sow is rejected by onSowExtraField', () => {
      const session = setup({ grain: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const result = effect!.onSowExtraField!(player, { row: -1, col: 5069 }, 'grain')
      expect(result).toBe(false)
    })

    it('not sowable when already has crop', () => {
      const session = setup({ vegetable: 1 })
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
      const extras = computeExtraSowableFields(player)
      expect(extras.length).toBe(0)
    })
  })

  describe('sowing via session', () => {
    it('sowing vegetable stores crop data (remaining=2)', () => {
      const session = setup({ vegetable: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 5069, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.vegetable).toBe(1)

      const stacks = resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks[0].crop).toBe('vegetable')
      expect(stacks[0].remaining).toBe(2)
    })
  })

  describe('harvest', () => {
    it('harvest decrements remaining', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
      session.loadState(state)

      const vegBefore = player.resources.vegetable
      const flow = reap(state, player).reactionFlow
      expect(player.resources.vegetable).toBe(vegBefore + 1)
      // remaining was 2, now 1 — no plow since not last
      expect(flow).toBeUndefined()
      const stacks = player.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks[0].remaining).toBe(1)
    })

    it('non-last veg harvest returns no plow', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
      session.loadState(state)

      const flow = reap(state, player).reactionFlow
      expect(flow).toBeUndefined()
    })

    it('last veg harvest returns optional plow flow', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] },
      }
      session.loadState(state)

      const vegBefore = player.resources.vegetable
      const flow = reap(state, player).reactionFlow
      expect(player.resources.vegetable).toBe(vegBefore + 1)
      // Stack should be cleared
      const stacks = player.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks ?? []).toEqual([null])
      // Should return optional plow
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('parallel')
      const plow = (flow as Extract<ActionFlow, { type: 'parallel' }>).children[0] as Extract<ActionFlow, { type: 'leaf' }>
      expect(plow.actionId).toBe('plow')
      expect(plow.optional).toBe(true)
      expect(plow.sourceCard).toBe(CARD_ID)
    })
  })
})

describe('E069 Melon Patch parity', () => {
  const CARD_ID = 'E069_MelonPatch'

  const FILLER = '__test_placeholder__'

  const VIRTUAL_TILE = { row: -1, col: 5069 }

  const OCCUPATIONS = ['A100_Curator', 'A116_WoodCutter']

  const setup = ({
    played = false, occupations = 2, grain = 0, vegetable = 0,
    cardVegetables, round = 14, ordinaryFields = 0,
  }: {
    played?: boolean
    occupations?: number
    grain?: number
    vegetable?: number
    cardVegetables?: number
    round?: number
    ordinaryFields?: number
  } = {}) => {
    const session = new GameSession(6069, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.roundActionOrder = [
      'grain-utilization',
      ...state.roundActionOrder.filter((id) => id !== 'grain-utilization'),
    ]
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.fields = []
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    owner.resources.grain = grain
    owner.resources.vegetable = vegetable
    owner.fields = Array.from({ length: ordinaryFields }, (_, col) => ({
      row: 2, col: col + 1, stacks: [],
    }))
    if (cardVegetables !== undefined) {
      owner.cardStates[CARD_ID] = {
        extraData: {
          cardFieldStacks: [cardVegetables > 0
            ? { crop: 'vegetable', remaining: cardVegetables }
            : null],
        },
      }
      state.players.forEach((player) => markAllWorkersUsed(state, player))
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    return response
  }

  const play = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const enterSow = (session: GameSession) => {
    const response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    return response
  }

  const cardStacks = (response: SessionResponse) =>
    response.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardFieldStacks

  const finishHarvest = (session: GameSession, plow: boolean) => autoAdvanceRoundEnd(session, {
    onChoice: (interaction, currentSession) => {
      if (interaction.request.kind === 'choice' && interaction.sourceCard === CARD_ID) {
        const option = plow
          ? interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
          : interaction.request.options?.find((candidate) => candidate.value === '__skip__')
        expect(option, JSON.stringify(interaction)).toBeDefined()
        return currentSession.resolveChoice(interaction.playerIndex, option!.value)
      }
      if (interaction.request.kind === 'farm-select'
        && interaction.request.farm.farmType === 'plow') {
        expect(plow).toBe(true)
        const tile = interaction.request.farm.selectableTiles[0]
        expect(tile).toBeDefined()
        return currentSession.commitSelectionChoice(interaction.playerIndex, { tile })
      }
      return undefined
    },
  })

  it('E069 S1: two occupations play Melon Patch for free', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('E069 S2: fewer than two occupations keep Melon Patch unavailable', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('E069 S3: Melon Patch accepts vegetable and receives the normal two-vegetable stack', () => {
    const session = setup({ played: true, vegetable: 1 })
    enterSow(session)

    const response = session.commitSelectionChoice(0, {
      crops: [{ ...VIRTUAL_TILE, crop: 'vegetable' }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(cardStacks(response)).toEqual([{ crop: 'vegetable', remaining: 2 }])
  })

  it('E069 S4: Melon Patch rejects grain atomically and accepts a vegetable retry', () => {
    const session = setup({ played: true, grain: 1, vegetable: 1 })
    enterSow(session)

    const rejected = session.commitSelectionChoice(0, {
      crops: [{ ...VIRTUAL_TILE, crop: 'grain' }],
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    expect(cardStacks(rejected) ?? [null]).toEqual([null])

    const accepted = session.commitSelectionChoice(0, {
      crops: [{ ...VIRTUAL_TILE, crop: 'vegetable' }],
    })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 0 })
    expect(cardStacks(accepted)).toEqual([{ crop: 'vegetable', remaining: 2 }])
  })

  it('E069 S5: harvesting a non-last Melon Patch vegetable does not offer a field', () => {
    const response = finishHarvest(setup({ played: true, round: 4, cardVegetables: 2 }), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(cardStacks(response)).toEqual([{ crop: 'vegetable', remaining: 1 }])
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })

  it('E069 S6: harvesting the last Melon Patch vegetable may plow one field', () => {
    const response = finishHarvest(setup({ played: true, round: 4, cardVegetables: 1 }), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(cardStacks(response)).toEqual([null])
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })

  it('E069 S7: the free Melon Patch field may be declined', () => {
    const response = finishHarvest(setup({ played: true, round: 4, cardVegetables: 1 }), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(cardStacks(response)).toEqual([null])
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })

  it('E069 S8: Melon Patch is excluded from ordinary-field scoring', () => {
    const response = setup({ played: true, ordinaryFields: 1 }).getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'fields'))
      .toMatchObject({ quantity: 1, total: -1 })
  })
})
