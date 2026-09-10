import { type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { reap } from '../../shared/actions/effects/reap'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/C/C070_LettucePatch'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C070_LettucePatch'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  round?: number
}) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  // Ensure grain-utilization is available
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

  // Set all players' workers to 0 for harvest/round-end tests
  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    }
  }

  session.loadState(state)
  return session
}

describe('C070_LettucePatch session', () => {
  describe('sow - only vegetable sowable', () => {
    it('allows sowing vegetable in the card field', () => {
      const session = setup({ vegetable: 2 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')
      expect(resp.interaction.stateId).toBe('wait')

      // The interaction should include the virtual tile as sowable
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'sow') {
        const cardField = resp.interaction.request.farm.selectableFields.find(
          (f) => f.tile.row === -1 && f.tile.col === 3070,
        )
        expect(cardField).toBeDefined()
        expect(cardField?.allowedCrops).toEqual(['vegetable'])
        // Should NOT allow grain
        expect(cardField?.allowedCrops).not.toContain('grain')
      }

      // Sow vegetable in the card's field
      resp = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 3070, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)

      // Vegetable should be deducted
      expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    })

    it('does NOT allow sowing grain in the card field', () => {
      const session = setup({ grain: 2, vegetable: 0 })

      expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
      expect(session.takeAction(0, 'grain-utilization').ok).toBe(false)
    })
  })

  describe('sowing stores crop data', () => {
    it('stores crop data in cardStates after sowing', () => {
      const session = setup({ vegetable: 1 })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 3070, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)

      const cardState = resp.state.players[0]!.cardStates[CARD_ID]
      const stacks = cardState?.extraData?.cardFieldStacks as any[]
      expect(stacks).toBeDefined()
      expect(stacks[0].crop).toBe('vegetable')
      expect(stacks[0].remaining).toBe(2)
    })
  })

  describe('harvest grants 1 veg + optional conversion to 4 food', () => {
    it('onHarvestFieldPhase harvests 1 vegetable and offers conversion', () => {
      const session = new GameSession()
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.players = state.players.slice(0, 2)
      state.round = 4

      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.vegetable = 0
      player.cardStates[CARD_ID] = {
        extraData: {
          cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }],
        },
      }

      session.loadState(state)

      const flow = reap(state, player).reactionFlow

      // Should have harvested 1 vegetable
      expect(player.resources.vegetable).toBe(1)

      // Remaining should be decremented
      const stacks = player.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks[0].remaining).toBe(1)

      // Flow should be optional conversion choice with pay+gain
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('parallel')
      const conversion = (flow as Extract<ActionFlow, { type: 'parallel' }>).children[0] as Extract<ActionFlow, { type: 'xor' }>
      expect(conversion.type).toBe('xor')
      expect(conversion.optional).toBe(true)
      expect(conversion.children).toHaveLength(1)
      const children = (conversion.children[0] as Extract<ActionFlow, { type: 'seq' }>).children
      expect(children).toHaveLength(2)
      // First child: pay 1 vegetable
      expect(children[0].type).toBe('leaf')
      expect(children[0].actionId).toBe('pay')
      expect(children[0].params).toEqual({ vegetable: 1 })
      // Second child: gain 4 food
      expect(children[1].type).toBe('leaf')
      expect(children[1].actionId).toBe('gain')
      expect(children[1].params).toEqual({ food: 4 })
    })

    it('full harvest integration: harvests veg and player can convert to food', () => {
      const session = setup({ round: 4, vegetable: 0 })

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: {
          cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }],
        },
      }
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()

      // After harvest, vegetable should have been reaped from card field
      // The optional conversion may or may not have been taken (engine skips optional)
      const playerAfter = resp.state.players[0]!
      // vegetable was harvested (1 added) and remaining decremented
      // If optional was skipped, player has 1 veg
      // If optional was taken, player has 0 veg + 4 extra food
      // The engine auto-skips optional flows, so player should have 1 veg
      expect(playerAfter.resources.vegetable).toBe(1)
      const stacks = playerAfter.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks[0].remaining).toBe(1)
    })
  })

  describe('not sowable when crop exists', () => {
    it('does not show card field as sowable when crop already exists', () => {
      const session = setup({ vegetable: 2 })

      // Manually set crop data
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: {
          cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }],
        },
      }
      session.loadState(state)

      expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
      expect(session.takeAction(0, 'grain-utilization').ok).toBe(false)
    })
  })

  describe('crop cleared when remaining=0', () => {
    it('clears card crop when remaining reaches 0 after harvest', () => {
      const session = new GameSession()
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.players = state.players.slice(0, 2)
      state.round = 4

      const player = state.players[0]!
      player.minorPlayed.push(CARD_ID)
      player.resources.vegetable = 0
      player.cardStates[CARD_ID] = {
        extraData: {
          cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }], // Last remaining
        },
      }

      session.loadState(state)

      reap(state, player)

      // Vegetable should have been harvested
      expect(player.resources.vegetable).toBe(1)

      // Stack should be cleared
      const stacks = player.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks ?? []).toEqual([null])
    })

    it('crop cleared - full integration with performRoundEnd', () => {
      const session = setup({ round: 4, vegetable: 0 })

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates[CARD_ID] = {
        extraData: {
          cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }],
        },
      }
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()

      const playerAfter = resp.state.players[0]!
      expect(playerAfter.resources.vegetable).toBe(1)
      const stacks = playerAfter.cardStates[CARD_ID]?.extraData?.cardFieldStacks as any[]
      expect(stacks ?? []).toEqual([null])
    })
  })

  describe('isDoable listener', () => {
    it('makes sow doable when card field is empty and player has vegetable', () => {
      const session = setup({
        vegetable: 1,
        fields: [], // no normal fields
      })

      const resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
    })

    it('sow NOT doable without the card', () => {
      const session = setup({
        withCard: false,
        vegetable: 1,
        fields: [], // no normal fields
      })

      expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
      expect(session.takeAction(0, 'grain-utilization').ok).toBe(false)
    })
  })
})

describe('C070 Lettuce Patch parity', () => {
  const CARD_ID = 'C070_LettucePatch'

  const FILLER = '__test_placeholder__'

  const VIRTUAL_TILE = { row: -1, col: 3070 }

  const OCCUPATIONS = ['A100_Curator', 'A125_Priest', 'B113_PatchCaregiver']

  type CardCrop = { crop: 'vegetable'; remaining: number } | null

  const setup = ({
    played = true, occupations = 3, vegetable = 0, grain = 0, cardVegetables,
    round = 10, scoring = false,
  }: {
    played?: boolean
    occupations?: number
    vegetable?: number
    grain?: number
    cardVegetables?: number
    round?: number
    scoring?: boolean
  } = {}) => {
    const session = new GameSession(6070, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
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
    })

    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    owner.resources.grain = grain
    owner.resources.vegetable = vegetable
    if (cardVegetables !== undefined) {
      const stacks: CardCrop[] = [cardVegetables > 0
        ? { crop: 'vegetable', remaining: cardVegetables }
        : null]
      owner.cardStates[CARD_ID] = { extraData: { cardFieldStacks: stacks } }
    }

    if (scoring || [4, 7, 9, 11, 13, 14].includes(round) && cardVegetables !== undefined) {
      state.players.forEach((player) => {
        markAllWorkersUsed(state, player)
        if (scoring) setActiveWorkerCount(player, 0)
      })
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

  const playMinor = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const resolveHarvest = (session: GameSession, acceptConversion: boolean) => {
    let response = session.performRoundEnd()
    for (let guard = 0; guard < 50 && response.interaction.stateId === 'wait'; guard += 1) {
      const interaction = response.interaction
      if (interaction.request.kind === 'feed') {
        response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
        continue
      }
      const interactionOptions = interaction.request.options ?? []
      if (interaction.request.kind === 'select-trigger') {
        const trigger = interactionOptions.find((option) =>
          option.value === CARD_ID || option.sourceCard === CARD_ID)
        const fallback = interactionOptions.find((option) => option.value === '__done__')
          ?? interactionOptions[0]
        if (!trigger && !fallback) break
        response = session.resolveChoice(interaction.playerIndex, (trigger ?? fallback)!.value)
        continue
      }
      if (interaction.sourceCard === CARD_ID
        || interactionOptions.some((option) => option.sourceCard === CARD_ID)) {
        const chosen = acceptConversion
          ? interactionOptions.find((option) => option.value !== '__skip__')
          : interactionOptions.find((option) => option.value === '__skip__')
        expect(chosen, JSON.stringify(interaction)).toBeDefined()
        response = session.resolveChoice(interaction.playerIndex, chosen!.value)
        continue
      }
      const next = interactionOptions.find((option) => option.value === '__done__')
        ?? interactionOptions.find((option) => option.value === '__skip__')
        ?? interactionOptions[0]
      if (!next) break
      response = session.resolveChoice(interaction.playerIndex, next.value)
    }
    return response
  }

  const cardStack = (response: SessionResponse): CardCrop[] =>
    response.state.players[0]!.cardStates[CARD_ID]?.extraData?.cardFieldStacks as CardCrop[] ?? []

  it('C070 S1: three occupations allow Lettuce Patch to be played for free', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C070 S2: only two occupations keep Lettuce Patch unavailable', () => {
    const response = enterMinor(setup({ played: false, occupations: 2 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
  })

  it('C070 S4: grain cannot be sown on Lettuce Patch', () => {
    const session = setup({ grain: 1 })

    const started = session.takeAction(0, 'grain-utilization')
    expect(started.ok, started.error).toBe(true)
    expect(started.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    if (started.interaction.stateId !== 'wait'
      || started.interaction.request.kind !== 'farm-select') return
    const cardField = started.interaction.request.farm.selectableFields.find((field) =>
      field.tile.row === VIRTUAL_TILE.row && field.tile.col === VIRTUAL_TILE.col)
    expect(cardField).toBeUndefined()

    const rejected = session.commitSelectionChoice(0, {
      crops: [{ ...VIRTUAL_TILE, crop: 'grain' }],
    })

    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources.grain).toBe(1)
    expect(cardStack(rejected)).toEqual([])
  })

  it('C070 S8: Lettuce Patch scores one card point but adds no basic field', () => {
    const response = resolveHarvest(setup({ round: 14, scoring: true }), false)
    const fields = response.scores[0]!.categories.find((category) => category.key === 'fields')
    const cards = response.scores[0]!.categories.find((category) => category.key === 'cards')

    expect(response.state.gameOver).toBe(true)
    expect(fields).toMatchObject({ quantity: 0, total: -1 })
    expect(cards?.entries).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })
})
